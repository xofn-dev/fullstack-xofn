// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IOAppCore} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppCore.sol";
import {IOFT, SendParam, MessagingFee} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";

import {XofNTestBase} from "../helpers/XofNTestBase.sol";
import {XofNCurve} from "../../contracts/XofNCurve.sol";
import {XofNToken} from "../../contracts/XofNToken.sol";

/// @dev Bridge setelah terkunci (deployguide §7.5): dua arah lewat hub, supply total tetap 999M,
///      dust tinggal di pengirim, dan ambang verifikasi DVN sesuai tier benar-benar berlaku.
contract BridgeTest is XofNTestBase {
    XofNToken internal token;
    XofNToken internal onBase;
    XofNToken internal onArb;
    uint256 internal aliceTokens;

    function setUp() public override {
        super.setUp();
        _lockToken(STANDARD);
    }

    function _lockToken(uint8 tier) private {
        XofNCurve curve;
        (token, curve) = _launch(tier, _eids(BASE, ARB));
        _reachThreshold(curve); // alice membeli seluruh supply jual
        vm.prank(keeper);
        graduator.graduate(address(token));
        _expand(token);
        _runChain(token, BASE);
        _runChain(token, ARB);
        onBase = _remoteToken(token, BASE);
        onArb = _remoteToken(token, ARB);
        aliceTokens = token.balanceOf(alice);
        vm.deal(alice, 50 ether); // fee bridge
    }

    function _totalSupply() private view returns (uint256) {
        return token.totalSupply() + onBase.totalSupply() + onArb.totalSupply();
    }

    function test_bridgeRobinhoodToBaseAndBack() public {
        assertEq(_totalSupply(), TOTAL_SUPPLY);
        uint256 baseSupplyBefore = onBase.totalSupply();

        _bridge(address(token), alice, BASE, alice, 1_000 ether, "", "");
        assertEq(token.balanceOf(alice), aliceTokens - 1_000 ether);
        assertEq(_totalSupply(), TOTAL_SUPPLY - 1_000 ether, "burned at source, in flight");
        _mustDeliver(BASE, address(onBase));
        assertEq(onBase.balanceOf(alice), 1_000 ether);
        assertEq(onBase.totalSupply(), baseSupplyBefore + 1_000 ether);
        assertEq(_totalSupply(), TOTAL_SUPPLY);

        _bridge(address(onBase), alice, HOME, bob, 400 ether, "", "");
        _mustDeliver(HOME, address(token));
        assertEq(onBase.balanceOf(alice), 600 ether);
        assertEq(token.balanceOf(bob), 400 ether);
        assertEq(_totalSupply(), TOTAL_SUPPLY);
    }

    function test_bridgeRobinhoodToArbitrumAndBack() public {
        _bridge(address(token), alice, ARB, alice, 2_500 ether, "", "");
        _mustDeliver(ARB, address(onArb));
        assertEq(onArb.balanceOf(alice), 2_500 ether);

        _bridge(address(onArb), alice, HOME, alice, 2_500 ether, "", "");
        _mustDeliver(HOME, address(token));
        assertEq(token.balanceOf(alice), aliceTokens);
        assertEq(onArb.balanceOf(alice), 0);
        assertEq(_totalSupply(), TOTAL_SUPPLY);
    }

    /// @dev Topologi hub (PRD P29): Base↔Arbitrum tidak di-wire; harus lewat Robinhood.
    function test_baseToArbitrumGoesThroughHub() public {
        _bridge(address(token), alice, BASE, alice, 1_000 ether, "", "");
        _mustDeliver(BASE, address(onBase));

        SendParam memory direct = SendParam(ARB, _b32(alice), 1_000 ether, 0, "", "", "");
        vm.expectRevert(abi.encodeWithSelector(IOAppCore.NoPeer.selector, ARB));
        onBase.quoteSend(direct, false);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IOAppCore.NoPeer.selector, ARB));
        onBase.send{value: 1 ether}(direct, MessagingFee(1 ether, 0), alice);

        // Dua langkah: Base → Robinhood → Arbitrum.
        _bridge(address(onBase), alice, HOME, alice, 1_000 ether, "", "");
        _mustDeliver(HOME, address(token));
        _bridge(address(token), alice, ARB, alice, 1_000 ether, "", "");
        _mustDeliver(ARB, address(onArb));
        assertEq(onArb.balanceOf(alice), 1_000 ether);
        assertEq(_totalSupply(), TOTAL_SUPPLY);
    }

    /// @dev Jumlah di bawah 0,000001 token (1e12 wei) tetap tinggal di wallet pengirim.
    function test_dustStaysWithSender() public {
        uint256 amount = 1 ether + 999_999_999_999;
        uint256 sent = _bridge(address(token), alice, BASE, alice, amount, "", "");
        assertEq(sent, 1 ether);
        assertEq(token.balanceOf(alice), aliceTokens - 1 ether, "dust was not debited");
        _mustDeliver(BASE, address(onBase));
        assertEq(onBase.balanceOf(alice), 1 ether);
        assertEq(_totalSupply(), TOTAL_SUPPLY);
    }

    function testFuzz_dustStaysWithSenderAndSupplyIsConserved(uint256 amount, bool toArbitrum)
        public
    {
        amount = bound(amount, 1e12, aliceTokens);
        uint32 dst = toArbitrum ? ARB : BASE;
        XofNToken remoteToken = toArbitrum ? onArb : onBase;

        uint256 sent = _bridge(address(token), alice, dst, alice, amount, "", "");
        assertEq(sent, (amount / 1e12) * 1e12);
        assertLt(amount - sent, 1e12);
        assertEq(token.balanceOf(alice), aliceTokens - sent);
        _mustDeliver(dst, address(remoteToken));
        assertEq(remoteToken.balanceOf(alice), sent);
        assertEq(_totalSupply(), TOTAL_SUPPLY);
    }

    /// @dev Jumlah yang seluruhnya dust tidak mengirim apa pun.
    function test_pureDustAmountSendsNothing() public {
        uint256 sent = _bridge(address(token), alice, BASE, alice, 1e12 - 1, "", "");
        assertEq(sent, 0);
        assertEq(token.balanceOf(alice), aliceTokens);
    }

    // ───────────────────────────── Ambang verifikasi sesuai tier ─────────────────────────────

    /// @dev Standard `2+1/2`: butuh KEDUA DVN wajib DAN minimal satu dari dua opsional.
    function test_standardNeedsBothRequiredAndOneOptional() public {
        address[] storage dvns = chains[BASE].dvns; // wajib: [0],[2]; opsional: [1],[3]

        _bridge(address(token), alice, BASE, alice, 100 ether, "", "");

        // Satu DVN wajib mati → tidak terverifikasi, walau semua lainnya memverifikasi.
        // (Verifikasi DVN tersimpan di library, jadi tiap skenario mulai dari snapshot.)
        uint256 snapshot = vm.snapshotState();
        dvnDown[dvns[2]] = true;
        assertFalse(_deliver(BASE, address(onBase)).verified, "one required DVN down");
        vm.revertToState(snapshot);

        // Kedua opsional mati → tidak terverifikasi (dua wajib saja tidak cukup).
        dvnDown[dvns[1]] = true;
        dvnDown[dvns[3]] = true;
        assertFalse(_deliver(BASE, address(onBase)).verified, "no optional DVN");

        // Satu opsional kembali → cukup (1 dari 2).
        dvnDown[dvns[3]] = false;
        Delivery memory d = _deliver(BASE, address(onBase));
        assertTrue(d.verified && d.executed, "2 required + 1 of 2 optional");
        assertEq(onBase.balanceOf(alice), 100 ether);
    }

    /// @dev Fortress `3+1/2`: DVN wajib ketiga benar-benar wajib.
    function test_fortressNeedsAllThreeRequired() public {
        _lockToken(FORTRESS);
        address[] storage dvns = chains[ARB].dvns; // wajib: [0],[2],[4]; opsional: [1],[3]

        _bridge(address(token), alice, ARB, alice, 100 ether, "", "");
        dvnDown[dvns[4]] = true;
        assertFalse(_deliver(ARB, address(onArb)).verified, "third required DVN down");
        dvnDown[dvns[4]] = false;

        dvnDown[dvns[1]] = true; // satu opsional mati tidak apa-apa
        Delivery memory d = _deliver(ARB, address(onArb));
        assertTrue(d.verified && d.executed);
        assertEq(onArb.balanceOf(alice), 100 ether);
    }

    /// @dev Satu DVN saja tidak pernah cukup: 1-of-1 tidak ada di pathway XofN.
    function test_singleDvnIsNeverEnough() public {
        address[] storage dvns = chains[BASE].dvns;
        _bridge(address(token), alice, BASE, alice, 100 ether, "", "");
        for (uint256 keep = 0; keep < 5; keep++) {
            uint256 snapshot = vm.snapshotState();
            for (uint256 i = 0; i < 5; i++) {
                dvnDown[dvns[i]] = i != keep;
            }
            assertFalse(_deliver(BASE, address(onBase)).verified, "a single DVN verified a message");
            assertEq(onBase.balanceOf(alice), 0);
            vm.revertToState(snapshot);
        }
    }

    /// @dev Enforced options terpasang: pengguna bisa mengirim tanpa opsi tambahan.
    function test_quoteSendWorksWithoutExtraOptions() public view {
        SendParam memory param = SendParam(BASE, _b32(alice), 10 ether, 10 ether, "", "", "");
        MessagingFee memory fee = IOFT(address(token)).quoteSend(param, false);
        assertGt(fee.nativeFee, 0);
        assertEq(fee.lzTokenFee, 0);
    }
}
