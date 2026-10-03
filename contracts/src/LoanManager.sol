// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {MarketCalendar} from "./libraries/MarketCalendar.sol";
import {IAggregatorV3, IStockToken} from "./interfaces/IExternal.sol";
import {HourglassVault} from "./HourglassVault.sol";

interface ISafetyModuleCover {
    function coverShortfall(address vault, uint256 amount) external returns (uint256 paid);
    function backstopPay(uint256 amount) external;
}

/// @title LoanManager
/// @notice Fixed-term, fixed-rate USDG loans against tokenized stocks. No price liquidation, ever: a loan only
/// ends by repayment, rollover, or - once maturity + 24h grace has passed - a Dutch auction of the collateral.
///
/// - Rate is fixed at origination from the vault's utilisation *after* the loan.
/// - Maturity snaps to the nearest Tue/Wed/Thu 18:30 UTC slot (US market hours), skipping holidays.
/// - Early repayment pays interest for the time used, with a floor (3 days on 7-day loans, 10 on 30-day).
/// - Auction lot price is anchored to the oracle value: 102% -> 85% over 4 active hours, then 85% -> 70% over
///   4 more, then the SafetyModule may buy at 70%. "Active" = market open AND price usable: the clock skips the
///   weekend/holiday window exactly, and skips every interval in which the price was found unusable (token or
///   oracle paused, stale feed) at a checkpoint (`pokeAuction`, called by the keeper and by anyone). Proceeds
///   pay the vault first (principal + interest + 1% penalty), then the protocol's interest cut; any surplus is
///   the borrower's. A shortfall is covered by the SafetyModule.
/// - Anyone can mark a loan whose collateral no longer covers the lender with margin (`markLoan`): the vault
///   books a loss provision before maturity, so informed lenders cannot exit ahead of the loss.
/// - Every risk parameter is snapshotted into the loan when it opens; governance changes never touch open loans.
/// - Repayment, adding collateral and claiming surplus are never pausable.
contract LoanManager is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant YEAR = 365 days;
    uint256 public constant MAX_UTIL_BPS = 8_000;
    uint256 public constant WEEKEND_HAIRCUT_BPS = 1_000;
    uint256 public constant PENALTY_BPS = 100;
    uint256 public constant GRACE = 24 hours;
    uint256 public constant MAX_EXTRA_GRACE = 7 days;
    uint256 public constant ROLL_WINDOW = 3 days;
    uint256 public constant STALE_OPEN = 25 hours;
    uint256 public constant STALE_CLOSED = 72 hours;
    uint256 public constant PHASE = 4 hours;
    uint256 public constant START_BPS = 10_200;
    uint256 public constant MID_BPS = 8_500;
    uint256 public constant FLOOR_BPS = 7_000;
    uint256 public constant MAX_ORIGINATION_BPS = 100;
    uint256 public constant MAX_PROTOCOL_INTEREST_BPS = 2_000;

    enum Status {
        None,
        Active,
        Repaid,
        Auction,
        Settled
    }

    struct VaultConfig {
        bool enabled;
        uint16 originationFeeBps;
        uint32 minInterestSecs;
    }

    struct AssetConfig {
        bool enabled;
        address feed;
        uint8 assetDecimals;
        uint8 feedDecimals;
    }

    struct RiskParams {
        uint16 ltvBps;
        uint16 rateMinBps;
        uint16 rateMaxBps;
        uint16 capBps; // max share of the vault's assets lent against this asset
    }

    struct Loan {
        address borrower;
        address vault;
        address asset;
        Status status;
        uint64 start;
        uint64 maturity;
        uint32 rateBps;
        uint32 minInterestSecs;
        uint16 protocolInterestBps;
        uint128 collateral;
        uint128 principal;
        uint128 interest; // gross, full term
        uint128 lenderInterest; // net of the protocol cut, full term
        uint256 accrualRate; // lenderInterest per second, 1e18-scaled
    }

    struct Auction {
        uint64 start;
        uint64 lastCheck;
        uint64 activeSecs;
        bool lastUsable;
    }

    struct Terms {
        uint256 rateBps;
        uint256 maturity;
        uint256 fee;
        uint256 interest;
        uint256 lenderInterest;
        uint256 accrualRate;
        uint256 value;
        bool marketOpen;
    }

    IERC20 public immutable usdg;
    uint8 public immutable usdgDecimals;
    uint256 public immutable minLoan;

    address public guardian;
    address public feeSplitter;
    ISafetyModuleCover public safetyModule;
    uint16 public protocolInterestBps = 1_000;
    bool public newLoansPaused;
    uint256 public noAuctionBefore; // guardian grace extension, can only move forward

    mapping(uint256 => bool) public holiday; // UTC day index
    mapping(address => VaultConfig) public vaults;
    mapping(address => AssetConfig) public assets;
    mapping(address => mapping(address => RiskParams)) public risk; // vault => asset => params
    mapping(address => mapping(address => uint256)) public assetDebt; // vault => asset => principal

    mapping(uint256 => Loan) internal _loans;
    mapping(uint256 => Auction) public auctions;
    mapping(address => uint256) public surplus;
    mapping(uint256 => uint256) public provisionOf;
    mapping(uint256 => address) public collateralRecipient;
    uint256 public nextLoanId = 1;

    event GuardianSet(address guardian);
    event FeeSplitterSet(address feeSplitter);
    event SafetyModuleSet(address safetyModule);
    event VaultSet(address indexed vault, bool enabled, uint16 originationFeeBps, uint32 minInterestSecs);
    event AssetSet(address indexed asset, bool enabled, address feed);
    event RiskSet(address indexed vault, address indexed asset, RiskParams params);
    event ProtocolInterestSet(uint16 bps);
    event NewLoansPaused(bool paused);
    event HolidaySet(uint256 indexed day, bool closed);
    event GraceExtended(uint256 noAuctionBefore);

    event LoanOpened(
        uint256 indexed id,
        address indexed borrower,
        address indexed vault,
        address asset,
        uint256 collateral,
        uint256 principal,
        uint256 rateBps,
        uint256 maturity,
        uint256 fee
    );
    event LoanRepaid(uint256 indexed id, address indexed payer, uint256 principal, uint256 interest, address to);
    event CollateralAdded(uint256 indexed id, uint256 amount);
    event LoanRolled(uint256 indexed id, uint256 principal, uint256 rateBps, uint256 maturity, uint256 fee);
    event AuctionStarted(uint256 indexed id);
    event AuctionPoked(uint256 indexed id, uint256 activeSecs, bool usable);
    event LoanMarked(uint256 indexed id, uint256 provision);
    event RecipientSet(uint256 indexed id, address to);
    event AuctionSettled(
        uint256 indexed id, address indexed buyer, uint256 price, uint256 toVault, uint256 shortfall, uint256 surplus
    );
    event SurplusClaimed(address indexed borrower, address to, uint256 amount);

    error OnlyGuardian();
    error Paused();
    error VaultDisabled();
    error AssetDisabled();
    error NotListed();
    error TokenPaused();
    error BadPrice();
    error StalePrice();
    error LoanTooSmall();
    error LtvTooHigh();
    error AssetCapReached();
    error UtilizationTooHigh();
    error RateTooHigh();
    error FeeTooHigh();
    error FeeOnTransfer();
    error BadStatus();
    error NotBorrower();
    error NotInRollWindow();
    error GraceNotOver();
    error PriceAboveMax();
    error BackstopNotOpen();
    error BadParam();
    error NothingToClaim();

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert OnlyGuardian();
        _;
    }

    constructor(IERC20 usdg_, address owner_, address guardian_, address feeSplitter_) Ownable(owner_) {
        usdg = usdg_;
        usdgDecimals = IERC20Metadata(address(usdg_)).decimals();
        minLoan = 100 * 10 ** usdgDecimals;
        guardian = guardian_;
        feeSplitter = feeSplitter_;
    }

    // ================================================================ governance (owner = timelock)

    function setGuardian(address g) external onlyOwner {
        guardian = g;
        emit GuardianSet(g);
    }

    function setFeeSplitter(address f) external onlyOwner {
        feeSplitter = f;
        emit FeeSplitterSet(f);
    }

    function setSafetyModule(address sm) external onlyOwner {
        safetyModule = ISafetyModuleCover(sm);
        emit SafetyModuleSet(sm);
    }

    function setVault(address vault, bool enabled, uint16 originationFeeBps, uint32 minInterestSecs)
        external
        onlyOwner
    {
        if (originationFeeBps > MAX_ORIGINATION_BPS) revert BadParam();
        if (minInterestSecs > HourglassVault(vault).term()) revert BadParam();
        vaults[vault] = VaultConfig(enabled, originationFeeBps, minInterestSecs);
        emit VaultSet(vault, enabled, originationFeeBps, minInterestSecs);
    }

    function setAsset(address asset, bool enabled, address feed) external onlyOwner {
        uint8 ad = IERC20Metadata(asset).decimals();
        uint8 fd = IAggregatorV3(feed).decimals();
        if (uint256(ad) + fd < usdgDecimals) revert BadParam();
        assets[asset] = AssetConfig(enabled, feed, ad, fd);
        emit AssetSet(asset, enabled, feed);
    }

    function setRisk(address vault, address asset, RiskParams calldata p) external onlyOwner {
        if (p.ltvBps > 9_000 || p.rateMinBps > p.rateMaxBps || p.rateMaxBps > BPS || p.capBps > BPS) revert BadParam();
        risk[vault][asset] = p;
        emit RiskSet(vault, asset, p);
    }

    function setProtocolInterestBps(uint16 bps) external onlyOwner {
        if (bps > MAX_PROTOCOL_INTEREST_BPS) revert BadParam();
        protocolInterestBps = bps;
        emit ProtocolInterestSet(bps);
    }

    // ================================================================ guardian

    /// @notice Stops new loans and rollovers only. Repay, add collateral, auctions and claims keep working.
    function setNewLoansPaused(bool p) external onlyGuardian {
        newLoansPaused = p;
        emit NewLoansPaused(p);
    }

    /// @notice Only days that have not started yet, so running auctions and maturities are never rewritten.
    function setHoliday(uint256 day, bool closed) external onlyGuardian {
        if (day <= block.timestamp / 1 days) revert BadParam();
        holiday[day] = closed;
        emit HolidaySet(day, closed);
    }

    /// @notice No auction may start before `until` (e.g. after a sequencer outage or a long token pause).
    /// At most 7 days ahead; it can only move forward, so nobody can shorten a borrower's grace.
    function extendGrace(uint256 until) external onlyGuardian {
        if (until > block.timestamp + MAX_EXTRA_GRACE || until <= noAuctionBefore) revert BadParam();
        noAuctionBefore = until;
        emit GraceExtended(until);
    }

    // ================================================================ views

    function getLoan(uint256 id) external view returns (Loan memory) {
        return _loans[id];
    }

    function isMarketOpen() external view returns (bool) {
        return MarketCalendar.isOpen(holiday, block.timestamp);
    }

    function maturityFor(uint256 start, uint256 term) external view returns (uint256) {
        return MarketCalendar.maturityFor(holiday, start, term);
    }

    /// @notice Oracle value of `amount` of `asset`, in USDG units. Reverts when the price is unusable.
    function quoteValue(address asset, uint256 amount) public view returns (uint256 value, bool open) {
        uint256 price;
        (price, open) = _price(asset);
        value = _value(asset, amount, price);
    }

    /// @notice Terms a new loan would get right now (reverts with the same errors openLoan would).
    function quoteLoan(address vault, address asset, uint256 collateral, uint256 principal)
        external
        view
        returns (Terms memory t)
    {
        return _terms(vault, asset, collateral, principal, 0, 0);
    }

    /// @notice What repaying loan `id` costs right now (principal + interest due).
    function amountDue(uint256 id) external view returns (uint256 principal, uint256 interest) {
        Loan storage l = _loans[id];
        (interest,) = _interestDue(l, block.timestamp);
        principal = l.principal;
    }

    function graceEnd(uint256 id) public view returns (uint256) {
        uint256 g = uint256(_loans[id].maturity) + GRACE;
        return g > noAuctionBefore ? g : noAuctionBefore;
    }

    /// @notice Current auction factor in bps of oracle value, using market-open seconds since the start.
    function auctionFactor(uint256 id) public view returns (uint256) {
        uint256 active = auctionActiveSecs(id);
        if (active < PHASE) return START_BPS - (START_BPS - MID_BPS) * active / PHASE;
        if (active < 2 * PHASE) return MID_BPS - (MID_BPS - FLOOR_BPS) * (active - PHASE) / PHASE;
        return FLOOR_BPS;
    }

    function auctionPrice(uint256 id) public view returns (uint256) {
        Loan storage l = _loans[id];
        if (l.status != Status.Auction) revert BadStatus();
        (uint256 value,) = quoteValue(l.asset, l.collateral);
        return value * auctionFactor(id) / BPS;
    }

    // ================================================================ borrower

    function openLoan(
        address vault,
        address asset,
        uint256 collateral,
        uint256 principal,
        uint256 maxRateBps,
        uint256 maxFee,
        address to
    ) external nonReentrant returns (uint256 id) {
        if (newLoansPaused) revert Paused();
        Terms memory t = _terms(vault, asset, collateral, principal, 0, 0);
        if (t.rateBps > maxRateBps) revert RateTooHigh();
        if (t.fee > maxFee) revert FeeTooHigh();

        _pullExact(IERC20(asset), msg.sender, collateral);

        id = nextLoanId++;
        _loans[id] = Loan({
            borrower: msg.sender,
            vault: vault,
            asset: asset,
            status: Status.Active,
            start: uint64(block.timestamp),
            maturity: uint64(t.maturity),
            rateBps: uint32(t.rateBps),
            minInterestSecs: vaults[vault].minInterestSecs,
            protocolInterestBps: protocolInterestBps,
            collateral: SafeCast.toUint128(collateral),
            principal: SafeCast.toUint128(principal),
            interest: SafeCast.toUint128(t.interest),
            lenderInterest: SafeCast.toUint128(t.lenderInterest),
            accrualRate: t.accrualRate
        });
        assetDebt[vault][asset] += principal;

        HourglassVault(vault).openLoan(address(this), principal, t.accrualRate, t.maturity);
        if (t.fee != 0) usdg.safeTransfer(feeSplitter, t.fee);
        usdg.safeTransfer(to, principal - t.fee);

        emit LoanOpened(id, msg.sender, vault, asset, collateral, principal, t.rateBps, t.maturity, t.fee);
    }

    /// @notice Where third-party repayments send the collateral (default: the borrower). Lets a borrower whose
    /// wallet may get blocklisted by the issuer arrange in advance for someone else to repay to a clean wallet.
    function setCollateralRecipient(uint256 id, address to) external {
        Loan storage l = _loans[id];
        if (msg.sender != l.borrower) revert NotBorrower();
        collateralRecipient[id] = to;
        emit RecipientSet(id, to);
    }

    /// @notice Repay principal + interest due and release the collateral. Anyone may pay; the collateral goes to
    /// `to` only when the borrower calls, otherwise to the preset recipient or the borrower.
    function repay(uint256 id, address to) external nonReentrant {
        Loan storage l = _loans[id];
        if (l.status != Status.Active) revert BadStatus();
        if (msg.sender != l.borrower) {
            address preset = collateralRecipient[id];
            to = preset == address(0) ? l.borrower : preset;
        }

        (uint256 gross, uint256 net) = _interestDue(l, block.timestamp);
        uint256 principal = l.principal;
        address vault = l.vault;
        l.status = Status.Repaid;
        assetDebt[vault][l.asset] -= principal;
        _setProvision(id, vault, 0);

        usdg.safeTransferFrom(msg.sender, vault, principal + net);
        if (gross > net) usdg.safeTransferFrom(msg.sender, feeSplitter, gross - net);
        HourglassVault(vault).closeLoan(principal, l.accrualRate, l.start, l.maturity, principal + net);
        IERC20(l.asset).safeTransfer(to, l.collateral);

        emit LoanRepaid(id, msg.sender, principal, gross, to);
    }

    function addCollateral(uint256 id, uint256 amount) external nonReentrant {
        Loan storage l = _loans[id];
        if (l.status != Status.Active) revert BadStatus();
        _pullExact(IERC20(l.asset), msg.sender, amount);
        l.collateral += SafeCast.toUint128(amount);
        emit CollateralAdded(id, amount);
    }

    /// @notice Close the loan and open a new one on the same collateral in one transaction, from 3 days before
    /// maturity until the end of grace. Old interest is due in full up to now (early-repay floor applies); the
    /// new loan is priced at today's oracle value and utilisation. The borrower pays or receives the difference.
    function rollover(uint256 id, uint256 newPrincipal, uint256 maxRateBps, uint256 maxFee) external nonReentrant {
        if (newLoansPaused) revert Paused();
        Loan storage l = _loans[id];
        if (l.status != Status.Active) revert BadStatus();
        if (msg.sender != l.borrower) revert NotBorrower();
        if (block.timestamp + ROLL_WINDOW < l.maturity || block.timestamp > graceEnd(id)) revert NotInRollWindow();

        address vault = l.vault;
        uint256 oldPrincipal = l.principal;
        Terms memory t = _terms(vault, l.asset, l.collateral, newPrincipal, oldPrincipal, oldPrincipal);
        if (t.rateBps > maxRateBps) revert RateTooHigh();
        if (t.fee > maxFee) revert FeeTooHigh();

        (uint256 grossOld, uint256 netOld) = _interestDue(l, block.timestamp);
        uint256 lenderPortionOld = oldPrincipal + netOld;
        uint256 toSplitter = (grossOld - netOld) + t.fee;
        // borrower owes old principal + old interest + new fee, and receives the new principal
        int256 borrowerNet = int256(oldPrincipal + grossOld + t.fee) - int256(newPrincipal);

        if (borrowerNet > 0) usdg.safeTransferFrom(msg.sender, address(this), uint256(borrowerNet));
        if (lenderPortionOld > newPrincipal) usdg.safeTransfer(vault, lenderPortionOld - newPrincipal);
        HourglassVault(vault)
            .rollLoan(
                oldPrincipal,
                l.accrualRate,
                l.start,
                l.maturity,
                lenderPortionOld,
                newPrincipal,
                t.accrualRate,
                t.maturity,
                address(this)
            );
        if (toSplitter != 0) usdg.safeTransfer(feeSplitter, toSplitter);
        if (borrowerNet < 0) usdg.safeTransfer(msg.sender, uint256(-borrowerNet));

        assetDebt[vault][l.asset] = assetDebt[vault][l.asset] - oldPrincipal + newPrincipal;
        l.start = uint64(block.timestamp);
        l.maturity = uint64(t.maturity);
        l.rateBps = uint32(t.rateBps);
        l.minInterestSecs = vaults[vault].minInterestSecs;
        l.protocolInterestBps = protocolInterestBps;
        l.principal = SafeCast.toUint128(newPrincipal);
        l.interest = SafeCast.toUint128(t.interest);
        l.lenderInterest = SafeCast.toUint128(t.lenderInterest);
        l.accrualRate = t.accrualRate;

        emit LoanRolled(id, newPrincipal, t.rateBps, t.maturity, t.fee);
    }

    function claimSurplus(address to) external nonReentrant {
        uint256 amount = surplus[msg.sender];
        if (amount == 0) revert NothingToClaim();
        surplus[msg.sender] = 0;
        usdg.safeTransfer(to, amount);
        emit SurplusClaimed(msg.sender, to, amount);
    }

    // ================================================================ default + auction

    /// @notice Book (or release) a loss provision for a loan whose collateral no longer covers what the vault
    /// is owed with a 15% margin (owed > 85% of the oracle value). An accounting mark, not a liquidation: the
    /// loan itself is untouched. Anyone can call it, before or after maturity.
    function markLoan(uint256 id) external nonReentrant {
        Loan storage l = _loans[id];
        if (l.status != Status.Active && l.status != Status.Auction) revert BadStatus();
        (uint256 value,) = quoteValue(l.asset, l.collateral);
        _setProvision(id, l.vault, _expectedLoss(l, value));
        emit LoanMarked(id, provisionOf[id]);
    }

    /// @notice Anyone can start the auction once maturity + grace has passed without repayment, while the price
    /// is usable: a paused or stale token can not be pushed into default.
    function startAuction(uint256 id) external nonReentrant {
        Loan storage l = _loans[id];
        if (l.status != Status.Active) revert BadStatus();
        if (block.timestamp <= graceEnd(id)) revert GraceNotOver();
        (uint256 value,) = quoteValue(l.asset, l.collateral);
        l.status = Status.Auction;
        _setProvision(id, l.vault, _expectedLoss(l, value));
        auctions[id] = Auction(uint64(block.timestamp), uint64(block.timestamp), 0, true);
        HourglassVault(l.vault).auctionOpened();
        emit AuctionStarted(id);
    }

    /// @notice Checkpoint the auction clock. The keeper calls this every few minutes during an auction (anyone
    /// can): an interval only counts as active if the price was usable at both ends.
    function pokeAuction(uint256 id) external {
        if (_loans[id].status != Status.Auction) revert BadStatus();
        (uint256 active, bool usable) = _activeView(id);
        Auction storage a = auctions[id];
        a.activeSecs = uint64(active);
        a.lastCheck = uint64(block.timestamp);
        a.lastUsable = usable;
        emit AuctionPoked(id, active, usable);
    }

    function auctionActiveSecs(uint256 id) public view returns (uint256 active) {
        (active,) = _activeView(id);
    }

    /// @notice Buy the whole collateral lot at the current auction price. Only while the market is open and the
    /// oracle is usable.
    function buy(uint256 id, uint256 maxPrice) external nonReentrant {
        Loan storage l = _loans[id];
        if (!MarketCalendar.isOpen(holiday, block.timestamp)) revert StalePrice();
        uint256 price = auctionPrice(id);
        if (price > maxPrice) revert PriceAboveMax();
        usdg.safeTransferFrom(msg.sender, address(this), price);
        IERC20(l.asset).safeTransfer(msg.sender, l.collateral);
        _settle(id, price, msg.sender);
    }

    /// @notice After 8 active hours unsold, the SafetyModule may take the lot at the 70% floor with its reserve.
    /// The market must be open (fresh price), as for any other buyer.
    function backstopBuy(uint256 id) external nonReentrant {
        Loan storage l = _loans[id];
        if (l.status != Status.Auction) revert BadStatus();
        if (!MarketCalendar.isOpen(holiday, block.timestamp)) revert StalePrice();
        if (auctionActiveSecs(id) < 2 * PHASE) revert BackstopNotOpen();
        (uint256 value,) = quoteValue(l.asset, l.collateral);
        uint256 price = value * FLOOR_BPS / BPS;
        safetyModule.backstopPay(price);
        IERC20(l.asset).safeTransfer(address(safetyModule), l.collateral);
        _settle(id, price, address(safetyModule));
    }

    // ================================================================ internals

    function _settle(uint256 id, uint256 received, address buyer) internal {
        Loan storage l = _loans[id];
        address vault = l.vault;
        l.status = Status.Settled;
        assetDebt[vault][l.asset] -= l.principal;

        uint256 claimAmt = _lenderClaim(l);
        uint256 toVault = received < claimAmt ? received : claimAmt;
        uint256 rest = received - toVault;
        uint256 protocolCut = uint256(l.interest) - l.lenderInterest;
        uint256 toProtocol = rest < protocolCut ? rest : protocolCut;
        uint256 toBorrower = rest - toProtocol;
        uint256 shortfall = claimAmt - toVault;

        uint256 covered;
        if (shortfall != 0) covered = safetyModule.coverShortfall(vault, shortfall);
        if (toVault != 0) usdg.safeTransfer(vault, toVault);
        if (toProtocol != 0) usdg.safeTransfer(feeSplitter, toProtocol);
        if (toBorrower != 0) surplus[l.borrower] += toBorrower;

        _setProvision(id, vault, 0);
        HourglassVault(vault).auctionClosed();
        HourglassVault(vault).closeLoan(l.principal, l.accrualRate, l.start, l.maturity, toVault + covered);
        emit AuctionSettled(id, buyer, received, toVault, shortfall, toBorrower);
    }

    function _lenderClaim(Loan storage l) internal view returns (uint256) {
        return uint256(l.principal) + l.lenderInterest + uint256(l.principal) * PENALTY_BPS / BPS;
    }

    /// @dev Owed to the vault (penalty excluded) beyond 85% of the collateral's oracle value.
    function _expectedLoss(Loan storage l, uint256 value) internal view returns (uint256) {
        uint256 owed = uint256(l.principal) + l.lenderInterest;
        uint256 covered = value * MID_BPS / BPS;
        return owed > covered ? owed - covered : 0;
    }

    function _activeView(uint256 id) internal view returns (uint256 active, bool usable) {
        Auction storage a = auctions[id];
        if (a.start == 0) return (0, false);
        active = a.activeSecs;
        Loan storage l = _loans[id];
        try this.quoteValue(l.asset, l.collateral) returns (uint256, bool) {
            usable = true;
        } catch {}
        if (usable && a.lastUsable) {
            active += block.timestamp - a.lastCheck
            - MarketCalendar.closedSeconds(holiday, a.lastCheck, block.timestamp);
        }
    }

    function _setProvision(uint256 id, address vault, uint256 p) internal {
        uint256 old = provisionOf[id];
        if (p == old) return;
        provisionOf[id] = p;
        if (p > old) HourglassVault(vault).addProvision(p - old);
        else HourglassVault(vault).removeProvision(old - p);
    }

    function _interestDue(Loan storage l, uint256 t) internal view returns (uint256 gross, uint256 net) {
        if (t >= l.maturity) return (l.interest, l.lenderInterest);
        uint256 dur = uint256(l.maturity) - l.start;
        uint256 e = t - l.start;
        if (e < l.minInterestSecs) e = l.minInterestSecs;
        if (e >= dur) return (l.interest, l.lenderInterest);
        gross = uint256(l.interest) * e / dur;
        net = uint256(l.lenderInterest) * e / dur;
    }

    /// @param releasedPrincipal principal of the loan being replaced (rollover), freed before the new one.
    /// @param releasedAssetDebt same amount, released from this asset's cap.
    function _terms(
        address vault,
        address asset,
        uint256 collateral,
        uint256 principal,
        uint256 releasedPrincipal,
        uint256 releasedAssetDebt
    ) internal view returns (Terms memory t) {
        VaultConfig memory vc = vaults[vault];
        if (!vc.enabled) revert VaultDisabled();
        if (!assets[asset].enabled) revert AssetDisabled(); // disabling an asset only stops new loans
        RiskParams memory p = risk[vault][asset];
        if (p.ltvBps == 0) revert NotListed();
        if (principal < minLoan) revert LoanTooSmall();

        uint256 price;
        (price, t.marketOpen) = _price(asset);
        t.value = _value(asset, collateral, price);
        uint256 ltv = t.marketOpen ? p.ltvBps : (p.ltvBps > WEEKEND_HAIRCUT_BPS ? p.ltvBps - WEEKEND_HAIRCUT_BPS : 0);
        if (principal * BPS > t.value * ltv) revert LtvTooHigh();

        HourglassVault v = HourglassVault(vault);
        uint256 ta = v.lendingBase(); // min(current, daily snapshot): fresh deposits can't cheapen today's rate
        if ((assetDebt[vault][asset] - releasedAssetDebt + principal) * BPS > ta * p.capBps) revert AssetCapReached();
        uint256 outAfter = v.outstanding() - releasedPrincipal + principal;
        if (outAfter * BPS > ta * MAX_UTIL_BPS) revert UtilizationTooHigh();

        uint256 utilBps = outAfter * BPS / ta;
        t.rateBps = p.rateMinBps + (uint256(p.rateMaxBps) - p.rateMinBps) * utilBps / MAX_UTIL_BPS;
        t.maturity = MarketCalendar.maturityFor(holiday, block.timestamp, v.term());
        uint256 dur = t.maturity - block.timestamp;
        t.interest = principal * t.rateBps * dur / (YEAR * BPS);
        t.lenderInterest = t.interest - t.interest * protocolInterestBps / BPS;
        t.accrualRate = t.lenderInterest * 1e18 / dur;
        t.fee = principal * vc.originationFeeBps / BPS;
    }

    function _price(address asset) internal view returns (uint256 price, bool open) {
        AssetConfig memory a = assets[asset];
        if (a.feed == address(0)) revert NotListed();
        if (_tokenPaused(asset)) revert TokenPaused();
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) =
            IAggregatorV3(a.feed).latestRoundData();
        if (answer <= 0) revert BadPrice();
        if (answeredInRound < roundId) revert StalePrice();
        open = MarketCalendar.isOpen(holiday, block.timestamp);
        uint256 maxAge = open ? STALE_OPEN : STALE_CLOSED;
        if (updatedAt > block.timestamp || block.timestamp - updatedAt > maxAge) revert StalePrice();
        price = uint256(answer);
    }

    function _value(address asset, uint256 amount, uint256 price) internal view returns (uint256) {
        AssetConfig memory a = assets[asset];
        return amount * price / 10 ** (uint256(a.assetDecimals) + a.feedDecimals - usdgDecimals);
    }

    function _tokenPaused(address asset) internal view returns (bool) {
        try IStockToken(asset).paused() returns (bool p) {
            if (p) return true;
        } catch {}
        try IStockToken(asset).oraclePaused() returns (bool p) {
            if (p) return true;
        } catch {}
        return false;
    }

    function _pullExact(IERC20 token, address from, uint256 amount) internal {
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        if (token.balanceOf(address(this)) - before != amount) revert FeeOnTransfer();
    }
}
