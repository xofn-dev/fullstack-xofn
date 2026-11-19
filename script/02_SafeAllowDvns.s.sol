// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {console2} from "forge-std/Script.sol";

import {XofNRegistry} from "../contracts/XofNRegistry.sol";
import {Deploy1aScript} from "./lib/Deploy1aScript.sol";

/// @title 02_SafeAllowDvns — Fase 1a, langkah 2 dari 4
/// @notice Menyusun transaksi Safe `Registry.setDvnAllowed(dvn, true)` untuk tiap DVN resep.
///         Script ini TIDAK menandatangani apa pun.
/// @dev Tanpa `SAFE_SIGNATURES`: mencetak, untuk setiap DVN yang belum diizinkan, target,
///      calldata, nonce Safe, dan `safeTxHash`. Itu isi persetujuan tertulis (playbook §8).
///        forge script script/02_SafeAllowDvns.s.sol --rpc-url $RH_TESTNET_RPC
///      Tiap owner memeriksa sendiri lalu menandatangani di perangkatnya:
///        cast wallet sign --no-hash <safeTxHash> --account <keystore-owner>
///      Dengan `SAFE_SIGNATURES=<sig1>,<sig2>`: mengeksekusi transaksi tertunda PERTAMA. Jalankan
///      sekali per DVN, berurutan (hash dihitung dengan nonce berurutan):
///        SAFE_SIGNATURES=0x..,0x.. forge script script/02_SafeAllowDvns.s.sol \
///          --rpc-url $RH_TESTNET_RPC --sender $DEPLOYER_ADDRESS            # dry-run dulu
///        ... --account xofn-deployer --sender $DEPLOYER_ADDRESS --broadcast # HANYA developer
///      Tanda tangan terikat ke chain, alamat Safe, nonce, dan calldata; bila salah satunya
///      berubah, tanda tangan harus diulang.
contract SafeAllowDvns is Deploy1aScript {
    function run() external {
        Config memory cfg = _configFromEnv();
        _preflight(cfg);
        Addresses memory a = _predict(cfg);
        if (a.registry.code.length == 0) revert NotDeployed("registry", a.registry);
        if (XofNRegistry(a.registry).owner() != cfg.safe) {
            revert SafeNotAccepted(cfg.safe, "not the Registry owner");
        }
        _logHeader("XofN 1a / 02 SafeAllowDvns", cfg);
        console2.log("registry       ", a.registry);

        SafeTx[] memory pending = _pendingSafeTxs(cfg, a.registry);
        if (pending.length == 0) {
            console2.log("All recipe DVNs are already allowed. Nothing to do.");
            return;
        }
        for (uint256 i = 0; i < pending.length; i++) {
            console2.log("--- Safe transaction", i + 1, "of", pending.length);
            console2.log("dvn            ", pending[i].dvn);
            console2.log("to             ", pending[i].to);
            console2.log("value           0, operation 0 (CALL)");
            console2.log("data           ", vm.toString(pending[i].data));
            console2.log("safe nonce     ", pending[i].nonce);
            console2.log("safeTxHash     ", vm.toString(pending[i].safeTxHash));
        }

        bytes[] memory signatures = vm.envOr("SAFE_SIGNATURES", ",", new bytes[](0));
        if (signatures.length == 0) {
            // Bukti bahwa calldata berjalan bila pemanggilnya Safe; tidak ada yang dikirim.
            vm.startPrank(cfg.safe);
            for (uint256 i = 0; i < pending.length; i++) {
                (bool ok,) = pending[i].to.call(pending[i].data);
                require(ok, "calldata would revert when called by the Safe");
            }
            vm.stopPrank();
            console2.log("No SAFE_SIGNATURES: calldata simulated as the Safe. Nothing was signed or sent.");
            return;
        }

        console2.log("Executing Safe transaction 1 (dvn above) with the given signatures.");
        vm.startBroadcast(cfg.deployer);
        _execSafeTx(cfg, pending[0], signatures);
        vm.stopBroadcast();
        require(XofNRegistry(a.registry).dvnAllowed(pending[0].dvn), "DVN not allowed after execution");
        console2.log("Remaining after this one:", pending.length - 1);
    }
}
