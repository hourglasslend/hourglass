// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {LoanManager} from "../src/LoanManager.sol";
import {MockERC20, MockStockToken, MockFeed} from "./mocks/Mocks.sol";

contract DeployTest is Test {
    Deploy internal script = new Deploy();
    address internal admin = makeAddr("admin");
    address internal guardian = makeAddr("guardian");

    function test_DeployHandsEverythingToTimelock() public {
        vm.warp(1791194400);
        MockERC20 usdg = new MockERC20("USDG", "USDG", 6);
        MockERC20 glass = new MockERC20("GLASS", "GLASS", 18);
        MockStockToken nvda = new MockStockToken("NVDA", "NVDA");
        MockFeed feed = new MockFeed();
        feed.set(236e8, vm.getBlockTimestamp());
        Deploy.Listing[] memory l = new Deploy.Listing[](1);
        l[0] = Deploy.Listing(address(nvda), address(feed), 4500, 4000, 1000, 1600);

        Deploy.Config memory c = Deploy.Config({
            usdg: IERC20(address(usdg)),
            glass: IERC20(address(glass)),
            admin: admin,
            guardian: guardian,
            buyback: makeAddr("buyback"),
            treasury: makeAddr("treasury"),
            delay: 48 hours,
            vaultCap: 250_000e6,
            reserveTarget: 25_000e6,
            setup: address(script) // the script contract sends the calls, as under forge script
        });
        Deploy.Deployment memory d = script.deploy(c, l);
        address setup = address(script);

        // config as approved
        (bool en, uint16 fee7, uint32 floor7) = d.lm.vaults(address(d.v7));
        (, uint16 fee30, uint32 floor30) = d.lm.vaults(address(d.v30));
        assertTrue(en);
        assertEq(fee7, 6);
        assertEq(fee30, 25);
        assertEq(floor7, 3 days);
        assertEq(floor30, 10 days);
        (uint16 ltv,,, uint16 cap) = d.lm.risk(address(d.v30), address(nvda));
        assertEq(ltv, 4000);
        assertEq(cap, 2000);
        assertEq(d.v7.depositCap(), 250_000e6);
        assertEq(d.lm.guardian(), guardian);

        // deployer holds no timelock role
        assertFalse(d.timelock.hasRole(d.timelock.PROPOSER_ROLE(), setup));
        assertFalse(d.timelock.hasRole(d.timelock.CANCELLER_ROLE(), setup));
        assertFalse(d.timelock.hasRole(d.timelock.DEFAULT_ADMIN_ROLE(), setup));
        assertTrue(d.timelock.hasRole(d.timelock.PROPOSER_ROLE(), admin));
        assertTrue(d.timelock.hasRole(d.timelock.CANCELLER_ROLE(), guardian));
        assertFalse(d.timelock.hasRole(d.timelock.PROPOSER_ROLE(), guardian));

        // acceptance batch: not before the delay, then anyone executes it
        (address[] memory t, uint256[] memory v, bytes[] memory p, bytes32 salt) = script.acceptBatch(d);
        vm.expectRevert();
        d.timelock.executeBatch(t, v, p, bytes32(0), salt);
        vm.warp(vm.getBlockTimestamp() + 48 hours);
        vm.prank(makeAddr("anyone"));
        d.timelock.executeBatch(t, v, p, bytes32(0), salt);

        assertEq(d.lm.owner(), address(d.timelock));
        assertEq(d.v7.owner(), address(d.timelock));
        assertEq(d.v30.owner(), address(d.timelock));
        assertEq(d.sm.owner(), address(d.timelock));
        assertEq(d.splitter.owner(), address(d.timelock));

        // and the deployer can no longer change anything
        vm.prank(setup);
        vm.expectRevert();
        d.lm.setProtocolInterestBps(0);
    }

    function test_MainnetListingsMatchApprovedTable() public view {
        Deploy.Listing[] memory l = script.mainnetListings();
        assertEq(l.length, 10);
        for (uint256 i; i < l.length; ++i) {
            assertTrue(l[i].ltv7 >= l[i].ltv30);
            assertTrue(l[i].rateMin < l[i].rateMax);
        }
        assertEq(l[2].ltv7, 4500); // NVDA
        assertEq(l[8].ltv30, 3500); // TSLA
        assertEq(l[9].ltv7, 8000); // SGOV
    }
}
