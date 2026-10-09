// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CentaVaultFactory} from "../src/CentaVaultFactory.sol";

contract DeployCentaSave is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployerAddress = vm.addr(deployerPrivateKey);

        console2.log("Deploying contracts with account:", deployerAddress);

        vm.startBroadcast(deployerPrivateKey);

        // The deployer address acts as the default relayer for the hackathon
        CentaVaultFactory factory = new CentaVaultFactory(deployerAddress);

        vm.stopBroadcast();

        console2.log("==================================================");
        console2.log("CentaVaultFactory deployed to:", address(factory));
        console2.log("Network: Monad Testnet (Chain ID 10143)");
        console2.log("==================================================");
    }
}