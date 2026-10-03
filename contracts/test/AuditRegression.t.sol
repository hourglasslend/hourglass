// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {LoanManager} from "../src/LoanManager.sol";
import {HourglassVault} from "../src/HourglassVault.sol";
import {SafetyModule} from "../src/SafetyModule.sol";

/// @notice One test per finding of the internal pre-testnet review (3 Oct 2026): each reproduces the attack
/// and asserts it no longer works.
contract AuditRegressionTest is Base {
    address internal attacker = makeAddr("attacker");

    function _now() internal view returns (uint256) {
        return vm.getBlockTimestamp();
    }

    function _giveNvda(address who, uint256 amount) internal {
        nvda.mint(who, amount);
        vm.prank(who);
        nvda.approve(address(lm), type(uint256).max);
    }

    function _openAs(address who, uint256 coll, uint256 principal) internal returns (uint256) {
        vm.prank(who);
        return lm.openLoan(address(v7), address(nvda), coll, principal, type(uint256).max, type(uint256).max, who);
    }

    function _fundReserve(uint256 amount) internal {
        usdg.mint(address(this), amount);
        usdg.approve(address(sm), type(uint256).max);
        sm.fundReserve(amount);
    }

    // H1: the auction clock does not run while the price is unusable
    function test_H1_AuctionClockSkipsOraclePause() public {
        uint256 id = _open(v7, 94.2e18, 10_000 * U);
        vm.warp(lm.graceEnd(id) + 1); // Wed 14 Oct 18:30, market open
        _refresh(236e8);
        lm.startAuction(id);

        vm.warp(_now() + 1 hours);
        _refresh(236e8);
        lm.pokeAuction(id);
        assertEq(lm.auctionActiveSecs(id), 1 hours);

        nvda.setOraclePaused(true); // keeper sees the pause and checkpoints
        lm.pokeAuction(id);
        vm.warp(_now() + 8 hours);
        nvda.setOraclePaused(false);
        _refresh(236e8);
        assertEq(lm.auctionActiveSecs(id), 1 hours, "8 paused hours not counted");
        assertEq(lm.auctionFactor(id), 10_200 - 1_700 / 4);

        lm.pokeAuction(id);
        vm.warp(_now() + 30 minutes);
        _refresh(236e8);
        assertEq(lm.auctionActiveSecs(id), 1.5 hours);
    }

    function test_H1_CannotStartAuctionWhilePausedOrStale() public {
        uint256 id = _open(v7, 94.2e18, 10_000 * U);
        vm.warp(lm.graceEnd(id) + 1);
        nvda.setOraclePaused(true);
        _refresh(236e8);
        vm.expectRevert(LoanManager.TokenPaused.selector);
        lm.startAuction(id);
        nvda.setOraclePaused(false);
        nvdaFeed.set(236e8, _now() - 26 hours);
        vm.expectRevert(LoanManager.StalePrice.selector);
        lm.startAuction(id);
        // the borrower can still repay in the meantime
        vm.prank(alice);
        lm.repay(id, alice);
    }

    // H2: rewards can't be ground down by dust top-ups
    function test_H2_OnlyFeeSplitterNotifies_NoRewardLoss() public {
        glass.mint(bob, 1_000e18);
        vm.startPrank(bob);
        glass.approve(address(sm), type(uint256).max);
        sm.stake(1_000e18);
        vm.stopPrank();

        usdg.mint(attacker, 10);
        vm.startPrank(attacker);
        usdg.approve(address(sm), type(uint256).max);
        vm.expectRevert(SafetyModule.NotNotifier.selector);
        sm.notifyReward(1);
        vm.stopPrank();

        // 100 honest distributions of 10 USDG, one per hour: stakers get their 40% with no loss
        uint256 t = _now();
        for (uint256 i; i < 100; ++i) {
            usdg.mint(address(splitter), 10 * U);
            splitter.distribute();
            t += 1 hours;
            vm.warp(t);
        }
        vm.warp(t + 8 days);
        assertApproxEqAbs(sm.earned(bob), 400 * U, 10, "within 10 wei of 400 USDG");
    }

    // M1: deposit -> borrow -> withdraw can't dodge the caps or cheapen the rate
    function test_M1_FreshDepositCannotLowerRateOrBypassCaps() public {
        lm.setRisk(address(v7), address(nvda), LoanManager.RiskParams(4500, 1000, 1600, 10_000));
        _giveNvda(bob, 100_000e18);
        _openAs(bob, 10_000e18, 750_000 * U); // 75% utilised

        vm.warp(MON + 1 days); // a new day: the next touch takes the daily snapshot (~1,000,000)
        _refresh(236e8);
        _giveNvda(attacker, 100_000e18);
        _deposit(v7, attacker, 1_000_000 * U);
        assertApproxEqAbs(v7.lendingBase(), 1_000_000 * U, 1_000 * U);

        vm.prank(attacker);
        vm.expectRevert(LoanManager.UtilizationTooHigh.selector);
        lm.openLoan(address(v7), address(nvda), 2_000e18, 100_000 * U, type(uint256).max, type(uint256).max, attacker);

        uint256 id = _openAs(attacker, 2_000e18, 40_000 * U);
        assertGe(lm.getLoan(id).rateBps, 1590, "priced as if the fresh deposit wasn't there");

        vm.warp(_now() + 5 minutes);
        _refresh(236e8);
        vm.startPrank(attacker);
        v7.redeem(v7.maxRedeem(attacker), attacker, attacker);
        vm.stopPrank();
        assertLe(v7.utilizationBps(), 8_000, "withdrawals never lift utilisation past 80%");
    }

    // M2: no deposits while an auction can move the share price
    function test_M2_DepositsPausedDuringAuction() public {
        uint256 id = _open(v7, 94.2e18, 10_000 * U);
        vm.warp(lm.graceEnd(id) + 1);
        _refresh(120e8);
        lm.startAuction(id);
        assertEq(v7.maxDeposit(attacker), 0);
        usdg.mint(attacker, 1_000_000 * U);
        vm.startPrank(attacker);
        usdg.approve(address(v7), type(uint256).max);
        vm.expectRevert();
        v7.deposit(1_000_000 * U, attacker);
        vm.stopPrank();

        vm.warp(_now() + 5 minutes);
        _refresh(120e8);
        vm.prank(buyer);
        lm.buy(id, type(uint256).max);
        assertGt(v7.maxDeposit(attacker), 0, "deposits reopen after settlement");
        assertEq(v7.lossProvision(), 0);
    }

    // M3: cancelled entries can't jam the queue
    function test_M3_QueueCannotBeJammed() public {
        _deposit(v7, attacker, 10 * U);
        vm.warp(_now() + 5 minutes);
        vm.startPrank(attacker);
        for (uint256 i; i < 3_000; ++i) {
            uint256 rid = v7.requestRedeem(1, attacker);
            v7.cancelRequest(rid);
        }
        vm.stopPrank();
        vm.prank(lender);
        uint256 lid = v7.requestRedeem(1e12, lender);

        uint256 g = gasleft();
        v7.processQueue(100);
        assertLt(g - gasleft(), 1_000_000, "bounded work per call");
        assertEq(v7.queueHead(), 100);
        v7.processQueue(3_000);
        v7.processQueue(1);
        (,, uint256 left) = v7.requests(lid);
        assertEq(left, 0, "the honest request is reached and filled");
    }

    // M4: backstop can't buy on a weekend price
    function test_M4_BackstopNeedsOpenMarket() public {
        vm.warp(WED);
        _refresh(236e8);
        uint256 id = _open(v7, 94.2e18, 10_000 * U);
        vm.warp(lm.graceEnd(id) + 1); // Thu 15 Oct 18:30
        _refresh(236e8);
        lm.startAuction(id);
        _fundReserve(100_000 * U);

        vm.warp(lm.graceEnd(id) + 1 days + 17.5 hours); // Sat 12:00 UTC
        _refresh(236e8);
        vm.expectRevert(LoanManager.StalePrice.selector);
        lm.backstopBuy(id);

        vm.warp(lm.graceEnd(id) + 3 days + 8 hours); // Mon 02:30 UTC, open again
        _refresh(236e8);
        lm.backstopBuy(id);
    }

    // M5: one shortfall event allows at most 30% of the stake in total, always to the recovery address
    function test_M5_SlashBudgetPerEvent() public {
        glass.mint(bob, 1_000e18);
        vm.startPrank(bob);
        glass.approve(address(sm), type(uint256).max);
        sm.stake(1_000e18);
        vm.stopPrank();
        uint256 id = _open(v7, 94.2e18, 10_000 * U);
        vm.warp(lm.graceEnd(id) + 1);
        _refresh(50e8);
        lm.startAuction(id);
        vm.prank(buyer);
        lm.buy(id, type(uint256).max);
        assertGt(sm.pendingShortfall(address(v7)), 0);
        assertEq(sm.slashBudget(), 300e18);

        vm.prank(guardian);
        sm.slash(address(v7), 300e18);
        assertEq(glass.balanceOf(makeAddr("recovery")), 300e18);
        vm.warp(_now() + 2 days);
        vm.prank(guardian);
        vm.expectRevert(SafetyModule.SlashTooLarge.selector);
        sm.slash(address(v7), 1e18);
        assertEq(sm.totalGlass(), 700e18);
    }

    // M6: a loan whose collateral fell can be marked before maturity
    function test_M6_MarkLoanBooksProvisionEarly() public {
        uint256 id = _open(v7, 94.2e18, 10_000 * U);
        vm.warp(_now() + 1 days);
        _refresh(110e8); // 94.2 x 110 = 10,362; 85% = 8,807.7
        uint256 taBefore = v7.totalAssets();
        lm.markLoan(id);
        LoanManager.Loan memory l = lm.getLoan(id);
        uint256 expected = uint256(l.principal) + l.lenderInterest - uint256(94.2e18) * 110e8 / 1e20 * 8_500 / 10_000;
        assertApproxEqAbs(lm.provisionOf(id), expected, 1);
        assertApproxEqAbs(taBefore - v7.totalAssets(), expected, 1);

        _refresh(236e8);
        lm.markLoan(id);
        assertEq(lm.provisionOf(id), 0, "released when the price recovers");

        _refresh(110e8);
        lm.markLoan(id);
        vm.prank(alice);
        lm.repay(id, alice);
        assertEq(v7.lossProvision(), 0, "released on repay");
    }

    // L1: dust can't lock a lender
    function test_L1_DustDepositDoesNotLock() public {
        vm.warp(_now() + 1 hours);
        usdg.mint(attacker, 1);
        vm.startPrank(attacker);
        usdg.approve(address(v7), 1);
        v7.deposit(1, lender);
        vm.stopPrank();
        assertGt(v7.maxWithdraw(lender), 0);
    }

    // L3: holidays can only be set for days that have not started
    function test_L3_NoRetroactiveHolidays() public {
        uint256 today = _now() / 1 days;
        vm.startPrank(guardian);
        vm.expectRevert(LoanManager.BadParam.selector);
        lm.setHoliday(today, true);
        vm.expectRevert(LoanManager.BadParam.selector);
        lm.setHoliday(today - 1, true);
        lm.setHoliday(today + 1, true);
        vm.stopPrank();
    }

    // L5: a borrower can preset where a third-party repayment sends the collateral
    function test_L5_PresetCollateralRecipient() public {
        uint256 id = _open(v7, 94.2e18, 5_000 * U);
        address fresh = makeAddr("fresh");
        vm.prank(alice);
        lm.setCollateralRecipient(id, fresh);
        nvda.setBlocked(alice, true);
        usdg.mint(bob, 10_000 * U);
        vm.startPrank(bob);
        usdg.approve(address(lm), type(uint256).max);
        lm.repay(id, bob);
        vm.stopPrank();
        assertEq(nvda.balanceOf(fresh), 94.2e18);
        vm.prank(bob);
        vm.expectRevert(LoanManager.NotBorrower.selector);
        lm.setCollateralRecipient(id, bob);
    }

    // Info: an unanswered Chainlink round is treated as stale
    function test_Info_UnansweredRoundIsStale() public {
        nvdaFeed.setRounds(5, 4);
        vm.prank(alice);
        vm.expectRevert(LoanManager.StalePrice.selector);
        lm.openLoan(address(v7), address(nvda), 94.2e18, 5_000 * U, type(uint256).max, type(uint256).max, alice);
    }
}
