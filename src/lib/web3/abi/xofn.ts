import { parseAbi } from 'viem';

// ABI kontrak XofN yang dipakai aplikasi. Ditulis tangan dari artefak `out/` (Phase 3) dan
// dicocokkan kembali dengan artefak itu oleh tests/web3.test.ts selama `out/` ada.
// `Status` dan `Step` adalah enum Solidity, jadi di ABI berupa uint8 (lihat src/types/enums.ts).

const PATHWAY_TUPLE =
  '(uint32 eid, address sendLib, address receiveLib, address executor, uint32 maxMessageSize, uint64 confirmations, uint128 receiveGas, uint128 composeGas, address[] standardRequired, address[] fortressRequired, address[] optionalDvns)';

export const graduatorAbi = parseAbi([
  'function launch(string name, string symbol, uint8 tier, uint32[] eids, bytes32 metadataHash) returns (address token, address curve)',
  'function graduate(address token)',
  'function expandAndLock(address token) payable',
  'function retryRemote(address token, uint32 eid) payable',
  'function quoteExpandAndLock(address token) view returns (uint256 deployFees, uint256 liquidityFees)',
  'function quoteRetry(address token, uint32 eid) view returns (uint256)',
  'function launchOf(address token) view returns ((address curve, address creator, uint8 tier, uint8 status, uint8 remotesLocked, bytes32 poolId, uint256 positionId, address payer, bytes32 salt, uint256 tokensPerChain, uint32[] eids))',
  'function expansionOf(address token, uint32 eid) view returns ((uint8 step, address remoteToken, uint256 feeEscrow))',
  `function pathwayOf(uint32 eid) view returns (${PATHWAY_TUPLE})`,
  'function expansionEids() view returns (uint32[])',
  'function tierAvailable(uint8 tier, uint32 eid) view returns (bool)',
  'function tokenCount() view returns (uint256)',
  'function tokenAt(uint256 index) view returns (address)',
  'function launchCount() view returns (uint256)',
  'function saleSupply() view returns (uint256)',
  'function startPrice() view returns (uint256)',
  'function graduationThreshold() view returns (uint256)',
  'function callerReward() view returns (uint256)',
  'function expansionPairEth() view returns (uint256)',
  'function registry() view returns (address)',
  'function positionManager() view returns (address)',
  'function poolGuard() view returns (address)',
  'function lpRecipient() view returns (address)',
  'function poolKeyOf(address token) view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks))',
  'function homeEid() view returns (uint32)',
  'function peers(uint32 eid) view returns (bytes32 peer)',
  'event Launched(address indexed token, address indexed curve, address indexed creator, uint8 tier, uint32[] eids, bytes32 metadataHash)',
  'event Graduated(address indexed token, address indexed caller, bytes32 indexed poolId, uint256 positionId, uint256 poolTokens, uint256 poolEth, uint256 tokensPerChain)',
  'event ExpansionStarted(address indexed token, address indexed caller)',
  'event ExpansionStep(address indexed token, uint32 indexed eid, uint8 step, bytes32 guid)',
  'event LiquidityDeferred(address indexed token, uint32 indexed eid)',
  'event RefundFailed(address indexed to, uint256 amount)',
  'event Locked(address indexed token, uint8 tier)',
]);

export const curveAbi = parseAbi([
  'function buy(uint256 minTokensOut) payable returns (uint256 tokensOut)',
  'function sell(uint256 tokensIn, uint256 minEthOut) returns (uint256 ethOut)',
  'function quoteBuy(uint256 ethIn) view returns (uint256 tokensOut, uint256 ethUsed)',
  'function quoteSell(uint256 tokensIn) view returns (uint256 ethOut)',
  'function currentPrice() view returns (uint256)',
  'function ethRaised() view returns (uint256)',
  'function tokensSold() view returns (uint256)',
  'function saleSupply() view returns (uint256)',
  'function graduationThreshold() view returns (uint256)',
  'function virtualEth() view returns (uint256)',
  'function virtualTokens() view returns (uint256)',
  'function thresholdReached() view returns (bool)',
  'function graduated() view returns (bool)',
  'function token() view returns (address)',
  'event Bought(address indexed buyer, uint256 ethIn, uint256 tokensOut, uint256 ethRaised)',
  'event Sold(address indexed seller, uint256 tokensIn, uint256 ethOut, uint256 ethRaised)',
  'event CurveGraduated(uint256 ethAmount, uint256 tokenAmount)',
]);

const SEND_PARAM_TUPLE =
  '(uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd)';
const FEE_TUPLE = '(uint256 nativeFee, uint256 lzTokenFee)';

export const tokenAbi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function owner() view returns (address)',
  'function endpoint() view returns (address)',
  'function peers(uint32 eid) view returns (bytes32 peer)',
  'function sharedDecimals() view returns (uint8)',
  'function decimalConversionRate() view returns (uint256)',
  `function quoteSend(${SEND_PARAM_TUPLE} _sendParam, bool _payInLzToken) view returns (${FEE_TUPLE} msgFee)`,
  `function send(${SEND_PARAM_TUPLE} _sendParam, ${FEE_TUPLE} _fee, address _refundAddress) payable returns ((bytes32 guid, uint64 nonce, ${FEE_TUPLE} fee) msgReceipt, (uint256 amountSentLD, uint256 amountReceivedLD) oftReceipt)`,
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event OFTSent(bytes32 indexed guid, uint32 dstEid, address indexed fromAddress, uint256 amountSentLD, uint256 amountReceivedLD)',
  'event OFTReceived(bytes32 indexed guid, uint32 srcEid, address indexed toAddress, uint256 amountReceivedLD)',
]);

export const registryAbi = parseAbi([
  'function registrar() view returns (address)',
  'function verify(address token) view returns (bool locked, uint8 tier, uint32[] eids)',
  'function verifyEid(address token, uint32 eid) view returns (bool)',
  'function isRegistered(address token) view returns (bool)',
  'function tierOf(address token) view returns (uint8)',
  'function lockedAt(address token) view returns (uint64)',
  'event TokenRegistered(address indexed token, uint8 tier, uint32[] eids)',
  'event TokenLocked(address indexed token, uint8 tier, uint32[] eids)',
]);

export const remoteAbi = parseAbi([
  'function deploymentOf(address homeToken) view returns ((address remoteToken, uint8 state, uint8 tier, bytes32 poolId, uint256 positionId))',
  'function homeTokenOf(address remoteToken) view returns (address homeToken)',
  'function quoteAck(address homeToken) view returns (uint256)',
  'function reAck(address homeToken) payable',
  'function registry() view returns (address)',
  'function poolKeyOf(address remoteToken) view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks))',
  'event TokenDeployed(address indexed homeToken, address indexed remoteToken, uint8 tier)',
  'event PoolSeeded(address indexed homeToken, address indexed remoteToken, bytes32 indexed poolId, uint256 positionId, uint256 tokenAmount, uint256 ethAmount)',
  'event RemoteLocked(address indexed homeToken, address indexed remoteToken)',
  'event AckSent(address indexed homeToken, uint8 kind, bytes32 guid)',
  'event AckDeferred(address indexed homeToken, uint8 kind)',
]);

// EndpointV2: hanya bagian compose (retryCompose) dan delegate.
export const endpointComposeAbi = parseAbi([
  'function delegates(address oapp) view returns (address)',
  'function composeQueue(address from, address to, bytes32 guid, uint16 index) view returns (bytes32 messageHash)',
  'function lzCompose(address _from, address _to, bytes32 _guid, uint16 _index, bytes _message, bytes _extraData) payable',
  'event ComposeSent(address from, address to, bytes32 guid, uint16 index, bytes message)',
  'event ComposeDelivered(address from, address to, bytes32 guid, uint16 index)',
]);
