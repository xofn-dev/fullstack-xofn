// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    Origin
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {
    EndpointV2Mock as EndpointV2
} from "@layerzerolabs/test-devtools-evm-foundry/contracts/mocks/EndpointV2Mock.sol";
import {IOAppCore} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppCore.sol";
import {OAppReceiver} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppReceiver.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";

import {XofNTestBase} from "../helpers/XofNTestBase.sol";
import {XofNCurve} from "../../contracts/XofNCurve.sol";
import {XofNGraduator} from "../../contracts/XofNGraduator.sol";
import {XofNRemote} from "../../contracts/XofNRemote.sol";
import {XofNToken} from "../../contracts/XofNToken.sol";
import {ExpansionMsg} from "../../contracts/libraries/ExpansionMsg.sol";
import {TierLib} from "../../contracts/libraries/TierLib.sol";
import {MockLooseOFT} from "../mocks/MockLooseOFT.sol";
import {MockV2Pair} from "../mocks/MockUniswapV2.sol";

/// @dev PRD §9.2 tahap 2, composer `XofNRemote.lzCompose` (deployguide §7.5):
///      hanya dari endpoint, hanya token terdaftar, pool dibuat + diisi dalam satu panggilan,
///      front-run tidak berpengaruh, dan perilaku saat compose gagal + `retryCompose`.
contract ComposerTest is XofNTestBase {
    using OptionsBuilder for bytes;

    XofNToken internal token; // home
    XofNToken internal onBase; // token di chain ekspansi
    XofNRemote internal remote;
    uint256 internal perChain;

    function setUp() public override {
        super.setUp();
        remote = remotes[BASE];
        // Supaya panggilan atas nama endpoint (vm.prank) bisa membawa value.
        vm.deal(chains[BASE].endpoint, 10 ether);
    }

    /// @dev Menjalankan alur sampai token likuiditas dikreditkan ke Remote; compose belum jalan.
    function _untilLiquidityDelivered() private returns (Delivery memory liquidity) {
        (token,) = _launchAndGraduate(STANDARD, _eids(BASE));
        _expand(token);
        _mustDeliver(BASE, address(remote));
        _mustDeliver(HOME, address(graduator));
        onBase = _remoteToken(token, BASE);
        perChain = graduator.launchOf(address(token)).tokensPerChain;
        liquidity = _mustDeliver(BASE, address(onBase));
        assertEq(onBase.balanceOf(address(remote)), perChain, "tokens credited before compose");
    }

    /// @dev Sampai ack CONFIGURED tercatat tetapi likuiditas BELUM dikirim (escrow kosong).
    ///      Di jendela ini pemegang token sudah bisa memakai pathway home→ekspansi.
    function _untilConfiguredOnly() private {
        (token,) = _launchAndGraduate(STANDARD, _eids(BASE));
        (uint256 deployFees,) = graduator.quoteExpandAndLock(address(token));
        vm.prank(keeper);
        graduator.expandAndLock{value: deployFees}(address(token));
        _mustDeliver(BASE, address(remote));
        _mustDeliver(HOME, address(graduator));
        onBase = _remoteToken(token, BASE);
        perChain = graduator.launchOf(address(token)).tokensPerChain;
        assertEq(
            uint8(graduator.expansionOf(address(token), BASE).step),
            uint8(XofNGraduator.Step.Configured)
        );
    }

    function _sendLiquidityByRetry() private returns (Delivery memory liquidity) {
        vm.startPrank(bob);
        graduator.retryRemote{value: graduator.quoteRetry(address(token), BASE)}(
            address(token), BASE
        );
        vm.stopPrank();
        liquidity = _mustDeliver(BASE, address(onBase));
    }

    // ───────────────────────────── Siapa yang boleh memanggil ─────────────────────────────

    function test_lzComposeRejectsCallerOtherThanEndpoint() public {
        Delivery memory liquidity = _untilLiquidityDelivered();
        (address from, bytes memory message) = this.composeMessageOf(liquidity.packet);

        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(OAppReceiver.OnlyEndpoint.selector, attacker));
        remote.lzCompose{value: EXPANSION_PAIR_ETH}(from, liquidity.guid, message, attacker, "");

        // Graduator (peer) dan Safe (owner) pun tidak bisa memanggil langsung.
        vm.prank(safe);
        vm.expectRevert(abi.encodeWithSelector(OAppReceiver.OnlyEndpoint.selector, safe));
        remote.lzCompose(from, liquidity.guid, message, safe, "");

        assertEq(address(_pair(BASE, address(onBase))), address(0), "no pool");
    }

    /// @dev OFT pihak lain mengirim token ber-compose ke Remote. Endpoint memanggil `lzCompose`,
    ///      tetapi Remote menolak karena pengirimnya bukan XofNToken yang ia deploy.
    function test_composeFromUnregisteredTokenIsRejected() public {
        _untilLiquidityDelivered();

        vm.startPrank(attacker);
        MockLooseOFT looseHome = new MockLooseOFT(chains[HOME].endpoint, attacker);
        MockLooseOFT looseBase = new MockLooseOFT(chains[BASE].endpoint, attacker);
        looseHome.setPeer(BASE, _b32(address(looseBase)));
        looseBase.setPeer(HOME, _b32(address(looseHome)));
        vm.stopPrank();

        bytes memory options = OptionsBuilder.newOptions()
            .addExecutorLzReceiveOption(200_000, 0)
            .addExecutorLzComposeOption(0, 3_000_000, uint128(EXPANSION_PAIR_ETH));
        _bridge(
            address(looseHome),
            attacker,
            BASE,
            address(remote),
            1_000 ether,
            options,
            abi.encode(EXPANSION_PAIR_ETH)
        );
        Delivery memory d = _mustDeliver(BASE, address(looseBase));
        assertEq(looseBase.balanceOf(address(remote)), 1_000 ether);

        assertFalse(_compose(BASE, d, address(remote)), "compose must fail");
        (address from, bytes memory message) = this.composeMessageOf(d.packet);
        vm.prank(chains[BASE].endpoint);
        vm.expectRevert(
            abi.encodeWithSelector(XofNRemote.UnregisteredToken.selector, address(looseBase))
        );
        remote.lzCompose{value: EXPANSION_PAIR_ETH}(from, d.guid, message, address(0), "");

        assertEq(
            uint8(remote.deploymentOf(address(token)).state), uint8(XofNRemote.State.Configured)
        );
    }

    /// @dev Pemegang XofNToken mengirim token ber-compose ke Remote sebelum likuiditas resmi.
    ///      Tokennya terdaftar, tetapi pengirim compose bukan Graduator: ditolak.
    function test_composeFromRegisteredTokenButNotFromGraduatorIsRejected() public {
        (XofNToken t, XofNCurve curve) = _launch(STANDARD, _eids(BASE));
        _buy(curve, attacker, 0.5 ether);
        _reachThreshold(curve);
        vm.prank(keeper);
        graduator.graduate(address(t));
        token = t;
        (uint256 deployFees,) = graduator.quoteExpandAndLock(address(token));
        vm.prank(keeper);
        graduator.expandAndLock{value: deployFees}(address(token));
        _mustDeliver(BASE, address(remote));
        _mustDeliver(HOME, address(graduator));
        onBase = _remoteToken(token, BASE);
        perChain = graduator.launchOf(address(token)).tokensPerChain;

        bytes memory options = OptionsBuilder.newOptions()
            .addExecutorLzComposeOption(0, 3_000_000, uint128(EXPANSION_PAIR_ETH));
        // Rasio palsu: 1 token untuk seluruh ETH pasangan.
        _bridge(
            address(token),
            attacker,
            BASE,
            address(remote),
            1 ether,
            options,
            abi.encode(EXPANSION_PAIR_ETH)
        );
        Delivery memory forged = _mustDeliver(BASE, address(onBase));

        assertFalse(_compose(BASE, forged, address(remote)));
        (address from, bytes memory message) = this.composeMessageOf(forged.packet);
        vm.prank(chains[BASE].endpoint);
        vm.expectRevert(
            abi.encodeWithSelector(XofNRemote.UntrustedComposeSource.selector, HOME, _b32(attacker))
        );
        remote.lzCompose{value: EXPANSION_PAIR_ETH}(from, forged.guid, message, address(0), "");
        assertEq(address(_pair(BASE, address(onBase))), address(0));

        // Likuiditas resmi tetap masuk dengan rasio yang benar.
        Delivery memory liquidity = _sendLiquidityByRetry();
        assertTrue(_compose(BASE, liquidity, address(remote)));
        (uint256 reserveToken, uint256 reserveEth) = chains[BASE].router.reservesOf(address(onBase));
        assertEq(reserveToken, perChain);
        assertEq(reserveEth, EXPANSION_PAIR_ETH);
    }

    // ───────────────────────────── Satu panggilan ─────────────────────────────

    /// @dev Pool dibuat, diisi, dan token dikunci dalam SATU panggilan `lzCompose`.
    function test_poolIsCreatedAndFilledInOneCall() public {
        Delivery memory liquidity = _untilLiquidityDelivered();
        assertEq(address(_pair(BASE, address(onBase))), address(0), "no pool before compose");
        assertEq(onBase.owner(), address(remote));

        vm.recordLogs();
        assertTrue(_compose(BASE, liquidity, address(remote)));
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertTrue(_hasLog(logs, address(remote), XofNRemote.PoolSeeded.selector));
        assertTrue(_hasLog(logs, address(remote), XofNRemote.RemoteLocked.selector));

        MockV2Pair pair = _pair(BASE, address(onBase));
        (uint256 reserveToken, uint256 reserveEth) = chains[BASE].router.reservesOf(address(onBase));
        assertEq(reserveToken, perChain);
        assertEq(reserveEth, EXPANSION_PAIR_ETH);
        assertEq(pair.balanceOf(LP_RECIPIENT), pair.totalSupply() - pair.MINIMUM_LIQUIDITY());
        assertEq(pair.balanceOf(address(remote)), 0);
        assertEq(onBase.balanceOf(address(remote)), 0);

        XofNRemote.Deployment memory d = remote.deploymentOf(address(token));
        assertEq(uint8(d.state), uint8(XofNRemote.State.Locked));
        assertEq(d.pool, address(pair));
        assertEq(onBase.owner(), address(0));
        assertEq(_delegateOf(BASE, address(onBase)), address(0));
        (bool locked,,) = chains[BASE].registry.verify(address(onBase));
        assertTrue(locked);
        assertEq(_pending(HOME, address(graduator)), 1, "ack LOCKED sent");
    }

    /// @dev Composer tidak bergantung pada pemanggil `endpoint.lzCompose` atau `extraData`.
    function test_composeDoesNotDependOnCallerOrExtraData() public {
        Delivery memory liquidity = _untilLiquidityDelivered();
        (address from, bytes memory message) = this.composeMessageOf(liquidity.packet);

        vm.prank(attacker);
        EndpointV2(chains[BASE].endpoint).lzCompose{value: EXPANSION_PAIR_ETH}(
            from, address(remote), liquidity.guid, 0, message, hex"deadbeef"
        );
        (uint256 reserveToken, uint256 reserveEth) = chains[BASE].router.reservesOf(address(onBase));
        assertEq(reserveToken, perChain);
        assertEq(reserveEth, EXPANSION_PAIR_ETH, "ratio comes from composeMsg only");
    }

    /// @dev Value lebih besar dari yang diminta `composeMsg` tidak mengubah rasio pool.
    function test_extraValueDoesNotChangePoolRatio() public {
        Delivery memory liquidity = _untilLiquidityDelivered();
        assertTrue(_composeWith(BASE, liquidity, address(remote), SEED_GAS, 1 ether));
        (uint256 reserveToken, uint256 reserveEth) = chains[BASE].router.reservesOf(address(onBase));
        assertEq(reserveToken, perChain);
        assertEq(reserveEth, EXPANSION_PAIR_ETH);
    }

    // ───────────────────────────── Front-run pool di chain ekspansi ─────────────────────────────

    function test_frontRun_emptyPairCreatedFirst() public {
        Delivery memory liquidity = _untilLiquidityDelivered();
        vm.prank(attacker);
        chains[BASE].factory.createPair(address(onBase), address(chains[BASE].weth));

        assertTrue(_compose(BASE, liquidity, address(remote)));
        (uint256 reserveToken, uint256 reserveEth) = chains[BASE].router.reservesOf(address(onBase));
        assertEq(reserveToken, perChain);
        assertEq(reserveEth, EXPANSION_PAIR_ETH);
    }

    /// @dev Donasi WETH + `sync` sebelum compose: pool tetap terisi, pendonor tidak dapat LP.
    function test_frontRun_donationAndSyncCannotBlockCompose() public {
        Delivery memory liquidity = _untilLiquidityDelivered();
        vm.startPrank(attacker);
        address pair = chains[BASE].factory.createPair(address(onBase), address(chains[BASE].weth));
        chains[BASE].weth.deposit{value: 0.01 ether}();
        chains[BASE].weth.transfer(pair, 0.01 ether);
        MockV2Pair(pair).sync();
        vm.stopPrank();

        assertTrue(_compose(BASE, liquidity, address(remote)));
        assertEq(MockV2Pair(pair).balanceOf(attacker), 0);
        (uint256 reserveToken, uint256 reserveEth) = chains[BASE].router.reservesOf(address(onBase));
        assertEq(reserveToken, perChain);
        assertEq(reserveEth, EXPANSION_PAIR_ETH + 0.01 ether);
        assertEq(uint8(remote.deploymentOf(address(token)).state), uint8(XofNRemote.State.Locked));
    }

    /// @dev Kasus terberat: penyerang sudah memegang token di chain ekspansi (dibridge di jendela
    ///      sebelum likuiditas resmi) dan membuka pool dengan harga palsu. Compose tetap berhasil
    ///      dan penyerang tidak untung.
    function test_frontRun_skewedPoolWithBridgedTokensDoesNotProfit() public {
        _assertRemoteSkewedPoolDoesNotProfit(10_000 ether, 0.01 ether);
    }

    /// @dev Pool tandingan 4x lebih besar dari likuiditas resmi (temuan review 17 Nov 2026).
    function test_frontRun_largeSkewedPoolWithBridgedTokensDoesNotProfit() public {
        _assertRemoteSkewedPoolDoesNotProfit(8_000_000 ether, 0.2 ether);
    }

    function testFuzz_frontRun_anyRemotePoolDoesNotProfit(uint256 attackTokens, uint256 attackEth)
        public
    {
        attackTokens = bound(attackTokens, 1e15, 50_000_000 ether);
        attackEth = bound(attackEth, 1e12, 2 ether);
        _assertRemoteSkewedPoolDoesNotProfit(attackTokens, attackEth);
    }

    function _assertRemoteSkewedPoolDoesNotProfit(uint256 attackTokens, uint256 attackEth) private {
        (XofNToken t, XofNCurve curve) = _launch(STANDARD, _eids(BASE));
        _buy(curve, attacker, 0.5 ether);
        _reachThreshold(curve);
        vm.prank(keeper);
        graduator.graduate(address(t));
        token = t;
        (uint256 deployFees,) = graduator.quoteExpandAndLock(address(token));
        vm.prank(keeper);
        graduator.expandAndLock{value: deployFees}(address(token));
        _mustDeliver(BASE, address(remote));
        _mustDeliver(HOME, address(graduator));
        onBase = _remoteToken(token, BASE);
        perChain = graduator.launchOf(address(token)).tokensPerChain;

        // Penyerang membridge token ke dirinya sendiri di Base, lalu membuat pool tandingan.
        attackTokens = (attackTokens / 1e12) * 1e12; // tanpa dust, supaya jumlah yang tiba pasti
        vm.deal(attacker, attackEth + 10 ether);
        _bridge(address(token), attacker, BASE, attacker, attackTokens, "", "");
        _mustDeliver(BASE, address(onBase));
        vm.startPrank(attacker);
        onBase.approve(address(chains[BASE].router), attackTokens);
        chains[BASE].router.addLiquidityETHRaw{value: attackEth}(
            address(onBase), attackTokens, attacker
        );
        vm.stopPrank();

        Delivery memory liquidity = _sendLiquidityByRetry();
        assertTrue(_compose(BASE, liquidity, address(remote)), "compose must not be blockable");
        assertEq(uint8(remote.deploymentOf(address(token)).state), uint8(XofNRemote.State.Locked));
        assertEq(onBase.balanceOf(address(remote)), 0);
        assertEq(chains[BASE].weth.balanceOf(address(remote)), 0);

        // Likuiditas protokol, dinilai pada harga target (pairEth / perChain), tidak berkurang.
        MockV2Pair pair = _pair(BASE, address(onBase));
        {
            (uint256 reserveToken, uint256 reserveEth) =
                chains[BASE].router.reservesOf(address(onBase));
            uint256 poolValue = reserveEth + (reserveToken * EXPANSION_PAIR_ETH) / perChain;
            uint256 protocolValue = (pair.balanceOf(LP_RECIPIENT) * poolValue) / pair.totalSupply();
            assertGe(
                protocolValue,
                (2 * EXPANSION_PAIR_ETH * 997) / 1000,
                "protocol liquidity was diluted"
            );
        }

        uint256 valueOut = _attackerExit(pair);
        uint256 valueIn = attackEth + (attackTokens * EXPANSION_PAIR_ETH) / perChain;
        assertLe(
            valueOut, valueIn + (2 * EXPANSION_PAIR_ETH) / 100_000, "front-runner must not profit"
        );
    }

    function _attackerExit(MockV2Pair pair) private returns (uint256) {
        uint256 lp = pair.balanceOf(attacker);
        vm.startPrank(attacker);
        pair.transfer(address(pair), lp);
        (uint256 amount0, uint256 amount1) = pair.burn(attacker);
        vm.stopPrank();
        (uint256 tokensBack, uint256 ethBack) =
            pair.token0() == address(onBase) ? (amount0, amount1) : (amount1, amount0);
        return ethBack + (tokensBack * EXPANSION_PAIR_ETH) / perChain;
    }

    // ───────────────────────────── Compose gagal + retryCompose ─────────────────────────────

    /// @dev `lzCompose` kehabisan gas. Yang terjadi pada token: tetap di Remote, tidak hilang dan
    ///      tidak berpindah. Pesan compose tetap tersimpan di endpoint; siapa pun bisa
    ///      menjalankannya ulang, dan setelah berhasil tidak bisa dijalankan lagi.
    function test_composeOutOfGas_tokensStayAtRemote_thenRetryComposeSucceeds() public {
        Delivery memory liquidity = _untilLiquidityDelivered();
        (address from, bytes memory message) = this.composeMessageOf(liquidity.packet);
        EndpointV2 ep = EndpointV2(chains[BASE].endpoint);

        assertFalse(
            _composeWith(
                BASE, liquidity, address(remote), 200_000, EXPANSION_PAIR_ETH + SEED_ACK_VALUE
            ),
            "compose must run out of gas"
        );

        // Keadaan setelah gagal.
        assertEq(onBase.balanceOf(address(remote)), perChain, "tokens stay at the composer");
        assertEq(onBase.totalSupply(), perChain);
        assertEq(address(_pair(BASE, address(onBase))), address(0), "no pool");
        assertEq(
            uint8(remote.deploymentOf(address(token)).state), uint8(XofNRemote.State.Configured)
        );
        assertEq(onBase.owner(), address(remote), "not locked");
        assertEq(
            ep.composeQueue(from, address(remote), liquidity.guid, 0),
            keccak256(message),
            "compose stays queued at the endpoint"
        );
        (bool homeLocked,,) = chains[HOME].registry.verify(address(token));
        assertFalse(homeLocked);

        // retryCompose: pihak mana pun, dengan gas cukup dan value pasangan.
        vm.prank(bob);
        ep.lzCompose{value: EXPANSION_PAIR_ETH + SEED_ACK_VALUE, gas: SEED_GAS}(
            from, address(remote), liquidity.guid, 0, message, ""
        );
        (uint256 reserveToken, uint256 reserveEth) = chains[BASE].router.reservesOf(address(onBase));
        assertEq(reserveToken, perChain);
        assertEq(reserveEth, EXPANSION_PAIR_ETH);
        assertEq(onBase.balanceOf(address(remote)), 0);

        // Tidak bisa dijalankan dua kali.
        assertFalse(_compose(BASE, liquidity, address(remote)), "replay must fail");

        _mustDeliver(HOME, address(graduator));
        (homeLocked,,) = chains[HOME].registry.verify(address(token));
        assertTrue(homeLocked);
    }

    /// @dev Executor tidak membawa ETH pasangan (mis. batas native 0). Compose revert dan tetap
    ///      antre; siapa pun bisa menjalankannya ulang dengan menyetor ETH pasangan itu.
    function test_composeWithoutPairValueReverts_thenRetryWithValueSucceeds() public {
        Delivery memory liquidity = _untilLiquidityDelivered();
        (address from, bytes memory message) = this.composeMessageOf(liquidity.packet);

        assertFalse(_composeWith(BASE, liquidity, address(remote), SEED_GAS, 0));
        vm.prank(chains[BASE].endpoint);
        vm.expectRevert(
            abi.encodeWithSelector(
                XofNRemote.InsufficientPairAsset.selector,
                EXPANSION_PAIR_ETH,
                EXPANSION_PAIR_ETH - 1
            )
        );
        remote.lzCompose{value: EXPANSION_PAIR_ETH - 1}(
            from, liquidity.guid, message, address(0), ""
        );
        assertEq(onBase.balanceOf(address(remote)), perChain);

        assertTrue(_composeWith(BASE, liquidity, address(remote), SEED_GAS, EXPANSION_PAIR_ETH));
        (uint256 reserveToken, uint256 reserveEth) = chains[BASE].router.reservesOf(address(onBase));
        assertEq(reserveToken, perChain);
        assertEq(reserveEth, EXPANSION_PAIR_ETH);

        // Ack bisa saja tidak terbayar; `reAck` menutupnya.
        if (_pending(HOME, address(graduator)) == 0) {
            vm.startPrank(bob);
            remote.reAck{value: remote.quoteAck(address(token))}(address(token));
            vm.stopPrank();
        }
        _mustDeliver(HOME, address(graduator));
        (bool locked,,) = chains[HOME].registry.verify(address(token));
        assertTrue(locked);
    }

    /// @dev Setelah pool dibuat, pesan compose kedua untuk token yang sama ditolak.
    function test_poolCanOnlyBeSeededOnce() public {
        Delivery memory liquidity = _untilLiquidityDelivered();
        assertTrue(_compose(BASE, liquidity, address(remote)));
        (address from, bytes memory message) = this.composeMessageOf(liquidity.packet);

        vm.prank(chains[BASE].endpoint);
        vm.expectRevert(abi.encodeWithSelector(XofNRemote.AlreadySeeded.selector, address(token)));
        remote.lzCompose{value: EXPANSION_PAIR_ETH}(from, liquidity.guid, message, address(0), "");
    }

    // ───────────────────────────── Pesan DEPLOY ─────────────────────────────

    function test_remoteLzReceiveRejectsNonEndpointAndNonPeer() public {
        bytes memory deploy =
            ExpansionMsg.encodeDeploy(attacker, bytes32(uint256(1)), STANDARD, "Fake", "FAKE");

        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(OAppReceiver.OnlyEndpoint.selector, attacker));
        remote.lzReceive(
            Origin(HOME, _b32(address(graduator)), 1), bytes32(0), deploy, address(0), ""
        );

        vm.prank(chains[BASE].endpoint);
        vm.expectRevert(abi.encodeWithSelector(IOAppCore.OnlyPeer.selector, HOME, _b32(attacker)));
        remote.lzReceive(Origin(HOME, _b32(attacker), 1), bytes32(0), deploy, address(0), "");

        // Pesan dari Remote lain (Arbitrum) juga bukan peer.
        vm.prank(chains[BASE].endpoint);
        vm.expectRevert(abi.encodeWithSelector(IOAppCore.NoPeer.selector, ARB));
        remote.lzReceive(
            Origin(ARB, _b32(address(remotes[ARB])), 1), bytes32(0), deploy, address(0), ""
        );
    }

    function test_remoteRejectsUnknownMessageKind() public {
        bytes memory unknown = abi.encode(uint8(9), attacker, bytes32(0), STANDARD, "Fake", "FAKE");
        vm.prank(chains[BASE].endpoint);
        vm.expectRevert(abi.encodeWithSelector(XofNRemote.UnknownMessage.selector, uint8(9)));
        remote.lzReceive(
            Origin(HOME, _b32(address(graduator)), 1), bytes32(0), unknown, address(0), ""
        );
    }

    /// @dev Remote yang pathway-nya tidak mendukung Fortress menolak pesan DEPLOY Fortress;
    ///      tier tidak diturunkan.
    function test_remoteNeverDowngradesTier() public {
        TierLib.Pathway memory p = _pathway(BASE, HOME);
        p.fortressRequired = new address[](0);
        XofNRemote limited = new XofNRemote(chains[BASE].endpoint, safe, _remoteInfra(BASE), p);
        vm.prank(safe);
        limited.setPeer(HOME, _b32(address(graduator)));

        bytes memory deploy =
            ExpansionMsg.encodeDeploy(attacker, bytes32(uint256(1)), FORTRESS, "Coin", "COIN");
        vm.prank(chains[BASE].endpoint);
        vm.expectRevert(abi.encodeWithSelector(TierLib.TierUnavailable.selector, FORTRESS, HOME));
        limited.lzReceive(
            Origin(HOME, _b32(address(graduator)), 1), bytes32(0), deploy, address(0), ""
        );
    }

    // ───────────────────────────── Permukaan Remote ─────────────────────────────

    function test_remoteMutableSurfaceIsExactlyTheAllowlist() public view {
        string[8] memory allowed = [
            "lzReceive", // pesan DEPLOY, hanya dari endpoint + peer
            "lzCompose", // composer, hanya dari endpoint
            "reAck", // kirim ulang ack; tidak mengubah state token
            "sendAckFromSelf", // internal: hanya bisa dipanggil kontrak itu sendiri
            "setPeer", // OApp: sekali pasang, hanya home EID
            "setDelegate",
            "transferOwnership",
            "renounceOwnership"
        ];
        string memory json = vm.readFile("out/XofNRemote.sol/XofNRemote.json");
        uint256 mutableCount;
        for (uint256 i = 0;; i++) {
            string memory base = string.concat(".abi[", vm.toString(i), "]");
            if (!vm.keyExistsJson(json, base)) break;
            if (
                keccak256(bytes(vm.parseJsonString(json, string.concat(base, ".type"))))
                    != keccak256("function")
            ) {
                continue;
            }
            bytes32 mutability =
                keccak256(bytes(vm.parseJsonString(json, string.concat(base, ".stateMutability"))));
            if (mutability == keccak256("view") || mutability == keccak256("pure")) continue;
            string memory name = vm.parseJsonString(json, string.concat(base, ".name"));
            bool found;
            for (uint256 j = 0; j < allowed.length; j++) {
                if (keccak256(bytes(name)) == keccak256(bytes(allowed[j]))) found = true;
            }
            assertTrue(found, string.concat("unexpected state-changing function: ", name));
            mutableCount++;
        }
        assertEq(mutableCount, allowed.length, "allowlist drifted");
    }

    function test_remoteSelfCallAndPeerGuards() public {
        vm.prank(attacker);
        vm.expectRevert(XofNRemote.OnlySelf.selector);
        remote.sendAckFromSelf(address(1));

        vm.startPrank(safe);
        vm.expectRevert(abi.encodeWithSelector(XofNRemote.PeerAlreadySet.selector, HOME));
        remote.setPeer(HOME, _b32(attacker));
        vm.expectRevert(abi.encodeWithSelector(XofNRemote.UnsupportedEid.selector, ARB));
        remote.setPeer(ARB, _b32(attacker));
        vm.stopPrank();

        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker)
        );
        remote.setPeer(HOME, _b32(attacker));
    }

    function _hasLog(Vm.Log[] memory logs, address emitter, bytes32 topic0)
        private
        pure
        returns (bool)
    {
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == emitter && logs[i].topics[0] == topic0) return true;
        }
        return false;
    }
}
