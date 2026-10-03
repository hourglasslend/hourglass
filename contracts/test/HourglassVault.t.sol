// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {HourglassVault} from "../src/HourglassVault.sol";
import {LoanManager} from "../src/LoanManager.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";

contract HourglassVaultTest is Base {
    function test_DepositLock_FiveMinutes_AndFollowsTransfers() public {
        address carol = makeAddr("carol");
        _deposit(v7, carol, 1_000 * U);
        assertEq(v7.maxWithdraw(carol), 0);
        vm.prank(carol);
        vm.expectRevert();
        v7.withdraw(1 * U, carol, carol);

        // moving the shares to a fresh wallet does not dodge the lock
        address fresh = makeAddr("fresh");
        uint256 shares = v7.balanceOf(carol);
        vm.prank(carol);
        v7.transfer(fresh, shares);
        assertEq(v7.maxRedeem(fresh), 0);

        vm.warp(vm.getBlockTimestamp() + 5 minutes);
        vm.prank(fresh);
        v7.redeem(shares, fresh, fresh);
        assertApproxEqAbs(usdg.balanceOf(fresh), 1_000 * U, 1);
    }

    function test_DepositCap() public {
        v7.setDepositCap(1_000_500 * U);
        assertEq(v7.maxDeposit(alice), 500 * U);
        usdg.mint(bob, 1_000 * U);
        vm.startPrank(bob);
        usdg.approve(address(v7), type(uint256).max);
        vm.expectRevert();
        v7.deposit(501 * U, bob);
        v7.deposit(500 * U, bob);
        vm.stopPrank();
    }

    function test_WithdrawalQueue_FilledByRepayment() public {
        nvda.mint(alice, 1_000_000e18);
        lm.setRisk(address(v7), address(nvda), LoanManager.RiskParams(4500, 1000, 1600, 10_000));
        uint256 id = _open(v7, 6_000e18, 600_000 * U); // 60% utilised
        vm.warp(vm.getBlockTimestamp() + 5 minutes);

        // withdrawals may only take utilisation up to 80%: 1,000,000 - 600,000 / 0.8 = 250,000
        assertApproxEqAbs(v7.maxWithdraw(lender), 250_000 * U, 1 * U); // + 5 minutes of interest
        uint256 shares = v7.convertToShares(500_000 * U);
        vm.prank(lender);
        uint256 rid = v7.requestRedeem(shares, lender);

        // the queue reserves the idle cash: nothing left to lend
        assertEq(v7.availableToLend(), 0);
        vm.prank(alice);
        vm.expectRevert();
        lm.openLoan(address(v7), address(nvda), 100e18, 1_000 * U, type(uint256).max, type(uint256).max, alice);

        v7.processQueue(10); // partial fill, stops at 80% utilisation
        (,, uint256 left) = v7.requests(rid);
        assertGt(left, 0);
        assertApproxEqAbs(usdg.balanceOf(lender), 250_000 * U, 1 * U);
        assertLe(v7.utilizationBps(), 8_000);

        vm.warp(lm.getLoan(id).maturity);
        _refresh(236e8);
        usdg.mint(alice, 1_000_000 * U);
        vm.prank(alice);
        lm.repay(id, alice);
        v7.processQueue(10);
        (,, left) = v7.requests(rid);
        assertEq(left, 0);
        assertGt(usdg.balanceOf(lender), 500_000 * U, "filled at the higher post-interest share price");
        assertEq(v7.queuedShares(), 0);
    }

    function test_CancelRequest() public {
        vm.warp(vm.getBlockTimestamp() + 5 minutes);
        uint256 shares = v7.balanceOf(lender) / 2;
        vm.startPrank(lender);
        uint256 rid = v7.requestRedeem(shares, lender);
        v7.cancelRequest(rid);
        vm.stopPrank();
        assertEq(v7.queuedShares(), 0);
        vm.prank(alice);
        vm.expectRevert(HourglassVault.NotRequestOwner.selector);
        v7.cancelRequest(rid);
    }

    function test_InflationAttackBlunted() public {
        HourglassVault fresh = new HourglassVault(usdg, "x", "x", 7 days, type(uint256).max, address(this));
        address attacker = makeAddr("attacker");
        usdg.mint(attacker, 1_000_001 * U);
        vm.startPrank(attacker);
        usdg.approve(address(fresh), type(uint256).max);
        fresh.deposit(1, attacker);
        usdg.transfer(address(fresh), 1_000_000 * U); // donation
        vm.stopPrank();

        usdg.mint(bob, 1_000 * U);
        vm.startPrank(bob);
        usdg.approve(address(fresh), type(uint256).max);
        uint256 shares = fresh.deposit(1_000 * U, bob);
        vm.stopPrank();
        assertGt(shares, 0);
        assertApproxEqRel(fresh.convertToAssets(shares), 1_000 * U, 0.01e18, "victim keeps >= 99%");
    }

    function test_OnlyManagerHooks() public {
        vm.expectRevert(HourglassVault.OnlyManager.selector);
        v7.openLoan(alice, 1, 1, MON + 8 days + 8.5 hours);
        vm.expectRevert(HourglassVault.ManagerAlreadySet.selector);
        v7.setManager(alice);
    }

    function test_AccrualAcrossManyMaturities_LongIdleGap() public {
        uint256[] memory ids = new uint256[](5);
        for (uint256 i; i < 5; ++i) {
            vm.warp(MON + i * 1 days);
            _refresh(236e8);
            ids[i] = _open(v7, 10e18, 1_000 * U);
        }
        uint256 expected;
        for (uint256 i; i < 5; ++i) {
            expected += lm.getLoan(ids[i]).lenderInterest;
        }
        // nobody touches the vault for 60 days: all accrual stopped at each maturity
        vm.warp(MON + 60 days);
        assertApproxEqAbs(v7.accruedInterest(), expected, 5);
        v7.sync();
        assertEq(v7.accrualRate(), 0);
    }

    /// @dev Any loan, repaid at any time before the auction: lenders end with exactly principal + net interest due.
    function testFuzz_VaultAccounting_OpenRepay(uint256 principal, uint256 repayAfter, uint256 openAt) public {
        principal = bound(principal, 100 * U, 10_000 * U);
        openAt = bound(openAt, MON, MON + 6 days);
        vm.warp(openAt);
        _refresh(236e8);
        uint256 ta0 = v7.totalAssets();
        uint256 id = _open(v7, 200e18, principal); // 200 NVDA = 47,200: fits even the weekend LTV
        LoanManager.Loan memory l = lm.getLoan(id);

        repayAfter = bound(repayAfter, 0, uint256(l.maturity) - l.start + 3 days);
        vm.warp(vm.getBlockTimestamp() + repayAfter);
        (, uint256 grossDue) = lm.amountDue(id);
        uint256 netDue = l.interest == 0 ? 0 : grossDue * l.lenderInterest / l.interest;
        vm.prank(alice);
        lm.repay(id, alice);

        assertEq(v7.outstanding(), 0);
        assertEq(v7.accrualRate(), 0);
        assertApproxEqAbs(v7.totalAssets(), ta0 + netDue, 2);
    }
}
