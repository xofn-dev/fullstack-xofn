// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {UlnConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import {ExecutorConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol";
import {
    SetConfigParam
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import {
    ILayerZeroEndpointV2
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {
    IMessageLib,
    MessageLibType
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLib.sol";
import {
    IOAppOptionsType3,
    EnforcedOptionParam
} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppOptionsType3.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";

import {IXofNRegistry} from "../interfaces/IXofNRegistry.sol";

/// @title TierLib
/// @notice Definisi tier XofN dan resep konfigurasi satu pathway (PRD §5.3, §5.4).
/// @dev Satu-satunya tempat tier diterjemahkan menjadi konfigurasi endpoint. Dipakai Graduator
///      (sisi home), Remote (sisi ekspansi), dan Registry (pembanding `verify`), supaya ketiganya
///      tidak bisa berbeda tafsir.
///
///      Tier didefinisikan lewat JUMLAH, bukan nama operator (rekomendasi PRD P1):
///      - Standard = 2 DVN wajib + 1 dari 2 opsional  → badge `XofN 2+1/2`
///      - Fortress = 3 DVN wajib + 1 dari 2 opsional  → badge `XofN 3+1/2`
///      Tidak ada bentuk lain. 1-of-1 tidak bisa direpresentasikan.
///
///      Nilai 0 di konfigurasi ULN/executor berarti "pakai default" (PRD P5), jadi setiap field
///      wajib bukan nol dan `validate` menolaknya.
library TierLib {
    using OptionsBuilder for bytes;

    uint8 internal constant TIER_STANDARD = 1;
    uint8 internal constant TIER_FORTRESS = 2;

    uint8 internal constant STANDARD_REQUIRED = 2;
    uint8 internal constant FORTRESS_REQUIRED = 3;
    uint8 internal constant OPTIONAL_COUNT = 2;
    uint8 internal constant OPTIONAL_THRESHOLD = 1;

    uint32 internal constant CONFIG_TYPE_EXECUTOR = 1;
    uint32 internal constant CONFIG_TYPE_ULN = 2;

    /// @dev Tipe pesan OFT (OFTCore.SEND / SEND_AND_CALL).
    uint16 internal constant MSG_SEND = 1;
    uint16 internal constant MSG_SEND_AND_CALL = 2;

    /// @notice Resep satu pathway dilihat dari chain lokal ke `eid`.
    /// @dev Alamat library, executor, dan DVN adalah alamat di chain LOKAL.
    ///      `fortressRequired` kosong berarti Fortress tidak ditawarkan di pathway ini.
    struct Pathway {
        uint32 eid;
        address sendLib;
        address receiveLib;
        address executor;
        uint32 maxMessageSize;
        uint64 confirmations;
        uint128 receiveGas; // enforced option lzReceive untuk token
        uint128 composeGas; // enforced option lzCompose untuk token
        address[] standardRequired;
        address[] fortressRequired;
        address[] optionalDvns;
    }

    error InvalidTier(uint8 tier);
    error InvalidEid(uint32 eid);
    error ZeroConfigField();
    error InvalidRequiredDvnCount(uint256 count);
    error InvalidOptionalDvnCount(uint256 count);
    error DvnsNotSortedUnique();
    error DvnOverlap(address dvn);
    error DvnNotAllowed(address dvn);
    error TierUnavailable(uint8 tier, uint32 eid);
    error LibraryNotRegistered(address lib);
    error WrongLibraryType(address lib);
    error EidNotSupported(uint32 eid);

    function isValidTier(uint8 tier) internal pure returns (bool) {
        return tier == TIER_STANDARD || tier == TIER_FORTRESS;
    }

    function supportsTier(Pathway memory p, uint8 tier) internal pure returns (bool) {
        if (p.eid == 0) return false;
        if (tier == TIER_STANDARD) return true;
        if (tier == TIER_FORTRESS) return p.fortressRequired.length == FORTRESS_REQUIRED;
        return false;
    }

    function requiredDvns(Pathway memory p, uint8 tier) internal pure returns (address[] memory) {
        if (tier == TIER_STANDARD) return p.standardRequired;
        if (tier == TIER_FORTRESS && p.fortressRequired.length == FORTRESS_REQUIRED) {
            return p.fortressRequired;
        }
        if (!isValidTier(tier)) revert InvalidTier(tier);
        revert TierUnavailable(tier, p.eid);
    }

    /// @notice Menolak resep yang tidak memenuhi aturan tier. Dipanggil sekali, di constructor.
    /// @dev Menolak: field 0 (P5), DVN wajib bukan 2 (Standard) / 3 (Fortress), opsional bukan 2,
    ///      array tidak terurut naik atau berduplikat, DVN yang sama di set wajib dan opsional,
    ///      DVN di luar daftar putih Registry, serta library yang tidak terdaftar di endpoint
    ///      (resep seperti itu tidak akan pernah bisa dipasang, dan token tidak akan bisa
    ///      diekspansi).
    function validate(Pathway memory p, IXofNRegistry registry, ILayerZeroEndpointV2 endpoint)
        internal
        view
    {
        if (p.eid == 0 || p.eid == endpoint.eid()) revert InvalidEid(p.eid);
        if (
            p.sendLib == address(0) || p.receiveLib == address(0) || p.executor == address(0)
                || p.maxMessageSize == 0 || p.confirmations == 0 || p.receiveGas == 0
                || p.composeGas == 0
        ) revert ZeroConfigField();

        if (!endpoint.isRegisteredLibrary(p.sendLib)) revert LibraryNotRegistered(p.sendLib);
        if (!endpoint.isRegisteredLibrary(p.receiveLib)) revert LibraryNotRegistered(p.receiveLib);
        // Syarat yang sama dengan yang diperiksa endpoint saat library dipasang, supaya resep
        // yang salah ketahuan saat deploy, bukan saat token pertama diekspansi.
        if (IMessageLib(p.sendLib).messageLibType() == MessageLibType.Receive) {
            revert WrongLibraryType(p.sendLib);
        }
        if (IMessageLib(p.receiveLib).messageLibType() == MessageLibType.Send) {
            revert WrongLibraryType(p.receiveLib);
        }
        if (
            !endpoint.isSupportedEid(p.eid) || !IMessageLib(p.sendLib).isSupportedEid(p.eid)
                || !IMessageLib(p.receiveLib).isSupportedEid(p.eid)
        ) revert EidNotSupported(p.eid);

        if (p.standardRequired.length != STANDARD_REQUIRED) {
            revert InvalidRequiredDvnCount(p.standardRequired.length);
        }
        if (p.fortressRequired.length != 0 && p.fortressRequired.length != FORTRESS_REQUIRED) {
            revert InvalidRequiredDvnCount(p.fortressRequired.length);
        }
        if (p.optionalDvns.length != OPTIONAL_COUNT) {
            revert InvalidOptionalDvnCount(p.optionalDvns.length);
        }

        _validateSet(p.optionalDvns, registry);
        _validateSet(p.standardRequired, registry);
        _rejectOverlap(p.standardRequired, p.optionalDvns);
        if (p.fortressRequired.length != 0) {
            _validateSet(p.fortressRequired, registry);
            _rejectOverlap(p.fortressRequired, p.optionalDvns);
        }
    }

    /// @notice Cek ulang daftar putih saat launch: perubahan daftar putih hanya memengaruhi token
    ///         BARU, tidak token yang sudah ada.
    function requireAllowed(Pathway memory p, uint8 tier, IXofNRegistry registry) internal view {
        address[] memory required = requiredDvns(p, tier);
        for (uint256 i = 0; i < required.length; i++) {
            if (!registry.dvnAllowed(required[i])) revert DvnNotAllowed(required[i]);
        }
        for (uint256 i = 0; i < p.optionalDvns.length; i++) {
            if (!registry.dvnAllowed(p.optionalDvns[i])) revert DvnNotAllowed(p.optionalDvns[i]);
        }
    }

    function ulnConfig(Pathway memory p, uint8 tier) internal pure returns (UlnConfig memory) {
        address[] memory required = requiredDvns(p, tier);
        return UlnConfig({
            confirmations: p.confirmations,
            requiredDVNCount: uint8(required.length),
            optionalDVNCount: OPTIONAL_COUNT,
            optionalDVNThreshold: OPTIONAL_THRESHOLD,
            requiredDVNs: required,
            optionalDVNs: p.optionalDvns
        });
    }

    function executorConfig(Pathway memory p) internal pure returns (ExecutorConfig memory) {
        return ExecutorConfig({maxMessageSize: p.maxMessageSize, executor: p.executor});
    }

    function sendOptions(Pathway memory p) internal pure returns (bytes memory) {
        return OptionsBuilder.newOptions().addExecutorLzReceiveOption(p.receiveGas, 0);
    }

    function sendAndCallOptions(Pathway memory p) internal pure returns (bytes memory) {
        return OptionsBuilder.newOptions()
            .addExecutorLzReceiveOption(p.receiveGas, 0)
            .addExecutorLzComposeOption(0, p.composeGas, 0);
    }

    /// @notice Hash konfigurasi sisi endpoint satu pathway: library kirim/terima, ULN kirim/terima,
    ///         dan executor. Registry memanggil ini dengan nilai yang dibaca dari endpoint.
    function hashEndpointConfig(
        address sendLib,
        address receiveLib,
        bytes memory ulnSend,
        bytes memory ulnReceive,
        bytes memory executorCfg
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                sendLib,
                receiveLib,
                keccak256(ulnSend),
                keccak256(ulnReceive),
                keccak256(executorCfg)
            )
        );
    }

    /// @notice Hash enforced options token untuk satu pathway (pesan SEND dan SEND_AND_CALL).
    function hashOptions(bytes memory optionsSend, bytes memory optionsSendAndCall)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(keccak256(optionsSend), keccak256(optionsSendAndCall)));
    }

    /// @notice Hash akhir yang disimpan dan dibandingkan Registry.
    function combineHashes(bytes32 endpointHash, bytes32 optionsHash)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(endpointHash, optionsHash));
    }

    /// @notice `configHash` untuk resep yang tersimpan di storage pemanggil.
    /// @dev `external` (delegatecall ke library terhubung) supaya kodenya tidak tertanam di
    ///      Graduator dan Remote.
    function configHashOf(Pathway storage p, uint8 tier) external view returns (bytes32) {
        return configHash(p, tier);
    }

    /// @notice Hash yang diharapkan untuk `tier` di pathway `p`.
    function configHash(Pathway memory p, uint8 tier) internal pure returns (bytes32) {
        bytes memory uln = abi.encode(ulnConfig(p, tier));
        return combineHashes(
            hashEndpointConfig(p.sendLib, p.receiveLib, uln, uln, abi.encode(executorConfig(p))),
            hashOptions(sendOptions(p), sendAndCallOptions(p))
        );
    }

    /// @notice Memasang resep di `token` untuk pathway `p`: library eksplisit, ULN (kirim dan
    ///         terima), executor, dan enforced options. Peer dipasang terpisah oleh pemanggil.
    /// @dev Pemanggil harus owner sekaligus delegate token. Hanya bisa dijalankan sekali per
    ///      pathway: endpoint menolak library yang sama dipasang dua kali.
    ///      `external`: dijalankan lewat delegatecall, jadi `msg.sender` di endpoint dan di token
    ///      tetap kontrak pemanggil (Graduator atau Remote).
    function applyRecipe(
        ILayerZeroEndpointV2 endpoint,
        address token,
        Pathway storage pathway,
        uint8 tier
    ) external {
        Pathway memory p = pathway;
        bytes memory uln = abi.encode(ulnConfig(p, tier));

        endpoint.setSendLibrary(token, p.eid, p.sendLib);
        // Grace period 0: tidak ada library lama yang tetap sah.
        endpoint.setReceiveLibrary(token, p.eid, p.receiveLib, 0);

        SetConfigParam[] memory sendParams = new SetConfigParam[](2);
        sendParams[0] = SetConfigParam(p.eid, CONFIG_TYPE_EXECUTOR, abi.encode(executorConfig(p)));
        sendParams[1] = SetConfigParam(p.eid, CONFIG_TYPE_ULN, uln);
        endpoint.setConfig(token, p.sendLib, sendParams);

        SetConfigParam[] memory receiveParams = new SetConfigParam[](1);
        receiveParams[0] = SetConfigParam(p.eid, CONFIG_TYPE_ULN, uln);
        endpoint.setConfig(token, p.receiveLib, receiveParams);

        EnforcedOptionParam[] memory options = new EnforcedOptionParam[](2);
        options[0] = EnforcedOptionParam(p.eid, MSG_SEND, sendOptions(p));
        options[1] = EnforcedOptionParam(p.eid, MSG_SEND_AND_CALL, sendAndCallOptions(p));
        IOAppOptionsType3(token).setEnforcedOptions(options);
    }

    function _validateSet(address[] memory dvns, IXofNRegistry registry) private view {
        address previous = address(0);
        for (uint256 i = 0; i < dvns.length; i++) {
            address dvn = dvns[i];
            // Terurut naik tanpa duplikat; sekaligus menolak address(0) di posisi pertama.
            if (dvn <= previous) revert DvnsNotSortedUnique();
            if (!registry.dvnAllowed(dvn)) revert DvnNotAllowed(dvn);
            previous = dvn;
        }
    }

    function _rejectOverlap(address[] memory required, address[] memory optional) private pure {
        for (uint256 i = 0; i < required.length; i++) {
            for (uint256 j = 0; j < optional.length; j++) {
                // DVN wajib yang juga opsional membuat "+1 dari 2" tidak menambah verifikator.
                if (required[i] == optional[j]) revert DvnOverlap(required[i]);
            }
        }
    }
}
