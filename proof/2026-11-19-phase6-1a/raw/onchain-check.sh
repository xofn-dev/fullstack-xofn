#!/bin/sh
# Cek read-only Robinhood testnet (Fase 1a, langkah A1). Tidak ada transaksi.
# RPC publik tanpa kredensial; boleh diganti lewat argumen pertama.
C="${CAST:-$HOME/.foundry/bin/cast}"
R="${1:-https://rpc.testnet.chain.robinhood.com}"
q(){ sleep 0.25; "$C" "$@" --rpc-url "$R" 2>&1 | tr '\n' ' ' | cut -c1-700; echo; }
code(){ sleep 0.25; c=$("$C" code "$1" --rpc-url "$R" 2>&1); case "$c" in 0x*) echo "$(( (${#c}-2)/2 )) bytes, keccak $("$C" keccak "$c")";; *) echo "ERR $(echo "$c" | head -1 | cut -c1-160)";; esac; }

EP=0x3acaaf60502791d199a5a5f0b173d78229ebfe32
SEND=0x45841dd1ca50265Da7614fC43A361e526c0e6160
RECV=0xd682ECF100f6F4284138AA925348633B0611Ae21
EXEC=0x701f3927871EfcEa1235dB722f9E608aE120d243
ULN='getUlnConfig(address,uint32)((uint64,uint8,uint8,uint8,address[],address[]))'
Z=0x0000000000000000000000000000000000000000

echo "## chain"; echo "chainId: $(q chain-id)"; echo "block:   $(q block-number)"
echo "## endpoint $EP"; echo "code: $(code $EP)"; echo "eid(): $(q call $EP 'eid()(uint32)')"
for L in $SEND $RECV; do
  echo "## lib $L"; echo "code: $(code $L)"
  echo "isRegisteredLibrary: $(q call $EP 'isRegisteredLibrary(address)(bool)' $L)"
  echo "messageLibType: $(q call $L 'messageLibType()(uint8)')"
  echo "version: $(q call $L 'version()(uint64,uint8,uint8)')"
done
echo "## executor $EXEC"; echo "code: $(code $EXEC)"
for E in 40245 40231; do
  echo "## pathway eid $E"
  echo "endpoint.isSupportedEid:      $(q call $EP 'isSupportedEid(uint32)(bool)' $E)"
  echo "endpoint.defaultSendLibrary:  $(q call $EP 'defaultSendLibrary(uint32)(address)' $E)"
  echo "endpoint.defaultReceiveLibrary: $(q call $EP 'defaultReceiveLibrary(uint32)(address)' $E)"
  echo "send.isSupportedEid:          $(q call $SEND 'isSupportedEid(uint32)(bool)' $E)"
  echo "recv.isSupportedEid:          $(q call $RECV 'isSupportedEid(uint32)(bool)' $E)"
  echo "send default UlnConfig:       $(q call $SEND "$ULN" $Z $E)"
  echo "recv default UlnConfig:       $(q call $RECV "$ULN" $Z $E)"
  echo "send default ExecutorConfig (maxMessageSize, executor): $(q call $SEND 'getExecutorConfig(address,uint32)((uint32,address))' $Z $E)"
  echo "executor.dstConfig (lzReceiveBaseGas,multBps,floorUSD,nativeCap,lzComposeBaseGas): $(q call $EXEC 'dstConfig(uint32)(uint64,uint16,uint128,uint128,uint64)' $E)"
done
echo "## DVN (Robinhood testnet)"
for D in "labs:0xa78a78a13074ed93ad447a26ec57121f29e8fec2" "horizen:0x52f615ecbcbf40e47a315c2d84d14fa2851e55b7" "paxos:0x771d83e953ca8f113f02f18206ecf8bb93da3f0a" "twinstake:0xcde82f74624525e24853b1f59c8b20a162a3d297"; do
  N=${D%%:*}; A=${D##*:}
  echo "$N $A code: $(code $A)"
  for E in 40245 40231; do echo "  dstConfig($E) (gas,multBps,floorUSD): $(q call $A 'dstConfig(uint32)(uint64,uint16,uint128)' $E)"; done
done
echo "## infrastruktur deploy"
echo "CreateX 0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed: $(code 0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed)"
echo "CREATE2 deployer 0x4e59b44847b379578588920cA78FbF26c0B4956C: $(code 0x4e59b44847b379578588920cA78FbF26c0B4956C)"
echo "SafeL2 singleton 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762: $(code 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762)"
echo "SafeL2 VERSION(): $(q call 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762 'VERSION()(string)')"
echo "SafeProxyFactory 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67: $(code 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67)"
echo "CompatibilityFallbackHandler 0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99: $(code 0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99)"
echo "## Uniswap v2 (kandidat alamat)"
for U in "router-alamat-RH-mainnet:0x89e5DB8B5aA49aA85AC63f691524311AEB649eba" "factory-alamat-RH-mainnet:0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f" "weth-alamat-RH-mainnet:0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" "router-alamat-Base/Arb:0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24" "factory-alamat-Base:0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6" "router-alamat-Ethereum:0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" "factory-alamat-Ethereum:0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f" "weth-predeploy-OP-style:0x4200000000000000000000000000000000000006"; do
  N=${U%%:*}; A=${U##*:}; echo "$N $A: $(code $A)"
done
