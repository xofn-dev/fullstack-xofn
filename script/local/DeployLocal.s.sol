// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {
    EndpointV2Mock
} from "@layerzerolabs/test-devtools-evm-foundry/contracts/mocks/EndpointV2Mock.sol";
import {
    SendUln302Mock
} from "@layerzerolabs/test-devtools-evm-foundry/contracts/mocks/SendUln302Mock.sol";
import {
    ReceiveUln302Mock
} from "@layerzerolabs/test-devtools-evm-foundry/contracts/mocks/ReceiveUln302Mock.sol";
import {
    ExecutorMock
} from "@layerzerolabs/test-devtools-evm-foundry/contracts/mocks/ExecutorMock.sol";
import {
    ExecutorFeeLibMock
} from "@layerzerolabs/test-devtools-evm-foundry/contracts/mocks/ExecutorFeeLibMock.sol";
import {
    PriceFeedMock
} from "@layerzerolabs/test-devtools-evm-foundry/contracts/mocks/PriceFeedMock.sol";
import {IExecutor} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/interfaces/IExecutor.sol";
import {
    ILayerZeroPriceFeed
} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/interfaces/ILayerZeroPriceFeed.sol";
import {
    UlnConfig,
    SetDefaultUlnConfigParam
} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import {
    ExecutorConfig,
    SetDefaultExecutorConfigParam
} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol";
import {
    SetConfigParam
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";

import {XofNCurve} from "../../contracts/XofNCurve.sol";
import {XofNGraduator} from "../../contracts/XofNGraduator.sol";
import {XofNPoolGuard} from "../../contracts/XofNPoolGuard.sol";
import {XofNRegistry} from "../../contracts/XofNRegistry.sol";
import {XofNRemote} from "../../contracts/XofNRemote.sol";
import {TierLib} from "../../contracts/libraries/TierLib.sol";
import {MockDVN} from "../../test/mocks/MockDVN.sol";
import {LocalRelay} from "./LocalRelay.sol";

/// @title DeployLocal
/// @notice Deploy seluruh stack XofN ke SATU node Anvil (chain ID 31337) untuk Phase 3–4.
/// @dev HANYA UNTUK ANVIL. Script ini menolak chain ID lain. Script deploy jaringan publik
///      (01_DeployCore dst.) termasuk Phase 6–7 yang FROZEN dan tidak ada di repo.
///
///      Tiga "chain" disimulasikan sebagai tiga endpoint LayerZero tiruan di node yang sama:
///      EID 1 = Robinhood (home), 2 = Base, 3 = Arbitrum. DVN dan executor tiruan; `LocalRelay`
///      mengantar pesan antar-endpoint.
///
///      AMM-nya Uniswap v4 ASLI: tiap "chain" mendapat PoolManager dan PositionManager sendiri,
///      di-deploy dari artefak bawaan paket npm resmi (dikompilasi Uniswap dengan solc 0.8.26;
///      repo ini dipin 0.8.24). Untuk aplikasi (Phase 4) ikut di-deploy V4Quoter, StateView, dan
///      `MockV4Router` (router UJI bawaan paket periphery; BUKAN Universal Router). Hook penjaga
///      tiap Graduator/Remote ditaruh di alamat ber-flag lewat CREATE2 dengan salt hasil tambang
///      (lihat `_deployGuardForNextContract` untuk bedanya dengan jaringan publik).
///
///      Cara pakai (akun dev Anvil yang sudah ter-unlock; tanpa private key atau keystore):
///        anvil
///        forge script script/local/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 \
///          --broadcast --slow --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
///      `--slow` wajib: tanpa itu forge mengirim transaksi sekaligus, satu blok Anvil penuh
///      (30M gas), dan transaksi sisanya tidak pernah ditambang karena automine hanya terpicu
///      oleh transaksi baru.
///      Hasilnya ditulis ke deployments/local.json. `deployBlock` di sana adalah blok saat script
///      mulai (batas bawah untuk pemindaian event). Setelah itu pesan lintas chain diantar dengan
///      `cast send <localRelay> "deliverNext()"` sampai `pendingCount()` nol.
contract DeployLocal is Script {
    uint32 internal constant HOME = 1;
    uint32 internal constant BASE = 2;
    uint32 internal constant ARB = 3;

    // Parameter milik owner (PRD P8, P15, P16) — di sini konstanta simulasi lokal saja.
    uint256 internal constant SALE_SUPPLY = 799_200_000 ether;
    uint256 internal constant START_PRICE = 1_500_000_000;
    uint256 internal constant GRADUATION_THRESHOLD = 4 ether;
    uint256 internal constant CALLER_REWARD = 0.01 ether;
    uint256 internal constant EXPANSION_PAIR_ETH = 0.04 ether;
    address internal constant LP_RECIPIENT = address(0xdead);
    // Saldo awal tiap XofNRemote: ETH pasangan + fee ack dibayar dari sini (PRD P51). Di jaringan
    // publik pengisian ini tugas tim/PM, bukan script.
    uint256 internal constant REMOTE_FUNDING = 5 ether;

    string internal constant V4_CORE_OUT = "node_modules/@uniswap/v4-core/out/";
    string internal constant V4_PERIPHERY_OUT = "node_modules/@uniswap/v4-periphery/foundry-out/";
    /// @dev Alamat kanonik Permit2. Tidak di-deploy: jalur XofN tidak memakai Permit2.
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    struct ChainEnv {
        address endpoint;
        address sendLib;
        address receiveLib;
        address executor;
        address poolManager;
        address positionManager;
        address poolGuard; // hook penjaga Graduator (home) atau Remote (ekspansi)
        address swapRouter; // MockV4Router: router uji untuk panel trading lokal
        address quoter;
        address stateView;
        address registry;
        address[] dvns;
    }

    mapping(uint32 eid => ChainEnv) internal env;
    mapping(uint32 eid => address) internal remotes;
    address internal deployer;
    LocalRelay internal relay;
    PriceFeedMock internal priceFeed;
    XofNGraduator internal graduator;
    address internal curveImplementation;

    function run() external {
        require(block.chainid == 31337, "DeployLocal: Anvil (chain ID 31337) only");
        deployer = msg.sender;
        vm.startBroadcast();

        relay = new LocalRelay();
        (bool funded,) = address(relay).call{value: 50 ether}("");
        require(funded, "relay funding failed");
        priceFeed = new PriceFeedMock(deployer);
        priceFeed.setNativeTokenPriceUSD(1e20);

        for (uint32 eid = HOME; eid <= ARB; eid++) {
            _deployChain(eid);
        }
        for (uint32 eid = HOME; eid <= ARB; eid++) {
            _configureChain(eid);
        }

        _deployHome();
        _deployRemote(BASE);
        _deployRemote(ARB);

        vm.stopBroadcast();
        _writeManifest();
    }

    // ───────────────────────────── LayerZero tiruan ─────────────────────────────

    function _deployChain(uint32 eid) private {
        ChainEnv storage c = env[eid];
        c.endpoint = address(new EndpointV2Mock(eid, deployer));
        relay.setEndpoint(eid, c.endpoint);

        c.sendLib = address(new SendUln302Mock(payable(address(relay)), c.endpoint, 1e12, 100_000));
        c.receiveLib = address(new ReceiveUln302Mock(c.endpoint));
        EndpointV2Mock(c.endpoint).registerLibrary(c.sendLib);
        EndpointV2Mock(c.endpoint).registerLibrary(c.receiveLib);

        address[] memory libs = new address[](2);
        libs[0] = c.sendLib;
        libs[1] = c.receiveLib;
        address[] memory admins = new address[](1);
        admins[0] = deployer;
        ExecutorMock executor =
            new ExecutorMock(c.endpoint, address(0), libs, address(priceFeed), deployer, admins);
        executor.setWorkerFeeLib(address(new ExecutorFeeLibMock(eid)));
        c.executor = address(executor);

        address[] memory dvns = new address[](5);
        for (uint256 i = 0; i < 5; i++) {
            dvns[i] = address(new MockDVN(0.0001 ether));
        }
        _sort(dvns);
        for (uint256 i = 0; i < 5; i++) {
            c.dvns.push(dvns[i]);
        }

        _deployUniswapV4(c);
        c.registry = address(new XofNRegistry(c.endpoint, deployer));
        for (uint256 i = 0; i < 5; i++) {
            XofNRegistry(c.registry).setDvnAllowed(dvns[i], true);
        }
    }

    /// @dev Default pathway (library, ULN 1 DVN, executor) untuk setiap EID lain, seperti
    ///      endpoint sungguhan yang selalu punya default. Resep XofN menimpanya secara eksplisit.
    function _configureChain(uint32 eid) private {
        ChainEnv storage c = env[eid];
        address[] memory defaultDvns = new address[](1);
        defaultDvns[0] = c.dvns[0];

        IExecutor.DstConfigParam[] memory dstConfigs = new IExecutor.DstConfigParam[](2);
        uint256 k;
        for (uint32 other = HOME; other <= ARB; other++) {
            if (other == eid) continue;

            SetDefaultUlnConfigParam[] memory uln = new SetDefaultUlnConfigParam[](1);
            uln[0] = SetDefaultUlnConfigParam(
                other, UlnConfig(100, 1, 0, 0, defaultDvns, new address[](0))
            );
            SendUln302Mock(payable(c.sendLib)).setDefaultUlnConfigs(uln);
            ReceiveUln302Mock(c.receiveLib).setDefaultUlnConfigs(uln);

            SetDefaultExecutorConfigParam[] memory exec = new SetDefaultExecutorConfigParam[](1);
            exec[0] = SetDefaultExecutorConfigParam(other, ExecutorConfig(10_000, c.executor));
            SendUln302Mock(payable(c.sendLib)).setDefaultExecutorConfigs(exec);

            EndpointV2Mock(c.endpoint).setDefaultSendLibrary(other, c.sendLib);
            EndpointV2Mock(c.endpoint).setDefaultReceiveLibrary(other, c.receiveLib, 0);

            dstConfigs[k++] = IExecutor.DstConfigParam({
                dstEid: other,
                lzReceiveBaseGas: 5000,
                lzComposeBaseGas: 5000,
                multiplierBps: 10_000,
                floorMarginUSD: 1e10,
                nativeCap: 0.1 ether
            });

            ILayerZeroPriceFeed.UpdatePrice[] memory prices =
                new ILayerZeroPriceFeed.UpdatePrice[](1);
            prices[0] =
                ILayerZeroPriceFeed.UpdatePrice(other, ILayerZeroPriceFeed.Price(1e20, 1, 1));
            priceFeed.setPrice(prices);
        }
        ExecutorMock(c.executor).setDstConfig(dstConfigs);
    }

    // ───────────────────────────── Kontrak XofN ─────────────────────────────

    function _pathway(uint32 localEid, uint32 remoteEid)
        private
        view
        returns (TierLib.Pathway memory p)
    {
        ChainEnv storage c = env[localEid];
        p.eid = remoteEid;
        p.sendLib = c.sendLib;
        p.receiveLib = c.receiveLib;
        p.executor = c.executor;
        p.maxMessageSize = 10_000;
        p.confirmations = 15;
        p.receiveGas = 300_000;
        p.composeGas = 100_000;
        // Dari lima DVN terurut a0..a4: Standard {a0,a2}; Fortress {a0,a2,a4}; opsional {a1,a3}.
        p.standardRequired = new address[](2);
        p.standardRequired[0] = c.dvns[0];
        p.standardRequired[1] = c.dvns[2];
        p.fortressRequired = new address[](3);
        p.fortressRequired[0] = c.dvns[0];
        p.fortressRequired[1] = c.dvns[2];
        p.fortressRequired[2] = c.dvns[4];
        p.optionalDvns = new address[](2);
        p.optionalDvns[0] = c.dvns[1];
        p.optionalDvns[1] = c.dvns[3];
    }

    // ───────────────────────────── Uniswap v4 ─────────────────────────────

    function _deployUniswapV4(ChainEnv storage c) private {
        c.poolManager =
            deployCode(string.concat(V4_CORE_OUT, "PoolManager.sol/PoolManager.json"), abi.encode(deployer));
        c.positionManager = deployCode(
            string.concat(V4_PERIPHERY_OUT, "PositionManager.sol/PositionManager.json"),
            // (poolManager, permit2, unsubscribeGasLimit, tokenDescriptor, weth9). Deskriptor dan
            // WETH9 hanya dipakai tokenURI dan aksi WRAP/UNWRAP, yang tidak dipakai XofN.
            abi.encode(c.poolManager, PERMIT2, uint256(100_000), address(0), address(0xE770))
        );
        bytes memory managerArg = abi.encode(c.poolManager);
        c.swapRouter =
            deployCode(string.concat(V4_PERIPHERY_OUT, "MockV4Router.sol/MockV4Router.json"), managerArg);
        c.quoter = deployCode(string.concat(V4_PERIPHERY_OUT, "V4Quoter.sol/V4Quoter.json"), managerArg);
        c.stateView =
            deployCode(string.concat(V4_PERIPHERY_OUT, "StateView.sol/StateView.json"), managerArg);
    }

    /// @notice Men-deploy hook penjaga untuk kontrak yang akan di-deploy `deployer` TEPAT SETELAH
    ///         transaksi ini (nonce berikutnya + 1).
    /// @dev Izin hook v4 ada di 14 bit terendah alamatnya, jadi salt CREATE2 ditambang sampai
    ///      alamatnya hanya ber-flag `beforeInitialize`. `new X{salt: ..}` saat broadcast dikirim
    ///      lewat deployer CREATE2 kanonik (0x4e59…956C).
    ///
    ///      HANYA UNTUK ANVIL: alamat kontrak berikutnya diprediksi dari nonce EOA, yang hanya
    ///      benar bila hook dan kontrak itu dua transaksi berurutan dari EOA yang sama. Di
    ///      jaringan publik cara itu rapuh (transaksi tersisip, `--resume`, Safe). Di sana alamat
    ///      Graduator/Remote diketahui lebih dulu lewat CREATE3 (CreateX) dengan salt yang
    ///      terikat pengirim; yang sama hanyalah penambangan salt hook-nya.
    function _deployGuardForNextContract() private returns (address guard) {
        address seeder = vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 1);
        bytes32 initCodeHash =
            keccak256(abi.encodePacked(type(XofNPoolGuard).creationCode, abi.encode(seeder)));
        bytes32 salt;
        for (uint256 i = 0;; i++) {
            salt = bytes32(i);
            guard = vm.computeCreate2Address(salt, initCodeHash, CREATE2_FACTORY);
            if (uint160(guard) & Hooks.ALL_HOOK_MASK == Hooks.BEFORE_INITIALIZE_FLAG) break;
        }
        // Alamat CREATE2 ditentukan initcode (termasuk `seeder`), jadi kode di alamat itu pasti
        // hook yang sama: dipakai apa adanya. Menambang salt lain akan gagal diam-diam bila
        // pihak lain men-deploy hook identik lebih dulu (review 19 Nov 2026, LOW-4).
        if (guard.code.length != 0) {
            require(XofNPoolGuard(guard).seeder() == seeder, "foreign code at guard address");
            return guard;
        }
        require(address(new XofNPoolGuard{salt: salt}(seeder)) == guard, "guard address mismatch");
    }

    function _deployHome() private {
        curveImplementation = address(new XofNCurve());
        env[HOME].poolGuard = _deployGuardForNextContract();

        TierLib.Pathway[] memory pathways = new TierLib.Pathway[](2);
        pathways[0] = _pathway(HOME, BASE);
        pathways[1] = _pathway(HOME, ARB);
        XofNGraduator.ExpansionGas[] memory gas = new XofNGraduator.ExpansionGas[](2);
        // deployGas, seedGas: ±1,6x dan ±2x pemakaian terukur (test/lz/GasMeasure.t.sol).
        gas[0] = XofNGraduator.ExpansionGas(7_000_000, 2_500_000);
        gas[1] = gas[0];

        graduator = new XofNGraduator(
            env[HOME].endpoint,
            deployer,
            XofNGraduator.Infra(
                env[HOME].registry,
                curveImplementation,
                env[HOME].positionManager,
                env[HOME].poolGuard,
                LP_RECIPIENT
            ),
            XofNGraduator.Economics(
                SALE_SUPPLY, START_PRICE, GRADUATION_THRESHOLD, CALLER_REWARD, EXPANSION_PAIR_ETH
            ),
            pathways,
            gas
        );
        XofNRegistry(env[HOME].registry).setRegistrar(address(graduator));
    }

    function _deployRemote(uint32 eid) private {
        env[eid].poolGuard = _deployGuardForNextContract();
        XofNRemote remote = new XofNRemote(
            env[eid].endpoint,
            deployer,
            XofNRemote.Infra(
                env[eid].registry,
                env[eid].positionManager,
                env[eid].poolGuard,
                LP_RECIPIENT,
                HOME,
                1_500_000,
                1_500_000
            ),
            _pathway(eid, HOME)
        );
        remotes[eid] = address(remote);
        XofNRegistry(env[eid].registry).setRegistrar(address(remote));
        (bool funded,) = address(remote).call{value: REMOTE_FUNDING}("");
        require(funded, "remote funding failed");

        graduator.setPeer(eid, bytes32(uint256(uint160(address(remote)))));
        remote.setPeer(HOME, bytes32(uint256(uint160(address(graduator)))));
        // Pathway infrastruktur dengan resep Fortress, kedua arah (deployguide §7.2).
        _wireInfra(address(graduator), HOME, eid);
        _wireInfra(address(remote), eid, HOME);
    }

    function _wireInfra(address oapp, uint32 localEid, uint32 remoteEid) private {
        TierLib.Pathway memory p = _pathway(localEid, remoteEid);
        EndpointV2Mock endpoint = EndpointV2Mock(env[localEid].endpoint);
        bytes memory uln = abi.encode(TierLib.ulnConfig(p, TierLib.TIER_FORTRESS));

        endpoint.setSendLibrary(oapp, remoteEid, p.sendLib);
        endpoint.setReceiveLibrary(oapp, remoteEid, p.receiveLib, 0);
        SetConfigParam[] memory sendParams = new SetConfigParam[](2);
        sendParams[0] = SetConfigParam(remoteEid, 1, abi.encode(TierLib.executorConfig(p)));
        sendParams[1] = SetConfigParam(remoteEid, 2, uln);
        endpoint.setConfig(oapp, p.sendLib, sendParams);
        SetConfigParam[] memory receiveParams = new SetConfigParam[](1);
        receiveParams[0] = SetConfigParam(remoteEid, 2, uln);
        endpoint.setConfig(oapp, p.receiveLib, receiveParams);
    }

    // ───────────────────────────── Manifest ─────────────────────────────

    /// @dev Tiap entri `chains.<key>` berbentuk sama dengan `deployments/<network>.json` di
    ///      deployguide §2, supaya pembaca manifest di Phase 4 memakai satu bentuk.
    function _writeManifest() private {
        string memory chainsJson;
        chainsJson = vm.serializeString("chains", "robinhood", _chainJson("robinhood", HOME));
        chainsJson = vm.serializeString("chains", "base", _chainJson("base", BASE));
        chainsJson = vm.serializeString("chains", "arbitrum", _chainJson("arbitrum", ARB));

        vm.serializeString("root", "network", "local");
        vm.serializeString(
            "root",
            "note",
            "Anvil only. Mock LayerZero endpoints and DVNs; a local Uniswap v4 deployment with a test swap router. Not a public deployment."
        );
        vm.serializeUint("root", "chainId", block.chainid);
        vm.serializeAddress("root", "localRelay", address(relay));
        string memory root = vm.serializeString("root", "chains", chainsJson);
        vm.writeJson(root, "deployments/local.json");
    }

    function _chainJson(string memory key, uint32 eid) private returns (string memory) {
        ChainEnv storage c = env[eid];

        string memory contractsKey = string.concat(key, ".contracts");
        if (eid == HOME) {
            vm.serializeAddress(contractsKey, "XofNGraduator", address(graduator));
            vm.serializeAddress(contractsKey, "XofNCurveImplementation", curveImplementation);
        } else {
            vm.serializeAddress(contractsKey, "XofNRemote", remotes[eid]);
        }
        string memory contractsJson = vm.serializeAddress(contractsKey, "XofNRegistry", c.registry);

        // Uniswap v4 lokal. `swapRouter` adalah router UJI; alamat ini hanya ada di manifest lokal.
        string memory v4Key = string.concat(key, ".uniswapV4");
        vm.serializeAddress(v4Key, "poolManager", c.poolManager);
        vm.serializeAddress(v4Key, "positionManager", c.positionManager);
        vm.serializeAddress(v4Key, "poolGuard", c.poolGuard);
        vm.serializeAddress(v4Key, "swapRouter", c.swapRouter);
        vm.serializeAddress(v4Key, "quoter", c.quoter);
        string memory v4Json = vm.serializeAddress(v4Key, "stateView", c.stateView);

        string memory mocksKey = string.concat(key, ".mocks");
        vm.serializeAddress(mocksKey, "sendLib", c.sendLib);
        vm.serializeAddress(mocksKey, "receiveLib", c.receiveLib);
        vm.serializeAddress(mocksKey, "executor", c.executor);
        string memory mocksJson = vm.serializeAddress(mocksKey, "dvns", c.dvns);

        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "eid", eid);
        vm.serializeAddress(key, "endpointV2", c.endpoint);
        vm.serializeString(key, "contracts", contractsJson);
        vm.serializeString(key, "mocks", mocksJson);
        vm.serializeString(key, "uniswapV4", v4Json);
        vm.serializeAddress(key, "owner", deployer);
        vm.serializeUint(key, "deployBlock", block.number);
        return vm.serializeBool(key, "verifiedSource", false);
    }

    function _sort(address[] memory list) private pure {
        for (uint256 i = 1; i < list.length; i++) {
            address value = list[i];
            uint256 j = i;
            while (j > 0 && list[j - 1] > value) {
                list[j] = list[j - 1];
                j--;
            }
            list[j] = value;
        }
    }
}
