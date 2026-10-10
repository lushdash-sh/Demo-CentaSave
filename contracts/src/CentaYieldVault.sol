// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract CentaYieldVault is ERC4626 {
    // Simulated yield accrued over time for demo purposes
    uint256 public simulatedYieldAccrued;

    constructor(IERC20 _mINR) ERC4626(_mINR) ERC20("CentaSave Yield mINR", "y-mINR") {}

    // Override totalAssets to include simulated DeFi yield compounding
    function totalAssets() public view override returns (uint256) {
        return super.totalAssets() + simulatedYieldAccrued;
    }

    // Function for admin/relayer to simulate incoming yield from a lending pool
    function simulateYieldAccrual(uint256 yieldAmount) external {
        simulatedYieldAccrued += yieldAmount;
    }
}