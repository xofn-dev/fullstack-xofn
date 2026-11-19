// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IOAppCore} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppCore.sol";
import {
    EndpointV2Mock as EndpointV2
} from "@layerzerolabs/test-devtools-evm-foundry/contracts/mocks/EndpointV2Mock.sol";
import {UlnConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import {ExecutorConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol";

import {XofNTestBase} from "../helpers/XofNTestBase.sol";
import {XofNCurve} from "../../contracts/XofNCurve.sol";
import {XofNGraduator} from "../../contracts/XofNGraduator.sol";
import {XofNRegistry} from "../../contracts/XofNRegistry.sol";
import {XofNRemote} from "../../contracts/XofNRemote.sol";
import {XofNToken} from "../../contracts/XofNToken.sol";
import {TierLib} from "../../contracts/libraries/TierLib.sol";
import {MockDVN} from "../mocks/MockDVN.sol";

/// @dev PRD §9.2 tahap 2 (multi-endpoint): keadaan setelah ekspansi, kegagalan satu chain +
///      `retryRemote`, dan larangan tampil Locked sebelum semua chain selesai.
contract ExpansionTest is XofNTestBase {
    // ───────────────────────────── Keadaan akhir (deployguide §7.4) ─────────────────────────────

    function test_postExpansionState_standard() public {
        (XofNToken token,) = _launchGraduateExpand(STANDARD, _eids(BASE, ARB));
        _assertFullyLocked(token, STANDARD, 2);
    }

    function test_postExpansionState_fortress() public {
        (XofNToken token,) = _launchGraduateExpand(FORTRESS, _eids(BASE, ARB));
        _assertFullyLocked(token, FORTRESS, 3);
    }

    function test_singleChainExpansion() public {
        (XofNToken token,) = _launchGraduateExpand(STANDARD, _eids(ARB));

        (bool locked, uint8 tier, uint32[] memory eids) =
            chains[HOME].registry.verify(address(token));
        assertTrue(locked);
        assertEq(tier, STANDARD);
        assertEq(eids.length, 1);
        assertEq(eids[0], ARB);
        _assertPathwayLocked(HOME, address(token), ARB, STANDARD, 2);

        // Chain yang tidak dipilih creator tidak tersentuh.
        assertEq(remotes[BASE].deploymentOf(address(token)).remoteToken, address(0));
        assertEq(token.peers(BASE), bytes32(0));
        assertEq(token.totalSupply() + _remoteToken(token, ARB).totalSupply(), TOTAL_SUPPLY);
    }

    function _assertFullyLocked(XofNToken token, uint8 tier, uint8 requiredCount) private view {
        XofNToken onBase = _remoteToken(token, BASE);
        XofNToken onArb = _remoteToken(token, ARB);

        assertEq(
            uint8(graduator.launchOf(address(token)).status), uint8(XofNGraduator.Status.Locked)
        );

        // Setiap chain, setiap pathway.
        _assertPathwayLocked(HOME, address(token), BASE, tier, requiredCount);
        _assertPathwayLocked(HOME, address(token), ARB, tier, requiredCount);
        _assertPathwayLocked(BASE, address(onBase), HOME, tier, requiredCount);
        _assertPathwayLocked(ARB, address(onArb), HOME, tier, requiredCount);

        // Peer saling menunjuk; Base↔Arbitrum tidak di-wire (topologi hub, PRD P29).
        assertEq(token.peers(BASE), _b32(address(onBase)));
        assertEq(token.peers(ARB), _b32(address(onArb)));
        assertEq(onBase.peers(HOME), _b32(address(token)));
        assertEq(onArb.peers(HOME), _b32(address(token)));
        assertEq(onBase.peers(ARB), bytes32(0));
        assertEq(onArb.peers(BASE), bytes32(0));

        // Hasil yang dibaca publik: verify di Registry SETIAP chain.
        (bool locked, uint8 registeredTier, uint32[] memory eids) =
            chains[HOME].registry.verify(address(token));
        assertTrue(locked, "home verify");
        assertEq(registeredTier, tier);
        assertEq(eids.length, 2);
        assertEq(eids[0], BASE);
        assertEq(eids[1], ARB);

        (locked, registeredTier, eids) = chains[BASE].registry.verify(address(onBase));
        assertTrue(locked, "base verify");
        assertEq(registeredTier, tier);
        assertEq(eids.length, 1);
        assertEq(eids[0], HOME);

        (locked, registeredTier, eids) = chains[ARB].registry.verify(address(onArb));
        assertTrue(locked, "arbitrum verify");
        assertEq(registeredTier, tier);
        assertEq(eids[0], HOME);

        // Supply total tetap 999M; pool ada di ketiga chain.
        assertEq(token.totalSupply() + onBase.totalSupply() + onArb.totalSupply(), TOTAL_SUPPLY);
        uint256 perChain = graduator.launchOf(address(token)).tokensPerChain;
        assertEq(onBase.totalSupply(), perChain);
        assertEq(onArb.totalSupply(), perChain);
        assertEq(onBase.balanceOf(address(chains[BASE].poolManager)), perChain);
        assertEq(onArb.balanceOf(address(chains[ARB].poolManager)), perChain);
        assertTrue(_poolExists(HOME, address(token)), "home pool");
        assertTrue(_poolExists(BASE, address(onBase)), "base pool");
        assertTrue(_poolExists(ARB, address(onArb)), "arbitrum pool");

        // Graduator dan Remote tidak menyimpan sisa token; Graduator tidak menyimpan ETH.
        assertEq(token.balanceOf(address(graduator)), 0);
        assertEq(onBase.balanceOf(address(remotes[BASE])), 0);
        assertEq(address(graduator).balance, 0);
    }

    /// @dev Padanan perintah `cast call` di deployguide §7.4 untuk satu pathway.
    function _assertPathwayLocked(
        uint32 localEid,
        address token,
        uint32 remoteEid,
        uint8 tier,
        uint8 requiredCount
    ) private view {
        EndpointV2 ep = EndpointV2(chains[localEid].endpoint);
        TierLib.Pathway memory p = _pathway(localEid, remoteEid);

        assertEq(XofNToken(token).owner(), address(0), "owner");
        assertEq(_delegateOf(localEid, token), address(0), "delegate");

        assertFalse(ep.isDefaultSendLibrary(token, remoteEid), "send library is default");
        assertEq(ep.getSendLibrary(token, remoteEid), p.sendLib);
        (address receiveLib, bool isDefault) = ep.getReceiveLibrary(token, remoteEid);
        assertFalse(isDefault, "receive library is default");
        assertEq(receiveLib, p.receiveLib);

        address[] memory required = TierLib.requiredDvns(p, tier);
        for (uint256 side = 0; side < 2; side++) {
            UlnConfig memory uln = abi.decode(
                ep.getConfig(token, side == 0 ? p.sendLib : p.receiveLib, remoteEid, 2), (UlnConfig)
            );
            assertEq(uln.confirmations, CONFIRMATIONS);
            assertEq(uln.requiredDVNCount, requiredCount, "requiredDVNCount");
            assertEq(uln.optionalDVNCount, 2, "optionalDVNCount");
            assertEq(uln.optionalDVNThreshold, 1, "optionalDVNThreshold");
            assertEq(uln.requiredDVNs.length, requiredCount);
            for (uint256 i = 0; i < requiredCount; i++) {
                assertEq(uln.requiredDVNs[i], required[i]);
                // Operator wajib berbeda dan bukan salah satu opsional.
                if (i > 0) assertTrue(uln.requiredDVNs[i] > uln.requiredDVNs[i - 1]);
                assertTrue(uln.requiredDVNs[i] != p.optionalDvns[0]);
                assertTrue(uln.requiredDVNs[i] != p.optionalDvns[1]);
            }
            assertEq(uln.optionalDVNs[0], p.optionalDvns[0]);
            assertEq(uln.optionalDVNs[1], p.optionalDvns[1]);
        }

        ExecutorConfig memory executor =
            abi.decode(ep.getConfig(token, p.sendLib, remoteEid, 1), (ExecutorConfig));
        assertEq(executor.maxMessageSize, MAX_MESSAGE_SIZE);
        assertEq(executor.executor, p.executor);

        // Enforced options: gas lzReceive DAN lzCompose.
        assertEq(XofNToken(token).enforcedOptions(remoteEid, 1), TierLib.sendOptions(p));
        assertEq(XofNToken(token).enforcedOptions(remoteEid, 2), TierLib.sendAndCallOptions(p));

        assertTrue(XofNToken(token).peers(remoteEid) != bytes32(0), "peer");
        assertTrue(chains[localEid].registry.verifyEid(token, remoteEid), "verifyEid");
    }

    // ───────────────────────────── Urutan langkah (P28) ─────────────────────────────

    /// @dev Resep sisi home terpasang sebelum pesan DEPLOY berangkat; peer baru terpasang setelah
    ///      ack CONFIGURED; likuiditas baru dikirim setelah kedua sisi terkonfigurasi.
    function test_recipeIsInstalledBeforeLiquidityIsSent() public {
        (XofNToken token,) = _launchAndGraduate(STANDARD, _eids(BASE));
        EndpointV2 ep = EndpointV2(chains[HOME].endpoint);

        // Graduated: belum ada konfigurasi tier (dipasang saat ekspansi).
        assertTrue(ep.isDefaultSendLibrary(address(token), BASE));

        _expand(token);
        assertEq(
            uint8(graduator.launchOf(address(token)).status), uint8(XofNGraduator.Status.Expanding)
        );
        assertEq(uint8(_step(token, BASE)), uint8(XofNGraduator.Step.DeploySent));
        assertFalse(ep.isDefaultSendLibrary(address(token), BASE), "home recipe installed");
        assertEq(token.peers(BASE), bytes32(0), "peer not yet known");
        assertEq(
            token.balanceOf(address(graduator)), graduator.launchOf(address(token)).tokensPerChain
        );

        _mustDeliver(BASE, address(remotes[BASE]));
        XofNToken onBase = _remoteToken(token, BASE);
        assertEq(onBase.owner(), address(remotes[BASE]));
        assertEq(_delegateOf(BASE, address(onBase)), address(remotes[BASE]));
        assertEq(onBase.peers(HOME), _b32(address(token)));
        assertTrue(chains[BASE].registry.checkConfig(address(onBase)), "remote recipe installed");
        assertEq(onBase.totalSupply(), 0, "no liquidity before both sides are configured");

        _mustDeliver(HOME, address(graduator));
        assertEq(uint8(_step(token, BASE)), uint8(XofNGraduator.Step.LiquiditySent));
        assertEq(token.peers(BASE), _b32(address(onBase)));
        assertEq(graduator.expansionOf(address(token), BASE).remoteToken, address(onBase));
        assertEq(token.balanceOf(address(graduator)), 0);
    }

    // ───────────────────────────── Kegagalan satu chain + retry ─────────────────────────────

    /// @dev DVN wajib di Arbitrum tidak memverifikasi pesan DEPLOY. Base selesai, token TIDAK
    ///      terkunci. `retryRemote` mengirim ulang pesan yang sama persis; setelah DVN pulih,
    ///      pesan ulang itulah yang menyelesaikan langkahnya.
    ///
    ///      Catatan protokol: endpoint hanya mau menjalankan sebuah pesan bila semua nonce
    ///      sebelumnya sudah TERVERIFIKASI. Jadi pesan ulang tidak bisa mendahului pesan asli yang
    ///      belum terverifikasi; ia baru jalan setelah DVN memverifikasi keduanya.
    function test_dvnFailureOnOneChain_thenRetryRemoteSucceeds() public {
        (XofNToken token,) = _launchAndGraduate(STANDARD, _eids(BASE, ARB));
        _expand(token);
        XofNRemote remote = remotes[ARB];

        address failingDvn = chains[ARB].dvns[2]; // DVN wajib pathway infrastruktur di Arbitrum
        dvnDown[failingDvn] = true;
        Delivery memory stuck = _deliver(ARB, address(remote));
        assertFalse(stuck.verified, "must not verify without a required DVN");
        assertFalse(stuck.executed);
        assertEq(remote.deploymentOf(address(token)).remoteToken, address(0));
        bytes memory originalMessage = this.messageOf(stuck.packet);

        // Base berjalan sampai selesai dan terkunci di chain-nya sendiri...
        _runChain(token, BASE);
        (bool baseLocked,,) = chains[BASE].registry.verify(address(_remoteToken(token, BASE)));
        assertTrue(baseLocked);

        // ...tetapi token belum Locked: home belum dilepas, verify home false.
        _assertNotLocked(token);
        assertEq(uint8(_step(token, BASE)), uint8(XofNGraduator.Step.RemoteLocked));
        assertEq(uint8(_step(token, ARB)), uint8(XofNGraduator.Step.DeploySent));

        // Siapa pun mengulang langkah yang sama dan membayar fee-nya.
        uint256 fee = graduator.quoteRetry(address(token), ARB);
        assertGt(fee, 0);
        vm.prank(bob);
        graduator.retryRemote{value: fee}(address(token), ARB);
        assertEq(_pending(ARB, address(remote)), 2);
        assertFalse(_deliver(ARB, address(remote)).verified, "DVN still down");
        _assertNotLocked(token);

        // DVN pulih dan memverifikasi keduanya. Pesan ulang dijalankan lebih dulu.
        dvnDown[failingDvn] = false;
        Delivery memory original = _take(ARB, address(remote));
        Delivery memory resent = _take(ARB, address(remote));
        assertTrue(original.verified && resent.verified);
        assertEq(
            keccak256(this.messageOf(resent.packet)), keccak256(originalMessage), "same parameters"
        );
        assertTrue(_execute(resent, 0), "retried message completes the step");

        // Sisa alur Arbitrum.
        _mustDeliver(HOME, address(graduator));
        Delivery memory liquidity = _mustDeliver(ARB, address(_remoteToken(token, ARB)));
        assertTrue(_compose(ARB, liquidity, address(remote)));
        _assertNotLocked(token); // ack terakhir belum tiba
        _mustDeliver(HOME, address(graduator));

        (bool locked,,) = chains[HOME].registry.verify(address(token));
        assertTrue(locked);
        assertEq(
            uint8(graduator.launchOf(address(token)).status), uint8(XofNGraduator.Status.Locked)
        );

        // Pesan asli yang terlambat dijalankan tidak mengubah apa pun, tidak mengirim ack, dan
        // tidak memakai saldo Remote (PRD P51).
        address remoteToken = remote.deploymentOf(address(token)).remoteToken;
        uint256 remoteBalance = address(remote).balance;
        assertTrue(_execute(original, 0));
        assertEq(remote.deploymentOf(address(token)).remoteToken, remoteToken);
        assertEq(_pending(HOME, address(graduator)), 0, "no ack for a stale DEPLOY");
        assertEq(address(remote).balance, remoteBalance, "remote balance untouched");
        (locked,,) = chains[HOME].registry.verify(address(token));
        assertTrue(locked);
    }

    /// @dev `lzReceive` di Remote kehabisan gas. Pesan tetap terverifikasi di endpoint dan bisa
    ///      dijalankan ulang oleh siapa pun dengan gas cukup.
    function test_gasFailureOnOneChain_thenEndpointRetrySucceeds() public {
        (XofNToken token,) = _launchAndGraduate(STANDARD, _eids(BASE, ARB));
        _expand(token);

        Delivery memory d = _deliverWithGas(ARB, address(remotes[ARB]), 300_000);
        assertTrue(d.verified);
        assertFalse(d.executed, "deploy must fail with too little gas");
        assertEq(remotes[ARB].deploymentOf(address(token)).remoteToken, address(0));

        _runChain(token, BASE);
        _assertNotLocked(token);

        assertTrue(_execute(d, 0), "retry with the gas from the message options");
        _mustDeliver(HOME, address(graduator));
        Delivery memory liquidity = _mustDeliver(ARB, address(_remoteToken(token, ARB)));
        assertTrue(_compose(ARB, liquidity, address(remotes[ARB])));
        _mustDeliver(HOME, address(graduator));

        (bool locked,,) = chains[HOME].registry.verify(address(token));
        assertTrue(locked);
    }

    /// @dev Jalur lain untuk kegagalan gas: `retryRemote` mengirim ulang. Pesan lama yang
    ///      kemudian dijalankan juga tidak merusak apa pun: Remote idempoten dan tidak mengirim
    ///      ack kedua dari saldonya (PRD P51).
    function test_gasFailure_thenRetryRemote_andStaleMessageIsHarmless() public {
        (XofNToken token,) = _launchAndGraduate(STANDARD, _eids(ARB));
        _expand(token);

        Delivery memory failed = _deliverWithGas(ARB, address(remotes[ARB]), 300_000);
        assertFalse(failed.executed);

        vm.startPrank(bob);
        graduator.retryRemote{value: graduator.quoteRetry(address(token), ARB)}(address(token), ARB);
        vm.stopPrank();
        _mustDeliver(ARB, address(remotes[ARB]));
        address remoteToken = remotes[ARB].deploymentOf(address(token)).remoteToken;

        // Pesan lama akhirnya dijalankan: token tidak di-deploy dua kali, tidak ada ack kedua,
        // dan saldo Remote tidak terpakai.
        uint256 remoteBalance = address(remotes[ARB]).balance;
        assertTrue(_execute(failed, 0));
        assertEq(remotes[ARB].deploymentOf(address(token)).remoteToken, remoteToken);
        assertEq(_pending(HOME, address(graduator)), 1);
        assertEq(address(remotes[ARB]).balance, remoteBalance, "stale DEPLOY spends nothing");

        _mustDeliver(HOME, address(graduator)); // ack → likuiditas
        assertEq(uint8(_step(token, ARB)), uint8(XofNGraduator.Step.LiquiditySent));
        assertEq(_pending(ARB, remoteToken), 1, "liquidity sent exactly once");

        Delivery memory liquidity = _mustDeliver(ARB, remoteToken);
        assertTrue(_compose(ARB, liquidity, address(remotes[ARB])));
        _mustDeliver(HOME, address(graduator));
        (bool locked,,) = chains[HOME].registry.verify(address(token));
        assertTrue(locked);
        assertEq(token.totalSupply() + XofNToken(remoteToken).totalSupply(), TOTAL_SUPPLY);
    }

    /// @dev DVN mati di sisi kirim: `expandAndLock` revert seluruhnya, tidak ada state setengah.
    function test_sourceDvnDown_expandRevertsAtomically() public {
        (XofNToken token,) = _launchAndGraduate(STANDARD, _eids(BASE, ARB));
        MockDVN(chains[HOME].dvns[0]).setRejectJobs(true);

        vm.deal(keeper, 10 ether);
        vm.prank(keeper);
        vm.expectRevert();
        graduator.expandAndLock{value: 1 ether}(address(token));

        assertEq(
            uint8(graduator.launchOf(address(token)).status), uint8(XofNGraduator.Status.Graduated)
        );
        assertTrue(EndpointV2(chains[HOME].endpoint).isDefaultSendLibrary(address(token), BASE));

        MockDVN(chains[HOME].dvns[0]).setRejectJobs(false);
        _expand(token);
        _runChain(token, BASE);
        _runChain(token, ARB);
        (bool locked,,) = chains[HOME].registry.verify(address(token));
        assertTrue(locked);
    }

    /// @dev Pemanggil hanya membayar pesan DEPLOY. Likuiditas menunggu `retryRemote`; setelah itu
    ///      alur lanjut seperti biasa.
    function test_liquidityDeferredWhenEscrowIsShort_thenRetryRemote() public {
        (XofNToken token,) = _launchAndGraduate(STANDARD, _eids(BASE));
        (uint256 deployFees,) = graduator.quoteExpandAndLock(address(token));
        vm.prank(keeper);
        graduator.expandAndLock{value: deployFees}(address(token));

        _mustDeliver(BASE, address(remotes[BASE]));
        _mustDeliver(HOME, address(graduator)); // ack tercatat walau likuiditas tidak berangkat
        assertEq(uint8(_step(token, BASE)), uint8(XofNGraduator.Step.Configured));
        address remoteToken = remotes[BASE].deploymentOf(address(token)).remoteToken;
        assertEq(_pending(BASE, remoteToken), 0);
        assertEq(token.peers(BASE), _b32(remoteToken));

        uint256 fee = graduator.quoteRetry(address(token), BASE);
        assertGt(fee, 0);
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(XofNGraduator.InsufficientFee.selector, fee, fee - 1)
        );
        graduator.retryRemote{value: fee - 1}(address(token), BASE);

        // Kelebihan pembayaran dikembalikan ke pemanggil retry.
        uint256 before = bob.balance;
        vm.prank(bob);
        graduator.retryRemote{value: fee + 0.5 ether}(address(token), BASE);
        assertEq(before - bob.balance, fee);
        assertEq(uint8(_step(token, BASE)), uint8(XofNGraduator.Step.LiquiditySent));

        Delivery memory liquidity = _mustDeliver(BASE, remoteToken);
        assertTrue(_compose(BASE, liquidity, address(remotes[BASE])));
        _mustDeliver(HOME, address(graduator));
        (bool locked,,) = chains[HOME].registry.verify(address(token));
        assertTrue(locked);
    }

    /// @dev Escrow fee milik pemanggil `expandAndLock`. Bila langkah likuiditas akhirnya dijalankan
    ///      orang lain lewat `retryRemote`, sisa escrow kembali ke pemiliknya, bukan ke pemanggil
    ///      retry.
    function test_retryCallerCannotTakeOriginalPayersEscrow() public {
        (XofNToken token,) = _launchAndGraduate(STANDARD, _eids(BASE));
        (uint256 deployFees, uint256 liquidityFees) = graduator.quoteExpandAndLock(address(token));
        uint256 surplus = 0.3 ether;

        // DVN sisi home menolak pekerjaan saat ack tiba: pengiriman otomatis gagal, escrow utuh.
        vm.prank(keeper);
        graduator.expandAndLock{value: deployFees + liquidityFees + surplus}(address(token));
        _mustDeliver(BASE, address(remotes[BASE]));
        MockDVN(chains[HOME].dvns[0]).setRejectJobs(true);
        _mustDeliver(HOME, address(graduator));
        assertEq(uint8(_step(token, BASE)), uint8(XofNGraduator.Step.Configured));
        uint256 escrow = graduator.expansionOf(address(token), BASE).feeEscrow;
        assertEq(escrow, liquidityFees + surplus);
        MockDVN(chains[HOME].dvns[0]).setRejectJobs(false);

        uint256 keeperBefore = keeper.balance;
        uint256 attackerBefore = attacker.balance;
        assertEq(graduator.quoteRetry(address(token), BASE), 0, "escrow already covers the fee");
        vm.prank(attacker);
        graduator.retryRemote{value: 0.2 ether}(address(token), BASE);

        assertEq(uint8(_step(token, BASE)), uint8(XofNGraduator.Step.LiquiditySent));
        assertEq(attacker.balance, attackerBefore, "retry caller gets exactly their own value back");
        assertGe(
            keeper.balance - keeperBefore, surplus, "unused escrow returns to the original payer"
        );
        assertEq(graduator.expansionOf(address(token), BASE).feeEscrow, 0);
        assertEq(address(graduator).balance, 0);
    }

    /// @dev Saldo Remote kosong (tim belum mengisi): deploy tetap berhasil, tetapi ack tidak
    ///      terkirim otomatis. Siapa pun memanggil `reAck` di chain tujuan dan alur lanjut.
    function test_ackDeferredWhenRemoteUnfunded_thenReAck() public {
        (XofNToken token,) = _launchAndGraduate(STANDARD, _eids(BASE));
        _expand(token);
        XofNRemote remote = remotes[BASE];
        vm.deal(address(remote), 0);

        Delivery memory d = _take(BASE, address(remote));
        assertTrue(_executeWith(d, DEPLOY_GAS, 0), "deploy still succeeds without funds");
        assertTrue(remote.deploymentOf(address(token)).remoteToken != address(0));
        assertEq(_pending(HOME, address(graduator)), 0, "ack could not be paid");

        uint256 fee = remote.quoteAck(address(token));
        uint256 before = bob.balance;
        vm.prank(bob);
        remote.reAck{value: fee + 1 ether}(address(token));
        assertEq(before - bob.balance, fee, "excess refunded");

        _mustDeliver(HOME, address(graduator));
        assertEq(uint8(_step(token, BASE)), uint8(XofNGraduator.Step.LiquiditySent));

        vm.expectRevert(abi.encodeWithSelector(XofNRemote.NotDeployed.selector, attacker));
        remote.reAck{value: 1 ether}(attacker);
    }

    // ───────────────────────────── Syarat pemanggilan ─────────────────────────────

    function test_expandAndLockRequiresGraduated() public {
        (XofNToken token, XofNCurve curve) = _launch(STANDARD, _eids(BASE));
        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(
                XofNGraduator.InvalidStatus.selector, address(token), XofNGraduator.Status.Bonding
            )
        );
        graduator.expandAndLock{value: 1 ether}(address(token));

        _reachThreshold(curve);
        vm.prank(keeper);
        graduator.graduate(address(token));
        _expand(token);

        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(
                XofNGraduator.InvalidStatus.selector, address(token), XofNGraduator.Status.Expanding
            )
        );
        graduator.expandAndLock{value: 1 ether}(address(token));
    }

    function test_expandAndLockRequiresDeployFees() public {
        (XofNToken token,) = _launchAndGraduate(STANDARD, _eids(BASE, ARB));
        (uint256 deployFees,) = graduator.quoteExpandAndLock(address(token));
        vm.prank(keeper);
        vm.expectRevert();
        graduator.expandAndLock{value: deployFees - 1}(address(token));
        assertEq(
            uint8(graduator.launchOf(address(token)).status), uint8(XofNGraduator.Status.Graduated)
        );
    }

    /// @dev Siapa pun boleh memanggil, bukan hanya creator (PRD P31).
    function test_anyoneCanExpand() public {
        (XofNToken token,) = _launchAndGraduate(STANDARD, _eids(BASE));
        (uint256 deployFees, uint256 liquidityFees) = graduator.quoteExpandAndLock(address(token));
        vm.prank(attacker);
        graduator.expandAndLock{value: deployFees + liquidityFees}(address(token));
        _runChain(token, BASE);
        (bool locked,,) = chains[HOME].registry.verify(address(token));
        assertTrue(locked);
    }

    /// @dev Tahap 1 berjalan penuh tanpa infrastruktur tahap 2 (keadaan Fase 1b). Selama Remote
    ///      belum di-wire, `expandAndLock` revert dan token tetap "Graduated · awaiting expansion".
    function test_expandRevertsWhileInfrastructureIsNotWired() public {
        XofNRegistry registry = new XofNRegistry(chains[HOME].endpoint, safe);
        vm.startPrank(safe);
        for (uint256 i = 0; i < 5; i++) {
            registry.setDvnAllowed(chains[HOME].dvns[i], true);
        }
        vm.stopPrank();

        XofNGraduator.Infra memory infra = _graduatorInfra();
        infra.registry = address(registry);
        XofNGraduator.ExpansionGas[] memory gas = new XofNGraduator.ExpansionGas[](2);
        gas[0] = _expansionGas();
        gas[1] = _expansionGas();
        XofNGraduator unwired = new XofNGraduator(
            chains[HOME].endpoint, safe, infra, _economics(), _homePathways(), gas
        );
        vm.prank(safe);
        registry.setRegistrar(address(unwired));

        vm.prank(creator);
        (address token, address curve) =
            unwired.launch("Proof Coin", "PROOF", STANDARD, _eids(BASE), bytes32(0));
        _reachThreshold(XofNCurve(curve));
        vm.prank(keeper);
        unwired.graduate(token);
        assertEq(uint8(unwired.launchOf(token).status), uint8(XofNGraduator.Status.Graduated));

        vm.expectRevert(abi.encodeWithSelector(IOAppCore.NoPeer.selector, BASE));
        unwired.quoteExpandAndLock(token);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(XofNGraduator.InfraPathwayNotPinned.selector, BASE));
        unwired.expandAndLock{value: 1 ether}(token);

        // Peer saja tidak cukup: pathway infrastruktur harus dipasang eksplisit, tidak boleh
        // berjalan di atas konfigurasi default LayerZero (yang bisa 1-of-1 dan bisa berubah).
        vm.prank(safe);
        unwired.setPeer(BASE, _b32(address(remotes[BASE])));
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(XofNGraduator.InfraPathwayNotPinned.selector, BASE));
        unwired.expandAndLock{value: 1 ether}(token);

        assertEq(uint8(unwired.launchOf(token).status), uint8(XofNGraduator.Status.Graduated));
        assertEq(XofNToken(token).owner(), address(unwired));
        (bool locked,,) = registry.verify(token);
        assertFalse(locked);
    }

    function test_retryRemoteRequiresRetryableStep() public {
        (XofNToken token,) = _launchAndGraduate(STANDARD, _eids(BASE));

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(
                XofNGraduator.InvalidStatus.selector, address(token), XofNGraduator.Status.Graduated
            )
        );
        graduator.retryRemote{value: 1 ether}(address(token), BASE);

        _expand(token);
        _mustDeliver(BASE, address(remotes[BASE]));
        _mustDeliver(HOME, address(graduator));

        // Likuiditas sudah berangkat: tidak ada yang bisa diulang dari home.
        assertEq(graduator.quoteRetry(address(token), BASE), 0);
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(
                XofNGraduator.NothingToRetry.selector,
                address(token),
                BASE,
                XofNGraduator.Step.LiquiditySent
            )
        );
        graduator.retryRemote{value: 1 ether}(address(token), BASE);

        // Chain yang tidak dipilih creator juga tidak bisa "di-retry".
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(
                XofNGraduator.NothingToRetry.selector, address(token), ARB, XofNGraduator.Step.None
            )
        );
        graduator.retryRemote{value: 1 ether}(address(token), ARB);
    }

    /// @dev Graduator hanya memegang escrow fee pemanggil. ETH curve langsung masuk pool home;
    ///      ETH pool ekspansi berasal dari saldo Remote (PRD P51).
    function test_graduatorEthAccounting() public {
        (XofNToken token,) = _launchAndGraduate(STANDARD, _eids(BASE, ARB));
        assertEq(address(graduator).balance, 0);

        _expand(token);
        uint256 escrow = graduator.expansionOf(address(token), BASE).feeEscrow
            + graduator.expansionOf(address(token), ARB).feeEscrow;
        assertEq(address(graduator).balance, escrow);

        _runChain(token, BASE);
        _runChain(token, ARB);
        assertEq(graduator.expansionOf(address(token), BASE).feeEscrow, 0);
        assertEq(graduator.expansionOf(address(token), ARB).feeEscrow, 0);
        assertEq(address(graduator).balance, 0);
    }

    /// @dev PRD P51: tidak ada pesan ekspansi yang membawa value executor, jadi `nativeCap`
    ///      (0 di Robinhood testnet; seluruh suite ini berjalan dengan cap 0) tidak berpengaruh.
    function test_expansionMessagesCarryNoExecutorValue() public {
        (XofNToken token,) = _launchAndGraduate(STANDARD, _eids(BASE));
        _expand(token);
        XofNRemote remote = remotes[BASE];

        Delivery memory deploy = _mustDeliver(BASE, address(remote));
        (, uint256 deployValue) = _parseExecutorLzReceiveOption(deploy.options);
        assertEq(deployValue, 0, "DEPLOY carries no value");

        _mustDeliver(HOME, address(graduator));
        address remoteToken = remote.deploymentOf(address(token)).remoteToken;
        Delivery memory liquidity = _mustDeliver(BASE, remoteToken);
        (, uint256 receiveValue) = _parseExecutorLzReceiveOption(liquidity.options);
        (,, uint256 composeValue) = _parseExecutorLzComposeOption(liquidity.options);
        assertEq(receiveValue, 0, "liquidity lzReceive carries no value");
        assertEq(composeValue, 0, "compose carries no value");

        // ETH pasangan + fee ack LOCKED dibayar dari saldo Remote.
        uint256 before = address(remote).balance;
        assertTrue(_compose(BASE, liquidity, address(remote)));
        uint256 ackFee = remote.quoteAck(address(token));
        assertEq(before - address(remote).balance, EXPANSION_PAIR_ETH + ackFee);
        assertEq(address(chains[BASE].poolManager).balance, EXPANSION_PAIR_ETH);
    }

    // ───────────────────────────── Helper ─────────────────────────────

    function _step(XofNToken token, uint32 eid) private view returns (XofNGraduator.Step) {
        return graduator.expansionOf(address(token), eid).step;
    }

    function _assertNotLocked(XofNToken token) private view {
        (bool locked,,) = chains[HOME].registry.verify(address(token));
        assertFalse(locked, "verify must be false before every chain is done");
        assertEq(
            uint8(graduator.launchOf(address(token)).status), uint8(XofNGraduator.Status.Expanding)
        );
        assertEq(token.owner(), address(graduator));
        assertEq(_delegateOf(HOME, address(token)), address(graduator));
        assertEq(chains[HOME].registry.lockedAt(address(token)), 0);
    }
}
