// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {LoanManager} from "../src/LoanManager.sol";

/// @notice Accrual-drift fuzz from the internal review (3 Oct 2026): open 3 loans, maybe roll one, close each
/// early, at maturity, in grace or by auction; the vault must end with no accrual left and assets == cash.
contract AccrualFuzzTest is Base {
    function _t() internal view returns (uint256) {
        return vm.getBlockTimestamp();
    }

    function _go(uint256 t) internal {
        vm.warp(t);
        _refresh(236e8);
    }

    /// open 3 loans at fuzzed times, roll one, repay all at fuzzed times (some exactly at maturity, some after)
    function testFuzz_AccrualDrift(uint256 a, uint256 b, uint256 c, uint256 r1, uint256 r2, uint256 r3, bool roll)
        public
    {
        uint256 t = MON;
        uint256[3] memory ids;
        ids[0] = _open(v7, 94.2e18, 10_000 * U);
        t += bound(a, 0, 3 days);
        _go(t);
        ids[1] = _open(v7, 94.2e18, 7_000 * U);
        t += bound(b, 0, 2 days);
        _go(t);
        ids[2] = _open(v7, 94.2e18, 333 * U);

        if (roll) {
            uint256 m = lm.getLoan(ids[0]).maturity;
            t = m - 1 days + bound(c, 0, 2 days); // in [m-1d, m+1d]
            if (t > lm.graceEnd(ids[0])) t = lm.graceEnd(ids[0]);
            if (t < _t()) t = _t();
            _go(t);
            vm.prank(alice);
            lm.rollover(ids[0], 9_000 * U, type(uint256).max, type(uint256).max);
        }
        uint256[3] memory rs = [r1, r2, r3];
        for (uint256 i; i < 3; ++i) {
            LoanManager.Loan memory l = lm.getLoan(ids[i]);
            uint256 mode = rs[i] % 3;
            uint256 when;
            if (mode == 0) when = l.maturity; // exactly at maturity
            else if (mode == 1) when = l.start + 1 + (rs[i] / 3) % (l.maturity - l.start); // before
            else when = l.maturity + 1 + (rs[i] / 3) % 1 days; // in grace
            if (when > lm.graceEnd(ids[i])) when = lm.graceEnd(ids[i]);
            if (when < _t()) {
                if (_t() > lm.graceEnd(ids[i])) {
                    _go(_t() + 1);
                    lm.startAuction(ids[i]);
                    uint256 tt = _t();
                    while (!lm.isMarketOpen()) {
                        tt += 1 hours;
                        _go(tt);
                    }
                    vm.prank(buyer);
                    lm.buy(ids[i], type(uint256).max);
                    continue;
                }
                when = _t();
            }
            _go(when);
            vm.prank(alice);
            lm.repay(ids[i], alice);
        }
        _go(_t() + 30 days);
        assertEq(v7.outstanding(), 0);
        assertEq(v7.accrualRate(), 0, "rate drift");
        assertEq(v7.accruedInterest(), 0, "accrued drift");
        assertEq(v7.totalAssets(), usdg.balanceOf(address(v7)), "ta == cash");
    }
}
