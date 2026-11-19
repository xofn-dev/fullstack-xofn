// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {console2} from "forge-std/Script.sol";

import {Deploy1aScript} from "./lib/Deploy1aScript.sol";

/// @title 01_DeployRegistry — Fase 1a, Robinhood testnet (46630), langkah 1 dari 4
/// @notice Men-deploy tiga library terhubung, `XofNRegistry` (owner = Safe sejak constructor), dan
///         implementation `XofNCurve`, semuanya lewat CreateX CREATE3.
/// @dev Dry-run (agent atau developer, tanpa key):
///        forge script script/01_DeployRegistry.s.sol --rpc-url $RH_TESTNET_RPC --sender $DEPLOYER_ADDRESS
///      Broadcast (HANYA developer; keystore atau ledger, tidak pernah --private-key):
///        forge script script/01_DeployRegistry.s.sol --rpc-url $RH_TESTNET_RPC \
///          --account xofn-deployer --sender $DEPLOYER_ADDRESS --broadcast --slow
///      Menolak berjalan di luar chain 46630. Catat baris `--libraries` yang dicetak: script 03
///      membutuhkannya.
contract DeployRegistry is Deploy1aScript {
    function run() external {
        Config memory cfg = _configFromEnv();
        _preflight(cfg);
        _logHeader("XofN 1a / 01 DeployRegistry", cfg);

        vm.startBroadcast(cfg.deployer);
        Addresses memory a = _deployStage1(cfg);
        vm.stopBroadcast();

        _logAddresses(a);
        console2.log("Registry owner      ", cfg.safe);
        console2.log("Next: script 02 (Safe allowlists the DVNs), then script 03 with:");
        console2.log(_librariesFlags(a));
    }
}
