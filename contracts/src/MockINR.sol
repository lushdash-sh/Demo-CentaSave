// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockINR is ERC20 {
    constructor() ERC20("Mock Indian Rupee", "mINR") {
        // Mint 1,000,000 mINR to deployer for testing
        _mint(msg.sender, 1_000_000 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}