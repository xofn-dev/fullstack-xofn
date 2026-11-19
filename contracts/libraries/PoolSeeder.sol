// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";

import {IV4PositionManager, IXofNPoolGuard} from "../interfaces/IUniswapV4.sol";

/// @title PoolSeeder
/// @notice Membuat DAN mengisi pool Uniswap v4 ETH/token dalam satu panggilan (PRD §5.5).
/// @dev Dipakai `XofNGraduator.graduate()` di home dan `XofNRemote.lzCompose()` di chain ekspansi.
///
///      Bentuk pool: ETH native (currency0) / token (currency1), fee 0,30%, tickSpacing 60, satu
///      posisi full-range, hook = `XofNPoolGuard`. Posisi full-range berperilaku seperti x·y=k,
///      jadi batas subsidi di constructor Graduator (PRD P42) tetap berlaku.
///
///      Ketahanan terhadap front-run: PoolKey memuat alamat hook penjaga, dan hook itu hanya
///      mengizinkan kontrak pemanggil library ini menginisialisasi pool. Pool tidak bisa ada
///      sebelum panggilan ini, jadi tidak ada harga awal, likuiditas, atau donasi pihak lain yang
///      perlu ditangani. Pihak lain tetap bisa membuat pool ETH/token DENGAN PoolKey LAIN (tanpa
///      hook atau hook lain); pool itu tidak memengaruhi pool ini.
///
///      Kenapa `initialize` dipanggil langsung di PoolManager, bukan lewat PositionManager: hook
///      menerima pemanggil `initialize` sebagai `sender`. Lewat PositionManager, `sender` adalah
///      PositionManager dan hook akan menolak.
///
///      Kenapa tanpa Permit2 dan tanpa `unlockCallback`: token dikirim ke PositionManager lalu
///      diselesaikan dari saldonya (`SETTLE` dengan `payerIsUser = false`) dalam jumlah yang
///      eksplisit, jadi saldo lain yang kebetulan ada di PositionManager tidak ikut terpakai.
///      PositionManager yang memegang `unlock`; Graduator dan Remote tidak mendapat fungsi baru.
///
///      Debu pembulatan: rentang berhenti di tick yang bisa dipakai, bukan di tak hingga, jadi
///      sebagian sangat kecil dari satu sisi tidak terserap. Sisa sampai `jumlah / DUST_DIVISOR`
///      dilepas di PoolManager (`clear`): tidak dibakar, total supply tetap 999M, dan pemanggil
///      tidak menyisakan apa pun. Sisa di atas batas itu dikembalikan ke pemanggil; tidak revert,
///      supaya `graduate()` dan `lzCompose` tidak bisa macet karena pembulatan.
///
///      Asumsi: token tanpa pajak transfer, 18 desimal.
library PoolSeeder {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;

    /// @dev 0,30% dalam satuan pip (1e-6), sama dengan fee Uniswap v2.
    uint24 internal constant POOL_FEE = 3000;
    int24 internal constant TICK_SPACING = 60;
    /// @dev Tick terjauh yang kelipatan TICK_SPACING: floor(887272 / 60) * 60.
    int24 internal constant TICK_LOWER = -887_220;
    int24 internal constant TICK_UPPER = 887_220;
    uint256 internal constant DUST_DIVISOR = 1e9;

    error ZeroSeedAmount();
    error SeedAmountTooLarge();
    error InvalidPositionManager(address positionManager);
    error InvalidPoolGuard(address poolGuard);
    error InvalidLpRecipient(address lpRecipient);

    /// @notice Menolak infrastruktur yang tidak akan pernah bisa membuat pool. Dipanggil sekali,
    ///         di constructor kontrak pemanggil.
    /// @dev `external`: library terhubung, dijalankan lewat delegatecall, jadi `address(this)`
    ///      adalah kontrak pemanggil. Hook harus sudah ada dan terikat ke kontrak itu.
    function validate(address positionManager, address poolGuard, address lpRecipient)
        external
        view
    {
        if (positionManager.code.length == 0) revert InvalidPositionManager(positionManager);
        IV4PositionManager posm = IV4PositionManager(positionManager);
        // `poolManager()` juga dimiliki kontrak v4 lain (quoter, StateView, router). Yang salah
        // tempel di sini baru ketahuan saat graduation, ketika curve sudah tertutup dan tidak ada
        // jalan keluar. Penghitung NFT posisi hanya ada di PositionManager dan mulai dari 1.
        try posm.nextTokenId() returns (uint256 nextId) {
            if (nextId == 0) revert InvalidPositionManager(positionManager);
        } catch {
            revert InvalidPositionManager(positionManager);
        }
        if (address(posm.poolManager()).code.length == 0) {
            revert InvalidPositionManager(positionManager);
        }
        // Flag salah berarti hook tidak pernah dipanggil (siapa pun bisa menginisialisasi) atau
        // dipanggil untuk fungsi yang tidak ada (pool tidak bisa dipakai).
        if (
            poolGuard.code.length == 0
                || uint160(poolGuard) & Hooks.ALL_HOOK_MASK != Hooks.BEFORE_INITIALIZE_FLAG
                || IXofNPoolGuard(poolGuard).seeder() != address(this)
        ) revert InvalidPoolGuard(poolGuard);
        // Perilakunya ikut diuji, bukan hanya alamat dan `seeder()`: kontrak ini harus lolos
        // dengan jawaban yang diterima PoolManager, dan pihak lain harus ditolak. Hook yang
        // meloloskan siapa pun akan membiarkan pool diinisialisasi lebih dulu pada harga
        // sembarang, dan `seed` lalu revert selamanya.
        PoolKey memory key = poolKey(poolGuard, address(this));
        (bool ok, bytes memory answer) = poolGuard.staticcall(
            abi.encodeCall(IXofNPoolGuard.beforeInitialize, (address(this), key, 1))
        );
        if (
            !ok || answer.length != 32
                || abi.decode(answer, (bytes4)) != IHooks.beforeInitialize.selector
        ) revert InvalidPoolGuard(poolGuard);
        (ok,) = poolGuard.staticcall(
            abi.encodeCall(IXofNPoolGuard.beforeInitialize, (positionManager, key, 1))
        );
        if (ok) revert InvalidPoolGuard(poolGuard);
        // PositionManager mengartikan address(1) sebagai pemanggil dan address(2) sebagai dirinya
        // sendiri; address(0) ditolak saat mint NFT.
        if (uint160(lpRecipient) <= 2) revert InvalidLpRecipient(lpRecipient);
    }

    /// @dev `external`: library terhubung, dijalankan lewat delegatecall. Aset dan `address(this)`
    ///      tetap milik kontrak pemanggil.
    /// @param positionManager PositionManager Uniswap v4 chain ini.
    /// @param poolGuard   Hook `XofNPoolGuard` yang terikat ke kontrak pemanggil.
    /// @param token       Token yang dipasangkan dengan ETH.
    /// @param tokenAmount Jumlah token; harus sudah dipegang kontrak pemanggil.
    /// @param ethAmount   Jumlah ETH native; harus sudah dipegang kontrak pemanggil.
    /// @param lpRecipient Penerima NFT posisi.
    /// @return poolId     PoolId v4 (`keccak256(abi.encode(PoolKey))`).
    /// @return positionId ID NFT posisi di PositionManager.
    function seed(
        address positionManager,
        address poolGuard,
        address token,
        uint256 tokenAmount,
        uint256 ethAmount,
        address lpRecipient
    ) external returns (bytes32 poolId, uint256 positionId) {
        if (tokenAmount == 0 || ethAmount == 0) revert ZeroSeedAmount();
        if (tokenAmount > type(uint128).max || ethAmount > type(uint128).max) {
            revert SeedAmountTooLarge();
        }

        IV4PositionManager posm = IV4PositionManager(positionManager);
        PoolKey memory key = poolKey(poolGuard, token);
        poolId = PoolId.unwrap(key.toId());

        // Revert bila pool sudah ada (`PoolAlreadyInitialized`). Hanya kontrak ini yang lolos hook.
        posm.poolManager().initialize(key, sqrtPriceX96(ethAmount, tokenAmount));

        positionId = posm.nextTokenId();
        IERC20(token).safeTransfer(positionManager, tokenAmount);

        bytes[] memory params = new bytes[](5);
        params[0] = abi.encode(key.currency0, ethAmount, false);
        params[1] = abi.encode(key.currency1, tokenAmount, false);
        // Likuiditas dihitung PositionManager dari kredit di atas pada harga pool saat ini.
        params[2] = abi.encode(
            key,
            TICK_LOWER,
            TICK_UPPER,
            uint128(ethAmount),
            uint128(tokenAmount),
            lpRecipient,
            bytes("")
        );
        params[3] = abi.encode(key.currency0, ethAmount / DUST_DIVISOR);
        params[4] = abi.encode(key.currency1, tokenAmount / DUST_DIVISOR);

        posm.modifyLiquidities{value: ethAmount}(
            abi.encode(
                abi.encodePacked(
                    uint8(Actions.SETTLE),
                    uint8(Actions.SETTLE),
                    uint8(Actions.MINT_POSITION_FROM_DELTAS),
                    uint8(Actions.CLEAR_OR_TAKE),
                    uint8(Actions.CLEAR_OR_TAKE)
                ),
                params
            ),
            block.timestamp
        );
    }

    /// @notice PoolKey pool XofN untuk `token`. ETH native selalu currency0 (alamat 0).
    function poolKey(address poolGuard, address token) internal pure returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(token),
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(poolGuard)
        });
    }

    /// @notice Akar harga pembukaan dalam Q64.96: sqrt(tokenAmount / ethAmount) * 2^96.
    /// @dev Dihitung sebagai sqrt(token * 2^128 / eth) * 2^32. Dengan kedua jumlah <= uint128,
    ///      hasil `mulDiv` di bawah 2^256 dan hasil akhir di bawah 2^160. `token << 192` langsung
    ///      akan overflow.
    function sqrtPriceX96(uint256 ethAmount, uint256 tokenAmount) internal pure returns (uint160) {
        return uint160(Math.sqrt(Math.mulDiv(tokenAmount, 1 << 128, ethAmount)) << 32);
    }
}
