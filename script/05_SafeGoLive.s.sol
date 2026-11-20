// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {console2} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";

import {XofNGraduator} from "../contracts/XofNGraduator.sol";
import {XofNRegistry} from "../contracts/XofNRegistry.sol";
import {TierLib} from "../contracts/libraries/TierLib.sol";
import {Deploy1aScript} from "./lib/Deploy1aScript.sol";

/// @title 05_SafeGoLive — Robinhood testnet (46630): membuka launchpad
/// @notice Menyusun transaksi Safe `Registry.setRegistrar(Graduator)`, saklar go-live (PRD P47).
///         TIDAK BISA DIBATALKAN: registrar hanya bisa diisi sekali; setelah itu tidak ada pihak,
///         termasuk Safe, yang bisa menggantinya atau menutup launch kembali.
/// @dev Dibuka atas keputusan PM 20 Nov 2026 (disampaikan developer): "pm setuju aja yang penting
///      testnet bisa launchpad jalan juga". Script ini tidak menandatangani apa pun.
///        forge script script/05_SafeGoLive.s.sol --rpc-url $RH_TESTNET_RPC
///      mencetak target, calldata, nonce, dan `safeTxHash`, lalu menyimulasikan calldata sebagai
///      Safe. Dua owner menandatangani `safeTxHash` (`cast wallet sign --no-hash`). Lalu:
///        SAFE_SIGNATURES=<sig1>,<sig2> forge script script/05_SafeGoLive.s.sol \
///          --rpc-url $RH_TESTNET_RPC --sender $DEPLOYER_ADDRESS              # dry-run
///        ... --account xofn-tn-deployer --sender $DEPLOYER_ADDRESS --broadcast # HANYA developer
///      Setelah broadcast berhasil, `status` di deployments/robinhood-testnet.json menjadi `live`.
contract SafeGoLive is Deploy1aScript {
    function run() external {
        Config memory cfg = _configFromEnv();
        // Sebelum go-live, keadaan dorman harus utuh: kalau ada yang menyimpang, berhenti di sini.
        Addresses memory predicted = _predict(cfg);
        Addresses memory a = _verifyDormant(
            cfg, [predicted.tierLib, predicted.poolSeeder, predicted.tokenDeployer]
        );
        _logHeader("XofN 1a / 05 SafeGoLive (IRREVERSIBLE)", cfg);

        bytes memory data = abi.encodeCall(XofNRegistry.setRegistrar, (a.graduator));
        uint256 nonce = _safeNonce(cfg.safe);
        SafeTx memory safeTx = SafeTx({
            to: a.registry,
            data: data,
            nonce: nonce,
            safeTxHash: _safeTxHash(cfg.safe, a.registry, data, nonce),
            dvn: address(0)
        });
        console2.log("action          Registry.setRegistrar(Graduator)");
        console2.log("registrar to set", a.graduator);
        console2.log("to             ", safeTx.to);
        console2.log("value           0, operation 0 (CALL)");
        console2.log("data           ", vm.toString(safeTx.data));
        console2.log("safe nonce     ", safeTx.nonce);
        console2.log("safeTxHash     ", vm.toString(safeTx.safeTxHash));

        bytes[] memory signatures = vm.envOr("SAFE_SIGNATURES", ",", new bytes[](0));
        if (signatures.length == 0) {
            vm.prank(cfg.safe);
            (bool ok,) = safeTx.to.call(safeTx.data);
            require(ok, "setRegistrar would revert when called by the Safe");
            console2.log("No SAFE_SIGNATURES: calldata simulated as the Safe. Nothing was signed or sent.");
            return;
        }

        vm.startBroadcast(cfg.deployer);
        _execSafeTx(cfg, safeTx, signatures);
        vm.stopBroadcast();

        require(XofNRegistry(a.registry).registrar() == a.graduator, "registrar not set");
        _assertLaunchOpenInSimulation(a.graduator);
        console2.log("RESULT: registrar set. Launching is open on Robinhood testnet.");

        if (
            vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)
                || vm.isContext(VmSafe.ForgeContext.ScriptResume)
        ) {
            vm.writeJson('"live"', "deployments/robinhood-testnet.json", ".status");
            console2.log("deployments/robinhood-testnet.json: status = live");
        }
    }

    function _safeNonce(address safe) private view returns (uint256) {
        (bool ok, bytes memory out) = safe.staticcall(abi.encodeWithSignature("nonce()"));
        require(ok && out.length == 32, "cannot read Safe nonce");
        return abi.decode(out, (uint256));
    }

    /// @dev SIMULASI lokal di akhir script (tidak di-broadcast): launch sekarang berhasil.
    function _assertLaunchOpenInSimulation(address graduator) private {
        uint32[] memory eids = new uint32[](1);
        eids[0] = EID_BASE_SEPOLIA;
        uint256 snapshot = vm.snapshotState();
        vm.prank(address(0xBEEF));
        XofNGraduator(payable(graduator)).launch(
            "Go-live Check", "GOLIVE", TierLib.TIER_STANDARD, eids, bytes32(0)
        );
        vm.revertToState(snapshot);
    }
}
