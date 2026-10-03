// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Deploy} from "./Deploy.s.sol";
import {FaucetToken, TestStockToken, TestFeed} from "./testnet/TestnetMocks.sol";

/// @notice Robinhood Chain testnet (46630) rehearsal. Testnet has no USDG and no Chainlink feeds, so this
/// deploys faucet USDG / GLASS, four test stock tokens with issuer flags, and keeper-owned price feeds
/// (prices = mainnet at 3 Oct 2026). Timelock delay TESTNET_DELAY seconds (default 300).
/// Writes every address to ../app/src/deployments/<chainId>.json; `npm run sync:testnet` (in app/) then adds the
/// deploy block from the broadcast receipts (block.number on an Arbitrum chain is not the L2 block).
///   ADMIN_ADDRESS=0x… GUARDIAN_ADDRESS=0x… KEEPER_ADDRESS=0x… forge script script/DeployTestnet.s.sol \
///     --rpc-url https://rpc.testnet.chain.robinhood.com --account … --broadcast
contract DeployTestnet is Deploy {
    function run() external override returns (Deployment memory d) {
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address guardian = vm.envAddress("GUARDIAN_ADDRESS");
        address keeper = vm.envAddress("KEEPER_ADDRESS");

        vm.startBroadcast();
        FaucetToken usdg = new FaucetToken("Test Global Dollar", "tUSDG", 6, 100_000e6, keeper);
        FaucetToken glass = new FaucetToken("Test Hourglass", "tGLASS", 18, 10_000e18, keeper);

        Listing[] memory l = new Listing[](4);
        l[0] = _listing("SPY", 770_71210575, keeper, 6000, 5500, 800, 1200);
        l[1] = _listing("NVDA", 234_99711907, keeper, 4500, 4000, 1000, 1600);
        l[2] = _listing("TSLA", 372_61125000, keeper, 4000, 3500, 1200, 2000);
        l[3] = _listing("SGOV", 101_15681945, keeper, 8000, 8000, 600, 800);

        Config memory c = Config({
            usdg: IERC20(address(usdg)),
            glass: IERC20(address(glass)),
            admin: admin,
            guardian: guardian,
            buyback: keeper,
            treasury: admin,
            delay: vm.envOr("TESTNET_DELAY", uint256(300)),
            vaultCap: 10_000_000e6,
            reserveTarget: RESERVE_TARGET,
            setup: msg.sender
        });
        d = deploy(c, l);
        vm.stopBroadcast();

        log(d);
        console.log("tUSDG             ", address(usdg));
        console.log("tGLASS            ", address(glass));
        for (uint256 i; i < l.length; ++i) {
            console.log("stock / feed      ", l[i].token, l[i].feed);
        }
        _write(d, address(usdg), address(glass), l);
    }

    function _write(Deployment memory d, address usdg, address glass, Listing[] memory l) internal {
        string[4] memory sym = ["SPY", "NVDA", "TSLA", "SGOV"];
        string[4] memory name = ["SPDR S&P 500 ETF", "NVIDIA", "Tesla", "iShares 0-3M Treasury"];
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
            string.concat(assets, "]}")
        );
        string memory out = string.concat("../app/src/deployments/", vm.toString(block.chainid), ".json");
        vm.writeFile(out, j);
        console.log("addresses written to", out);
    }

    function _listing(string memory sym, int256 price, address keeper, uint16 l7, uint16 l30, uint16 rmin, uint16 rmax)
        internal
        returns (Listing memory)
    {
        TestStockToken t = new TestStockToken(string.concat("Test ", sym), string.concat("t", sym), keeper);
        TestFeed f = new TestFeed(string.concat("t", sym, " / USD"), price, keeper);
        return Listing(address(t), address(f), l7, l30, rmin, rmax);
    }
}
