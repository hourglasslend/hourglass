// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {SafetyModule} from "../src/SafetyModule.sol";

contract SafetyModuleTest is Base {
    address internal staker = makeAddr("staker");
    address internal recovery = makeAddr("recovery");

    function setUp() public override {
        super.setUp();
        glass.mint(staker, 1_000_000e18);
        vm.prank(staker);
        glass.approve(address(sm), type(uint256).max);
    }

    function _stake(uint256 amount) internal {
        vm.prank(staker);
        sm.stake(amount);
    }

    function test_Cooldown_TenDaysThenTwoDayWindow() public {
        _stake(1_000e18);
        uint256 shares = sm.sharesOf(staker);
        uint256 t0 = MON;
        vm.startPrank(staker);
        vm.expectRevert(SafetyModule.NotInWindow.selector);
        sm.unstake(shares, staker);
        sm.cooldown();
        vm.warp(t0 + 10 days - 1);
        vm.expectRevert(SafetyModule.NotInWindow.selector);
        sm.unstake(shares, staker);
        vm.warp(t0 + 12 days + 1); // window missed
        vm.expectRevert(SafetyModule.NotInWindow.selector);
        sm.unstake(shares, staker);

        sm.cooldown(); // start again
        vm.warp(t0 + 22 days + 1);
        sm.unstake(shares, staker);
        vm.stopPrank();
        assertApproxEqAbs(glass.balanceOf(staker), 1_000_000e18, 1e12);
    }

    function test_AddingStakeResetsCooldown() public {
        _stake(1_000e18);
        vm.prank(staker);
        sm.cooldown();
        vm.warp(MON + 9 days);
        _stake(1e18);
        assertEq(sm.cooldownStart(staker), 0);
    }

    function test_FeesSplit_40_30_30_AndStreamToStakers() public {
        _stake(1_000e18);
        usdg.mint(address(splitter), 1_000 * U);
        splitter.distribute();
        assertEq(usdg.balanceOf(buybackOp), 300 * U);
        assertEq(sm.reserve(), 300 * U, "treasury leg fills the reserve first");
        assertEq(usdg.balanceOf(treasury), 0);

        vm.warp(MON + 7 days);
        assertApproxEqAbs(sm.earned(staker), 400 * U, 1 * U);
        vm.prank(staker);
        sm.claim(staker);
        assertApproxEqAbs(usdg.balanceOf(staker), 400 * U, 1 * U);
    }

    function test_FeesWithNoStakers_GoToReserveThenTreasury() public {
        splitter.configure(address(sm), buybackOp, treasury, 500 * U);
        usdg.mint(address(splitter), 1_000 * U);
        splitter.distribute();
        assertEq(usdg.balanceOf(buybackOp), 300 * U);
        assertEq(sm.reserve(), 500 * U);
        assertEq(usdg.balanceOf(treasury), 200 * U);
    }

    function test_Slash_NeedsShortfall_30PctBudgetPerEvent() public {
        _stake(1_000e18);
        vm.prank(guardian);
        vm.expectRevert(SafetyModule.NoShortfall.selector);
        sm.slash(address(v7), 1e18);

        // record an uncovered shortfall (reserve empty)
        vm.prank(address(lm));
        sm.coverShortfall(address(v7), 500 * U);
        assertEq(sm.pendingShortfall(address(v7)), 500 * U);

        vm.startPrank(guardian);
        vm.expectRevert(SafetyModule.SlashTooLarge.selector);
        sm.slash(address(v7), 301e18);
        sm.slash(address(v7), 300e18);
        vm.warp(MON + 2 days);
        vm.expectRevert(SafetyModule.SlashTooLarge.selector); // this event's 30% budget is used up
        sm.slash(address(v7), 1e18);
        vm.stopPrank();
        assertEq(glass.balanceOf(recovery), 300e18);
        assertApproxEqAbs(sm.glassOf(staker), 700e18, 1e12, "stakers absorb the slash pro rata");

        // recovery sells GLASS off-chain and repays the vault
        uint256 before = usdg.balanceOf(address(v7));
        usdg.mint(recovery, 500 * U);
        vm.startPrank(recovery);
        usdg.approve(address(sm), type(uint256).max);
        sm.repayShortfall(address(v7), 600 * U); // capped at what is pending
        vm.stopPrank();
        assertEq(usdg.balanceOf(address(v7)) - before, 500 * U);
        assertEq(sm.pendingShortfall(address(v7)), 0);
    }

    function test_OnlyManagerAndProtectedSweep() public {
        vm.expectRevert(SafetyModule.OnlyManager.selector);
        sm.coverShortfall(address(v7), 1);
        vm.expectRevert(SafetyModule.ProtectedToken.selector);
        sm.sweep(address(glass), address(this), 1);
        vm.expectRevert(SafetyModule.ProtectedToken.selector);
        sm.sweep(address(usdg), address(this), 1);
    }

    function test_DonateGlassRaisesStakePerShare() public {
        _stake(1_000e18);
        glass.mint(buybackOp, 100e18);
        vm.startPrank(buybackOp);
        glass.approve(address(sm), type(uint256).max);
        sm.donateGlass(100e18);
        vm.stopPrank();
        assertApproxEqAbs(sm.glassOf(staker), 1_100e18, 1e12);
    }
}
