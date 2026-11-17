// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {OApp, Origin, MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {IOAppCore} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppCore.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {
    MessagingParams,
    MessagingReceipt
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {IOFT, SendParam} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IXofNCurve} from "./interfaces/IXofNCurve.sol";
import {IXofNRegistry} from "./interfaces/IXofNRegistry.sol";
import {IUniswapV2Router} from "./interfaces/IUniswapV2.sol";
import {ExpansionMsg} from "./libraries/ExpansionMsg.sol";
import {PoolSeeder} from "./libraries/PoolSeeder.sol";
import {TierLib} from "./libraries/TierLib.sol";
import {XofNTokenDeployer} from "./libraries/XofNTokenDeployer.sol";

/// @title XofNGraduator
/// @notice Owner dan delegate setiap XofNToken di home chain sejak launch sampai ekspansi selesai.
///         Menjalankan launch, `graduate()` (tahap 1), dan `expandAndLock()` / `retryRemote()`
///         (tahap 2).
/// @dev Batas kewenangan (PRD §5.2, CLAUDE.md §7):
///      - Tidak upgradeable. Semua parameter (resep tier, alamat DVN, AMM, ekonomi curve) dikunci
///        di constructor dan tidak punya setter.
///      - Fungsi yang mengubah state sebuah token hanya: `launch`, `graduate`, `expandAndLock`,
///        `retryRemote`, dan `lzReceive` (ack dari Remote). Tidak ada fungsi yang meneruskan
///        panggilan bebas ke token, mengubah tier, atau memindahkan ownership token.
///      - `graduate()` TIDAK me-renounce dan TIDAK menolkan delegate. Penguncian hanya terjadi di
///        akhir ekspansi, setelah SEMUA chain ekspansi melapor terkunci.
///      - Sebagai OApp, kontrak ini punya fungsi owner bawaan: `setPeer` (di sini hanya bisa
///        dipasang sekali per EID yang punya resep), `setDelegate`, `transferOwnership`,
///        `renounceOwnership`. Semuanya menyangkut pathway infrastruktur Graduator↔Remote, bukan
///        token. Batasnya: selama delegate infrastruktur masih dipegang owner, owner bisa
///        mengganti DVN pathway infrastruktur dan dengan itu memalsukan ack untuk token yang
///        BELUM terkunci. Token yang sudah terkunci tidak terpengaruh (PRD P38).
///
///      Urutan ekspansi per chain (keputusan owner 17 Nov 2026 atas PRD P28: resep sebelum
///      likuiditas):
///        expandAndLock ─ pasang resep sisi home ─ kirim DEPLOY ──► Remote: deploy + resep + peer
///        ack CONFIGURED ◄── pasang peer sisi home ─ kirim likuiditas (OFT send + compose)
///        Remote.lzCompose: buat + isi pool, kunci token remote ──► ack LOCKED
///        setelah SEMUA chain LOCKED: cek pra-kunci → renounceOwnership() → Registry.recordLock
///
///      Langkah lintas chain tidak atomik. `retryRemote` mengulang langkah terakhir yang belum
///      selesai dengan parameter yang sama; pesannya disusun ulang dari data launch yang immutable.
contract XofNGraduator is OApp, ReentrancyGuard {
    using OptionsBuilder for bytes;

    enum Status {
        None,
        Bonding,
        Graduated,
        Expanding,
        Locked
    }

    enum Step {
        None,
        DeploySent,
        Configured,
        LiquiditySent,
        RemoteLocked
    }

    struct Infra {
        address registry;
        address curveImplementation;
        address router;
        address lpRecipient;
    }

    /// @dev Ekonomi curve dan pool. Semua nilai milik owner (PRD P8, P15, P16).
    struct Economics {
        uint256 saleSupply; // token yang dijual curve
        uint256 startPrice; // wei per 1 token utuh
        uint256 graduationThreshold; // ETH yang harus terkumpul
        uint256 callerReward; // insentif tetap pemanggil graduate()
        uint256 expansionPairEth; // ETH pasangan per chain ekspansi
    }

    /// @dev Gas dan value untuk pesan ekspansi ke satu chain. Diukur di tes (PRD P4).
    struct ExpansionGas {
        uint128 deployGas; // lzReceive di Remote: deploy token + resep
        uint128 deployAckValue; // value di lzReceive Remote untuk membayar ack CONFIGURED
        uint128 seedGas; // tambahan gas lzCompose di Remote: buat + isi pool + kunci
        uint128 seedAckValue; // tambahan value di lzCompose untuk membayar ack LOCKED
    }

    struct Launch {
        address curve;
        address creator;
        uint8 tier;
        Status status;
        uint8 remotesLocked;
        address pool;
        address payer;
        bytes32 salt;
        uint256 tokensPerChain;
        uint32[] eids;
    }

    struct Expansion {
        Step step;
        address remoteToken;
        uint256 feeEscrow;
    }

    /// @dev Ukuran pesan OFT ber-compose: to (32) + amountSD (8) + composeFrom (32) + data (32).
    uint256 private constant LIQUIDITY_MESSAGE_LENGTH = 104;
    /// @dev Satuan terkecil lintas chain (18 desimal lokal, 6 shared): 0,000001 token.
    uint256 private constant DUST = 1e12;
    uint256 private constant TOTAL_SUPPLY = 999_000_000 ether;
    /// @dev Gas untuk pengembalian kelebihan fee. Dibatasi supaya penerima tidak bisa menghabiskan
    ///      gas langkah ekspansi; cukup untuk wallet kontrak biasa.
    uint256 private constant REFUND_GAS = 30_000;

    IXofNRegistry public immutable registry;
    address public immutable curveImplementation;
    address public immutable router;
    address public immutable factory;
    address public immutable weth;
    address public immutable lpRecipient;
    uint32 public immutable homeEid;

    uint256 public immutable saleSupply;
    uint256 public immutable startPrice;
    uint256 public immutable graduationThreshold;
    uint256 public immutable callerReward;
    uint256 public immutable expansionPairEth;

    uint256 public launchCount;
    /// @notice ETH pasangan yang disisihkan untuk chain ekspansi dan belum dikirim.
    uint256 public reservedPairEth;

    uint32[] private _expansionEids;
    address[] private _tokens;
    mapping(uint32 eid => TierLib.Pathway) private _pathways;
    mapping(uint32 eid => ExpansionGas) private _gas;
    mapping(address token => Launch) private _launches;
    mapping(address token => mapping(uint32 eid => Expansion)) private _expansions;

    event Launched(
        address indexed token,
        address indexed curve,
        address indexed creator,
        uint8 tier,
        uint32[] eids,
        bytes32 metadataHash
    );
    event Graduated(
        address indexed token,
        address indexed caller,
        address pool,
        uint256 poolTokens,
        uint256 poolEth,
        uint256 tokensPerChain
    );
    event ExpansionStarted(address indexed token, address indexed caller);
    event ExpansionStep(address indexed token, uint32 indexed eid, Step step, bytes32 guid);
    event LiquidityDeferred(address indexed token, uint32 indexed eid);
    event RefundFailed(address indexed to, uint256 amount);
    event Locked(address indexed token, uint8 tier);

    error ZeroAddress();
    error InvalidEconomics();
    error LengthMismatch();
    error DuplicateEid(uint32 eid);
    error UnsupportedEid(uint32 eid);
    error PeerAlreadySet(uint32 eid);
    error InvalidName();
    error InvalidSymbol();
    error InvalidExpansionChains();
    error InvalidStatus(address token, Status status);
    error NothingToRetry(address token, uint32 eid, Step step);
    error InsufficientFee(uint256 required, uint256 provided);
    error InfraPathwayNotPinned(uint32 eid);
    error ConfigMismatch(address token);
    error OnlySelf();
    error EthTransferFailed();

    constructor(
        address _endpoint,
        address _owner,
        Infra memory _infra,
        Economics memory _economics,
        TierLib.Pathway[] memory _pathwayList,
        ExpansionGas[] memory _gasList
    ) OApp(_endpoint, _owner) Ownable(_owner) {
        if (
            _infra.registry == address(0) || _infra.curveImplementation == address(0)
                || _infra.router == address(0) || _infra.lpRecipient == address(0)
        ) revert ZeroAddress();
        uint256 n = _pathwayList.length;
        if (n == 0 || n != _gasList.length) revert LengthMismatch();

        registry = IXofNRegistry(_infra.registry);
        curveImplementation = _infra.curveImplementation;
        router = _infra.router;
        factory = IUniswapV2Router(_infra.router).factory();
        weth = IUniswapV2Router(_infra.router).WETH();
        lpRecipient = _infra.lpRecipient;
        homeEid = endpoint.eid();

        // Likuiditas pool home harus tersisa setelah insentif dan porsi setiap chain ekspansi.
        if (
            _economics.saleSupply == 0 || _economics.saleSupply >= TOTAL_SUPPLY
                || _economics.startPrice == 0 || _economics.expansionPairEth == 0
                || _economics.graduationThreshold
                    <= _economics.callerReward + n * _economics.expansionPairEth
        ) revert InvalidEconomics();
        saleSupply = _economics.saleSupply;
        startPrice = _economics.startPrice;
        graduationThreshold = _economics.graduationThreshold;
        callerReward = _economics.callerReward;
        expansionPairEth = _economics.expansionPairEth;

        // Resep tier dikunci di sini (deployguide §5.2). Tidak ada setter.
        for (uint256 i = 0; i < n; i++) {
            TierLib.Pathway memory p = _pathwayList[i];
            TierLib.validate(p, registry, endpoint);
            if (_pathways[p.eid].eid != 0) revert DuplicateEid(p.eid);
            ExpansionGas memory g = _gasList[i];
            if (g.deployGas == 0 || g.seedGas == 0) revert TierLib.ZeroConfigField();
            _pathways[p.eid] = p;
            _gas[p.eid] = g;
            _expansionEids.push(p.eid);
        }
    }

    /// @dev Menerima ETH dari curve saat graduation.
    receive() external payable {}

    // ───────────────────────────── Launch ─────────────────────────────

    /// @notice Membuat token baru: clone curve, deploy XofNToken (supply penuh ke curve), dan
    ///         mencatat tier serta chain ekspansi di Registry. Satu transaksi.
    /// @param tier 1 = Standard (`XofN 2+1/2`), 2 = Fortress (`XofN 3+1/2`). Tidak bisa diubah.
    /// @param eids Chain ekspansi pilihan creator (minimal satu). Diterapkan saat ekspansi.
    /// @param metadataHash Hash metadata/gambar off-chain; hanya dicatat di event.
    function launch(
        string calldata name,
        string calldata symbol,
        uint8 tier,
        uint32[] calldata eids,
        bytes32 metadataHash
    ) external nonReentrant returns (address token, address curve) {
        if (bytes(name).length == 0 || bytes(name).length > 32) {
            revert InvalidName();
        }
        if (bytes(symbol).length < 2 || bytes(symbol).length > 12) revert InvalidSymbol();

        bytes32 salt = keccak256(abi.encode(homeEid, ++launchCount));
        curve = Clones.clone(curveImplementation);
        token =
            XofNTokenDeployer.deploy(salt, name, symbol, address(endpoint), address(this), curve);
        _registerLaunch(token, curve, salt, tier, eids);

        emit Launched(token, curve, msg.sender, tier, eids, metadataHash);
    }

    /// @dev Menolak tier tidak sah, chain di luar resep, tier yang tidak tersedia di sebuah
    ///      pathway, dan DVN yang sudah dicabut dari daftar putih; lalu mencatat launch.
    function _registerLaunch(
        address token,
        address curve,
        bytes32 salt,
        uint8 tier,
        uint32[] calldata eids
    ) private {
        if (!TierLib.isValidTier(tier)) revert TierLib.InvalidTier(tier);
        uint256 n = eids.length;
        if (n == 0 || n > _expansionEids.length) revert InvalidExpansionChains();

        bytes32[] memory hashes = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) {
            uint32 eid = eids[i];
            for (uint256 j = 0; j < i; j++) {
                if (eids[j] == eid) revert DuplicateEid(eid);
            }
            TierLib.Pathway storage p = _pathways[eid];
            if (p.eid == 0) revert UnsupportedEid(eid);
            // Fortress tidak pernah diturunkan diam-diam: kalau pathway tidak mendukung, tolak.
            if (!TierLib.supportsTier(p, tier)) revert TierLib.TierUnavailable(tier, eid);
            TierLib.requireAllowed(p, tier, registry);
            hashes[i] = TierLib.configHashOf(p, tier);
        }

        IXofNCurve(curve).initialize(token, saleSupply, startPrice, graduationThreshold);
        registry.register(token, tier, eids, hashes);

        Launch storage l = _launches[token];
        l.curve = curve;
        l.creator = msg.sender;
        l.tier = tier;
        l.status = Status.Bonding;
        l.salt = salt;
        l.eids = eids;
        _tokens.push(token);
    }

    // ───────────────────────────── Tahap 1: graduate ─────────────────────────────

    /// @notice Graduation lokal: memindahkan likuiditas dari curve ke pool di home chain.
    ///         Siapa pun boleh memanggil; pemanggil menerima insentif tetap.
    /// @dev Gagal sebelum ambang tercapai dan hanya bisa sekali (dijaga curve dan status).
    ///      Owner dan delegate token TETAP kontrak ini. Tidak ada renounce di tahap 1.
    ///
    ///      Pembagian: setiap pool (home dan tiap chain ekspansi) dibuka pada harga yang sama,
    ///      `(eth - insentif) / token`. Tiap chain ekspansi mendapat `expansionPairEth` dan token
    ///      sebanding; sisanya masuk pool home sekarang.
    function graduate(address token) external nonReentrant {
        Launch storage l = _launches[token];
        if (l.status != Status.Bonding) revert InvalidStatus(token, l.status);
        l.status = Status.Graduated;

        (uint256 ethAmount, uint256 tokenAmount) = IXofNCurve(l.curve).graduate();

        uint256 n = l.eids.length;
        uint256 liquidityEth = ethAmount - callerReward;
        // Dibulatkan ke kelipatan dust supaya tidak ada sisa pembulatan saat dikirim lintas chain.
        uint256 tokensPerChain =
            (Math.mulDiv(tokenAmount, expansionPairEth, liquidityEth) / DUST) * DUST;
        uint256 poolEth = liquidityEth - n * expansionPairEth;
        uint256 poolTokens = tokenAmount - n * tokensPerChain;

        l.tokensPerChain = tokensPerChain;
        reservedPairEth += n * expansionPairEth;

        (address pool,) = PoolSeeder.seed(factory, weth, token, poolTokens, poolEth, lpRecipient);
        l.pool = pool;

        emit Graduated(token, msg.sender, pool, poolTokens, poolEth, tokensPerChain);
        _sendEth(msg.sender, callerReward);
    }

    // ───────────────────────────── Tahap 2: ekspansi + kunci ─────────────────────────────

    /// @notice Memulai ekspansi token yang sudah lulus ke setiap chain pilihan creator.
    ///         Siapa pun boleh memanggil; pemanggil membayar fee LayerZero.
    /// @dev `msg.value` minimal harus menutup pesan DEPLOY ke semua chain. Sisanya disimpan
    ///      sebagai escrow fee pengiriman likuiditas, yang berangkat otomatis saat ack CONFIGURED
    ///      tiba. Bila escrow kurang, langkah itu menunggu `retryRemote`. Lihat
    ///      `quoteExpandAndLock`.
    function expandAndLock(address token) external payable nonReentrant {
        Launch storage l = _launches[token];
        if (l.status != Status.Graduated) revert InvalidStatus(token, l.status);
        l.status = Status.Expanding;
        l.payer = msg.sender;
        emit ExpansionStarted(token, msg.sender);

        uint256 n = l.eids.length;
        uint256 spent;
        for (uint256 i = 0; i < n; i++) {
            uint32 eid = l.eids[i];
            // Ack dari Remote memasang peer token dan memicu penguncian home, jadi pathway
            // infrastruktur ke chain ini tidak boleh berjalan di atas konfigurasi default.
            _requireInfraPinned(eid);
            // Resep sisi home dipasang lebih dulu (P28). Peer menyusul saat ack CONFIGURED,
            // karena alamat token remote baru pasti setelah Remote men-deploy-nya.
            TierLib.applyRecipe(endpoint, token, _pathways[eid], l.tier);
            spent += _sendDeploy(token, l, eid, msg.value - spent);
        }

        uint256 escrow = (msg.value - spent) / n;
        for (uint256 i = 0; i < n; i++) {
            _expansions[token][l.eids[i]].feeEscrow = escrow;
        }
        uint256 remainder = msg.value - spent - escrow * n;
        if (remainder != 0) _refund(msg.sender, remainder);
    }

    /// @notice Mengulang langkah terakhir yang belum selesai untuk satu chain, dengan parameter
    ///         yang sama. Siapa pun boleh memanggil dan membayar fee-nya (PRD P14).
    /// @dev - `DeploySent`: mengirim ulang pesan DEPLOY (Remote idempoten: kalau token sudah ada,
    ///        ia hanya mengirim ack lagi).
    ///      - `Configured`: mengirim likuiditas; `msg.value` ditambahkan ke escrow.
    ///      - `LiquiditySent`: tidak ada yang bisa diulang dari home. Token sudah dalam perjalanan;
    ///        pengulangan terjadi di chain tujuan (`endpoint.lzReceive` / `endpoint.lzCompose`,
    ///        atau `XofNRemote.reAck`).
    function retryRemote(address token, uint32 eid) external payable nonReentrant {
        Launch storage l = _launches[token];
        if (l.status != Status.Expanding) revert InvalidStatus(token, l.status);
        Expansion storage x = _expansions[token][eid];

        if (x.step == Step.DeploySent) {
            uint256 fee = _sendDeploy(token, l, eid, msg.value);
            if (msg.value > fee) _sendEth(msg.sender, msg.value - fee);
        } else if (x.step == Step.Configured) {
            _sendLiquidity(token, eid, msg.value, msg.sender);
        } else {
            revert NothingToRetry(token, eid, x.step);
        }
    }

    /// @dev Hanya untuk dipanggil kontrak ini sendiri dari `_lzReceive`, supaya kegagalan
    ///      pengiriman likuiditas (mis. escrow kurang) tidak membatalkan pencatatan ack.
    function sendLiquidityFromSelf(address token, uint32 eid) external {
        if (msg.sender != address(this)) revert OnlySelf();
        _sendLiquidity(token, eid, 0, address(0));
    }

    // ───────────────────────────── Ack dari Remote ─────────────────────────────

    /// @dev Hanya terpanggil dari endpoint untuk pesan dari peer (Remote) di `_origin.srcEid`.
    ///      Ack untuk langkah yang tidak sedang ditunggu diabaikan (pesan ganda dari retry).
    function _lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address,
        /*_executor*/
        bytes calldata /*_extraData*/
    ) internal override {
        (uint8 kind, address token, address remoteToken) = ExpansionMsg.decodeAck(_message);
        uint32 eid = _origin.srcEid;
        Launch storage l = _launches[token];
        Expansion storage x = _expansions[token][eid];

        if (kind == ExpansionMsg.ACK_CONFIGURED) {
            if (x.step != Step.DeploySent || remoteToken == address(0)) return;
            x.step = Step.Configured;
            x.remoteToken = remoteToken;
            IOAppCore(token).setPeer(eid, bytes32(uint256(uint160(remoteToken))));
            emit ExpansionStep(token, eid, Step.Configured, _guid);

            try this.sendLiquidityFromSelf(token, eid) {}
            catch {
                emit LiquidityDeferred(token, eid);
            }
        } else if (kind == ExpansionMsg.ACK_LOCKED) {
            if (x.step != Step.LiquiditySent) return;
            x.step = Step.RemoteLocked;
            emit ExpansionStep(token, eid, Step.RemoteLocked, _guid);

            // Home dikunci TERAKHIR, setelah semua chain ekspansi melapor terkunci.
            if (++l.remotesLocked == l.eids.length) _lockHome(token, l);
        }
    }

    /// @dev Verifikasi pra-kunci → lepas owner + delegate → catat di Registry. Revert bila
    ///      konfigurasi tidak sesuai tier; token lalu tetap berstatus Expanding.
    function _lockHome(address token, Launch storage l) private {
        if (!registry.checkConfig(token)) revert ConfigMismatch(token);
        // XofNToken.renounceOwnership() menolkan delegate lebih dulu.
        Ownable(token).renounceOwnership();
        registry.recordLock(token);
        l.status = Status.Locked;
        emit Locked(token, l.tier);
    }

    // ───────────────────────────── Pesan keluar ─────────────────────────────

    function _sendDeploy(address token, Launch storage l, uint32 eid, uint256 available)
        private
        returns (uint256 fee)
    {
        bytes memory message = _deployMessage(token, l);
        bytes memory options = _deployOptions(eid);
        fee = _quote(eid, message, options, false).nativeFee;
        if (available < fee) revert InsufficientFee(fee, available);

        bytes32 guid =
            _lzSend(eid, message, options, MessagingFee(fee, 0), payable(address(this))).guid;
        _expansions[token][eid].step = Step.DeploySent;
        emit ExpansionStep(token, eid, Step.DeploySent, guid);
    }

    /// @dev ETH pasangan berasal dari dana curve yang disisihkan saat graduation; pemanggil hanya
    ///      menanggung selisih fee di atasnya. Quote dan kirim terjadi di transaksi yang sama.
    ///      Selisih itu diambil dari escrow pemanggil `expandAndLock` lebih dulu, lalu dari
    ///      `extra` (value pemanggil `retryRemote`). Sisa masing-masing kembali ke pemiliknya:
    ///      pemanggil retry tidak bisa mengambil escrow orang lain.
    function _sendLiquidity(address token, uint32 eid, uint256 extra, address extraPayer) private {
        Launch storage l = _launches[token];
        Expansion storage x = _expansions[token][eid];
        if (x.step != Step.Configured) revert NothingToRetry(token, eid, x.step);

        SendParam memory param = _liquidityParam(l, eid);
        uint256 fee = IOFT(token).quoteSend(param, false).nativeFee;
        uint256 fromCaller = fee > expansionPairEth ? fee - expansionPairEth : 0;
        uint256 escrow = x.feeEscrow;
        if (escrow + extra < fromCaller) revert InsufficientFee(fromCaller, escrow + extra);
        uint256 fromEscrow = escrow < fromCaller ? escrow : fromCaller;

        x.step = Step.LiquiditySent;
        x.feeEscrow = 0;
        reservedPairEth -= expansionPairEth;

        (MessagingReceipt memory receipt,) =
            IOFT(token).send{value: fee}(param, MessagingFee(fee, 0), address(this));
        emit ExpansionStep(token, eid, Step.LiquiditySent, receipt.guid);

        if (escrow > fromEscrow) _refund(l.payer, escrow - fromEscrow);
        uint256 extraUsed = fromCaller - fromEscrow;
        if (extra > extraUsed) _refund(extraPayer, extra - extraUsed);
    }

    function _deployMessage(address token, Launch storage l) private view returns (bytes memory) {
        return ExpansionMsg.encodeDeploy(
            token, l.salt, l.tier, IERC20Metadata(token).name(), IERC20Metadata(token).symbol()
        );
    }

    function _deployOptions(uint32 eid) private view returns (bytes memory) {
        ExpansionGas memory g = _gas[eid];
        return OptionsBuilder.newOptions().addExecutorLzReceiveOption(g.deployGas, g.deployAckValue);
    }

    /// @dev Token dikreditkan ke Remote, lalu Remote membuat pool di `lzCompose`.
    ///      Value compose = ETH pasangan + anggaran ack LOCKED.
    function _liquidityParam(Launch storage l, uint32 eid) private view returns (SendParam memory) {
        ExpansionGas memory g = _gas[eid];
        return SendParam({
            dstEid: eid,
            to: peers[eid],
            amountLD: l.tokensPerChain,
            minAmountLD: l.tokensPerChain,
            extraOptions: OptionsBuilder.newOptions()
                .addExecutorLzComposeOption(
                    0, g.seedGas, uint128(expansionPairEth) + g.seedAckValue
                ),
            composeMsg: abi.encode(expansionPairEth),
            oftCmd: ""
        });
    }

    /// @dev Fee dibayar dari saldo kontrak (msg.value pemanggil atau escrow), bukan harus sama
    ///      dengan msg.value seperti bawaan OAppSender. Jumlahnya selalu hasil quote di
    ///      transaksi yang sama dan sudah dicek terhadap dana yang tersedia.
    function _payNative(uint256 _nativeFee) internal pure override returns (uint256) {
        return _nativeFee;
    }

    // ───────────────────────────── Owner (pathway infrastruktur) ─────────────────────────────

    /// @notice Memasang alamat Remote untuk satu chain ekspansi. Hanya sekali per EID, dan hanya
    ///         untuk EID yang resepnya ada di constructor.
    /// @dev Dibuat sekali-pasang supaya Remote tidak bisa diganti setelah ada token yang
    ///      bergantung padanya.
    function setPeer(uint32 _eid, bytes32 _peer) public override onlyOwner {
        if (_pathways[_eid].eid == 0) revert UnsupportedEid(_eid);
        if (_peer == bytes32(0)) revert ZeroAddress();
        if (peers[_eid] != bytes32(0)) revert PeerAlreadySet(_eid);
        _setPeer(_eid, _peer);
    }

    // ───────────────────────────── View ─────────────────────────────

    /// @notice Perkiraan `msg.value` untuk `expandAndLock`.
    /// @return deployFees Fee pasti pesan DEPLOY ke semua chain (minimum yang harus dibayar).
    /// @return liquidityFees Perkiraan bagian pemanggil untuk pengiriman likuiditas. Dihitung
    ///         dengan konfigurasi pathway infrastruktur, karena resep token baru terpasang di
    ///         dalam `expandAndLock`; nilai pastinya ada di `quoteRetry` setelah ack CONFIGURED.
    function quoteExpandAndLock(address token)
        external
        view
        returns (uint256 deployFees, uint256 liquidityFees)
    {
        Launch storage l = _launches[token];
        uint256 n = l.eids.length;
        for (uint256 i = 0; i < n; i++) {
            uint32 eid = l.eids[i];
            deployFees += _quote(eid, _deployMessage(token, l), _deployOptions(eid), false)
            .nativeFee;

            TierLib.Pathway memory p = _pathways[eid];
            ExpansionGas memory g = _gas[eid];
            bytes memory options = TierLib.sendAndCallOptions(p)
                .addExecutorLzComposeOption(
                    0, g.seedGas, uint128(expansionPairEth) + g.seedAckValue
                );
            uint256 fee =
                endpoint.quote(
                MessagingParams(
                    eid, _getPeerOrRevert(eid), new bytes(LIQUIDITY_MESSAGE_LENGTH), options, false
                ),
                address(this)
            )
            .nativeFee;
            if (fee > expansionPairEth) liquidityFees += fee - expansionPairEth;
        }
    }

    /// @notice `msg.value` yang dibutuhkan `retryRemote(token, eid)` saat ini (0 bila tidak ada
    ///         yang bisa diulang dari home).
    function quoteRetry(address token, uint32 eid) external view returns (uint256) {
        Launch storage l = _launches[token];
        Expansion storage x = _expansions[token][eid];
        if (l.status != Status.Expanding) return 0;
        if (x.step == Step.DeploySent) {
            return _quote(eid, _deployMessage(token, l), _deployOptions(eid), false).nativeFee;
        }
        if (x.step == Step.Configured) {
            uint256 fee = IOFT(token).quoteSend(_liquidityParam(l, eid), false).nativeFee;
            uint256 fromCaller = fee > expansionPairEth ? fee - expansionPairEth : 0;
            return fromCaller > x.feeEscrow ? fromCaller - x.feeEscrow : 0;
        }
        return 0;
    }

    function launchOf(address token) external view returns (Launch memory) {
        return _launches[token];
    }

    function expansionOf(address token, uint32 eid) external view returns (Expansion memory) {
        return _expansions[token][eid];
    }

    function pathwayOf(uint32 eid) external view returns (TierLib.Pathway memory) {
        return _pathways[eid];
    }

    function expansionGasOf(uint32 eid) external view returns (ExpansionGas memory) {
        return _gas[eid];
    }

    function expansionEids() external view returns (uint32[] memory) {
        return _expansionEids;
    }

    /// @notice Apakah `tier` ditawarkan untuk chain `eid` (Fortress bisa tidak tersedia).
    function tierAvailable(uint8 tier, uint32 eid) external view returns (bool) {
        return TierLib.supportsTier(_pathways[eid], tier);
    }

    function tokenCount() external view returns (uint256) {
        return _tokens.length;
    }

    function tokenAt(uint256 index) external view returns (address) {
        return _tokens[index];
    }

    // ───────────────────────────── Internal ─────────────────────────────

    function _sendEth(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert EthTransferFailed();
    }

    /// @dev Pengembalian kelebihan fee tidak boleh menggagalkan langkah ekspansi: gas dibatasi
    ///      dan kegagalan hanya dicatat. ETH yang gagal dikembalikan tetap di kontrak ini.
    function _refund(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount, gas: REFUND_GAS}("");
        if (!ok) emit RefundFailed(to, amount);
    }

    function _requireInfraPinned(uint32 eid) private view {
        if (endpoint.isDefaultSendLibrary(address(this), eid)) revert InfraPathwayNotPinned(eid);
        (, bool isDefault) = endpoint.getReceiveLibrary(address(this), eid);
        if (isDefault) revert InfraPathwayNotPinned(eid);
    }
}
