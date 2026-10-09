// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./CentaVault.sol";

contract CentaVaultFactory {
    address public immutable defaultRelayer;
    mapping(address => address) public userVaults;
    address[] public allVaults;

    event VaultCreated(address indexed user, address vaultAddress);

    constructor(address _relayer) {
        require(_relayer != address(0), "Zero address relayer");
        defaultRelayer = _relayer;
    }

    function createVault() external returns (address) {
        require(userVaults[msg.sender] == address(0), "Vault already exists");

        CentaVault newVault = new CentaVault(msg.sender, defaultRelayer);
        address vaultAddress = address(newVault);

        userVaults[msg.sender] = vaultAddress;
        allVaults.push(vaultAddress);

        emit VaultCreated(msg.sender, vaultAddress);
        return vaultAddress;
    }

    function getVault(address user) external view returns (address) {
        return userVaults[user];
    }

    function totalVaultsCount() external view returns (uint256) {
        return allVaults.length;
    }
}