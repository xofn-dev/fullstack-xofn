// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {XofNTestBase} from "../helpers/XofNTestBase.sol";
import {XofNToken} from "../../contracts/XofNToken.sol";
import {Create3} from "../../contracts/libraries/Create3.sol";
import {XofNTokenDeployer} from "../../contracts/libraries/XofNTokenDeployer.sol";

contract Create3Harness {
    function deploy(bytes32 salt, bytes memory initCode) external returns (address) {
        return Create3.deploy(salt, initCode);
    }

    function predict(bytes32 salt) external view returns (address) {
        return Create3.predict(address(this), salt);
    }
}

contract Dummy {
    uint256 public immutable value;

    constructor(uint256 _value) {
        value = _value;
    }
}

/// @dev Alamat token hanya bergantung pada (kontrak pen-deploy, salt). Pihak lain tidak bisa
///      mendahului alamat itu (PRD P39).
contract Create3Test is XofNTestBase {
    Create3Harness internal harness;

    function setUp() public override {
        super.setUp();
        harness = new Create3Harness();
    }

    function test_addressIsIndependentOfBytecode() public {
        bytes32 salt = keccak256("salt");
        address predicted = harness.predict(salt);
        address deployed =
            harness.deploy(salt, abi.encodePacked(type(Dummy).creationCode, abi.encode(7)));
        assertEq(deployed, predicted);
        assertEq(Dummy(deployed).value(), 7);

        // Deployer lain dengan salt yang sama mendapat alamat lain, apa pun bytecode-nya.
        Create3Harness other = new Create3Harness();
        address elsewhere =
            other.deploy(salt, abi.encodePacked(type(Dummy).creationCode, abi.encode(9)));
        assertTrue(elsewhere != deployed);
        assertEq(elsewhere, other.predict(salt));
    }

    function test_sameSaltCannotBeUsedTwice() public {
        bytes32 salt = keccak256("salt");
        harness.deploy(salt, abi.encodePacked(type(Dummy).creationCode, abi.encode(1)));
        vm.expectRevert(Create3.Create3ProxyFailed.selector);
        harness.deploy(salt, abi.encodePacked(type(Dummy).creationCode, abi.encode(2)));
    }

    function test_failedConstructorReverts() public {
        vm.expectRevert(Create3.Create3DeployFailed.selector);
        harness.deploy(keccak256("bad"), hex"fe"); // INVALID
    }

    /// @dev Token home dan token ekspansi mengikuti rumus yang sama dengan salt yang sama.
    ///      Alamatnya seragam antar-chain hanya bila Graduator dan Remote beralamat sama.
    function test_tokenAddressesFollowDeployerAndSalt() public {
        (XofNToken token,) = _launchGraduateExpand(STANDARD, _eids(BASE, ARB));
        bytes32 salt = graduator.launchOf(address(token)).salt;

        assertEq(address(token), XofNTokenDeployer.predict(address(graduator), salt));
        assertEq(
            address(_remoteToken(token, BASE)),
            XofNTokenDeployer.predict(address(remotes[BASE]), salt)
        );
        assertEq(
            address(_remoteToken(token, ARB)),
            XofNTokenDeployer.predict(address(remotes[ARB]), salt)
        );
        // Pihak lain tidak bisa menghasilkan alamat itu dengan salt yang sama.
        assertTrue(XofNTokenDeployer.predict(attacker, salt) != address(token));
    }

    function test_eachLaunchGetsDistinctSaltAndAddress() public {
        (XofNToken a,) = _launch(STANDARD, _eids(BASE));
        (XofNToken b,) = _launch(STANDARD, _eids(BASE));
        assertTrue(address(a) != address(b));
        assertTrue(graduator.launchOf(address(a)).salt != graduator.launchOf(address(b)).salt);
        assertEq(graduator.launchCount(), 2);
    }
}
