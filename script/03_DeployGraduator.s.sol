// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {console2} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";

import {XofNGraduator} from "../contracts/XofNGraduator.sol";
import {Deploy1aScript} from "./lib/Deploy1aScript.sol";

/// @title 03_DeployGraduator — Fase 1a, langkah 3 dari 4
/// @notice Men-deploy hook penjaga (CREATE2, salt hasil tambang) dan `XofNGraduator` (CreateX
///         CREATE3, owner awal = deployer), lalu `setDelegate(Safe)` dan `transferOwnership(Safe)`.
///         Hasilnya DORMAN: `launch()` revert sampai Safe memanggil `Registry.setRegistrar`.
/// @dev WAJIB dijalankan dengan flag `--libraries` yang dicetak script 01; tanpa itu script
///      berhenti (`LibrariesNotLinked`). Syarat lain: keempat DVN sudah diizinkan Safe (script 02).
///        forge script script/03_DeployGraduator.s.sol --rpc-url $RH_TESTNET_RPC \
///          --sender $DEPLOYER_ADDRESS <flag --libraries>                      # dry-run
///        ... --account xofn-deployer --sender $DEPLOYER_ADDRESS --broadcast --slow <flag>  # developer
///      `deployments/robinhood-testnet.json` hanya ditulis saat broadcast. `deployBlock` diisi 0:
///      di Arbitrum Orbit `block.number` adalah blok L1, jadi blok L2 diambil dari receipt
///      setelah broadcast (ARCHITECTURE §5.6.1).
contract DeployGraduator is Deploy1aScript {
    function run() external {
        Config memory cfg = _configFromEnv();
        _preflight(cfg);
        Addresses memory a = _predict(cfg);
        _assertLinked(type(XofNGraduator).creationCode, a);
        _logHeader("XofN 1a / 03 DeployGraduator", cfg);

        vm.startBroadcast(cfg.deployer);
        a = _deployStage3(cfg, type(XofNGraduator).creationCode);
        vm.stopBroadcast();

        _logAddresses(a);
        console2.log("poolGuard CREATE2 salt", vm.toString(a.poolGuardSalt));
        console2.log("Graduator owner + endpoint delegate:", cfg.safe);
        console2.log("status: deployed-dormant (Registry registrar is empty)");

        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) || vm.isContext(VmSafe.ForgeContext.ScriptResume)) {
            _writeManifest(cfg, a);
            console2.log("Wrote deployments/robinhood-testnet.json");
        } else {
            console2.log("DRY RUN: manifest not written.");
        }
    }

    function _writeManifest(Config memory cfg, Addresses memory a) private {
        vm.serializeAddress("contracts", "XofNGraduator", a.graduator);
        vm.serializeAddress("contracts", "XofNCurveImplementation", a.curve);
        vm.serializeAddress("contracts", "XofNPoolGuard", a.poolGuard);
        string memory contractsJson = vm.serializeAddress("contracts", "XofNRegistry", a.registry);

        vm.serializeAddress("libraries", "TierLib", a.tierLib);
        vm.serializeAddress("libraries", "PoolSeeder", a.poolSeeder);
        string memory librariesJson =
            vm.serializeAddress("libraries", "XofNTokenDeployer", a.tokenDeployer);

        vm.serializeAddress("amm", "poolManager", POOL_MANAGER);
        string memory ammJson = vm.serializeAddress("amm", "positionManager", POSITION_MANAGER);

        vm.serializeString("root", "network", "testnet");
        // Reserved != Deployed (dorman) != Live. Live baru setelah Safe memanggil setRegistrar.
        vm.serializeString("root", "status", "deployed-dormant");
        vm.serializeUint("root", "chainId", block.chainid);
        vm.serializeUint("root", "eid", HOME_EID);
        vm.serializeAddress("root", "endpointV2", ENDPOINT);
        vm.serializeString("root", "contracts", contractsJson);
        vm.serializeString("root", "libraries", librariesJson);
        vm.serializeString("root", "amm", ammJson);
        vm.serializeAddress("root", "owner", cfg.safe);
        vm.serializeAddress("root", "deployer", cfg.deployer);
        vm.serializeAddress("root", "lpRecipient", cfg.lpRecipient);
        vm.serializeUint("root", "deployBlock", 0);
        string memory root = vm.serializeBool("root", "verifiedSource", false);
        vm.writeJson(root, "deployments/robinhood-testnet.json");
    }
}
