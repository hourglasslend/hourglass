// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

interface ISafetyModuleFunding {
    function totalShares() external view returns (uint256);
    function reserve() external view returns (uint256);
    function notifyReward(uint256 amount) external;
    function fundReserve(uint256 amount) external;
}

/// @title FeeSplitter
/// @notice Receives every protocol fee in USDG (origination fees, 10% of interest) and splits it:
///   40% -> SafetyModule stakers (streamed over 7 days)
///   30% -> buyback operator (USDG -> ETH -> GLASS on the Pons/Uniswap v4 pool; half burned, half donated to
///          the SafetyModule; done off-chain by the operator, every step visible on-chain)
///   30% -> SafetyModule USDG reserve until it reaches `reserveTarget`, then the treasury.
/// With no stakers yet, the staker share goes to the reserve/treasury leg instead of being lost.
contract FeeSplitter is Ownable2Step {
    using SafeERC20 for IERC20;

    uint256 public constant STAKERS_BPS = 4_000;
    uint256 public constant BUYBACK_BPS = 3_000;

    IERC20 public immutable usdg;
    ISafetyModuleFunding public safetyModule;
    address public buybackOperator;
    address public treasury;
    uint256 public reserveTarget;

    event Configured(address safetyModule, address buybackOperator, address treasury, uint256 reserveTarget);
    event Distributed(uint256 stakers, uint256 buyback, uint256 reserve, uint256 treasury);

    constructor(IERC20 usdg_, address owner_) Ownable(owner_) {
        usdg = usdg_;
    }

    function configure(address sm, address buyback, address treasury_, uint256 target) external onlyOwner {
        safetyModule = ISafetyModuleFunding(sm);
        buybackOperator = buyback;
        treasury = treasury_;
        reserveTarget = target;
        emit Configured(sm, buyback, treasury_, target);
    }

    function distribute() external {
        uint256 bal = usdg.balanceOf(address(this));
        if (bal == 0) return;
        uint256 toStakers = bal * STAKERS_BPS / 10_000;
        uint256 toBuyback = bal * BUYBACK_BPS / 10_000;
        uint256 rest = bal - toStakers - toBuyback;
        if (safetyModule.totalShares() == 0) {
            rest += toStakers;
            toStakers = 0;
        }

        uint256 res = safetyModule.reserve();
        uint256 gap = reserveTarget > res ? reserveTarget - res : 0;
        uint256 toReserve = rest < gap ? rest : gap;
        uint256 toTreasury = rest - toReserve;

        if (toStakers != 0) {
            usdg.forceApprove(address(safetyModule), toStakers);
            safetyModule.notifyReward(toStakers);
        }
        if (toReserve != 0) {
            usdg.forceApprove(address(safetyModule), toReserve);
            safetyModule.fundReserve(toReserve);
        }
        if (toBuyback != 0) usdg.safeTransfer(buybackOperator, toBuyback);
        if (toTreasury != 0) usdg.safeTransfer(treasury, toTreasury);
        emit Distributed(toStakers, toBuyback, toReserve, toTreasury);
    }
}
