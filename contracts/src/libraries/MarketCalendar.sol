// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice US equity calendar math in UTC.
/// Maturity slots are Tue/Wed/Thu at 18:30 UTC (14:30 ET in summer, 13:30 ET in winter): always inside
/// regular US trading hours. The "closed" window is Fri 21:00 UTC -> Mon 01:00 UTC: it starts before the
/// Friday post-market ends and lasts until the Sunday 20:00 ET overnight session has opened under both EST
/// and EDT, so it never counts a weekend hour as "open". Holidays are whole UTC days set by the guardian.
library MarketCalendar {
    uint256 internal constant DAY = 1 days;
    uint256 internal constant SLOT_OFFSET = 18 hours + 30 minutes;
    uint256 internal constant FRI_CLOSE = 21 hours;
    uint256 internal constant MON_OPEN = 1 hours;

    error NoMaturitySlot();

    /// @return 0 = Sunday ... 6 = Saturday. 1970-01-01 was a Thursday.
    function weekday(uint256 ts) internal pure returns (uint256) {
        return (ts / DAY + 4) % 7;
    }

    function isSlot(uint256 ts) internal pure returns (bool) {
        uint256 wd = weekday(ts);
        return ts % DAY == SLOT_OFFSET && wd >= 2 && wd <= 4;
    }

    function isOpen(mapping(uint256 => bool) storage holiday, uint256 ts) internal view returns (bool) {
        if (holiday[ts / DAY]) return false;
        uint256 wd = weekday(ts);
        uint256 sod = ts % DAY;
        if (wd == 6 || wd == 0) return false;
        if (wd == 5 && sod >= FRI_CLOSE) return false;
        if (wd == 1 && sod < MON_OPEN) return false;
        return true;
    }

    /// @notice Nearest Tue/Wed/Thu 18:30 UTC slot (not a holiday) to `start + term`, at least 1 day after start.
    /// Ties go to the earlier slot. Without holidays the result is within +-2 days of the nominal term.
    function maturityFor(mapping(uint256 => bool) storage holiday, uint256 start, uint256 term)
        internal
        view
        returns (uint256 best)
    {
        uint256 target = start + term;
        uint256 bestDiff = type(uint256).max;
        uint256 firstDay = target / DAY - 4;
        for (uint256 d = firstDay; d <= firstDay + 14; ++d) {
            uint256 slot = d * DAY + SLOT_OFFSET;
            uint256 wd = (d + 4) % 7;
            if (wd < 2 || wd > 4 || holiday[d] || slot < start + DAY) continue;
            uint256 diff = slot > target ? slot - target : target - slot;
            if (diff < bestDiff) {
                bestDiff = diff;
                best = slot;
            }
        }
        if (best == 0) revert NoMaturitySlot();
    }

    /// @notice Seconds in [a, b) during which the market is closed (weekend window or holiday).
    function closedSeconds(mapping(uint256 => bool) storage holiday, uint256 a, uint256 b)
        internal
        view
        returns (uint256 total)
    {
        if (b <= a) return 0;
        for (uint256 d = a / DAY; d <= (b - 1) / DAY; ++d) {
            uint256 dayStart = d * DAY;
            uint256 wd = (d + 4) % 7;
            uint256 cs;
            uint256 ce;
            if (holiday[d] || wd == 6 || wd == 0) {
                (cs, ce) = (dayStart, dayStart + DAY);
            } else if (wd == 5) {
                (cs, ce) = (dayStart + FRI_CLOSE, dayStart + DAY);
            } else if (wd == 1) {
                (cs, ce) = (dayStart, dayStart + MON_OPEN);
            } else {
                continue;
            }
            uint256 lo = cs > a ? cs : a;
            uint256 hi = ce < b ? ce : b;
            if (hi > lo) total += hi - lo;
        }
    }
}
