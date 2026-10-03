// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {HourglassVault} from "../src/HourglassVault.sol";
import {LoanManager} from "../src/LoanManager.sol";
import {SafetyModule} from "../src/SafetyModule.sol";
import {FeeSplitter} from "../src/FeeSplitter.sol";
import {MockERC20, MockStockToken, MockFeed} from "./mocks/Mocks.sol";

abstract contract Base is Test {
    // Mon 5 Oct 2026 10:00 UTC and friends
    uint256 internal constant MON = 1791194400;
    uint256 internal constant WED = 1791367200;
    uint256 internal constant FRI = 1791540000;
    uint256 internal constant SAT = 1791626400;
    uint256 internal constant SUN = 1791712800;
    uint256 internal constant SLOT = 18 hours + 30 minutes;

    uint256 internal constant U = 1e6; // 1 USDG

    MockERC20 internal usdg;
    MockERC20 internal glass;
    MockStockToken internal nvda;
    MockStockToken internal spy;
    MockFeed internal nvdaFeed;
    MockFeed internal spyFeed;

    HourglassVault internal v7;
    HourglassVault internal v30;
    LoanManager internal lm;
    SafetyModule internal sm;
    FeeSplitter internal splitter;

    address internal guardian = makeAddr("guardian");
    address internal lender = makeAddr("lender");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal buyer = makeAddr("buyer");
    address internal buybackOp = makeAddr("buybackOp");
    address internal treasury = makeAddr("treasury");

    function setUp() public virtual {
        vm.warp(MON);
        usdg = new MockERC20("Global Dollar", "USDG", 6);
        glass = new MockERC20("Hourglass", "GLASS", 18);
        nvda = new MockStockToken("NVIDIA", "NVDA");
        spy = new MockStockToken("SPDR S&P 500", "SPY");
        nvdaFeed = new MockFeed();
        spyFeed = new MockFeed();
        nvdaFeed.set(236e8, vm.getBlockTimestamp());
        spyFeed.set(700e8, vm.getBlockTimestamp());

        v7 = new HourglassVault(usdg, "Hourglass USDG 7D", "hgUSDG-7D", 7 days, 10_000_000 * U, address(this));
        v30 = new HourglassVault(usdg, "Hourglass USDG 30D", "hgUSDG-30D", 30 days, 10_000_000 * U, address(this));
        splitter = new FeeSplitter(usdg, address(this));
        lm = new LoanManager(usdg, address(this), guardian, address(splitter));
        sm = new SafetyModule(glass, usdg, address(this), guardian);

        v7.setManager(address(lm));
        v30.setManager(address(lm));
        sm.setManager(address(lm));
        sm.setRewardNotifier(address(splitter));
        sm.setRecovery(makeAddr("recovery"));
        lm.setSafetyModule(address(sm));
        splitter.configure(address(sm), buybackOp, treasury, 50_000 * U);

        lm.setVault(address(v7), true, 6, 3 days); // 0.06%, 3-day interest floor
        lm.setVault(address(v30), true, 25, 10 days); // 0.25%, 10-day floor
        lm.setAsset(address(nvda), true, address(nvdaFeed));
        lm.setAsset(address(spy), true, address(spyFeed));
        lm.setRisk(address(v7), address(nvda), LoanManager.RiskParams(4500, 1000, 1600, 2000));
        lm.setRisk(address(v30), address(nvda), LoanManager.RiskParams(4000, 1000, 1600, 2000));
        lm.setRisk(address(v7), address(spy), LoanManager.RiskParams(6000, 800, 1200, 2000));

        _deposit(v7, lender, 1_000_000 * U);
        _deposit(v30, lender, 1_000_000 * U);

        nvda.mint(alice, 1_000e18);
        spy.mint(alice, 1_000e18);
        usdg.mint(alice, 100_000 * U);
        usdg.mint(buyer, 1_000_000 * U);
        vm.startPrank(alice);
        nvda.approve(address(lm), type(uint256).max);
        spy.approve(address(lm), type(uint256).max);
        usdg.approve(address(lm), type(uint256).max);
        vm.stopPrank();
        vm.prank(buyer);
        usdg.approve(address(lm), type(uint256).max);
    }

    function _deposit(HourglassVault v, address who, uint256 amount) internal {
        usdg.mint(who, amount);
        vm.startPrank(who);
        usdg.approve(address(v), amount);
        v.deposit(amount, who);
        vm.stopPrank();
    }

    /// @dev Alice borrows `principal` against `coll` NVDA in vault `v`.
    function _open(HourglassVault v, uint256 coll, uint256 principal) internal returns (uint256 id) {
        vm.prank(alice);
        id = lm.openLoan(address(v), address(nvda), coll, principal, type(uint256).max, type(uint256).max, alice);
    }

    /// @dev Keep every feed fresh at the current time.
    function _refresh(int256 nvdaPrice) internal {
        nvdaFeed.set(nvdaPrice, vm.getBlockTimestamp());
        spyFeed.set(700e8, vm.getBlockTimestamp());
    }

    function _weekday(uint256 ts) internal pure returns (uint256) {
        return (ts / 1 days + 4) % 7;
    }
}
