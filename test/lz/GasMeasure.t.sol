// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {XofNTestBase} from "../helpers/XofNTestBase.sol";
import {XofNCurve} from "../../contracts/XofNCurve.sol";
import {XofNToken} from "../../contracts/XofNToken.sol";

/// @dev Pengukuran gas untuk PRD P4 (pesan deploy dan compose) dan P7 (`verify`).
///      Angka diukur di endpoint tiruan dan AMM tiruan; validasi di testnet tetap dibutuhkan
///      (Phase 7, FROZEN). Tes ini juga menjaga agar gas yang dikonfigurasi di tes punya margin
///      minimal 1,5x terhadap pemakaian terukur.
contract GasMeasureTest is XofNTestBase {
    function test_gas_standard() public {
        _measure(STANDARD, "standard");
    }

    function test_gas_fortress() public {
        _measure(FORTRESS, "fortress");
    }

    function _measure(uint8 tier, string memory label) private {
        uint256 g = gasleft();
        (XofNToken token, XofNCurve curve) = _launch(tier, _eids(BASE, ARB));
        emit log_named_uint(string.concat(label, ": launch"), g - gasleft());

        _reachThreshold(curve);
        vm.prank(keeper);
        g = gasleft();
        graduator.graduate(address(token));
        emit log_named_uint(string.concat(label, ": graduate"), g - gasleft());

        (uint256 deployFees, uint256 liquidityFees) = graduator.quoteExpandAndLock(address(token));
        vm.prank(keeper);
        g = gasleft();
        graduator.expandAndLock{value: deployFees + liquidityFees}(address(token));
        emit log_named_uint(string.concat(label, ": expandAndLock (2 chains)"), g - gasleft());

        // Base
        uint256 deployGas = _measureReceive(BASE, address(remotes[BASE]));
        uint256 ackConfiguredGas = _measureReceive(HOME, address(graduator));
        Delivery memory liquidity = _take(BASE, address(_remoteToken(token, BASE)));
        g = gasleft();
        assertTrue(_execute(liquidity, 0));
        uint256 creditGas = g - gasleft();
        g = gasleft();
        assertTrue(_compose(BASE, liquidity, address(remotes[BASE])));
        uint256 composeGas = g - gasleft();
        uint256 ackLockedGas = _measureReceive(HOME, address(graduator));

        // Arbitrum: ack LOCKED terakhir juga mengunci home (verifikasi 2 EID + renounce).
        _mustDeliver(ARB, address(remotes[ARB]));
        _mustDeliver(HOME, address(graduator));
        Delivery memory second = _mustDeliver(ARB, address(_remoteToken(token, ARB)));
        assertTrue(_compose(ARB, second, address(remotes[ARB])));
        uint256 finalAckGas = _measureReceive(HOME, address(graduator));

        emit log_named_uint(
            string.concat(label, ": Remote.lzReceive DEPLOY (token + recipe + ack)"), deployGas
        );
        emit log_named_uint(
            string.concat(label, ": Graduator.lzReceive ack CONFIGURED (+ send liquidity)"),
            ackConfiguredGas
        );
        emit log_named_uint(string.concat(label, ": token.lzReceive liquidity credit"), creditGas);
        emit log_named_uint(
            string.concat(label, ": Remote.lzCompose (pool + lock + ack)"), composeGas
        );
        emit log_named_uint(string.concat(label, ": Graduator.lzReceive ack LOCKED"), ackLockedGas);
        emit log_named_uint(
            string.concat(label, ": Graduator.lzReceive final ack LOCKED (locks home)"), finalAckGas
        );

        g = gasleft();
        chains[HOME].registry.verify(address(token));
        emit log_named_uint(string.concat(label, ": Registry.verify (2 EIDs)"), g - gasleft());
        g = gasleft();
        chains[HOME].registry.verifyEid(address(token), BASE);
        emit log_named_uint(string.concat(label, ": Registry.verifyEid"), g - gasleft());
        g = gasleft();
        chains[BASE].registry.verify(address(_remoteToken(token, BASE)));
        emit log_named_uint(
            string.concat(label, ": Registry.verify (1 EID, expansion chain)"), g - gasleft()
        );

        // Bridge biasa oleh pengguna setelah terkunci (penerima baru = kasus termahal).
        vm.deal(alice, 10 ether);
        _bridge(address(token), alice, BASE, makeAddr("fresh recipient"), 1_000 ether, "", "");
        uint256 bridgeGas = _measureReceive(BASE, address(_remoteToken(token, BASE)));
        emit log_named_uint(string.concat(label, ": token.lzReceive plain bridge"), bridgeGas);
        assertLe(bridgeGas * 3, uint256(TOKEN_RECEIVE_GAS) * 2, "bridge receiveGas margin");

        // Margin gas yang dikonfigurasi terhadap pemakaian terukur.
        assertLe(deployGas * 3, uint256(DEPLOY_GAS) * 2, "deployGas margin");
        assertLe(composeGas * 3, uint256(SEED_GAS + TOKEN_COMPOSE_GAS) * 2, "seedGas margin");
        assertLe(ackConfiguredGas * 3, uint256(ACK_CONFIGURED_GAS) * 2, "ackConfiguredGas margin");
        assertLe(finalAckGas * 3, uint256(ACK_LOCKED_GAS) * 2, "ackLockedGas margin");
        assertLe(creditGas * 3, uint256(TOKEN_RECEIVE_GAS) * 2, "token receiveGas margin");
    }

    function _measureReceive(uint32 dstEid, address dst) private returns (uint256 used) {
        Delivery memory d = _take(dstEid, dst);
        assertTrue(d.verified);
        uint256 g = gasleft();
        assertTrue(_execute(d, 0));
        used = g - gasleft();
    }
}
