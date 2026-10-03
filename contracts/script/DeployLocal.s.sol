// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Deploy} from "./Deploy.s.sol";
import {FaucetToken, TestStockToken, TestFeed} from "./testnet/TestnetMocks.sol";
import {LoanManager} from "../src/LoanManager.sol";

/// @notice Local anvil stack for frontend work: the testnet mocks + the full protocol, seeded with deposits,
/// a GLASS stake and a few open loans, then writes every address to ../app/src/deployments/31337.json.
/// Signs with anvil's public test account #0 (keeper and seed account). Timelock delay 1 second.
///   anvil
///   forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
///     --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
contract DeployLocal is Deploy {
    string internal constant OUT = "../app/src/deployments/31337.json";

    struct Mock {
        string sym;
        string name;
        int256 price;
        uint16 l7;
        uint16 l30;
        uint16 rmin;
        uint16 rmax;
    }

    function run() external override returns (Deployment memory d) {
        address me = msg.sender;
        Mock[6] memory m = [
            Mock("SPY", "SPDR S&P 500 ETF", 770_71210575, 6000, 5500, 800, 1200),
            Mock("QQQ", "Invesco QQQ", 751_99912534, 6000, 5500, 800, 1200),
            Mock("NVDA", "NVIDIA", 234_99711907, 4500, 4000, 1000, 1600),
            Mock("AAPL", "Apple", 333_82386412, 4500, 4000, 1000, 1600),
            Mock("TSLA", "Tesla", 372_61125000, 4000, 3500, 1200, 2000),
            Mock("SGOV", "iShares 0-3M Treasury", 101_15681945, 8000, 8000, 600, 800)
        ];

        vm.startBroadcast();
        FaucetToken usdg = new FaucetToken("Test Global Dollar", "tUSDG", 6, 100_000e6, me);
        FaucetToken glass = new FaucetToken("Test Hourglass", "tGLASS", 18, 10_000e18, me);
        Listing[] memory l = new Listing[](6);
        TestStockToken[6] memory stocks;
        for (uint256 i; i < 6; ++i) {
            stocks[i] = new TestStockToken(m[i].name, m[i].sym, me);
            TestFeed f = new TestFeed(string.concat(m[i].sym, " / USD"), m[i].price, me);
            l[i] = Listing(address(stocks[i]), address(f), m[i].l7, m[i].l30, m[i].rmin, m[i].rmax);
        }
        d = deploy(
            Config({
                usdg: IERC20(address(usdg)),
                glass: IERC20(address(glass)),
                admin: address(0xA11CE),
                guardian: me,
                buyback: me,
                treasury: address(0xA11CE),
                delay: 1,
                vaultCap: 10_000_000e6,
                reserveTarget: RESERVE_TARGET,
                setup: me
            }),
            l
        );

        // ---- seed
        usdg.mint(me, 2_000_000e6);
        usdg.approve(address(d.v7), type(uint256).max);
        usdg.approve(address(d.v30), type(uint256).max);
        usdg.approve(address(d.lm), type(uint256).max);
        d.v7.deposit(600_000e6, me);
        d.v30.deposit(550_000e6, me);
        for (uint256 i; i < 6; ++i) {
            stocks[i].mint(me, 1_000e18);
            stocks[i].approve(address(d.lm), type(uint256).max);
        }
        // conservative sizes so they also fit the weekend LTV haircut
        d.lm.openLoan(address(d.v7), address(stocks[2]), 100e18, 7_500e6, type(uint256).max, type(uint256).max, me);
        d.lm.openLoan(address(d.v7), address(stocks[0]), 20e18, 7_000e6, type(uint256).max, type(uint256).max, me);
        d.lm.openLoan(address(d.v30), address(stocks[4]), 50e18, 4_500e6, type(uint256).max, type(uint256).max, me);
        d.lm.openLoan(address(d.v30), address(stocks[3]), 60e18, 5_500e6, type(uint256).max, type(uint256).max, me);

        glass.mint(me, 1_000_000e18);
        glass.approve(address(d.sm), type(uint256).max);
        d.sm.stake(200_000e18);
        d.splitter.distribute(); // origination fees -> stakers / buyback / reserve
        vm.stopBroadcast();

        _write(d, address(usdg), address(glass), l, m);
        log(d);
    }

    function _write(Deployment memory d, address usdg, address glass, Listing[] memory l, Mock[6] memory m)
        internal
    {
        string memory assetsJson = "[";
        for (uint256 i; i < l.length; ++i) {
            assetsJson = string.concat(
                assetsJson,
                i == 0 ? "" : ",",
                '{"symbol":"',
                m[i].sym,
                '","name":"',
                m[i].name,
                '","token":"',
                vm.toString(l[i].token),
                '","feed":"',
                vm.toString(l[i].feed),
                '"}'
            );
        }
        assetsJson = string.concat(assetsJson, "]");
        string memory j = string.concat(
            '{"chainId":31337,"deployedAt":',
            vm.toString(block.timestamp),
            ',"usdg":"',
            vm.toString(usdg),
            '","glass":"',
            vm.toString(glass),
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
            assetsJson,
            "}"
        );
        vm.writeFile(OUT, j);
        console.log("addresses written to", OUT);
    }
}
