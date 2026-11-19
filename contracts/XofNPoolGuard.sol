// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

/// @title XofNPoolGuard
/// @notice Hook Uniswap v4 yang hanya mengizinkan satu alamat (`seeder`) menginisialisasi pool.
/// @dev Di v4 siapa pun bisa memanggil `PoolManager.initialize` untuk PoolKey mana pun, pada harga
///      berapa pun, bahkan sebelum tokennya ada. PoolKey XofN memuat alamat hook ini, jadi pool
///      XofN tidak bisa ada sebelum Graduator (home) atau Remote (chain ekspansi) membuatnya, dan
///      keduanya menginisialisasi serta mengisi pool dalam satu panggilan (PRD §5.5). Tidak ada
///      pool tandingan, donasi, atau harga awal milik pihak lain yang perlu ditangani.
///
///      Sengaja minimal: tanpa state, tanpa owner, tanpa panggilan keluar, dan hanya flag
///      `beforeInitialize`. Swap, tambah/tarik likuiditas, dan donasi tidak pernah melewati hook
///      ini. Alamat PoolManager tidak disimpan: hook ini hanya predikat atas `sender`, dan yang
///      berarti hanyalah state PoolManager kanonik. Karena itu initcode-nya sama di semua chain,
///      sehingga alamat hook (dan PoolId) seragam bila alamat `seeder` seragam.
contract XofNPoolGuard {
    /// @notice Satu-satunya alamat yang boleh menginisialisasi pool ber-hook ini.
    address public immutable seeder;

    error ZeroAddress();
    error InvalidHookAddress(address hook);
    error OnlySeeder(address sender);

    /// @dev Izin hook v4 dibaca dari 14 bit terendah ALAMAT hook. Bila bit `beforeInitialize` mati,
    ///      PoolManager tidak pernah memanggil hook ini dan siapa pun bisa menginisialisasi. Bila
    ///      ada bit lain yang hidup, PoolManager memanggil fungsi yang tidak ada di sini dan swap
    ///      atau mint akan revert. Jadi alamat yang salah ditolak saat deploy.
    constructor(address _seeder) {
        if (_seeder == address(0)) revert ZeroAddress();
        if (uint160(address(this)) & Hooks.ALL_HOOK_MASK != Hooks.BEFORE_INITIALIZE_FLAG) {
            revert InvalidHookAddress(address(this));
        }
        seeder = _seeder;
    }

    /// @param sender Pemanggil `PoolManager.initialize`.
    function beforeInitialize(address sender, PoolKey calldata, uint160)
        external
        view
        returns (bytes4)
    {
        if (sender != seeder) revert OnlySeeder(sender);
        return IHooks.beforeInitialize.selector;
    }
}
