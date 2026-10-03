// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {HourglassVault} from "../src/HourglassVault.sol";
import {LoanManager} from "../src/LoanManager.sol";
import {SafetyModule} from "../src/SafetyModule.sol";
import {FeeSplitter} from "../src/FeeSplitter.sol";

/// @notice Hourglass deployment. The deployer signs from an encrypted Foundry keystore:
///   cast wallet import hourglass-deployer --interactive
///   GLASS_ADDRESS=0x… ADMIN_ADDRESS=0x… GUARDIAN_ADDRESS=0x… BUYBACK_ADDRESS=0x… TREASURY_ADDRESS=0x… \
///     forge script script/Deploy.s.sol --rpc-url https://rpc.mainnet.chain.robinhood.com \
///     --account hourglass-deployer --broadcast
///
/// One TimelockController (48h) ends up owning every contract:
///   - ADMIN proposes (and may cancel), GUARDIAN may only cancel, anyone executes after the delay.
///   - The deployer configures everything, hands ownership to the timelock (Ownable2Step) and schedules the
///     timelock's acceptOwnership batch, then renounces every timelock role. Until that batch executes
///     (48h later, by anyone) the deployer is still owner: check the batch executed before taking deposits.
/// GUARDIAN is also the LoanManager/SafetyModule guardian: pause new loans, set holidays, extend grace, slash.
contract Deploy is Script {
    uint256 public constant TIMELOCK_DELAY = 48 hours;
    uint256 public constant VAULT_CAP = 25_000e6; // USDG; launch cap before an external audit, raised later by the timelock
    uint256 public constant RESERVE_TARGET = 25_000e6;

    address public constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;

    struct Config {
        IERC20 usdg;
        IERC20 glass;
        address admin;
        address guardian;
        address buyback;
        address treasury;
        uint256 delay;
        uint256 vaultCap;
        uint256 reserveTarget;
        address setup; // the address sending the calls; keeps no role afterwards
    }

    struct Listing {
        address token;
        address feed;
        uint16 ltv7;
        uint16 ltv30;
        uint16 rateMin;
        uint16 rateMax;
    }

    struct Deployment {
        TimelockController timelock;
        HourglassVault v7;
        HourglassVault v30;
        LoanManager lm;
        SafetyModule sm;
        FeeSplitter splitter;
    }

    function run() external virtual returns (Deployment memory d) {
        Config memory c = Config({
            usdg: IERC20(USDG),
            glass: IERC20(vm.envAddress("GLASS_ADDRESS")),
            admin: vm.envAddress("ADMIN_ADDRESS"),
            guardian: vm.envAddress("GUARDIAN_ADDRESS"),
            buyback: vm.envAddress("BUYBACK_ADDRESS"),
            treasury: vm.envAddress("TREASURY_ADDRESS"),
            delay: TIMELOCK_DELAY,
            vaultCap: VAULT_CAP,
            reserveTarget: RESERVE_TARGET,
            setup: msg.sender
        });
        vm.startBroadcast();
        Listing[] memory l = mainnetListings();
        d = deploy(c, l);
        vm.stopBroadcast();
        log(d);
        _writeMainnet(d, l);
    }

    /// @dev Addresses for the app and keeper: ../app/src/deployments/<chainId>.json. `npm run sync:mainnet` adds
    /// the deploy block from the broadcast receipts.
    function _writeMainnet(Deployment memory d, Listing[] memory l) internal {
        string[10] memory sym = ["SPY", "QQQ", "NVDA", "AAPL", "MSFT", "GOOGL", "META", "AMZN", "TSLA", "SGOV"];
        string[10] memory name = [
            "SPDR S&P 500 ETF",
            "Invesco QQQ",
            "NVIDIA",
            "Apple",
            "Microsoft",
            "Alphabet",
            "Meta Platforms",
            "Amazon",
            "Tesla",
            "iShares 0-3M Treasury"
        ];
        string memory assets = "[";
        for (uint256 i; i < l.length; ++i) {
            assets = string.concat(
                assets,
                i == 0 ? "" : ",",
                '{"symbol":"',
                sym[i],
                '","name":"',
                name[i],
                '","token":"',
                vm.toString(l[i].token),
                '","feed":"',
                vm.toString(l[i].feed),
                '"}'
            );
        }
        string memory j = string.concat(
            '{"chainId":',
            vm.toString(block.chainid),
            ',"deployedAt":',
            vm.toString(block.timestamp),
            ',"usdg":"',
            vm.toString(USDG),
            '","glass":"',
            vm.toString(address(d.sm.glass())),
            '","loanManager":"',
            vm.toString(address(d.lm)),
            '","vault7":"',
            vm.toString(address(d.v7)),
            '","vault30":"',
            vm.toString(address(d.v30)),
            '","safetyModule":"',
            vm.toString(address(d.sm)),
            '","feeSplitter":"',
            vm.toString(address(d.splitter)),
            '","timelock":"',
            vm.toString(address(d.timelock)),
            '","assets":',
            string.concat(assets, "]}")
        );
        string memory out = string.concat("../app/src/deployments/", vm.toString(block.chainid), ".json");
        vm.writeFile(out, j);
        console.log("addresses written to", out);
    }

    /// @notice First listings on Robinhood Chain mainnet (4663). Token <-> feed pairs and decimals (USDG 6,
    /// stocks 18, feeds 8) read on-chain 3 Oct 2026. Re-check before launch.
    function mainnetListings() public pure returns (Listing[] memory l) {
        l = new Listing[](10);
        // index / ETF: 60% / 55%, 8-12%
        l[0] = Listing(
            0x117cc2133c37B721F49dE2A7a74833232B3B4C0C,
            0x319724394D3A0e3669269846abE664Cd621f9f6A,
            6000,
            5500,
            800,
            1200
        ); // SPY
        l[1] = Listing(
            0xD5f3879160bc7c32ebb4dC785F8a4F505888de68,
            0x80901d846d5D7B030F26B480776EE3b29374C2ae,
            6000,
            5500,
            800,
            1200
        ); // QQQ
        // mega-cap: 45% / 40%, 10-16%
        l[2] = Listing(
            0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC,
            0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15,
            4500,
            4000,
            1000,
            1600
        ); // NVDA
        l[3] = Listing(
            0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9,
            0x6B22A786bAa607d76728168703a39Ea9C99f2cD0,
            4500,
            4000,
            1000,
            1600
        ); // AAPL
        l[4] = Listing(
            0xe93237C50D904957Cf27E7B1133b510C669c2e74,
            0x45C3C877C15E6BA2EBB19eA114Ea508d14C1Af2E,
            4500,
            4000,
            1000,
            1600
        ); // MSFT
        l[5] = Listing(
            0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3,
            0xF6f373a037c30F0e5010d854385cA89185AE638b,
            4500,
            4000,
            1000,
            1600
        ); // GOOGL
        l[6] = Listing(
            0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35,
            0x7C38C00C30BEe9378381E7B6135d7283356D71b1,
            4500,
            4000,
            1000,
            1600
        ); // META
        l[7] = Listing(
            0x12f190a9F9d7D37a250758b26824B97CE941bF54,
            0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C,
            4500,
            4000,
            1000,
            1600
        ); // AMZN
        // high volatility: 40% / 35%, 12-20%
        l[8] = Listing(
            0x322F0929c4625eD5bAd873c95208D54E1c003b2d,
            0x4A1166a659A55625345e9515b32adECea5547C38,
            4000,
            3500,
            1200,
            2000
        ); // TSLA
        // T-bill: 80% / 80%, 6-8%
        l[9] = Listing(
            0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5, 0xa0DF4ee0fFf975306345875E3548Fcc519577A11, 8000, 8000, 600, 800
        ); // SGOV
    }

    function deploy(Config memory c, Listing[] memory listings) public returns (Deployment memory d) {
        require(address(c.glass).code.length > 0, "GLASS has no code");
        require(c.admin != address(0) && c.guardian != address(0) && c.admin != c.guardian, "bad ADMIN/GUARDIAN");
        require(c.buyback != address(0) && c.treasury != address(0), "bad BUYBACK/TREASURY");

        address[] memory proposers = new address[](2);
        proposers[0] = c.admin;
        proposers[1] = c.setup; // only to schedule the acceptOwnership batch below
        address[] memory executors = new address[](1); // address(0): anyone executes
        d.timelock = new TimelockController(c.delay, proposers, executors, c.setup);
        d.timelock.grantRole(d.timelock.CANCELLER_ROLE(), c.guardian);

        d.splitter = new FeeSplitter(c.usdg, c.setup);
        d.lm = new LoanManager(c.usdg, c.setup, c.guardian, address(d.splitter));
        d.v7 = new HourglassVault(c.usdg, "Hourglass USDG 7D", "hgUSDG-7D", 7 days, c.vaultCap, c.setup);
        d.v30 = new HourglassVault(c.usdg, "Hourglass USDG 30D", "hgUSDG-30D", 30 days, c.vaultCap, c.setup);
        d.sm = new SafetyModule(c.glass, c.usdg, c.setup, c.guardian);

        d.v7.setManager(address(d.lm));
        d.v30.setManager(address(d.lm));
        d.sm.setManager(address(d.lm));
        d.sm.setRewardNotifier(address(d.splitter));
        d.sm.setRecovery(c.buyback); // the operator that sells slashed GLASS
        d.lm.setSafetyModule(address(d.sm));
        d.splitter.configure(address(d.sm), c.buyback, c.treasury, c.reserveTarget);

        // origination fee per term (~3%/yr either way) and early-repay interest floor
        d.lm.setVault(address(d.v7), true, 6, 3 days);
        d.lm.setVault(address(d.v30), true, 25, 10 days);
        for (uint256 i; i < listings.length; ++i) {
            Listing memory x = listings[i];
            d.lm.setAsset(x.token, true, x.feed);
            d.lm.setRisk(address(d.v7), x.token, LoanManager.RiskParams(x.ltv7, x.rateMin, x.rateMax, 2000));
            d.lm.setRisk(address(d.v30), x.token, LoanManager.RiskParams(x.ltv30, x.rateMin, x.rateMax, 2000));
        }

        // hand everything to the timelock and schedule its acceptance
        address[] memory targets = new address[](5);
        targets[0] = address(d.lm);
        targets[1] = address(d.v7);
        targets[2] = address(d.v30);
        targets[3] = address(d.sm);
        targets[4] = address(d.splitter);
        uint256[] memory values = new uint256[](5);
        bytes[] memory payloads = new bytes[](5);
        for (uint256 i; i < 5; ++i) {
            Ownable2StepLike(targets[i]).transferOwnership(address(d.timelock));
            payloads[i] = abi.encodeWithSignature("acceptOwnership()");
        }
        d.timelock.scheduleBatch(targets, values, payloads, bytes32(0), bytes32("hourglass-accept"), c.delay);

        d.timelock.renounceRole(d.timelock.PROPOSER_ROLE(), c.setup);
        d.timelock.renounceRole(d.timelock.CANCELLER_ROLE(), c.setup);
        d.timelock.renounceRole(d.timelock.DEFAULT_ADMIN_ROLE(), c.setup);
    }

    /// @notice Calldata to execute the acceptance batch once the delay has passed (anyone can send it).
    function acceptBatch(Deployment memory d)
        public
        pure
        returns (address[] memory targets, uint256[] memory values, bytes[] memory payloads, bytes32 salt)
    {
        targets = new address[](5);
        targets[0] = address(d.lm);
        targets[1] = address(d.v7);
        targets[2] = address(d.v30);
        targets[3] = address(d.sm);
        targets[4] = address(d.splitter);
        values = new uint256[](5);
        payloads = new bytes[](5);
        for (uint256 i; i < 5; ++i) {
            payloads[i] = abi.encodeWithSignature("acceptOwnership()");
        }
        salt = bytes32("hourglass-accept");
    }

    function log(Deployment memory d) internal pure {
        console.log("TimelockController", address(d.timelock));
        console.log("LoanManager       ", address(d.lm));
        console.log("Vault 7D          ", address(d.v7));
        console.log("Vault 30D         ", address(d.v30));
        console.log("SafetyModule      ", address(d.sm));
        console.log("FeeSplitter       ", address(d.splitter));
    }
}

interface Ownable2StepLike {
    function transferOwnership(address newOwner) external;
}
