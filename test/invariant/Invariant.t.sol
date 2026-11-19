// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {
    ExecutorOptions
} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/libs/ExecutorOptions.sol";
import {IOFT, SendParam, MessagingFee} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";

import {XofNTestBase} from "../helpers/XofNTestBase.sol";
import {XofNCurve} from "../../contracts/XofNCurve.sol";
import {XofNGraduator} from "../../contracts/XofNGraduator.sol";
import {XofNToken} from "../../contracts/XofNToken.sol";

interface IInvariantEnv {
    function relayOne(uint256 seed) external returns (bool);

    function remoteTokenAt(uint32 eid) external view returns (address);
}

/// @dev Handler [Pola: Cognita Handler/Accounting]: aktor acak menjalankan seluruh siklus hidup
///      satu token: beli/jual di curve, graduate, expandAndLock, pengiriman pesan lintas chain
///      dalam urutan acak, retry, dan bridge setelah terkunci.
contract LifecycleHandler is Test {
    uint32 internal constant HOME = 1;
    uint32 internal constant BASE = 2;
    uint32 internal constant ARB = 3;

    XofNGraduator public immutable graduator;
    XofNToken public immutable token;
    XofNCurve public immutable curve;
    IInvariantEnv public immutable env;
    address[] public actors;

    // Penghitung untuk membuktikan fuzzer benar-benar mencapai tiap tahap.
    uint256 public buys;
    uint256 public sells;
    uint256 public graduations;
    uint256 public expansions;
    uint256 public relays;
    uint256 public bridges;
    uint256 public retries;

    constructor(
        XofNGraduator _graduator,
        XofNToken _token,
        XofNCurve _curve,
        address[] memory _actors
    ) {
        graduator = _graduator;
        token = _token;
        curve = _curve;
        env = IInvariantEnv(msg.sender);
        actors = _actors;
        for (uint256 i = 0; i < _actors.length; i++) {
            vm.prank(_actors[i]);
            _token.approve(address(_curve), type(uint256).max);
        }
    }

    function _actor(uint256 seed) private view returns (address) {
        return actors[seed % actors.length];
    }

    function _status() private view returns (XofNGraduator.Status) {
        return graduator.launchOf(address(token)).status;
    }

    function buy(uint256 actorSeed, uint256 amount) external {
        if (curve.thresholdReached()) return;
        address actor = _actor(actorSeed);
        amount = bound(amount, 1 gwei, 1.5 ether);
        vm.deal(actor, actor.balance + amount);
        vm.prank(actor);
        curve.buy{value: amount}(0);
        buys++;
    }

    function sell(uint256 actorSeed, uint256 amount) external {
        if (curve.thresholdReached()) return;
        address actor = _actor(actorSeed);
        uint256 balance = token.balanceOf(actor);
        if (balance == 0) return;
        vm.prank(actor);
        curve.sell(bound(amount, 1, balance), 0);
        sells++;
    }

    function graduate(uint256 actorSeed) external {
        if (_status() != XofNGraduator.Status.Bonding || !curve.thresholdReached()) return;
        vm.prank(_actor(actorSeed));
        graduator.graduate(address(token));
        graduations++;
    }

    /// @dev Kadang hanya membayar fee DEPLOY, supaya jalur "likuiditas tertunda" ikut teruji.
    function expand(uint256 actorSeed, bool payLiquidity) external {
        if (_status() != XofNGraduator.Status.Graduated) return;
        (uint256 deployFees, uint256 liquidityFees) = graduator.quoteExpandAndLock(address(token));
        uint256 value = deployFees + (payLiquidity ? liquidityFees : 0);
        address actor = _actor(actorSeed);
        vm.deal(actor, actor.balance + value);
        vm.prank(actor);
        graduator.expandAndLock{value: value}(address(token));
        expansions++;
    }

    function retry(uint256 actorSeed, bool base) external {
        if (_status() != XofNGraduator.Status.Expanding) return;
        uint32 eid = base ? BASE : ARB;
        uint256 fee = graduator.quoteRetry(address(token), eid);
        XofNGraduator.Step step = graduator.expansionOf(address(token), eid).step;
        if (step != XofNGraduator.Step.DeploySent && step != XofNGraduator.Step.Configured) return;
        address actor = _actor(actorSeed);
        vm.deal(actor, actor.balance + fee);
        vm.prank(actor);
        graduator.retryRemote{value: fee}(address(token), eid);
        retries++;
    }

    /// @dev Menjalankan satu pesan lintas chain yang tertunda, dipilih acak.
    function relay(uint256 seed) external {
        if (env.relayOne(seed)) relays++;
    }

    /// @dev Bridge oleh pemegang token begitu pathway punya peer (juga sebelum terkunci).
    function bridge(uint256 actorSeed, uint256 amount, uint8 route) external {
        address actor = _actor(actorSeed);
        uint32 remoteEid = route % 2 == 0 ? BASE : ARB;
        bool fromHome = (route / 2) % 2 == 0;
        address source = fromHome ? address(token) : env.remoteTokenAt(remoteEid);
        if (source == address(0)) return;
        uint32 dstEid = fromHome ? remoteEid : HOME;
        if (XofNToken(source).peers(dstEid) == bytes32(0)) return;
        uint256 balance = XofNToken(source).balanceOf(actor);
        if (balance < 1e12) return;

        SendParam memory param = SendParam({
            dstEid: dstEid,
            to: bytes32(uint256(uint160(actor))),
            amountLD: bound(amount, 1e12, balance),
            minAmountLD: 0,
            extraOptions: "",
            composeMsg: "",
            oftCmd: ""
        });
        MessagingFee memory fee = IOFT(source).quoteSend(param, false);
        vm.deal(actor, actor.balance + fee.nativeFee);
        vm.prank(actor);
        IOFT(source).send{value: fee.nativeFee}(param, fee, actor);
        bridges++;
    }
}

/// @dev Invarian protokol (PRD §9.2). Dijalankan juga dengan `--match-contract Invariant`.
contract XofNInvariantTest is XofNTestBase, IInvariantEnv {
    XofNToken internal token;
    XofNCurve internal curve;
    LifecycleHandler internal handler;

    function setUp() public override {
        super.setUp();
        (token, curve) = _launch(STANDARD, _eids(BASE, ARB));

        address[] memory actors = new address[](3);
        actors[0] = alice;
        actors[1] = bob;
        actors[2] = attacker;
        handler = new LifecycleHandler(graduator, token, curve, actors);
        targetContract(address(handler));
    }

    // ───────────────────────────── Lingkungan untuk handler ─────────────────────────────

    function remoteTokenAt(uint32 eid) public view returns (address) {
        return remotes[eid].deploymentOf(address(token)).remoteToken;
    }

    /// @dev Tujuan pesan yang mungkin punya antrean.
    function _destinations() private view returns (uint32[6] memory eids, address[6] memory dsts) {
        eids = [BASE, ARB, HOME, BASE, ARB, HOME];
        dsts = [
            address(remotes[BASE]),
            address(remotes[ARB]),
            address(graduator),
            remoteTokenAt(BASE),
            remoteTokenAt(ARB),
            address(token)
        ];
    }

    function relayOne(uint256 seed) external returns (bool) {
        require(msg.sender == address(handler), "only handler");
        (uint32[6] memory eids, address[6] memory dsts) = _destinations();
        seed %= 6;
        for (uint256 i = 0; i < 6; i++) {
            uint256 k = (seed + i) % 6;
            if (dsts[k] == address(0) || _pending(eids[k], dsts[k]) == 0) continue;
            Delivery memory d = _deliver(eids[k], dsts[k]);
            if (!d.verified) return false;
            if (!d.executed) {
                // Tetap terhitung "dalam perjalanan" sampai berhasil dijalankan.
                _requeue(eids[k], dsts[k], d.guid);
                return false;
            }
            // Pesan likuiditas membawa compose untuk Remote (peran executor).
            if (k == 3 || k == 4) {
                if (_executorOptionExists(d.options, ExecutorOptions.OPTION_TYPE_LZCOMPOSE)) {
                    _compose(eids[k], d, address(remotes[eids[k]]));
                }
            }
            return true;
        }
        return false;
    }

    function _pendingTotal() private view returns (uint256 total) {
        (uint32[6] memory eids, address[6] memory dsts) = _destinations();
        for (uint256 i = 0; i < 6; i++) {
            if (dsts[i] != address(0)) total += _pending(eids[i], dsts[i]);
        }
    }

    function _supplyAllChains() private view returns (uint256 total) {
        total = token.totalSupply();
        for (uint32 eid = BASE; eid <= ARB; eid++) {
            address remoteToken = remoteTokenAt(eid);
            if (remoteToken != address(0)) total += XofNToken(remoteToken).totalSupply();
        }
    }

    function _status() private view returns (XofNGraduator.Status) {
        return graduator.launchOf(address(token)).status;
    }

    // ───────────────────────────── Invarian ─────────────────────────────

    /// @notice Total supply di semua chain tidak pernah melebihi 999M, dan tepat 999M setiap kali
    ///         tidak ada pesan dalam perjalanan. Sebelum ekspansi, seluruhnya ada di home.
    function invariant_totalSupplyAcrossChainsIs999M() public view {
        uint256 total = _supplyAllChains();
        assertLe(total, TOTAL_SUPPLY, "minted beyond 999M");
        if (_pendingTotal() == 0) assertEq(total, TOTAL_SUPPLY, "supply lost at rest");

        XofNGraduator.Status status = _status();
        if (status == XofNGraduator.Status.Bonding || status == XofNGraduator.Status.Graduated) {
            assertEq(
                token.totalSupply(), TOTAL_SUPPLY, "home supply must be whole before expansion"
            );
            assertEq(remoteTokenAt(BASE), address(0));
            assertEq(remoteTokenAt(ARB), address(0));
        }
    }

    /// @notice Tidak ada mint di chain ekspansi di luar `_credit`: supply remote tidak pernah
    ///         melebihi yang dibakar di home.
    function invariant_remoteSupplyNeverExceedsHomeBurn() public view {
        uint256 burnedAtHome = TOTAL_SUPPLY - token.totalSupply();
        uint256 remoteSupply = _supplyAllChains() - token.totalSupply();
        assertLe(remoteSupply, burnedAtHome);
    }

    /// @notice `verify()` true jika dan hanya jika token berstatus Locked; owner dan delegate
    ///         adalah Graduator sampai saat itu, dan nol setelahnya.
    function invariant_verifyAndOwnershipFollowLockState() public view {
        (bool locked, uint8 tier,) = chains[HOME].registry.verify(address(token));
        assertEq(tier, STANDARD, "tier never changes");

        if (_status() == XofNGraduator.Status.Locked) {
            assertTrue(locked, "locked status without verify");
            assertEq(token.owner(), address(0));
            assertEq(_delegateOf(HOME, address(token)), address(0));
            assertGt(chains[HOME].registry.lockedAt(address(token)), 0);
            // Home hanya terkunci setelah SEMUA chain ekspansi terkunci.
            for (uint32 eid = BASE; eid <= ARB; eid++) {
                assertEq(
                    uint8(graduator.expansionOf(address(token), eid).step),
                    uint8(XofNGraduator.Step.RemoteLocked)
                );
                (bool remoteLocked,,) = chains[eid].registry.verify(remoteTokenAt(eid));
                assertTrue(remoteLocked, "home locked before a remote");
            }
        } else {
            assertFalse(locked, "verify true before lock");
            assertEq(token.owner(), address(graduator), "owner must stay the Graduator");
            assertEq(
                _delegateOf(HOME, address(token)),
                address(graduator),
                "delegate must stay the Graduator"
            );
            assertEq(chains[HOME].registry.lockedAt(address(token)), 0);
        }
    }

    /// @notice Token remote selalu dimiliki Remote sampai terkunci; tidak pernah dimiliki wallet.
    function invariant_remoteTokenOwnerIsRemoteOrZero() public view {
        for (uint32 eid = BASE; eid <= ARB; eid++) {
            address remoteToken = remoteTokenAt(eid);
            if (remoteToken == address(0)) continue;
            address owner = XofNToken(remoteToken).owner();
            address delegate = _delegateOf(eid, remoteToken);
            (bool locked,,) = chains[eid].registry.verify(remoteToken);
            if (locked) {
                assertEq(owner, address(0));
                assertEq(delegate, address(0));
            } else {
                assertEq(owner, address(remotes[eid]));
                assertEq(delegate, address(remotes[eid]));
            }
        }
    }

    /// @notice Curve dan Graduator selalu memegang cukup aset untuk kewajibannya.
    function invariant_accountingIsSolvent() public view {
        if (!curve.graduated()) {
            assertGe(address(curve).balance, curve.ethRaised());
            assertEq(token.balanceOf(address(curve)), TOTAL_SUPPLY - curve.tokensSold());
            assertLe(curve.tokensSold(), SALE_SUPPLY);
        } else {
            assertEq(address(curve).balance, 0);
            assertEq(token.balanceOf(address(curve)), 0);
        }

        // Graduator hanya memegang escrow fee pemanggil (plus pengembalian yang gagal). ETH curve
        // langsung masuk pool home; ETH pool ekspansi dari saldo Remote (PRD P51).
        uint256 escrow = graduator.expansionOf(address(token), BASE).feeEscrow
            + graduator.expansionOf(address(token), ARB).feeEscrow;
        assertGe(address(graduator).balance, escrow);

        // Token likuiditas ekspansi tetap di Graduator sampai dikirim.
        XofNGraduator.Launch memory l = graduator.launchOf(address(token));
        uint256 unsent;
        for (uint32 eid = BASE; eid <= ARB; eid++) {
            XofNGraduator.Step step = graduator.expansionOf(address(token), eid).step;
            if (
                l.status != XofNGraduator.Status.Bonding
                    && (step == XofNGraduator.Step.None
                        || step == XofNGraduator.Step.DeploySent
                        || step == XofNGraduator.Step.Configured)
            ) unsent += l.tokensPerChain;
        }
        assertGe(token.balanceOf(address(graduator)), unsent);
    }

    /// @dev Bukti bahwa handler bisa mencapai keadaan Locked (bukan hanya tahap awal).
    function test_handlerReachesLockedState() public {
        handler.buy(0, 1.5 ether);
        handler.buy(1, 1.5 ether);
        handler.buy(2, 1.5 ether);
        handler.graduate(0);
        handler.expand(0, true);
        for (uint256 i = 0; i < 40; i++) {
            handler.relay(i);
        }

        assertEq(uint8(_status()), uint8(XofNGraduator.Status.Locked));
        handler.bridge(0, 1_000 ether, 0);
        handler.relay(3);
        invariant_totalSupplyAcrossChainsIs999M();
        invariant_remoteSupplyNeverExceedsHomeBurn();
        invariant_verifyAndOwnershipFollowLockState();
        invariant_remoteTokenOwnerIsRemoteOrZero();
        invariant_accountingIsSolvent();
        assertGt(handler.bridges(), 0);
    }
}
