// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {OFT} from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title XofNToken
/// @notice Token OFT XofN. OFT sejak tahap 1 (deployguide §aturan 1).
/// @dev Aturan yang dijaga kontrak ini (PRD §5.1):
///      - Supply tetap 999.000.000. Di home chain seluruhnya di-mint sekali di constructor ke
///        bonding curve. Di chain ekspansi supply awal 0.
///      - Tidak ada `mint` publik, `pause`, `setFee`, `blacklist`, atau `upgrade`. Satu-satunya
///        jalur mint setelah constructor adalah `_credit` bawaan OFT, yang hanya terpanggil lewat
///        `lzReceive` dari endpoint dan peer yang benar.
///      - `renounceOwnership()` menolkan delegate di endpoint lebih dulu (celah QUIP-25): tanpa
///        itu delegate lama tetap bisa mengubah konfigurasi dan tidak bisa dicabut lagi.
///      - Ownership tidak bisa dipindahkan. Owner adalah kontrak pen-deploy (Graduator di home,
///        Remote di chain ekspansi) sampai dilepas lewat `renounceOwnership()`.
///      - Kontrak ini tidak punya jalur ke `setConfig` / `setSendLibrary` / `setReceiveLibrary`
///        di endpoint. Itu penting: endpoint selalu mengizinkan OApp itu sendiri, jadi
///        "owner = 0 dan delegate = 0" hanya berarti terkunci bila jalur itu memang tidak ada.
///      Shared decimals mengikuti bawaan OFT (6): satuan terkecil lintas chain = 0,000001 token.
contract XofNToken is OFT {
    uint256 public constant TOTAL_SUPPLY = 999_000_000 ether;

    error OwnershipTransferDisabled();

    /// @param _name            Nama token.
    /// @param _symbol          Ticker.
    /// @param _endpoint        EndpointV2 chain ini.
    /// @param _owner           Owner sekaligus delegate awal (Graduator atau Remote).
    /// @param _supplyRecipient Penerima seluruh supply. `address(0)` di chain ekspansi (supply 0).
    constructor(
        string memory _name,
        string memory _symbol,
        address _endpoint,
        address _owner,
        address _supplyRecipient
    ) OFT(_name, _symbol, _endpoint, _owner) Ownable(_owner) {
        if (_supplyRecipient != address(0)) {
            _mint(_supplyRecipient, TOTAL_SUPPLY);
        }
    }

    /// @notice Melepas ownership DAN delegate. Tidak bisa dibatalkan.
    /// @dev Panggilan ke endpoint terjadi sebelum state owner berubah. Endpoint adalah kontrak
    ///      tepercaya dan `setDelegate` tidak memanggil balik, jadi urutan ini aman.
    function renounceOwnership() public override onlyOwner {
        endpoint.setDelegate(address(0));
        super.renounceOwnership();
    }

    /// @dev Ditutup supaya owner tidak pernah bisa menjadi wallet (deployguide §aturan 2).
    function transferOwnership(address) public view override onlyOwner {
        revert OwnershipTransferDisabled();
    }
}
