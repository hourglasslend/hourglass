// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private immutable _dec;

    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _dec = d;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Mimics a Robinhood Chain stock token: issuer pause, oracle pause, address blocklist.
contract MockStockToken is MockERC20 {
    bool public paused;
    bool public oraclePaused;
    mapping(address => bool) public isBlocked;

    error Blocked(address account);

    constructor(string memory n, string memory s) MockERC20(n, s, 18) {}

    function setPaused(bool p) external {
        paused = p;
    }

    function setOraclePaused(bool p) external {
        oraclePaused = p;
    }

    function setBlocked(address a, bool b) external {
        isBlocked[a] = b;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (isBlocked[from]) revert Blocked(from);
        if (isBlocked[to]) revert Blocked(to);
        super._update(from, to, value);
    }
}

/// @notice Takes a 1% fee on every transfer.
contract FeeOnTransferToken is MockERC20 {
    constructor() MockERC20("Fee", "FEE", 18) {}

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0xdead), fee);
            value -= fee;
        }
        super._update(from, to, value);
    }
}

contract MockFeed {
    uint8 public decimals = 8;
    int256 public answer;
    uint256 public updatedAt;
    uint80 public roundId = 1;
    uint80 public answeredInRound = 1;

    function set(int256 a, uint256 t) external {
        answer = a;
        updatedAt = t;
    }

    function setRounds(uint80 r, uint80 answeredIn) external {
        roundId = r;
        answeredInRound = answeredIn;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (roundId, answer, updatedAt, updatedAt, answeredInRound);
    }
}
