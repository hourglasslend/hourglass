// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {LoanManager} from "../src/LoanManager.sol";
import {MarketCalendar} from "../src/libraries/MarketCalendar.sol";
import {FeeOnTransferToken, MockFeed} from "./mocks/Mocks.sol";

contract LoanManagerTest is Base {
    // ------------------------------------------------------------------ open + repay

    function test_OpenAndRepay_ExactCashFlows() public {
        uint256 coll = 94.2e18; // 94.2 NVDA x $236 = 22,231.20 USDG
        uint256 principal = 10_000 * U;
        uint256 aliceBefore = usdg.balanceOf(alice);

        uint256 id = _open(v7, coll, principal);
        LoanManager.Loan memory l = lm.getLoan(id);

        // util after = 1% -> rate = 10% + 6% * 1% / 80% = 10.07%
        assertEq(l.rateBps, 1007);
        // Mon 5 Oct 10:00 + 7d = Mon 12 Oct -> nearest slot Tue 13 Oct 18:30 UTC
        assertEq(l.maturity, MON + 8 days + 8 hours + 30 minutes);
        uint256 dur = l.maturity - MON;
        uint256 gross = principal * 1007 * dur / (365 days * 10_000);
        assertEq(l.interest, gross);
        assertEq(l.lenderInterest, gross - gross / 10);

        uint256 fee = principal * 6 / 10_000; // 6.00 USDG
        assertEq(fee, 6 * U);
        assertEq(usdg.balanceOf(alice) - aliceBefore, principal - fee);
        assertEq(usdg.balanceOf(address(splitter)), fee);
        assertEq(nvda.balanceOf(address(lm)), coll);
        assertEq(v7.outstanding(), principal);

        // vault value grows linearly with time, then stops at maturity
        uint256 ta0 = v7.totalAssets();
        vm.warp(MON + dur / 2);
        assertApproxEqAbs(v7.totalAssets() - ta0, l.lenderInterest / 2, 2);
        vm.warp(l.maturity);
        uint256 atMaturity = v7.totalAssets();
        vm.warp(l.maturity + 12 hours);
        assertEq(v7.totalAssets(), atMaturity, "accrual stops at maturity");

        // repay inside grace: full fixed interest
        vm.prank(alice);
        lm.repay(id, alice);
        assertEq(nvda.balanceOf(alice), 1_000e18);
        assertEq(v7.outstanding(), 0);
        assertEq(usdg.balanceOf(address(splitter)), fee + (gross - l.lenderInterest));
        assertEq(v7.totalAssets(), ta0 + l.lenderInterest);
        assertEq(uint8(lm.getLoan(id).status), uint8(LoanManager.Status.Repaid));
    }

    function test_DocExample_SevenDayLoanCost() public {
        // Wed open: 7 days exactly (Wed 10:00 -> Wed 18:30 + 7d)
        vm.warp(WED);
        _refresh(236e8);
        uint256 id = _open(v7, 94.2e18, 10_000 * U);
        LoanManager.Loan memory l = lm.getLoan(id);
        assertEq(l.maturity, WED + 7 days + 8 hours + 30 minutes);
        (uint256 p, uint256 i) = lm.amountDue(id);
        assertEq(p, 10_000 * U);
        // early repay floor (3 days) applies right after opening
        uint256 dur = l.maturity - WED;
        assertEq(i, uint256(l.interest) * 3 days / dur);
    }

    // ------------------------------------------------------------------ maturity calendar

    function test_MaturitySnapTable() public view {
        // opened at 10:00 UTC, 7-day term
        assertEq(lm.maturityFor(MON, 7 days), MON + 8 days + 8.5 hours); // Mon -> Tue (8d)
        assertEq(lm.maturityFor(WED, 7 days), WED + 7 days + 8.5 hours); // Wed -> Wed (7d)
        assertEq(lm.maturityFor(FRI, 7 days), FRI + 6 days + 8.5 hours); // Fri -> Thu (6d)
        assertEq(lm.maturityFor(SAT, 7 days), SAT + 5 days + 8.5 hours); // Sat -> Thu (5d)
        assertEq(lm.maturityFor(SUN, 7 days), SUN + 9 days + 8.5 hours); // Sun -> Tue (9d)
        for (uint256 i; i < 5; ++i) {
            uint256 m = lm.maturityFor(MON + i * 1 days, 30 days);
            uint256 wd = _weekday(m);
            assertTrue(wd >= 2 && wd <= 4);
            assertEq(m % 1 days, SLOT);
        }
    }

    function test_HolidaySkipsSlot() public {
        uint256 tueDay = (MON + 8 days) / 1 days; // Tue 13 Oct
        vm.prank(guardian);
        lm.setHoliday(tueDay, true);
        // nearest remaining slot to Mon 12 Oct 10:00: Thu 8 Oct 18:30 (-3d15.5h) vs Wed 14 Oct 18:30 (+2d8.5h)
        assertEq(lm.maturityFor(MON, 7 days), MON + 9 days + 8.5 hours);
    }

    function testFuzz_MaturityAlwaysASlotNearTerm(uint256 start, bool long) public view {
        start = bound(start, MON, MON + 3650 days);
        uint256 term = long ? 30 days : 7 days;
        uint256 m = lm.maturityFor(start, term);
        assertEq(m % 1 days, SLOT);
        uint256 wd = _weekday(m);
        assertTrue(wd >= 2 && wd <= 4, "Tue-Thu");
        uint256 target = start + term;
        uint256 diff = m > target ? m - target : target - m;
        assertLe(diff, 3 days, "within 3 days of nominal term");
    }

    // ------------------------------------------------------------------ risk checks

    function test_RevertWhen_LtvTooHigh() public {
        // 45% of 22,231.20 = 10,004.04
        vm.prank(alice);
        vm.expectRevert(LoanManager.LtvTooHigh.selector);
        lm.openLoan(address(v7), address(nvda), 94.2e18, 10_005 * U, type(uint256).max, type(uint256).max, alice);
        _open(v7, 94.2e18, 10_004 * U);
    }

    function test_WeekendHaircut() public {
        vm.warp(SAT);
        _refresh(236e8);
        assertFalse(lm.isMarketOpen());
        // weekend LTV = 35% of 22,231.20 = 7,780.92
        vm.prank(alice);
        vm.expectRevert(LoanManager.LtvTooHigh.selector);
        lm.openLoan(address(v7), address(nvda), 94.2e18, 7_781 * U, type(uint256).max, type(uint256).max, alice);
        _open(v7, 94.2e18, 7_780 * U);
    }

    function test_Staleness_SessionAware() public {
        // Monday, price 26h old -> stale during session
        nvdaFeed.set(236e8, vm.getBlockTimestamp() - 26 hours);
        vm.prank(alice);
        vm.expectRevert(LoanManager.StalePrice.selector);
        lm.openLoan(address(v7), address(nvda), 94.2e18, 5_000 * U, type(uint256).max, type(uint256).max, alice);

        // Sunday 10:00: Friday 20:00 price (38h old) is fine while closed
        vm.warp(SUN);
        nvdaFeed.set(236e8, SUN - 38 hours);
        _open(v7, 94.2e18, 5_000 * U);

        // 73h old is too old even on a weekend
        nvdaFeed.set(236e8, SUN - 73 hours);
        vm.prank(alice);
        vm.expectRevert(LoanManager.StalePrice.selector);
        lm.openLoan(address(v7), address(nvda), 94.2e18, 5_000 * U, type(uint256).max, type(uint256).max, alice);
    }

    function test_OraclePausedBlocksNewLoansButNotRepay() public {
        uint256 id = _open(v7, 94.2e18, 5_000 * U);
        nvda.setOraclePaused(true);
        vm.prank(alice);
        vm.expectRevert(LoanManager.TokenPaused.selector);
        lm.openLoan(address(v7), address(nvda), 10e18, 1_000 * U, type(uint256).max, type(uint256).max, alice);
        vm.prank(alice);
        lm.addCollateral(id, 1e18);
        vm.prank(alice);
        lm.repay(id, alice);
    }

    function test_AssetCapAndUtilization() public {
        // cap = 20% of 1,000,000 = 200,000 against NVDA in v7
        nvda.mint(alice, 1_000_000e18);
        _open(v7, 1_000e18, 100_000 * U);
        vm.prank(alice);
        vm.expectRevert(LoanManager.AssetCapReached.selector);
        lm.openLoan(address(v7), address(nvda), 1_000e18, 100_001 * U, type(uint256).max, type(uint256).max, alice);

        // utilisation cap 80%: raise the asset cap and borrow up to it
        lm.setRisk(address(v7), address(nvda), LoanManager.RiskParams(4500, 1000, 1600, 10_000));
        _open(v7, 7_000e18, 700_000 * U);
        vm.prank(alice);
        vm.expectRevert(LoanManager.UtilizationTooHigh.selector);
        lm.openLoan(address(v7), address(nvda), 100e18, 1_000 * U, type(uint256).max, type(uint256).max, alice);
    }

    function test_RateRisesWithUtilizationAndIsFixed() public {
        nvda.mint(alice, 1_000_000e18);
        lm.setRisk(address(v7), address(nvda), LoanManager.RiskParams(4500, 1000, 1600, 10_000));
        uint256 a = _open(v7, 5_000e18, 400_000 * U); // util 40% -> 10% + 6% * 0.5 = 13%
        assertEq(lm.getLoan(a).rateBps, 1300);
        uint256 b = _open(v7, 5_000e18, 400_000 * U); // util 80% -> 16%
        assertEq(lm.getLoan(b).rateBps, 1600);
        assertEq(lm.getLoan(a).rateBps, 1300, "first loan keeps its rate");
    }

    function test_MaxRateAndMaxFeeProtectBorrower() public {
        vm.prank(alice);
        vm.expectRevert(LoanManager.RateTooHigh.selector);
        lm.openLoan(address(v7), address(nvda), 94.2e18, 10_000 * U, 1006, type(uint256).max, alice);
        vm.prank(alice);
        vm.expectRevert(LoanManager.FeeTooHigh.selector);
        lm.openLoan(address(v7), address(nvda), 94.2e18, 10_000 * U, 1007, 5 * U, alice);
    }

    function test_RevertWhen_FeeOnTransferCollateral() public {
        FeeOnTransferToken fot = new FeeOnTransferToken();
        MockFeed f = new MockFeed();
        f.set(100e8, vm.getBlockTimestamp());
        lm.setAsset(address(fot), true, address(f));
        lm.setRisk(address(v7), address(fot), LoanManager.RiskParams(5000, 1000, 1600, 2000));
        fot.mint(alice, 100e18);
        vm.startPrank(alice);
        fot.approve(address(lm), type(uint256).max);
        vm.expectRevert(LoanManager.FeeOnTransfer.selector);
        lm.openLoan(address(v7), address(fot), 100e18, 1_000 * U, type(uint256).max, type(uint256).max, alice);
        vm.stopPrank();
    }

    function test_RevertWhen_LoanTooSmall() public {
        vm.prank(alice);
        vm.expectRevert(LoanManager.LoanTooSmall.selector);
        lm.openLoan(address(v7), address(nvda), 10e18, 99 * U, type(uint256).max, type(uint256).max, alice);
    }

    // ------------------------------------------------------------------ repay variants

    function test_EarlyRepay_MinInterestFloor() public {
        uint256 id = _open(v7, 94.2e18, 10_000 * U);
        LoanManager.Loan memory l = lm.getLoan(id);
        uint256 dur = l.maturity - l.start;

        vm.warp(MON + 1 days); // used 1 day, pays the 3-day floor
        _refresh(236e8);
        (, uint256 due1) = lm.amountDue(id);
        assertEq(due1, uint256(l.interest) * 3 days / dur);

        vm.warp(MON + 5 days); // past the floor: pro-rata
        (, uint256 due5) = lm.amountDue(id);
        assertEq(due5, uint256(l.interest) * 5 days / dur);

        uint256 ta0 = v7.totalAssets();
        vm.prank(alice);
        lm.repay(id, alice);
        assertGe(v7.totalAssets(), ta0, "lenders never lose on early repay");
        assertEq(v7.accrualRate(), 0);
        assertEq(v7.rateEndingAt(l.maturity), 0);
    }

    function test_ThirdPartyRepay_CollateralAlwaysToBorrower() public {
        uint256 id = _open(v7, 94.2e18, 5_000 * U);
        usdg.mint(bob, 10_000 * U);
        vm.startPrank(bob);
        usdg.approve(address(lm), type(uint256).max);
        lm.repay(id, bob);
        vm.stopPrank();
        assertEq(nvda.balanceOf(bob), 0);
        assertEq(nvda.balanceOf(alice), 1_000e18);
    }

    function test_BlocklistedBorrowerRepaysToFreshWallet() public {
        uint256 id = _open(v7, 94.2e18, 5_000 * U);
        nvda.setBlocked(alice, true);
        address fresh = makeAddr("fresh");
        vm.prank(alice);
        lm.repay(id, fresh);
        assertEq(nvda.balanceOf(fresh), 94.2e18);
    }

    function test_PauseOnlyStopsNewLoans() public {
        uint256 id = _open(v7, 94.2e18, 5_000 * U);
        vm.prank(guardian);
        lm.setNewLoansPaused(true);
        vm.prank(alice);
        vm.expectRevert(LoanManager.Paused.selector);
        lm.openLoan(address(v7), address(nvda), 10e18, 1_000 * U, type(uint256).max, type(uint256).max, alice);
        vm.prank(alice);
        lm.addCollateral(id, 1e18);
        vm.prank(alice);
        lm.repay(id, alice);
    }

    function test_RevertWhen_NotGuardianOrOwner() public {
        vm.prank(alice);
        vm.expectRevert(LoanManager.OnlyGuardian.selector);
        lm.setNewLoansPaused(true);
        vm.prank(guardian);
        vm.expectRevert();
        lm.setProtocolInterestBps(500);
        vm.expectRevert(LoanManager.BadParam.selector);
        lm.setProtocolInterestBps(2_001);
        vm.expectRevert(LoanManager.BadParam.selector);
        lm.setVault(address(v7), true, 101, 3 days);
    }

    // ------------------------------------------------------------------ rollover

    function test_Rollover_SamePrincipal_PaysInterestAndFee() public {
        uint256 id = _open(v7, 94.2e18, 10_000 * U);
        LoanManager.Loan memory l = lm.getLoan(id);
        vm.warp(l.maturity - 1 days);
        _refresh(236e8);
        uint256 bal = usdg.balanceOf(alice);
        (, uint256 due) = lm.amountDue(id);

        vm.prank(alice);
        lm.rollover(id, 10_000 * U, type(uint256).max, type(uint256).max);

        LoanManager.Loan memory n = lm.getLoan(id);
        uint256 fee = 10_000 * U * 6 / 10_000;
        assertEq(bal - usdg.balanceOf(alice), due + fee, "borrower pays only old interest + new fee");
        assertEq(n.principal, 10_000 * U);
        assertGt(n.maturity, l.maturity);
        assertEq(v7.outstanding(), 10_000 * U);
        assertEq(nvda.balanceOf(address(lm)), 94.2e18);
    }

    function test_Rollover_LargerPrincipalAfterPriceRise() public {
        uint256 id = _open(v7, 94.2e18, 8_000 * U);
        LoanManager.Loan memory l = lm.getLoan(id);
        vm.warp(l.maturity - 1 days);
        _refresh(300e8); // NVDA up: 94.2 x 300 x 45% = 12,717
        uint256 bal = usdg.balanceOf(alice);
        (, uint256 due) = lm.amountDue(id);
        vm.prank(alice);
        lm.rollover(id, 12_000 * U, type(uint256).max, type(uint256).max);
        uint256 fee = 12_000 * U * 6 / 10_000;
        assertEq(usdg.balanceOf(alice) - bal, 4_000 * U - due - fee, "borrower receives the extra, net");
        assertEq(v7.outstanding(), 12_000 * U);
    }

    function test_Rollover_LtvRecheckedAtNewPrice() public {
        uint256 id = _open(v7, 94.2e18, 10_000 * U);
        LoanManager.Loan memory l = lm.getLoan(id);
        vm.warp(l.maturity - 1 days);
        _refresh(200e8); // max now 94.2 x 200 x 45% = 8,478
        vm.startPrank(alice);
        vm.expectRevert(LoanManager.LtvTooHigh.selector);
        lm.rollover(id, 10_000 * U, type(uint256).max, type(uint256).max);
        lm.addCollateral(id, 20e18); // 114.2 x 200 x 45% = 10,278
        lm.rollover(id, 10_000 * U, type(uint256).max, type(uint256).max);
        vm.stopPrank();
    }

    function test_RevertWhen_RolloverOutsideWindow() public {
        uint256 id = _open(v7, 94.2e18, 10_000 * U);
        vm.prank(alice);
        vm.expectRevert(LoanManager.NotInRollWindow.selector);
        lm.rollover(id, 10_000 * U, type(uint256).max, type(uint256).max);
    }

    // ------------------------------------------------------------------ default + auction

    function _defaultLoan() internal returns (uint256 id, LoanManager.Loan memory l) {
        id = _open(v7, 94.2e18, 10_000 * U);
        l = lm.getLoan(id);
        vm.warp(l.maturity + 24 hours);
        vm.expectRevert(LoanManager.GraceNotOver.selector);
        lm.startAuction(id);
        vm.warp(l.maturity + 24 hours + 1);
    }

    function test_Auction_SurplusGoesBackToBorrower() public {
        (uint256 id, LoanManager.Loan memory l) = _defaultLoan();
        _refresh(200e8); // NVDA fell to $200: lot = 18,840 USDG
        lm.startAuction(id);
        assertEq(lm.auctionFactor(id), 10_200);

        vm.warp(vm.getBlockTimestamp() + 2 hours); // Wed 20:30 UTC, market open
        _refresh(200e8);
        uint256 factor = lm.auctionFactor(id);
        assertEq(factor, 10_200 - 1_700 / 2);
        uint256 price = lm.auctionPrice(id);
        assertEq(price, 18_840 * U * factor / 10_000);

        uint256 vaultBefore = usdg.balanceOf(address(v7));
        uint256 splitBefore = usdg.balanceOf(address(splitter));
        vm.prank(buyer);
        lm.buy(id, price);

        uint256 claimAmt = uint256(l.principal) + l.lenderInterest + uint256(l.principal) / 100;
        assertEq(usdg.balanceOf(address(v7)) - vaultBefore, claimAmt);
        assertEq(usdg.balanceOf(address(splitter)) - splitBefore, l.interest - l.lenderInterest);
        uint256 expectedSurplus = price - claimAmt - (l.interest - l.lenderInterest);
        assertEq(lm.surplus(alice), expectedSurplus);
        assertEq(nvda.balanceOf(buyer), 94.2e18);
        assertEq(v7.outstanding(), 0);
        assertEq(v7.lossProvision(), 0);

        uint256 before = usdg.balanceOf(alice);
        vm.prank(alice);
        lm.claimSurplus(alice);
        assertEq(usdg.balanceOf(alice) - before, expectedSurplus);
    }

    function test_Auction_ShortfallCoveredByReserve() public {
        usdg.mint(address(this), 2_000 * U);
        usdg.approve(address(sm), type(uint256).max);
        sm.fundReserve(2_000 * U);

        (uint256 id, LoanManager.Loan memory l) = _defaultLoan();
        _refresh(100e8); // crash: lot = 9,420 USDG
        lm.startAuction(id);
        assertGt(v7.lossProvision(), 0, "expected loss provisioned at start");
        uint256 prov = lm.provisionOf(id);

        vm.warp(vm.getBlockTimestamp() + 1 hours);
        _refresh(100e8);
        uint256 price = lm.auctionPrice(id);
        uint256 vaultAssetsBefore = v7.totalAssets();
        vm.prank(buyer);
        lm.buy(id, price);

        uint256 claimAmt = uint256(l.principal) + l.lenderInterest + uint256(l.principal) / 100;
        uint256 shortfall = claimAmt - price;
        uint256 covered = shortfall < 2_000 * U ? shortfall : 2_000 * U;
        assertEq(sm.reserve(), 2_000 * U - covered);
        assertEq(sm.pendingShortfall(address(v7)), shortfall - covered);
        assertEq(lm.surplus(alice), 0);
        assertEq(v7.lossProvision(), 0);
        // vault ends with everything it was owed (incl. the 1% penalty) minus the part the reserve could not cover;
        // the provision taken at auction start is released
        uint256 penalty = uint256(l.principal) / 100;
        assertApproxEqAbs(v7.totalAssets() + (shortfall - covered), vaultAssetsBefore + prov + penalty, 2);
    }

    function test_Auction_ClockStopsOverWeekend() public {
        // open Fri -> maturity Thu 18:30, grace ends Fri 18:30
        vm.warp(FRI);
        _refresh(236e8);
        uint256 id = _open(v7, 94.2e18, 10_000 * U);
        LoanManager.Loan memory l = lm.getLoan(id);
        assertEq(_weekday(l.maturity), 4);
        uint256 start = l.maturity + 24 hours + 1; // Fri 18:30:01
        vm.warp(start);
        _refresh(236e8);
        lm.startAuction(id);

        vm.warp(start + 2.5 hours); // Fri 21:00:01 UTC: market just closed
        assertEq(lm.auctionFactor(id), 10_200 - uint256(1_700) * (2.5 hours - 1) / 4 hours);
        uint256 atClose = lm.auctionFactor(id);
        vm.warp(start + 2 days); // Sunday 18:30, still closed
        assertEq(lm.auctionFactor(id), atClose, "no decay while closed");
        _refresh(236e8);
        vm.prank(buyer);
        vm.expectRevert(LoanManager.StalePrice.selector);
        lm.buy(id, type(uint256).max);
    }

    function test_Backstop_AfterEightMarketHours() public {
        usdg.mint(address(this), 20_000 * U);
        usdg.approve(address(sm), type(uint256).max);
        sm.fundReserve(20_000 * U);
        (uint256 id,) = _defaultLoan(); // auction starts Wed 18:30 UTC
        _refresh(236e8);
        lm.startAuction(id);
        vm.warp(vm.getBlockTimestamp() + 7 hours);
        _refresh(236e8);
        vm.expectRevert(LoanManager.BackstopNotOpen.selector);
        lm.backstopBuy(id);
        vm.warp(vm.getBlockTimestamp() + 1 hours);
        _refresh(236e8);
        assertEq(lm.auctionFactor(id), 7_000);
        lm.backstopBuy(id);
        assertEq(nvda.balanceOf(address(sm)), 94.2e18);
        assertEq(uint8(lm.getLoan(id).status), uint8(LoanManager.Status.Settled));
        // 70% of 22,231.20 = 15,561.84 -> vault paid in full, surplus to alice
        assertGt(lm.surplus(alice), 0);
    }

    function test_DisabledAssetStillRepaysAndAuctions() public {
        uint256 a = _open(v7, 94.2e18, 5_000 * U);
        uint256 b = _open(v7, 94.2e18, 5_000 * U);
        lm.setAsset(address(nvda), false, address(nvdaFeed));
        vm.prank(alice);
        vm.expectRevert(LoanManager.AssetDisabled.selector);
        lm.openLoan(address(v7), address(nvda), 10e18, 1_000 * U, type(uint256).max, type(uint256).max, alice);
        vm.prank(alice);
        lm.repay(a, alice);

        vm.warp(lm.getLoan(b).maturity + 24 hours + 1);
        _refresh(236e8);
        lm.startAuction(b);
        uint256 price = lm.auctionPrice(b);
        vm.prank(buyer);
        lm.buy(b, price);
        assertEq(uint8(lm.getLoan(b).status), uint8(LoanManager.Status.Settled));
    }

    function test_GuardianExtendsGrace_OnlyForward() public {
        uint256 id = _open(v7, 94.2e18, 10_000 * U);
        LoanManager.Loan memory l = lm.getLoan(id);
        uint256 until = l.maturity + 3 days;
        vm.warp(l.maturity);
        vm.prank(guardian);
        lm.extendGrace(until);
        assertEq(lm.graceEnd(id), until);
        vm.warp(l.maturity + 24 hours + 1);
        _refresh(236e8);
        vm.expectRevert(LoanManager.GraceNotOver.selector);
        lm.startAuction(id);
        vm.startPrank(guardian);
        vm.expectRevert(LoanManager.BadParam.selector);
        lm.extendGrace(until - 1); // can't move back
        vm.expectRevert(LoanManager.BadParam.selector);
        lm.extendGrace(vm.getBlockTimestamp() + 8 days); // max 7 days ahead
        vm.stopPrank();
    }

    function test_RepayStillPossibleAfterGraceUntilAuctionStarts() public {
        uint256 id = _open(v7, 94.2e18, 10_000 * U);
        vm.warp(lm.getLoan(id).maturity + 3 days);
        vm.prank(alice);
        lm.repay(id, alice);
        vm.expectRevert(LoanManager.BadStatus.selector);
        lm.startAuction(id);
    }
}
