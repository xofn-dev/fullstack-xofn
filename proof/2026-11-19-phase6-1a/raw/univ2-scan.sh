#!/bin/sh
# Pindai kontrak bernama UniswapV2Router02 di explorer Robinhood testnet (read-only).
# Nama di explorer adalah klaim pihak yang memverifikasi source, BUKAN bukti siapa pemiliknya.
C="${CAST:-$HOME/.foundry/bin/cast}"
R=https://rpc.testnet.chain.robinhood.com
RM=https://rpc.mainnet.chain.robinhood.com
X=https://explorer.testnet.chain.robinhood.com
kc(){ sleep 0.2; c=$("$C" code "$1" --rpc-url "$2" 2>/dev/null); case "$c" in 0x*) echo "$(( (${#c}-2)/2 ))b $("$C" keccak "$c")";; *) echo ERR;; esac; }
call(){ sleep 0.2; "$C" call "$@" --rpc-url $R 2>&1 | head -1 | cut -c1-90; }
echo "## acuan: Uniswap v2 di Robinhood MAINNET (4663)"
echo "factory 0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f: $(kc 0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f $RM)"
echo "router  0x89e5DB8B5aA49aA85AC63f691524311AEB649eba: $(kc 0x89e5DB8B5aA49aA85AC63f691524311AEB649eba $RM)"
echo "weth    0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73: $(kc 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73 $RM)"
echo
echo "## kandidat di testnet (46630)"
curl -sS -m 30 -A "xofn-readonly-check" "$X/api/v2/search?q=UniswapV2Router02" | python3 -I -c '
import sys,json
for i in json.load(sys.stdin).get("items",[]):
    if i.get("type")=="contract": print(i["address_hash"], i.get("name"), i.get("is_smart_contract_verified"))
' | while read A NAME VER; do
  F=$(call $A 'factory()(address)'); W=$(call $A 'WETH()(address)')
  echo "router $A (nama explorer: $NAME, verified=$VER) code: $(kc $A $R)"
  echo "  factory $F code: $(kc $F $R)"
  echo "    allPairsLength: $(call $F 'allPairsLength()(uint256)')  feeTo: $(call $F 'feeTo()(address)')  feeToSetter: $(call $F 'feeToSetter()(address)')"
  echo "  WETH $W code: $(kc $W $R)  symbol: $(call $W 'symbol()(string)')  totalSupply: $(call $W 'totalSupply()(uint256)')"
  CR=$(curl -sS -m 20 -A "xofn-readonly-check" "$X/api/v2/addresses/$A" | python3 -I -c 'import sys,json
try:
    d=json.load(sys.stdin); print(d.get("creator_address_hash"), d.get("creation_transaction_hash"))
except Exception as e: print("n/a")')
  echo "  creator, tx: $CR"
done
