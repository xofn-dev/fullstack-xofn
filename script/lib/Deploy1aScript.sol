// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";

import {Deploy1a} from "./Deploy1a.sol";

/// @notice Bagian yang sama di keempat script 1a: membaca env dan mencetak alamat.
/// @dev Env (nama saja; isinya tidak pernah masuk repo atau bukti): `DEPLOYER_ADDRESS`,
///      `SAFE_ADDRESS`, `LP_RECIPIENT`, `DEPLOY_SALT`. Tidak ada private key di env: broadcast
///      memakai `--account <keystore>` atau `--ledger` (CLAUDE.md §5.1).
abstract contract Deploy1aScript is Script, Deploy1a {
    function _configFromEnv() internal view returns (Config memory cfg) {
        cfg.deployer = vm.envAddress("DEPLOYER_ADDRESS");
        cfg.safe = vm.envAddress("SAFE_ADDRESS");
        cfg.lpRecipient = vm.envAddress("LP_RECIPIENT");
        cfg.deploySalt = vm.envString("DEPLOY_SALT");
    }

    function _mode() internal view returns (string memory) {
        return vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) || vm.isContext(VmSafe.ForgeContext.ScriptResume)
            ? "MODE: BROADCAST"
            : "MODE: DRY RUN (nothing is sent)";
    }

    function _logHeader(string memory title, Config memory cfg) internal view {
        console2.log(title);
        console2.log(_mode());
        console2.log("chainId        ", block.chainid);
        console2.log("deployer       ", cfg.deployer);
        console2.log("safe           ", cfg.safe);
        console2.log("lpRecipient    ", cfg.lpRecipient);
    }

    function _logAddresses(Addresses memory a) internal pure {
        console2.log("TierLib             ", a.tierLib);
        console2.log("PoolSeeder          ", a.poolSeeder);
        console2.log("XofNTokenDeployer   ", a.tokenDeployer);
        console2.log("XofNRegistry        ", a.registry);
        console2.log("XofNCurve (impl)    ", a.curve);
        console2.log("XofNPoolGuard       ", a.poolGuard);
        console2.log("XofNGraduator       ", a.graduator);
    }

    /// @notice Flag `--libraries` untuk script 03 dan untuk verifikasi source.
    function _librariesFlags(Addresses memory a) internal pure returns (string memory) {
        return string.concat(
            "--libraries contracts/libraries/TierLib.sol:TierLib:",
            vm.toString(a.tierLib),
            " --libraries contracts/libraries/PoolSeeder.sol:PoolSeeder:",
            vm.toString(a.poolSeeder),
            " --libraries contracts/libraries/XofNTokenDeployer.sol:XofNTokenDeployer:",
            vm.toString(a.tokenDeployer)
        );
    }
}
