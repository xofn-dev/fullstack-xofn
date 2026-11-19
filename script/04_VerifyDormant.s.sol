// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {console2} from "forge-std/Script.sol";

import {Deploy1aScript} from "./lib/Deploy1aScript.sol";

/// @title 04_VerifyDormant — Fase 1a, langkah 4 dari 4 (READ-ONLY)
/// @notice Membaca chain dan menolak apa pun yang menyimpang dari "Deployed (dorman)": owner dan
///         delegate = Safe, registrar kosong, `launch()` revert `OnlyRegistrar`, parameter
///         constructor = tabel yang disetujui, alamat = prediksi CreateX, library ter-link benar.
/// @dev Tidak ada broadcast dan tidak butuh key:
///        forge script script/04_VerifyDormant.s.sol --rpc-url $RH_TESTNET_RPC
///      `launch()` di sini hanya DISIMULASIKAN secara lokal untuk memastikan ia revert.
contract VerifyDormant is Deploy1aScript {
    function run() external {
        Config memory cfg = _configFromEnv();
        Addresses memory predicted = _predict(cfg);
        Addresses memory a = _verifyDormant(
            cfg, [predicted.tierLib, predicted.poolSeeder, predicted.tokenDeployer]
        );

        _logHeader("XofN 1a / 04 VerifyDormant", cfg);
        _logAddresses(a);
        console2.log("codehash Registry  ", vm.toString(a.registry.codehash));
        console2.log("codehash Curve     ", vm.toString(a.curve.codehash));
        console2.log("codehash PoolGuard ", vm.toString(a.poolGuard.codehash));
        console2.log("codehash Graduator ", vm.toString(a.graduator.codehash));
        console2.log("RESULT: deployed-dormant. All checks passed. launch() reverts OnlyRegistrar.");
    }
}
