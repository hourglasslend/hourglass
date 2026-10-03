// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SafetyModule
/// @notice Stake GLASS to back Hourglass lenders and earn USDG from protocol fees.
///
/// Layers of cover for a vault shortfall (auction proceeds below what the vault is owed):
///   1. the USDG reserve, paid automatically by LoanManager.coverShortfall;
///   2. stakers: every uncovered shortfall event adds a slash budget of 30% of the GLASS staked at that moment.
///      The guardian may slash within that budget (calls >= 1 day apart). Slashed GLASS always goes to the
///      owner-set recovery address, which sells it and calls repayShortfall to forward the USDG to the vault.
///
/// Unstaking needs a 10-day cooldown, then has a 2-day window, so nobody can exit just ahead of a known loss.
/// Rewards are streamed over 7 days (Synthetix pattern, rate kept 1e18-scaled so top-ups lose nothing); only the
/// FeeSplitter (or owner) can add rewards. Stakes are non-transferable in v1.
contract SafetyModule is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant COOLDOWN = 10 days;
    uint256 public constant UNSTAKE_WINDOW = 2 days;
    uint256 public constant MAX_SLASH_BPS = 3_000;
    uint256 public constant SLASH_INTERVAL = 1 days;
    uint256 public constant REWARD_DURATION = 7 days;
    uint256 private constant VIRTUAL_SHARES = 1e6;
    uint256 private constant REWARD_SCALE = 1e36;
    uint256 private constant RATE_SCALE = 1e18; // shares carry a 1e6 virtual offset, so keep reward precision high

    IERC20 public immutable glass;
    IERC20 public immutable usdg;
    address public manager;
    address public guardian;
    address public rewardNotifier;
    address public recovery;

    uint256 public totalGlass;
    uint256 public totalShares;
    mapping(address => uint256) public sharesOf;
    mapping(address => uint256) public cooldownStart;

    uint256 public reserve;
    mapping(address => uint256) public pendingShortfall;
    uint256 public lastSlash;
    uint256 public slashBudget;

    uint256 public rewardRate; // USDG per second, 1e18-scaled
    uint256 public periodFinish;
    uint256 public lastRewardUpdate;
    uint256 public rewardPerShareStored;
    mapping(address => uint256) public rewardPerSharePaid;
    mapping(address => uint256) public rewards;

    event ManagerSet(address manager);
    event GuardianSet(address guardian);
    event RewardNotifierSet(address notifier);
    event RecoverySet(address recovery);
    event Staked(address indexed user, uint256 glass, uint256 shares);
    event Cooldown(address indexed user);
    event Unstaked(address indexed user, uint256 glass, uint256 shares);
    event RewardAdded(uint256 amount);
    event RewardPaid(address indexed user, uint256 amount);
    event ReserveFunded(uint256 amount);
    event GlassDonated(address indexed from, uint256 amount);
    event ShortfallCovered(address indexed vault, uint256 owed, uint256 paid);
    event BackstopPaid(uint256 amount);
    event Slashed(address indexed vault, uint256 glass, address to);
    event ShortfallRepaid(address indexed vault, uint256 amount);
    event Swept(address token, address to, uint256 amount);

    error OnlyManager();
    error OnlyGuardian();
    error ZeroAmount();
    error NotInWindow();
    error NoShortfall();
    error SlashTooLarge();
    error SlashTooSoon();
    error InsufficientReserve();
    error ProtectedToken();
    error NotNotifier();
    error NoStakers();

    constructor(IERC20 glass_, IERC20 usdg_, address owner_, address guardian_) Ownable(owner_) {
        glass = glass_;
        usdg = usdg_;
        guardian = guardian_;
    }

    modifier onlyManager() {
        if (msg.sender != manager) revert OnlyManager();
        _;
    }

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert OnlyGuardian();
        _;
    }

    modifier updateReward(address user) {
        rewardPerShareStored = rewardPerShare();
        lastRewardUpdate = lastTimeRewardApplicable();
        if (user != address(0)) {
            rewards[user] = earned(user);
            rewardPerSharePaid[user] = rewardPerShareStored;
        }
        _;
    }

    // ---------------------------------------------------------------- admin

    function setManager(address m) external onlyOwner {
        manager = m;
        emit ManagerSet(m);
    }

    function setGuardian(address g) external onlyOwner {
        guardian = g;
        emit GuardianSet(g);
    }

    function setRewardNotifier(address n) external onlyOwner {
        rewardNotifier = n;
        emit RewardNotifierSet(n);
    }

    function setRecovery(address r) external onlyOwner {
        recovery = r;
        emit RecoverySet(r);
    }

    /// @notice Stock tokens bought by the backstop (or anything sent by mistake) leave only through the owner
    /// (timelock). GLASS and USDG are accounted and cannot be swept.
    function sweep(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(glass) || token == address(usdg)) revert ProtectedToken();
        IERC20(token).safeTransfer(to, amount);
        emit Swept(token, to, amount);
    }

    // ---------------------------------------------------------------- staking

    function glassOf(address user) public view returns (uint256) {
        return sharesOf[user] * (totalGlass + 1) / (totalShares + VIRTUAL_SHARES);
    }

    function stake(uint256 amount) external nonReentrant updateReward(msg.sender) {
        if (amount == 0) revert ZeroAmount();
        uint256 shares = amount * (totalShares + VIRTUAL_SHARES) / (totalGlass + 1);
        if (shares == 0) revert ZeroAmount();
        glass.safeTransferFrom(msg.sender, address(this), amount);
        totalGlass += amount;
        totalShares += shares;
        sharesOf[msg.sender] += shares;
        cooldownStart[msg.sender] = 0; // adding stake restarts the cooldown
        emit Staked(msg.sender, amount, shares);
    }

    function cooldown() external {
        if (sharesOf[msg.sender] == 0) revert ZeroAmount();
        cooldownStart[msg.sender] = block.timestamp;
        emit Cooldown(msg.sender);
    }

    function unstake(uint256 shares, address to) external nonReentrant updateReward(msg.sender) {
        uint256 cs = cooldownStart[msg.sender];
        if (cs == 0 || block.timestamp < cs + COOLDOWN || block.timestamp > cs + COOLDOWN + UNSTAKE_WINDOW) {
            revert NotInWindow();
        }
        if (shares == 0) revert ZeroAmount();
        uint256 amount = shares * (totalGlass + 1) / (totalShares + VIRTUAL_SHARES);
        sharesOf[msg.sender] -= shares;
        totalShares -= shares;
        totalGlass -= amount;
        if (sharesOf[msg.sender] == 0) cooldownStart[msg.sender] = 0;
        glass.safeTransfer(to, amount);
        emit Unstaked(msg.sender, amount, shares);
    }

    /// @notice Add GLASS to the pool without minting shares (raises every staker's GLASS per share).
    /// Used for the 50% of bought-back GLASS that goes to the safety module.
    function donateGlass(uint256 amount) external nonReentrant {
        glass.safeTransferFrom(msg.sender, address(this), amount);
        totalGlass += amount;
        emit GlassDonated(msg.sender, amount);
    }

    // ---------------------------------------------------------------- rewards

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function rewardPerShare() public view returns (uint256) {
        if (totalShares == 0) return rewardPerShareStored;
        return rewardPerShareStored + (lastTimeRewardApplicable() - lastRewardUpdate) * rewardRate
            * (REWARD_SCALE / RATE_SCALE) / totalShares;
    }

    function earned(address user) public view returns (uint256) {
        return rewards[user] + sharesOf[user] * (rewardPerShare() - rewardPerSharePaid[user]) / REWARD_SCALE;
    }

    /// @notice Stream `amount` USDG to stakers over the next 7 days (added to whatever is still streaming).
    function notifyReward(uint256 amount) external nonReentrant updateReward(address(0)) {
        if (msg.sender != rewardNotifier && msg.sender != owner()) revert NotNotifier();
        if (amount == 0) revert ZeroAmount();
        if (totalShares == 0) revert NoStakers();
        usdg.safeTransferFrom(msg.sender, address(this), amount);
        uint256 leftover = block.timestamp < periodFinish ? (periodFinish - block.timestamp) * rewardRate : 0;
        rewardRate = (amount * RATE_SCALE + leftover) / REWARD_DURATION;
        lastRewardUpdate = block.timestamp;
        periodFinish = block.timestamp + REWARD_DURATION;
        emit RewardAdded(amount);
    }

    function claim(address to) external nonReentrant updateReward(msg.sender) returns (uint256 amount) {
        amount = rewards[msg.sender];
        if (amount == 0) return 0;
        rewards[msg.sender] = 0;
        usdg.safeTransfer(to, amount);
        emit RewardPaid(msg.sender, amount);
    }

    // ---------------------------------------------------------------- cover

    function fundReserve(uint256 amount) external nonReentrant {
        usdg.safeTransferFrom(msg.sender, address(this), amount);
        reserve += amount;
        emit ReserveFunded(amount);
    }

    /// @notice Pay a vault's shortfall from the USDG reserve; record what the reserve could not cover.
    function coverShortfall(address vault, uint256 amount) external onlyManager nonReentrant returns (uint256 paid) {
        paid = amount < reserve ? amount : reserve;
        reserve -= paid;
        if (amount > paid) {
            pendingShortfall[vault] += amount - paid;
            slashBudget += totalGlass * MAX_SLASH_BPS / 10_000; // one event = at most 30% of today's stake
        }
        if (paid != 0) usdg.safeTransfer(vault, paid);
        emit ShortfallCovered(vault, amount, paid);
    }

    /// @notice Buy an unsold auction lot at the floor price with reserve USDG (paid to the manager).
    function backstopPay(uint256 amount) external onlyManager nonReentrant {
        if (amount > reserve) revert InsufficientReserve();
        reserve -= amount;
        usdg.safeTransfer(msg.sender, amount);
        emit BackstopPaid(amount);
    }

    /// @notice Slash staked GLASS to the recovery address, within the budget opened by shortfall events.
    function slash(address vault, uint256 amount) external onlyGuardian nonReentrant {
        if (pendingShortfall[vault] == 0) revert NoShortfall();
        if (amount > slashBudget || amount > totalGlass * MAX_SLASH_BPS / 10_000) revert SlashTooLarge();
        if (lastSlash != 0 && block.timestamp < lastSlash + SLASH_INTERVAL) revert SlashTooSoon();
        lastSlash = block.timestamp;
        slashBudget -= amount;
        totalGlass -= amount;
        glass.safeTransfer(recovery, amount);
        emit Slashed(vault, amount, recovery);
    }

    /// @notice Forward USDG recovered (e.g. from selling slashed GLASS) to the vault that took the loss.
    function repayShortfall(address vault, uint256 amount) external nonReentrant {
        uint256 pending = pendingShortfall[vault];
        if (amount > pending) amount = pending;
        if (amount == 0) revert NoShortfall();
        pendingShortfall[vault] = pending - amount;
        usdg.safeTransferFrom(msg.sender, vault, amount);
        emit ShortfallRepaid(vault, amount);
    }
}
