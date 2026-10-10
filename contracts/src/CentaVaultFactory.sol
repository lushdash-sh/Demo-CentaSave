// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CentaVault} from "./CentaVault.sol";
import {CentaYieldVault} from "./CentaYieldVault.sol";
import {MockINR} from "./MockINR.sol";

contract CentaVaultFactory {
    address public relayer;
    address public mINR;
    address public yieldVault;

    mapping(address => address) public userVaults;
    address[] public allVaults;

    event VaultCreated(address indexed user, address vaultAddress);

    constructor(address _relayer) {
        relayer = _relayer;
        // Deploy Mock INR and Yield Vault natively on factory deployment
        MockINR token = new MockINR();
        mINR = address(token);

        CentaYieldVault vault = new CentaYieldVault(token);
        yieldVault = address(vault);
    }

    function createVault() external returns (address vaultAddress) {
        require(userVaults[msg.sender] == address(0), "Vault already exists");

        CentaVault vault = new CentaVault(msg.sender, relayer, mINR, yieldVault);
        vaultAddress = address(vault);

        userVaults[msg.sender] = vaultAddress;
        allVaults.push(vaultAddress);

        emit VaultCreated(msg.sender, vaultAddress);
    }

    function getVault(address user) external view returns (address) {
        return userVaults[user];
    }

    function totalVaultsCount() external view returns (uint256) {
        return allVaults.length;
    }
}