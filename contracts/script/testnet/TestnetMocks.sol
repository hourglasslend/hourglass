// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Testnet-only token with a public faucet (capped per call).
contract FaucetToken is ERC20, Ownable {
    uint8 private immutable _dec;
    uint256 public immutable faucetAmount;

    constructor(string memory n, string memory s, uint8 d, uint256 faucet_, address owner_)
        ERC20(n, s)
        Ownable(owner_)
    {
        _dec = d;
        faucetAmount = faucet_;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function faucet() external {
        _mint(msg.sender, faucetAmount);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}

/// @notice Testnet stock token: faucet plus the issuer flags the protocol reads (pause, oracle pause).
contract TestStockToken is FaucetToken {
    bool public paused;
    bool public oraclePaused;

    constructor(string memory n, string memory s, address owner_) FaucetToken(n, s, 18, 100e18, owner_) {}

    function setPaused(bool p) external onlyOwner {
        paused = p;
    }

    function setOraclePaused(bool p) external onlyOwner {
        oraclePaused = p;
    }
}

/// @notice Testnet price feed (Chainlink AggregatorV3 subset). The keeper pushes prices, or replays mainnet.
contract TestFeed is Ownable {
    uint8 public constant decimals = 8;
    string public description;
    int256 internal _answer;
    uint256 internal _updatedAt;
    uint80 internal _round;

    constructor(string memory d, int256 a, address owner_) Ownable(owner_) {
        description = d;
        _set(a, block.timestamp);
    }

    function set(int256 a, uint256 t) external onlyOwner {
        _set(a, t);
    }

    function _set(int256 a, uint256 t) internal {
        _answer = a;
        _updatedAt = t;
        ++_round;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (_round, _answer, _updatedAt, _updatedAt, _round);
    }
}
