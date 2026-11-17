// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {OFT} from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev "Token aneh" untuk tes Registry: OFT biasa yang `renounceOwnership`-nya TIDAK menolkan
///      delegate (celah QUIP-25). Dipakai untuk membuktikan `verify` menolak delegate != 0.
contract MockLooseOFT is OFT {
    constructor(address _endpoint, address _owner)
        OFT("Loose", "LOOSE", _endpoint, _owner)
        Ownable(_owner)
    {
        _mint(_owner, 1_000_000 ether);
    }
}
