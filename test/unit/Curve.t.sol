// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {XofNTestBase} from "../helpers/XofNTestBase.sol";
import {XofNCurve} from "../../contracts/XofNCurve.sol";
import {XofNToken} from "../../contracts/XofNToken.sol";

/// @dev Bonding curve: clone per launch, harga, ambang, dan penutupan trading (PRD §5.2).
contract CurveTest is XofNTestBase {
    XofNToken internal token;
    XofNCurve internal curve;

    function setUp() public override {
        super.setUp();
        (token, curve) = _launch(STANDARD, _eids(BASE));
    }

    function test_initialState() public view {
        assertEq(curve.graduator(), address(graduator));
        assertEq(address(curve.token()), address(token));
        assertEq(curve.saleSupply(), SALE_SUPPLY);
        assertEq(curve.graduationThreshold(), GRADUATION_THRESHOLD);
        assertEq(curve.ethRaised(), 0);
        assertEq(curve.tokensSold(), 0);
        assertFalse(curve.graduated());
        assertFalse(curve.thresholdReached());
        // Harga awal = parameter START_PRICE (selisih pembulatan paling banyak 1 wei).
        assertApproxEqAbs(curve.currentPrice(), START_PRICE, 1);
    }

    /// @dev Setiap launch mendapat clone sendiri dari satu implementation.
    function test_eachLaunchGetsItsOwnClone() public {
        (XofNToken token2, XofNCurve curve2) = _launch(FORTRESS, _eids(ARB));
        assertTrue(address(curve2) != address(curve));
        assertTrue(address(token2) != address(token));
        assertEq(token2.balanceOf(address(curve2)), TOTAL_SUPPLY);
        assertEq(token.balanceOf(address(curve)), TOTAL_SUPPLY);

        // EIP-1167: runtime 45 byte yang menunjuk ke implementation.
        assertEq(address(curve).code.length, 45);
        assertEq(
            keccak256(address(curve).code),
            keccak256(
                abi.encodePacked(
                    hex"363d3d373d3d3d363d73",
                    address(curveImpl),
                    hex"5af43d82803e903d91602b57fd5bf3"
                )
            )
        );
    }

    function test_implementationCannotBeInitialized() public {
        vm.expectRevert(XofNCurve.AlreadyInitialized.selector);
        curveImpl.initialize(address(token), SALE_SUPPLY, START_PRICE, GRADUATION_THRESHOLD);
    }

    function test_cloneCannotBeInitializedTwice() public {
        vm.prank(attacker);
        vm.expectRevert(XofNCurve.AlreadyInitialized.selector);
        curve.initialize(address(token), 1 ether, 1, 1 ether);
    }

    function test_initializeRejectsInvalidParams() public {
        XofNCurve fresh = XofNCurve(Clones.clone(address(curveImpl)));
        // Ambang tidak lebih besar dari harga awal * supply jual: harga tidak akan naik.
        vm.expectRevert(XofNCurve.InvalidCurveParams.selector);
        fresh.initialize(address(token), SALE_SUPPLY, START_PRICE, 1 ether);
        vm.expectRevert(XofNCurve.InvalidCurveParams.selector);
        fresh.initialize(address(0), SALE_SUPPLY, START_PRICE, GRADUATION_THRESHOLD);
        vm.expectRevert(XofNCurve.InvalidCurveParams.selector);
        fresh.initialize(address(token), 0, START_PRICE, GRADUATION_THRESHOLD);
        vm.expectRevert(XofNCurve.InvalidCurveParams.selector);
        fresh.initialize(address(token), SALE_SUPPLY, 0, GRADUATION_THRESHOLD);
    }

    function test_buyTransfersTokensAndRaisesPrice() public {
        uint256 priceBefore = curve.currentPrice();
        (uint256 quoted, uint256 used) = curve.quoteBuy(1 ether);
        uint256 out = _buy(curve, alice, 1 ether);

        assertEq(out, quoted);
        assertEq(used, 1 ether);
        assertEq(token.balanceOf(alice), out);
        assertEq(curve.ethRaised(), 1 ether);
        assertEq(curve.tokensSold(), out);
        assertEq(address(curve).balance, 1 ether);
        assertEq(token.balanceOf(address(curve)), TOTAL_SUPPLY - out);
        assertGt(curve.currentPrice(), priceBefore);
    }

    function test_sellReturnsEthAndNeverMoreThanPaid() public {
        uint256 out = _buy(curve, alice, 1 ether);
        uint256 balanceBefore = alice.balance;

        vm.startPrank(alice);
        token.approve(address(curve), out);
        uint256 quoted = curve.quoteSell(out);
        uint256 ethOut = curve.sell(out, 0);
        vm.stopPrank();

        assertEq(ethOut, quoted);
        assertLe(ethOut, 1 ether);
        assertApproxEqAbs(ethOut, 1 ether, 2);
        assertEq(alice.balance, balanceBefore + ethOut);
        assertEq(curve.tokensSold(), 0);
        assertEq(token.balanceOf(address(curve)), TOTAL_SUPPLY);
    }

    function test_slippageProtection() public {
        (uint256 quoted,) = curve.quoteBuy(1 ether);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(XofNCurve.SlippageExceeded.selector, quoted, quoted + 1)
        );
        curve.buy{value: 1 ether}(quoted + 1);

        uint256 out = _buy(curve, alice, 1 ether);
        vm.startPrank(alice);
        token.approve(address(curve), out);
        uint256 ethQuoted = curve.quoteSell(out);
        vm.expectRevert(
            abi.encodeWithSelector(XofNCurve.SlippageExceeded.selector, ethQuoted, ethQuoted + 1)
        );
        curve.sell(out, ethQuoted + 1);
        vm.stopPrank();
    }

    function test_zeroAmountsRejected() public {
        vm.startPrank(alice);
        vm.expectRevert(XofNCurve.ZeroAmount.selector);
        curve.buy{value: 0}(0);
        vm.expectRevert(XofNCurve.ZeroAmount.selector);
        curve.sell(0, 0);
        vm.stopPrank();
    }

    /// @dev Kelebihan di atas ambang dikembalikan; tepat `saleSupply` token terjual.
    function test_buyPastThresholdRefundsExcessAndSellsExactSaleSupply() public {
        _buy(curve, alice, 1 ether);
        vm.deal(bob, 10 ether);
        uint256 bobBefore = bob.balance;
        _buy(curve, bob, 10 ether);

        assertEq(curve.ethRaised(), GRADUATION_THRESHOLD);
        assertEq(address(curve).balance, GRADUATION_THRESHOLD);
        assertEq(bobBefore - bob.balance, GRADUATION_THRESHOLD - 1 ether);
        assertEq(curve.tokensSold(), SALE_SUPPLY);
        assertEq(token.balanceOf(address(curve)), TOTAL_SUPPLY - SALE_SUPPLY);
        assertTrue(curve.thresholdReached());
    }

    /// @dev Begitu ambang tercapai, curve menolak trading lanjutan (USER_FLOWS §7).
    function test_tradingClosesAtThreshold() public {
        _reachThreshold(curve);

        vm.prank(bob);
        vm.expectRevert(XofNCurve.TradingClosed.selector);
        curve.buy{value: 1 ether}(0);

        vm.startPrank(alice);
        token.approve(address(curve), 1 ether);
        vm.expectRevert(XofNCurve.TradingClosed.selector);
        curve.sell(1 ether, 0);
        vm.stopPrank();

        (uint256 tokensOut, uint256 used) = curve.quoteBuy(1 ether);
        assertEq(tokensOut, 0);
        assertEq(used, 0);
        assertEq(curve.quoteSell(1 ether), 0);
    }

    function test_onlyGraduatorCanGraduateCurve() public {
        _reachThreshold(curve);
        vm.prank(attacker);
        vm.expectRevert(XofNCurve.OnlyGraduator.selector);
        curve.graduate();
    }

    /// @dev Curve tidak punya fungsi admin: seluruh permukaan yang mengubah state hanya ini.
    function test_curveMutableSurface() public view {
        string[4] memory allowed = ["initialize", "buy", "sell", "graduate"];
        string memory json = vm.readFile("out/XofNCurve.sol/XofNCurve.json");
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
            bytes32 name = keccak256(bytes(vm.parseJsonString(json, string.concat(base, ".name"))));
            bool found;
            for (uint256 j = 0; j < allowed.length; j++) {
                if (name == keccak256(bytes(allowed[j]))) found = true;
            }
            assertTrue(found, "unexpected state-changing function on curve");
            mutableCount++;
        }
        assertEq(mutableCount, allowed.length);
    }
}
