import { parseAbi } from 'viem';

// Antarmuka baca feed harga Chainlink (AggregatorV3Interface). Hanya fungsi view.
export const aggregatorV3Abi = parseAbi([
  'function decimals() view returns (uint8)',
  'function description() view returns (string)',
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
]);
