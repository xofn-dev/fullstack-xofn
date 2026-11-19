// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TestHelperOz5} from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import {
    EndpointV2Mock as EndpointV2
} from "@layerzerolabs/test-devtools-evm-foundry/contracts/mocks/EndpointV2Mock.sol";
import {
    ReceiveUln302Mock as ReceiveUln302
} from "@layerzerolabs/test-devtools-evm-foundry/contracts/mocks/ReceiveUln302Mock.sol";
import {
    SendUln302Mock as SendUln302
} from "@layerzerolabs/test-devtools-evm-foundry/contracts/mocks/SendUln302Mock.sol";
import {UlnConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import {ExecutorConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol";
import {
    SetConfigParam
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import {
    Origin
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {
    PacketV1Codec
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/messagelib/libs/PacketV1Codec.sol";
import {
    IOFT,
    SendParam,
    MessagingFee,
    OFTReceipt
} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import {OFTMsgCodec} from "@layerzerolabs/oft-evm/contracts/libs/OFTMsgCodec.sol";
import {OFTComposeMsgCodec} from "@layerzerolabs/oft-evm/contracts/libs/OFTComposeMsgCodec.sol";
import {DoubleEndedQueue} from "@openzeppelin/contracts/utils/structs/DoubleEndedQueue.sol";

import {XofNCurve} from "../../contracts/XofNCurve.sol";
import {XofNGraduator} from "../../contracts/XofNGraduator.sol";
import {XofNRegistry} from "../../contracts/XofNRegistry.sol";
import {XofNRemote} from "../../contracts/XofNRemote.sol";
import {XofNToken} from "../../contracts/XofNToken.sol";
import {TierLib} from "../../contracts/libraries/TierLib.sol";
import {MockDVN} from "../mocks/MockDVN.sol";
import {MockWETH, MockV2Factory, MockV2Router, MockV2Pair} from "../mocks/MockUniswapV2.sol";

interface IDelegates {
    function delegates(address oapp) external view returns (address);
}

/// @dev Fondasi tes multi-endpoint (TestHelperOz5): tiga endpoint tiruan dalam satu EVM.
///      EID 1 = Robinhood (home), 2 = Base, 3 = Arbitrum. Tiap "chain" punya lima DVN tiruan
///      (pengganti operator yang belum diputuskan, PRD P1), AMM v2 tiruan, dan Registry sendiri.
///
///      `verifyPackets` bawaan helper hanya memakai satu DVN bertanda tangan, jadi tidak bisa
///      memenuhi konfigurasi 2+1/2. Pengiriman pesan di sini memakai `_deliver`: setiap DVN di
///      konfigurasi penerima memverifikasi (kecuali yang ditandai mati), lalu commit, lalu
///      `lzReceive` dengan gas dan value dari opsi pesan.
abstract contract XofNTestBase is TestHelperOz5 {
    using PacketV1Codec for bytes;
    using DoubleEndedQueue for DoubleEndedQueue.Bytes32Deque;

    uint32 internal constant HOME = 1;
    uint32 internal constant BASE = 2;
    uint32 internal constant ARB = 3;

    uint8 internal constant STANDARD = 1;
    uint8 internal constant FORTRESS = 2;

    uint256 internal constant TOTAL_SUPPLY = 999_000_000 ether;
    address internal constant LP_RECIPIENT = address(0xdead);

    // Konstanta tes lokal untuk parameter milik owner (PRD P8, P15, P16; ARCHITECTURE §12).
    uint256 internal constant SALE_SUPPLY = 799_200_000 ether;
    uint256 internal constant START_PRICE = 1_500_000_000; // 0,0000000015 ETH per token
    uint256 internal constant GRADUATION_THRESHOLD = 4 ether;
    uint256 internal constant CALLER_REWARD = 0.01 ether;
    uint256 internal constant EXPANSION_PAIR_ETH = 0.04 ether;

    // Saldo awal tiap XofNRemote: ETH pasangan + fee ack dibayar dari sini, diisi tim (PRD P51).
    uint256 internal constant REMOTE_FUNDING = 10 ether;

    // Gas pesan ekspansi. Angka terukur ada di test/lz/GasMeasure.t.sol (PRD P4).
    uint128 internal constant DEPLOY_GAS = 7_000_000;
    uint128 internal constant SEED_GAS = 5_000_000;
    uint128 internal constant ACK_CONFIGURED_GAS = 1_500_000;
    uint128 internal constant ACK_LOCKED_GAS = 1_500_000;
    uint128 internal constant TOKEN_RECEIVE_GAS = 300_000;
    uint128 internal constant TOKEN_COMPOSE_GAS = 100_000;
    uint64 internal constant CONFIRMATIONS = 15;
    uint32 internal constant MAX_MESSAGE_SIZE = 10_000;

    struct ChainEnv {
        address endpoint;
        address sendLib;
        address receiveLib;
        MockWETH weth;
        MockV2Factory factory;
        MockV2Router router;
        XofNRegistry registry;
        address[] dvns; // lima alamat, terurut naik
    }

    struct Delivery {
        bool verified;
        bool executed;
        bytes32 guid;
        bytes packet;
        bytes options;
    }

    address internal safe = makeAddr("safe");
    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal attacker = makeAddr("attacker");
    address internal keeper = makeAddr("keeper");

    mapping(uint32 eid => ChainEnv) internal chains;
    mapping(uint32 eid => XofNRemote) internal remotes;
    mapping(address dvn => bool) internal dvnDown;

    XofNCurve internal curveImpl;
    XofNGraduator internal graduator;

    function setUp() public virtual override {
        super.setUp();
        vm.deal(address(this), 10_000 ether);
        vm.deal(creator, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(attacker, 100 ether);
        vm.deal(keeper, 100 ether);

        // Batas value executor 0, seperti Robinhood testnet → Base/Arbitrum Sepolia (PRD P51).
        // Seluruh suite membuktikan ekspansi tidak membutuhkan value lewat executor.
        setExecutorValueCap(0);
        setUpEndpoints(3, LibraryType.UltraLightNode);
        for (uint32 eid = HOME; eid <= ARB; eid++) {
            _setUpChain(eid);
        }

        curveImpl = new XofNCurve();
        graduator = _deployGraduator(_homePathways(), _economics());
        vm.prank(safe);
        chains[HOME].registry.setRegistrar(address(graduator));

        for (uint32 eid = BASE; eid <= ARB; eid++) {
            XofNRemote remote = _deployRemote(eid);
            remotes[eid] = remote;
            vm.deal(address(remote), REMOTE_FUNDING);
            vm.startPrank(safe);
            chains[eid].registry.setRegistrar(address(remote));
            graduator.setPeer(eid, _b32(address(remote)));
            remote.setPeer(HOME, _b32(address(graduator)));
            vm.stopPrank();
            // Pathway infrastruktur Graduator↔Remote di-wire dengan resep Fortress (deployguide §7.2).
            _wireInfra(address(graduator), HOME, eid);
            _wireInfra(address(remote), eid, HOME);
        }
    }

    // ───────────────────────────── Setup ─────────────────────────────

    function _setUpChain(uint32 eid) internal {
        ChainEnv storage c = chains[eid];
        c.endpoint = endpoints[eid];
        c.sendLib = endpointSetup.sendLibs[eid - 1];
        c.receiveLib = endpointSetup.receiveLibs[eid - 1];
        c.weth = new MockWETH();
        c.factory = new MockV2Factory();
        c.router = new MockV2Router(address(c.factory), address(c.weth));
        c.registry = new XofNRegistry(c.endpoint, safe);

        address[] memory dvns = new address[](5);
        for (uint256 i = 0; i < 5; i++) {
            dvns[i] = address(new MockDVN(0.0001 ether));
        }
        _sort(dvns);
        vm.startPrank(safe);
        for (uint256 i = 0; i < 5; i++) {
            c.dvns.push(dvns[i]);
            c.registry.setDvnAllowed(dvns[i], true);
        }
        vm.stopPrank();
    }

    /// @dev Resep pathway dari `localEid` ke `remoteEid`. Dari lima DVN terurut a0..a4:
    ///      Standard wajib = {a0, a2}; Fortress wajib = {a0, a2, a4}; opsional = {a1, a3}.
    function _pathway(uint32 localEid, uint32 remoteEid)
        internal
        view
        returns (TierLib.Pathway memory p)
    {
        ChainEnv storage c = chains[localEid];
        p.eid = remoteEid;
        p.sendLib = c.sendLib;
        p.receiveLib = c.receiveLib;
        p.executor =
        SendUln302(payable(c.sendLib)).getExecutorConfig(address(0xdead), remoteEid).executor;
        p.maxMessageSize = MAX_MESSAGE_SIZE;
        p.confirmations = CONFIRMATIONS;
        p.receiveGas = TOKEN_RECEIVE_GAS;
        p.composeGas = TOKEN_COMPOSE_GAS;
        p.standardRequired = new address[](2);
        p.standardRequired[0] = c.dvns[0];
        p.standardRequired[1] = c.dvns[2];
        p.fortressRequired = new address[](3);
        p.fortressRequired[0] = c.dvns[0];
        p.fortressRequired[1] = c.dvns[2];
        p.fortressRequired[2] = c.dvns[4];
        p.optionalDvns = new address[](2);
        p.optionalDvns[0] = c.dvns[1];
        p.optionalDvns[1] = c.dvns[3];
    }

    function _homePathways() internal view returns (TierLib.Pathway[] memory list) {
        list = new TierLib.Pathway[](2);
        list[0] = _pathway(HOME, BASE);
        list[1] = _pathway(HOME, ARB);
    }

    /// @dev Virtual: tes ekonomi (mis. test/lz/SubsidyFarm.t.sol) memakai nilai lain.
    function _economics() internal pure virtual returns (XofNGraduator.Economics memory) {
        return XofNGraduator.Economics({
            saleSupply: SALE_SUPPLY,
            startPrice: START_PRICE,
            graduationThreshold: GRADUATION_THRESHOLD,
            callerReward: CALLER_REWARD,
            expansionPairEth: EXPANSION_PAIR_ETH
        });
    }

    function _expansionGas() internal pure returns (XofNGraduator.ExpansionGas memory) {
        return XofNGraduator.ExpansionGas({deployGas: DEPLOY_GAS, seedGas: SEED_GAS});
    }

    function _graduatorInfra() internal view returns (XofNGraduator.Infra memory) {
        return XofNGraduator.Infra({
            registry: address(chains[HOME].registry),
            curveImplementation: address(curveImpl),
            router: address(chains[HOME].router),
            lpRecipient: LP_RECIPIENT
        });
    }

    function _deployGraduator(
        TierLib.Pathway[] memory pathways,
        XofNGraduator.Economics memory economics
    ) internal returns (XofNGraduator) {
        XofNGraduator.ExpansionGas[] memory gas = new XofNGraduator.ExpansionGas[](pathways.length);
        for (uint256 i = 0; i < gas.length; i++) {
            gas[i] = _expansionGas();
        }
        return
            new XofNGraduator(
                chains[HOME].endpoint, safe, _graduatorInfra(), economics, pathways, gas
            );
    }

    function _remoteInfra(uint32 eid) internal view returns (XofNRemote.Infra memory) {
        return XofNRemote.Infra({
            registry: address(chains[eid].registry),
            router: address(chains[eid].router),
            lpRecipient: LP_RECIPIENT,
            homeEid: HOME,
            ackConfiguredGas: ACK_CONFIGURED_GAS,
            ackLockedGas: ACK_LOCKED_GAS
        });
    }

    function _deployRemote(uint32 eid) internal returns (XofNRemote) {
        return new XofNRemote(chains[eid].endpoint, safe, _remoteInfra(eid), _pathway(eid, HOME));
    }

    /// @dev Konfigurasi pathway infrastruktur sebuah OApp, dipasang delegate-nya (Safe).
    function _wireInfra(address oapp, uint32 localEid, uint32 remoteEid) internal {
        _wireInfraAs(safe, oapp, localEid, remoteEid);
    }

    /// @dev Sama dengan `_wireInfra`, oleh delegate tertentu (mis. EOA deployer sebelum
    ///      `setDelegate(Safe)`, skenario urutan deploy di test/lz/GoLive.t.sol).
    function _wireInfraAs(address delegate, address oapp, uint32 localEid, uint32 remoteEid)
        internal
    {
        TierLib.Pathway memory p = _pathway(localEid, remoteEid);
        EndpointV2 ep = EndpointV2(chains[localEid].endpoint);
        bytes memory uln = abi.encode(TierLib.ulnConfig(p, FORTRESS));

        vm.startPrank(delegate);
        ep.setSendLibrary(oapp, remoteEid, p.sendLib);
        ep.setReceiveLibrary(oapp, remoteEid, p.receiveLib, 0);
        SetConfigParam[] memory sendParams = new SetConfigParam[](2);
        sendParams[0] = SetConfigParam(remoteEid, 1, abi.encode(TierLib.executorConfig(p)));
        sendParams[1] = SetConfigParam(remoteEid, 2, uln);
        ep.setConfig(oapp, p.sendLib, sendParams);
        SetConfigParam[] memory receiveParams = new SetConfigParam[](1);
        receiveParams[0] = SetConfigParam(remoteEid, 2, uln);
        ep.setConfig(oapp, p.receiveLib, receiveParams);
        vm.stopPrank();
    }

    // ───────────────────────────── Aksi produk ─────────────────────────────

    function _eids(uint32 a) internal pure returns (uint32[] memory list) {
        list = new uint32[](1);
        list[0] = a;
    }

    function _eids(uint32 a, uint32 b) internal pure returns (uint32[] memory list) {
        list = new uint32[](2);
        list[0] = a;
        list[1] = b;
    }

    function _launch(uint8 tier, uint32[] memory eids)
        internal
        returns (XofNToken token, XofNCurve curve)
    {
        vm.prank(creator);
        (address t, address c) = graduator.launch("Proof Coin", "PROOF", tier, eids, bytes32(0));
        token = XofNToken(t);
        curve = XofNCurve(c);
    }

    function _buy(XofNCurve curve, address buyer, uint256 ethIn) internal returns (uint256) {
        vm.prank(buyer);
        return curve.buy{value: ethIn}(0);
    }

    function _reachThreshold(XofNCurve curve) internal {
        vm.deal(alice, GRADUATION_THRESHOLD + 1 ether);
        _buy(curve, alice, GRADUATION_THRESHOLD);
        assertTrue(curve.thresholdReached(), "threshold");
    }

    function _launchAndGraduate(uint8 tier, uint32[] memory eids)
        internal
        returns (XofNToken token, XofNCurve curve)
    {
        (token, curve) = _launch(tier, eids);
        _reachThreshold(curve);
        vm.prank(keeper);
        graduator.graduate(address(token));
    }

    function _expand(XofNToken token) internal {
        (uint256 deployFees, uint256 liquidityFees) = graduator.quoteExpandAndLock(address(token));
        vm.prank(keeper);
        graduator.expandAndLock{value: deployFees + liquidityFees}(address(token));
    }

    /// @dev Menjalankan satu chain ekspansi dari awal sampai ack LOCKED diterima di home.
    function _runChain(XofNToken token, uint32 eid) internal {
        XofNRemote remote = remotes[eid];
        _mustDeliver(eid, address(remote)); // DEPLOY
        _mustDeliver(HOME, address(graduator)); // ack CONFIGURED → likuiditas berangkat
        address remoteToken = remote.deploymentOf(address(token)).remoteToken;
        Delivery memory d = _mustDeliver(eid, remoteToken); // kredit token ke Remote
        assertTrue(_compose(eid, d, address(remote)), "compose");
        _mustDeliver(HOME, address(graduator)); // ack LOCKED
    }

    function _launchGraduateExpand(uint8 tier, uint32[] memory eids)
        internal
        returns (XofNToken token, XofNCurve curve)
    {
        (token, curve) = _launchAndGraduate(tier, eids);
        _expand(token);
        for (uint256 i = 0; i < eids.length; i++) {
            _runChain(token, eids[i]);
        }
    }

    /// @dev OFT send biasa oleh pengguna: quote tepat sebelum send (PRD §5.8).
    function _bridge(
        address oft,
        address sender,
        uint32 dstEid,
        address to,
        uint256 amount,
        bytes memory extraOptions,
        bytes memory composeMsg
    ) internal returns (uint256 amountSent) {
        SendParam memory param = SendParam({
            dstEid: dstEid,
            to: _b32(to),
            amountLD: amount,
            minAmountLD: 0,
            extraOptions: extraOptions,
            composeMsg: composeMsg,
            oftCmd: ""
        });
        MessagingFee memory fee = IOFT(oft).quoteSend(param, false);
        vm.prank(sender);
        (, OFTReceipt memory receipt) = IOFT(oft).send{value: fee.nativeFee}(param, fee, sender);
        amountSent = receipt.amountSentLD;
    }

    function _remoteToken(XofNToken token, uint32 eid) internal view returns (XofNToken) {
        return XofNToken(remotes[eid].deploymentOf(address(token)).remoteToken);
    }

    // ───────────────────────────── Pengiriman pesan ─────────────────────────────

    function _pending(uint32 dstEid, address dst) internal view returns (uint256) {
        return packetsQueue[dstEid][_b32(dst)].length();
    }

    /// @dev Mengembalikan pesan yang sudah diambil ke antrean (mis. `lzReceive`-nya gagal).
    function _requeue(uint32 dstEid, address dst, bytes32 guid) internal {
        packetsQueue[dstEid][_b32(dst)].pushBack(guid);
    }

    function _deliver(uint32 dstEid, address dst) internal returns (Delivery memory) {
        return _deliverWithGas(dstEid, dst, 0);
    }

    /// @param gasLimit 0 = pakai gas dari opsi pesan.
    function _deliverWithGas(uint32 dstEid, address dst, uint256 gasLimit)
        internal
        returns (Delivery memory d)
    {
        d = _take(dstEid, dst);
        if (d.verified) d.executed = _execute(d, gasLimit);
    }

    /// @dev Mengambil pesan berikutnya dan menjalankan verifikasi DVN + commit, tanpa `lzReceive`.
    ///      Bila ambang verifikasi tidak terpenuhi, pesan dikembalikan ke antrean (tertunda).
    function _take(uint32 dstEid, address dst) internal returns (Delivery memory d) {
        DoubleEndedQueue.Bytes32Deque storage queue = packetsQueue[dstEid][_b32(dst)];
        require(queue.length() > 0, "no pending packet");
        d.guid = queue.popBack();
        d.packet = packets[d.guid];
        d.options = optionsLookup[d.guid];
        d.verified = this.verifyAndCommit(d.packet);
        if (!d.verified) queue.pushBack(d.guid);
    }

    /// @dev Menjalankan `lzReceive` untuk pesan yang sudah terverifikasi (juga dipakai untuk
    ///      retry di endpoint). Gas dan value diambil dari opsi pesan.
    function _execute(Delivery memory d, uint256 gasLimit) internal returns (bool) {
        (uint256 gas, uint256 value) = _parseExecutorLzReceiveOption(d.options);
        if (gasLimit != 0) gas = gasLimit;
        return _executeWith(d, gas, value);
    }

    function _executeWith(Delivery memory d, uint256 gas, uint256 value) internal returns (bool) {
        try this.execReceive{value: value}(d.packet, gas) {
            return true;
        } catch {
            return false;
        }
    }

    function messageOf(bytes calldata packetBytes) external pure returns (bytes memory) {
        return packetBytes.message();
    }

    function _mustDeliver(uint32 dstEid, address dst) internal returns (Delivery memory d) {
        d = _deliver(dstEid, dst);
        assertTrue(d.verified, "packet not verified");
        assertTrue(d.executed, "lzReceive failed");
    }

    /// @dev Setiap DVN di konfigurasi penerima (wajib dan opsional) memverifikasi, kecuali yang
    ///      ditandai mati. Mengembalikan false bila ambang verifikasi tidak terpenuhi.
    function verifyAndCommit(bytes calldata packetBytes) external returns (bool) {
        uint32 dstEid = packetBytes.dstEid();
        uint32 srcEid = packetBytes.srcEid();
        address receiver = packetBytes.receiverB20();
        (address receiveLib,) = EndpointV2(endpoints[dstEid]).getReceiveLibrary(receiver, srcEid);
        ReceiveUln302 uln = ReceiveUln302(receiveLib);
        UlnConfig memory config = uln.getUlnConfig(receiver, srcEid);
        bytes memory header = packetBytes.header();
        bytes32 payloadHash = keccak256(packetBytes.payload());

        for (uint256 i = 0; i < config.requiredDVNs.length; i++) {
            _dvnVerify(uln, config.requiredDVNs[i], header, payloadHash, config.confirmations);
        }
        for (uint256 i = 0; i < config.optionalDVNs.length; i++) {
            _dvnVerify(uln, config.optionalDVNs[i], header, payloadHash, config.confirmations);
        }
        try uln.commitVerification(header, payloadHash) {
            return true;
        } catch {
            return false;
        }
    }

    function _dvnVerify(
        ReceiveUln302 uln,
        address dvn,
        bytes memory header,
        bytes32 payloadHash,
        uint64 confirmations
    ) private {
        if (dvnDown[dvn]) return;
        vm.prank(dvn);
        uln.verify(header, payloadHash, confirmations);
    }

    function execReceive(bytes calldata packetBytes, uint256 gas) external payable {
        Origin memory origin =
            Origin(packetBytes.srcEid(), packetBytes.sender(), packetBytes.nonce());
        EndpointV2(endpoints[packetBytes.dstEid()]).lzReceive{value: msg.value, gas: gas}(
            origin, packetBytes.receiverB20(), packetBytes.guid(), packetBytes.message(), bytes("")
        );
    }

    /// @dev Menyusun pesan compose OFT persis seperti yang dibuat `OFTCore._lzReceive`.
    function composeMessageOf(bytes calldata packetBytes)
        external
        pure
        returns (address from, bytes memory message)
    {
        bytes calldata oftMessage = packetBytes.message();
        from = packetBytes.receiverB20();
        message = OFTComposeMsgCodec.encode(
            packetBytes.nonce(),
            packetBytes.srcEid(),
            uint256(OFTMsgCodec.amountSD(oftMessage)) * 1e12,
            OFTMsgCodec.composeMsg(oftMessage)
        );
    }

    /// @dev Menjalankan `endpoint.lzCompose` dengan gas dan value dari opsi pesan (peran executor).
    function _compose(uint32 dstEid, Delivery memory d, address composer) internal returns (bool) {
        (, uint256 gas, uint256 value) = _parseExecutorLzComposeOption(d.options);
        return _composeWith(dstEid, d, composer, gas, value);
    }

    function _composeWith(
        uint32 dstEid,
        Delivery memory d,
        address composer,
        uint256 gas,
        uint256 value
    ) internal returns (bool) {
        (address from, bytes memory message) = this.composeMessageOf(d.packet);
        try EndpointV2(endpoints[dstEid]).lzCompose{value: value, gas: gas}(
            from, composer, d.guid, 0, message, bytes("")
        ) {
            return true;
        } catch {
            return false;
        }
    }

    // ───────────────────────────── Util ─────────────────────────────

    function _b32(address a) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(a)));
    }

    function _delegateOf(uint32 eid, address oapp) internal view returns (address) {
        return IDelegates(chains[eid].endpoint).delegates(oapp);
    }

    function _pair(uint32 eid, address token) internal view returns (MockV2Pair) {
        return MockV2Pair(chains[eid].factory.getPair(token, address(chains[eid].weth)));
    }

    function _sort(address[] memory list) internal pure {
        for (uint256 i = 1; i < list.length; i++) {
            address key = list[i];
            uint256 j = i;
            while (j > 0 && list[j - 1] > key) {
                list[j] = list[j - 1];
                j--;
            }
            list[j] = key;
        }
    }
}
