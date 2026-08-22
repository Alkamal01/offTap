// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {ShadowPayEscrow} from "../contracts/ShadowPayEscrow.sol";

contract Deploy is Script {
    function run() external returns (ShadowPayEscrow) {
        vm.startBroadcast();
        ShadowPayEscrow escrow = new ShadowPayEscrow();
        vm.stopBroadcast();

        console.log("ShadowPayEscrow deployed to:", address(escrow));
        return escrow;
    }
}
