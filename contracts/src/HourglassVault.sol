// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC4626, ERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MarketCalendar} from "./libraries/MarketCalendar.sol";

/// @title HourglassVault
/// @notice USDG lending vault for one loan term (7 or 30 days). The vault is the lender of every loan in its
/// term; LoanManager is the only contract that can lend its cash out.
///
/// totalAssets = USDG held + principal lent out + interest accrued linearly on open loans - loss provision.
/// Interest accrues per second and stops at each loan's maturity: loans end on fixed 18:30 UTC slots, so the
/// vault keeps the accrual rate that ends at each slot (`rateEndingAt`) and walks the days it has not seen.
///
/// Anti-manipulation:
/// - Withdrawals (direct or queued) can never push utilisation above 80%; beyond that lenders wait in the
///   FIFO queue, which repayments fill first. So capital deposited to dodge the borrow caps stays at risk.
/// - Loan rates and caps are priced on `lendingBase()`: the lower of current assets and a once-a-day snapshot,
///   so a deposit made today cannot lower today's borrow rate.
/// - Deposits stop while any loan of this vault is in auction (settlement moves the share price).
/// - New deposits (and shares received by transfer) are locked for 5 minutes; dust does not lock anyone.
contract HourglassVault is ERC4626, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant LOCK = 5 minutes;
    uint256 public constant MAX_UTIL_BPS = 8_000;
    uint256 public constant SNAPSHOT_INTERVAL = 1 days;
    uint256 private constant SCALE = 1e18;

    struct Request {
        address owner;
        address receiver;
        uint256 shares;
    }

    uint256 public immutable term;
    uint256 internal immutable dust; // 1 whole asset unit: smaller mints/transfers do not lock the receiver
    address public manager;
    uint256 public depositCap;

    uint256 public outstanding; // principal lent out
    uint256 public lossProvision; // expected shortfall of risky loans
    uint256 public accrualRate; // sum of open loans' net interest per second, 1e18-scaled
    uint256 internal accruedScaled; // net interest accrued and not yet received, 1e18-scaled
    uint256 public lastAccrual;
    mapping(uint256 => uint256) public rateEndingAt; // maturity slot => accrual rate that stops there
    uint256 public openAuctions;
    uint256 public snapshotAssets;
    uint256 public snapshotTime;

    mapping(address => uint256) public lockedUntil;
    Request[] public requests;
    uint256 public queueHead;
    uint256 public queuedShares;

    event ManagerSet(address manager);
    event DepositCapSet(uint256 cap);
    event LoanOpened(uint256 principal, uint256 rate, uint256 maturity);
    event LoanClosed(uint256 principal, uint256 cashIn);
    event LoanRolled(uint256 oldPrincipal, uint256 newPrincipal, uint256 newMaturity);
    event ProvisionChanged(uint256 lossProvision);
    event AuctionsOpen(uint256 count);
    event RedeemRequested(uint256 indexed id, address indexed owner, address receiver, uint256 shares);
    event RedeemCancelled(uint256 indexed id);
    event RedeemFilled(uint256 indexed id, uint256 shares, uint256 assets);

    error OnlyManager();
    error ManagerAlreadySet();
    error Locked();
    error InsufficientIdle();
    error BadMaturity();
    error NotRequestOwner();
    error ZeroShares();

    modifier onlyManager() {
        if (msg.sender != manager) revert OnlyManager();
        _;
    }

    constructor(IERC20 usdg, string memory name_, string memory symbol_, uint256 term_, uint256 cap_, address owner_)
        ERC20(name_, symbol_)
        ERC4626(usdg)
        Ownable(owner_)
    {
        term = term_;
        depositCap = cap_;
        lastAccrual = block.timestamp;
        dust = 10 ** IERC20Metadata(address(usdg)).decimals();
    }

    // ---------------------------------------------------------------- admin

    function setManager(address m) external onlyOwner {
        if (manager != address(0)) revert ManagerAlreadySet();
        manager = m;
        emit ManagerSet(m);
    }

    function setDepositCap(uint256 cap) external onlyOwner {
        depositCap = cap;
        emit DepositCapSet(cap);
    }

    // ---------------------------------------------------------------- accounting

    function totalAssets() public view override returns (uint256) {
        (uint256 acc,) = _accruedView();
        uint256 gross = IERC20(asset()).balanceOf(address(this)) + outstanding + acc / SCALE;
        return gross > lossProvision ? gross - lossProvision : 0;
    }

    function accruedInterest() external view returns (uint256) {
        (uint256 acc,) = _accruedView();
        return acc / SCALE;
    }

    /// @notice Assets that loan rates and caps are priced on: min(current, daily snapshot).
    function lendingBase() external view returns (uint256) {
        uint256 ta = totalAssets();
        uint256 snap = snapshotAssets;
        if (block.timestamp >= snapshotTime + SNAPSHOT_INTERVAL) snap = ta; // the next touch takes this snapshot
        if (snap == 0) return ta;
        return ta < snap ? ta : snap;
    }

    /// @notice USDG that can be lent out: idle cash minus what the withdrawal queue is waiting for.
    function availableToLend() public view returns (uint256) {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        uint256 reserved = convertToAssets(queuedShares);
        return idle > reserved ? idle - reserved : 0;
    }

    /// @notice USDG that may leave as withdrawals without lifting utilisation above 80%.
    function withdrawRoom() public view returns (uint256) {
        uint256 ta = totalAssets();
        uint256 needed = (outstanding * 10_000 + MAX_UTIL_BPS - 1) / MAX_UTIL_BPS;
        return ta > needed ? ta - needed : 0;
    }

    function utilizationBps() external view returns (uint256) {
        uint256 ta = totalAssets();
        return ta == 0 ? 0 : outstanding * 10_000 / ta;
    }

    function sync() external {
        _accrue();
    }

    function _accruedView() internal view returns (uint256 acc, uint256 rate) {
        acc = accruedScaled;
        rate = accrualRate;
        uint256 last = lastAccrual;
        uint256 nowTs = block.timestamp;
        if (rate == 0 || nowTs <= last) return (acc, rate);
        for (uint256 d = last / 1 days;; ++d) {
            uint256 slot = d * 1 days + MarketCalendar.SLOT_OFFSET;
            if (slot > nowTs) break;
            if (slot <= last) continue;
            uint256 ending = rateEndingAt[slot];
            if (ending != 0) {
                acc += rate * (slot - last);
                last = slot;
                rate -= ending;
                if (rate == 0) return (acc, rate);
            }
        }
        acc += rate * (nowTs - last);
    }

    function _accrue() internal {
        if (block.timestamp > lastAccrual) {
            (accruedScaled, accrualRate) = _accruedView();
            lastAccrual = block.timestamp;
        }
        if (block.timestamp >= snapshotTime + SNAPSHOT_INTERVAL) {
            snapshotAssets = totalAssets();
            snapshotTime = block.timestamp;
        }
    }

    // ---------------------------------------------------------------- manager hooks

    /// @notice Lend `principal` to `to`. Interest accrues at `rate` (1e18-scaled USDG/s) until `maturity`.
    function openLoan(address to, uint256 principal, uint256 rate, uint256 maturity) external onlyManager nonReentrant {
        _accrue();
        if (!MarketCalendar.isSlot(maturity) || maturity <= block.timestamp) revert BadMaturity();
        if (principal > availableToLend()) revert InsufficientIdle();
        outstanding += principal;
        _addAccrual(rate, maturity);
        IERC20(asset()).safeTransfer(to, principal);
        emit LoanOpened(principal, rate, maturity);
    }

    /// @notice Close a loan. The manager has already transferred `cashIn` (whatever was recovered) to the vault.
    function closeLoan(uint256 principal, uint256 rate, uint256 start, uint256 maturity, uint256 cashIn)
        external
        onlyManager
        nonReentrant
    {
        _accrue();
        _removeLoan(principal, rate, start, maturity);
        emit LoanClosed(principal, cashIn);
    }

    /// @notice Replace an open loan with a new one in a single step (rollover).
    /// `lenderPortionOld` = old principal + old net interest. If the new principal is larger, the vault pays the
    /// difference to `to`; if smaller, the manager has already transferred the difference in.
    function rollLoan(
        uint256 oldPrincipal,
        uint256 oldRate,
        uint256 oldStart,
        uint256 oldMaturity,
        uint256 lenderPortionOld,
        uint256 newPrincipal,
        uint256 newRate,
        uint256 newMaturity,
        address to
    ) external onlyManager nonReentrant {
        _accrue();
        if (!MarketCalendar.isSlot(newMaturity) || newMaturity <= block.timestamp) revert BadMaturity();
        _removeLoan(oldPrincipal, oldRate, oldStart, oldMaturity);
        outstanding += newPrincipal;
        _addAccrual(newRate, newMaturity);
        if (newPrincipal > lenderPortionOld) {
            uint256 delta = newPrincipal - lenderPortionOld;
            if (delta > availableToLend()) revert InsufficientIdle();
            IERC20(asset()).safeTransfer(to, delta);
        }
        emit LoanRolled(oldPrincipal, newPrincipal, newMaturity);
    }

    function addProvision(uint256 amount) external onlyManager {
        lossProvision += amount;
        emit ProvisionChanged(lossProvision);
    }

    function removeProvision(uint256 amount) external onlyManager {
        lossProvision = amount > lossProvision ? 0 : lossProvision - amount;
        emit ProvisionChanged(lossProvision);
    }

    function auctionOpened() external onlyManager {
        emit AuctionsOpen(++openAuctions);
    }

    function auctionClosed() external onlyManager {
        emit AuctionsOpen(--openAuctions);
    }

    function _addAccrual(uint256 rate, uint256 maturity) internal {
        accrualRate += rate;
        rateEndingAt[maturity] += rate;
    }

    function _removeLoan(uint256 principal, uint256 rate, uint256 start, uint256 maturity) internal {
        uint256 end = block.timestamp < maturity ? block.timestamp : maturity;
        if (block.timestamp < maturity) {
            accrualRate -= rate;
            rateEndingAt[maturity] -= rate;
        }
        uint256 loanAcc = rate * (end - start);
        accruedScaled = loanAcc > accruedScaled ? 0 : accruedScaled - loanAcc;
        outstanding -= principal;
    }

    // ---------------------------------------------------------------- ERC4626 limits + lock

    function maxDeposit(address) public view override returns (uint256) {
        if (openAuctions != 0) return 0;
        uint256 ta = totalAssets();
        return depositCap > ta ? depositCap - ta : 0;
    }

    function maxMint(address receiver) public view override returns (uint256) {
        return convertToShares(maxDeposit(receiver));
    }

    function maxWithdraw(address owner_) public view override returns (uint256) {
        if (block.timestamp < lockedUntil[owner_]) return 0;
        uint256 own = convertToAssets(balanceOf(owner_));
        uint256 avail = _withdrawable();
        return own < avail ? own : avail;
    }

    function maxRedeem(address owner_) public view override returns (uint256) {
        if (block.timestamp < lockedUntil[owner_]) return 0;
        uint256 own = balanceOf(owner_);
        uint256 availShares = convertToShares(_withdrawable());
        return own < availShares ? own : availShares;
    }

    function _withdrawable() internal view returns (uint256) {
        uint256 a = availableToLend();
        uint256 r = withdrawRoom();
        return a < r ? a : r;
    }

    function deposit(uint256 assets, address receiver) public override nonReentrant returns (uint256) {
        _accrue();
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver) public override nonReentrant returns (uint256) {
        _accrue();
        return super.mint(shares, receiver);
    }

    function withdraw(uint256 assets, address receiver, address owner_) public override nonReentrant returns (uint256) {
        _accrue();
        return super.withdraw(assets, receiver, owner_);
    }

    function redeem(uint256 shares, address receiver, address owner_) public override nonReentrant returns (uint256) {
        _accrue();
        return super.redeem(shares, receiver, owner_);
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (to == address(0) || to == address(this) || from == address(this)) return;
        if (convertToAssets(value) < dust) return; // dust cannot lock anyone
        uint256 lock = from == address(0) ? block.timestamp + LOCK : lockedUntil[from];
        if (lock > lockedUntil[to]) lockedUntil[to] = lock;
    }

    /// @dev Virtual shares (1e6) blunt the first-depositor inflation attack.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    // ---------------------------------------------------------------- withdrawal queue

    /// @notice Queue `shares` for redemption when idle cash is short. Shares move into the vault and keep
    /// earning (and bearing losses) until filled, at the share price at fill time.
    function requestRedeem(uint256 shares, address receiver) external nonReentrant returns (uint256 id) {
        if (shares == 0) revert ZeroShares();
        if (block.timestamp < lockedUntil[msg.sender]) revert Locked();
        _transfer(msg.sender, address(this), shares);
        queuedShares += shares;
        id = requests.length;
        requests.push(Request(msg.sender, receiver, shares));
        emit RedeemRequested(id, msg.sender, receiver, shares);
    }

    function cancelRequest(uint256 id) external nonReentrant {
        Request storage r = requests[id];
        if (r.owner != msg.sender) revert NotRequestOwner();
        uint256 shares = r.shares;
        r.shares = 0;
        queuedShares -= shares;
        _transfer(address(this), msg.sender, shares);
        emit RedeemCancelled(id);
    }

    /// @notice Look at up to `maxSteps` queue entries, oldest first, filling them from idle cash (never past
    /// 80% utilisation). Cancelled entries count as steps, so the queue cannot be jammed. Anyone can call.
    function processQueue(uint256 maxSteps) external nonReentrant returns (uint256 filled) {
        _accrue();
        IERC20 usdg = IERC20(asset());
        uint256 head = queueHead;
        uint256 n = requests.length;
        for (uint256 step; step < maxSteps && head < n; ++step) {
            Request storage r = requests[head];
            if (r.shares == 0) {
                ++head;
                continue;
            }
            uint256 cash = usdg.balanceOf(address(this));
            uint256 room = withdrawRoom();
            if (room < cash) cash = room;
            if (cash == 0) break;
            uint256 shares = r.shares;
            uint256 assets = convertToAssets(shares);
            if (assets > cash) {
                shares = convertToShares(cash);
                if (shares == 0) break;
                assets = convertToAssets(shares);
            }
            r.shares -= shares;
            queuedShares -= shares;
            _burn(address(this), shares);
            usdg.safeTransfer(r.receiver, assets);
            emit RedeemFilled(head, shares, assets);
            ++filled;
            if (r.shares != 0) break;
            ++head;
        }
        queueHead = head;
    }

    function requestCount() external view returns (uint256) {
        return requests.length;
    }
}
