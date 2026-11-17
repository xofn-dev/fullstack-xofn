// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IXofNCurve {
    function initialize(
        address token,
        uint256 saleSupply,
        uint256 startPrice,
        uint256 graduationThreshold
    ) external;

    function graduate() external returns (uint256 ethAmount, uint256 tokenAmount);

    function thresholdReached() external view returns (bool);
}
