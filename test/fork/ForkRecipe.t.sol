// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {
    ILayerZeroEndpointV2
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {UlnConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import {ExecutorConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol";
import {SendParam, MessagingFee} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";

import {XofNRegistry} from "../../contracts/XofNRegistry.sol";
import {XofNToken} from "../../contracts/XofNToken.sol";
import {TierLib} from "../../contracts/libraries/TierLib.sol";

interface ISendUln {
    function getExecutorConfig(address oapp, uint32 remoteEid)
        external
        view
        returns (ExecutorConfig memory);
}

/// @dev Fork test READ-ONLY terhadap endpoint LayerZero V2 yang sebenarnya. Tidak ada broadcast:
///      semua perubahan state hanya hidup di fork lokal milik forge.
///
///      Yang dibuktikan: resep tier dari `TierLib` diterima SendUln302/ReceiveUln302 asli (urutan
///      DVN, field bukan nol), `endpoint.getConfig` asli mengembalikan byte yang sama dengan hash
///      resep, `verify()` bekerja terhadap endpoint asli, dan DVN yang dipakai benar-benar bisa
///      memberi quote untuk pathway itu.
///
///      Operator WAJIB yang dipakai di sini (LayerZero Labs + Paxos, dan P2P untuk Fortress)
///      hanyalah CONTOH operator yang tercatat aktif di ketiga chain. Ini bukan keputusan P1.
///
///      Tes dilewati bila `FORK_RPC_<CHAIN>` kosong. Nilainya URL RPC apa pun yang bisa dibaca.
contract ForkRecipeTest is Test {
    uint32 internal constant EID_ROBINHOOD = 30416;
    uint32 internal constant EID_BASE = 30184;
    uint32 internal constant EID_ARBITRUM = 30110;

    address internal constant ENDPOINT_ROBINHOOD = 0x6F475642a6e85809B1c36Fa62763669b1b48DD5B;
    address internal constant ENDPOINT_BASE_ARBITRUM = 0x1a44076050125825900e736c501f859c50fE728c;

    TierLib.Pathway internal stored;

    function test_fork_robinhood_recipeToBase() public {
        _run("FORK_RPC_ROBINHOOD", "robinhood", ENDPOINT_ROBINHOOD, EID_ROBINHOOD, EID_BASE);
    }

    function test_fork_base_recipeToRobinhood() public {
        _run("FORK_RPC_BASE", "base", ENDPOINT_BASE_ARBITRUM, EID_BASE, EID_ROBINHOOD);
    }

    function test_fork_arbitrum_recipeToRobinhood() public {
        _run("FORK_RPC_ARBITRUM", "arbitrum", ENDPOINT_BASE_ARBITRUM, EID_ARBITRUM, EID_ROBINHOOD);
    }

    function _run(
        string memory envKey,
        string memory chainKey,
        address endpointAddress,
        uint32 localEid,
        uint32 remoteEid
    ) private {
        string memory rpc = vm.envOr(envKey, string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);

        ILayerZeroEndpointV2 endpoint = ILayerZeroEndpointV2(endpointAddress);
        assertEq(endpoint.eid(), localEid, "unexpected endpoint");

        XofNRegistry registry = new XofNRegistry(endpointAddress, address(this));
        registry.setRegistrar(address(this));
        TierLib.Pathway memory p = _pathway(endpoint, registry, chainKey, remoteEid);
        TierLib.validate(p, registry, endpoint);

        _checkTier(endpoint, registry, p, TierLib.TIER_STANDARD, 2);
        _checkTier(endpoint, registry, p, TierLib.TIER_FORTRESS, 3);
    }

    function _checkTier(
        ILayerZeroEndpointV2 endpoint,
        XofNRegistry registry,
        TierLib.Pathway memory p,
        uint8 tier,
        uint8 requiredCount
    ) private {
        XofNToken token = new XofNToken(
            "Fork Probe", "PROBE", address(endpoint), address(this), address(this)
        );
        uint32[] memory eids = new uint32[](1);
        eids[0] = p.eid;
        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = TierLib.configHash(p, tier);
        registry.register(address(token), tier, eids, hashes);

        // Sebelum resep: library default, verify false.
        assertTrue(endpoint.isDefaultSendLibrary(address(token), p.eid));
        assertFalse(registry.checkConfig(address(token)));

        stored = p;
        TierLib.applyRecipe(endpoint, address(token), stored, tier);
        token.setPeer(p.eid, bytes32(uint256(uint160(address(token)))));

        // Library asli menerima resep, dan byte konfigurasinya sama dengan hash yang diharapkan.
        assertTrue(registry.checkConfig(address(token)), "recipe does not match real getConfig");
        UlnConfig memory uln =
            abi.decode(endpoint.getConfig(address(token), p.sendLib, p.eid, 2), (UlnConfig));
        assertEq(uln.requiredDVNCount, requiredCount);
        assertEq(uln.optionalDVNCount, 2);
        assertEq(uln.optionalDVNThreshold, 1);
        assertEq(uln.confirmations, p.confirmations);

        // DVN dan executor asli bisa memberi quote untuk pathway ini (hanya membaca).
        SendParam memory param = SendParam(p.eid, bytes32(uint256(1)), 1 ether, 0, "", "", "");
        MessagingFee memory fee = token.quoteSend(param, false);
        assertGt(fee.nativeFee, 0);
        emit log_named_uint(
            tier == TierLib.TIER_STANDARD ? "quoteSend standard (wei)" : "quoteSend fortress (wei)",
            fee.nativeFee
        );

        (bool locked,,) = registry.verify(address(token));
        assertFalse(locked, "must be false before renounce");
        uint256 gasBefore = gasleft();
        token.renounceOwnership();
        (locked,,) = registry.verify(address(token));
        emit log_named_uint("renounce + verify gas", gasBefore - gasleft());
        assertTrue(locked, "verify against the real endpoint");
        assertTrue(registry.verifyEid(address(token), p.eid));
    }

    /// @dev Library dan executor = default pathway itu saat ini, dipasang EKSPLISIT.
    ///      DVN diambil dari config/dvn-labels.json berdasarkan id operator.
    function _pathway(
        ILayerZeroEndpointV2 endpoint,
        XofNRegistry registry,
        string memory chainKey,
        uint32 remoteEid
    ) private returns (TierLib.Pathway memory p) {
        p.eid = remoteEid;
        p.sendLib = endpoint.defaultSendLibrary(remoteEid);
        p.receiveLib = endpoint.defaultReceiveLibrary(remoteEid);
        ExecutorConfig memory executor =
            ISendUln(p.sendLib).getExecutorConfig(address(0xdead), remoteEid);
        p.executor = executor.executor;
        p.maxMessageSize = executor.maxMessageSize;
        p.confirmations = 15;
        p.receiveGas = 300_000;
        p.composeGas = 100_000;

        string memory json = vm.readFile("config/dvn-labels.json");
        address labs = _dvn(json, chainKey, "layerzero-labs");
        address second = _dvn(json, chainKey, "paxos");
        address third = _dvn(json, chainKey, "p2p");
        address telekom = _dvn(json, chainKey, "deutsche-telekom");
        address fidelity = _dvn(json, chainKey, "fidelity");

        p.standardRequired = _sorted2(labs, second);
        p.fortressRequired = _sorted3(labs, second, third);
        p.optionalDvns = _sorted2(telekom, fidelity);

        address[5] memory all = [labs, second, third, telekom, fidelity];
        for (uint256 i = 0; i < all.length; i++) {
            registry.setDvnAllowed(all[i], true);
        }
    }

    function _dvn(string memory json, string memory chainKey, string memory operatorId)
        private
        view
        returns (address)
    {
        for (uint256 i = 0;; i++) {
            string memory base = string.concat(".mainnet.", chainKey, "[", vm.toString(i), "]");
            if (!vm.keyExistsJson(json, base)) break;
            if (
                keccak256(bytes(vm.parseJsonString(json, string.concat(base, ".operatorId"))))
                        == keccak256(bytes(operatorId))
                    && !vm.parseJsonBool(json, string.concat(base, ".deprecated"))
            ) return vm.parseJsonAddress(json, string.concat(base, ".address"));
        }
        revert(string.concat("DVN not found: ", operatorId));
    }

    function _sorted2(address a, address b) private pure returns (address[] memory list) {
        list = new address[](2);
        (list[0], list[1]) = a < b ? (a, b) : (b, a);
    }

    function _sorted3(address a, address b, address c)
        private
        pure
        returns (address[] memory list)
    {
        list = new address[](3);
        list[0] = a;
        list[1] = b;
        list[2] = c;
        for (uint256 i = 1; i < 3; i++) {
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
