// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {XofNTestBase} from "../helpers/XofNTestBase.sol";
import {XofNCurve} from "../../contracts/XofNCurve.sol";
import {XofNToken} from "../../contracts/XofNToken.sol";

/// @dev Fuzz jumlah buy/sell di bonding curve (ARCHITECTURE §6).
contract CurveFuzzTest is XofNTestBase {
    XofNToken internal token;
    XofNCurve internal curve;

    function setUp() public override {
        super.setUp();
        (token, curve) = _launch(STANDARD, _eids(BASE, ARB));
        vm.prank(alice);
        token.approve(address(curve), type(uint256).max);
        vm.prank(bob);
        token.approve(address(curve), type(uint256).max);
    }

    function _assertCurveInvariants() private view {
        uint256 raised = curve.ethRaised();
        uint256 sold = curve.tokensSold();
        assertLe(raised, GRADUATION_THRESHOLD);
        assertLe(sold, SALE_SUPPLY);
        assertGe(address(curve).balance, raised, "curve must hold the ETH it raised");
        assertEq(token.balanceOf(address(curve)), TOTAL_SUPPLY - sold, "token accounting");
        assertEq(token.totalSupply(), TOTAL_SUPPLY);
        // (V0 + raised) * (Y0 - sold) >= V0 * Y0
        assertGe(
            (curve.virtualEth() + raised) * (curve.virtualTokens() - sold),
            curve.virtualEth() * curve.virtualTokens(),
            "constant product"
        );
    }

    function testFuzz_buy(uint256 ethIn) public {
        ethIn = bound(ethIn, 1 gwei, 10 ether);
        vm.deal(alice, ethIn);
        (uint256 quoted, uint256 used) = curve.quoteBuy(ethIn);
        uint256 out = _buy(curve, alice, ethIn);

        assertEq(out, quoted);
        assertEq(token.balanceOf(alice), out);
        assertEq(alice.balance, ethIn - used, "excess over the threshold is refunded");
        assertEq(curve.ethRaised(), used);
        _assertCurveInvariants();
    }

    /// @dev Beli lalu jual semuanya tidak pernah menghasilkan ETH lebih dari yang dibayar.
    function testFuzz_buyThenSellNeverProfits(uint256 ethIn) public {
        ethIn = bound(ethIn, 1 gwei, GRADUATION_THRESHOLD - 1);
        vm.deal(alice, ethIn);
        uint256 out = _buy(curve, alice, ethIn);

        vm.prank(alice);
        uint256 ethOut = curve.sell(out, 0);
        assertLe(ethOut, ethIn);
        assertApproxEqAbs(ethOut, ethIn, 2, "round trip loses at most rounding dust");
        assertEq(curve.tokensSold(), 0);
        _assertCurveInvariants();
    }

    /// @dev Harga tidak bergantung pada cara membelinya: dua pembelian = satu pembelian.
    function testFuzz_splitBuyEqualsSingleBuy(uint256 first, uint256 second) public {
        first = bound(first, 1 gwei, 1.9 ether);
        second = bound(second, 1 gwei, 1.9 ether);

        uint256 snapshot = vm.snapshotState();
        vm.deal(alice, first + second);
        uint256 single = _buy(curve, alice, first + second);
        vm.revertToState(snapshot);

        vm.deal(alice, first + second);
        uint256 split = _buy(curve, alice, first) + _buy(curve, alice, second);
        assertEq(split, single);
    }

    function testFuzz_randomTradesKeepInvariants(uint256[12] memory amounts, uint16 sellMask)
        public
    {
        for (uint256 i = 0; i < amounts.length; i++) {
            address actor = i % 2 == 0 ? alice : bob;
            if (curve.thresholdReached()) break;

            if ((sellMask >> i) & 1 == 1 && token.balanceOf(actor) > 0) {
                uint256 tokensIn = bound(amounts[i], 1, token.balanceOf(actor));
                uint256 quoted = curve.quoteSell(tokensIn);
                uint256 before = actor.balance;
                vm.prank(actor);
                curve.sell(tokensIn, 0);
                assertEq(actor.balance - before, quoted);
            } else {
                uint256 ethIn = bound(amounts[i], 1 gwei, 1 ether);
                vm.deal(actor, ethIn);
                _buy(curve, actor, ethIn);
            }
            _assertCurveInvariants();
        }
    }

    /// @dev Bagaimanapun jalannya, saat ambang tercapai tepat `saleSupply` token sudah terjual
    ///      dan sisanya (untuk pool) tidak kurang satu wei pun.
    function testFuzz_thresholdAlwaysSellsExactSaleSupply(uint256[6] memory amounts) public {
        for (uint256 i = 0; i < amounts.length; i++) {
            if (curve.thresholdReached()) break;
            uint256 ethIn = bound(amounts[i], 1 gwei, 1.5 ether);
            vm.deal(bob, ethIn);
            _buy(curve, bob, ethIn);
        }
        if (!curve.thresholdReached()) {
            vm.deal(alice, GRADUATION_THRESHOLD);
            _buy(curve, alice, GRADUATION_THRESHOLD);
        }

        assertEq(curve.ethRaised(), GRADUATION_THRESHOLD);
        assertEq(curve.tokensSold(), SALE_SUPPLY);
        assertEq(token.balanceOf(address(curve)), TOTAL_SUPPLY - SALE_SUPPLY);
        assertEq(address(curve).balance, GRADUATION_THRESHOLD);
        _assertCurveInvariants();

        // Graduation setelah jalur acak apa pun selalu berhasil dan membagi rata tanpa sisa.
        vm.prank(keeper);
        graduator.graduate(address(token));
        uint256 perChain = graduator.launchOf(address(token)).tokensPerChain;
        assertEq(perChain % 1e12, 0);
        assertEq(token.balanceOf(address(graduator)), 2 * perChain);
        assertEq(token.totalSupply(), TOTAL_SUPPLY);
    }
}
