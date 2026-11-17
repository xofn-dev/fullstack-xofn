// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

// AMM tiruan untuk tes lokal. Logika pair mengikuti UniswapV2Pair (mint/burn/swap/skim/sync,
// MINIMUM_LIQUIDITY, fee 0,3%) tanpa oracle harga dan tanpa protocol fee.

contract MockWETH is ERC20 {
    constructor() ERC20("Wrapped Ether", "WETH") {}

    function deposit() public payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "WETH: transfer failed");
    }

    receive() external payable {
        deposit();
    }
}

contract MockV2Pair is ERC20 {
    uint256 public constant MINIMUM_LIQUIDITY = 1000;

    address public immutable factory;
    address public token0;
    address public token1;

    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private blockTimestampLast;
    uint256 private unlocked = 1;

    modifier lock() {
        require(unlocked == 1, "UniswapV2: LOCKED");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor() ERC20("Uniswap V2", "UNI-V2") {
        factory = msg.sender;
    }

    function initialize(address _token0, address _token1) external {
        require(msg.sender == factory, "UniswapV2: FORBIDDEN");
        token0 = _token0;
        token1 = _token1;
    }

    function getReserves() public view returns (uint112, uint112, uint32) {
        return (reserve0, reserve1, blockTimestampLast);
    }

    function _updateReserves(uint256 balance0, uint256 balance1) private {
        require(
            balance0 <= type(uint112).max && balance1 <= type(uint112).max, "UniswapV2: OVERFLOW"
        );
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        blockTimestampLast = uint32(block.timestamp);
    }

    function mint(address to) external lock returns (uint256 liquidity) {
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - reserve0;
        uint256 amount1 = balance1 - reserve1;

        uint256 supply = totalSupply();
        if (supply == 0) {
            liquidity = Math.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            // Uniswap mengunci MINIMUM_LIQUIDITY di address(0); ERC20 OZ menolak mint ke sana.
            _mint(address(1), MINIMUM_LIQUIDITY);
        } else {
            liquidity = Math.min((amount0 * supply) / reserve0, (amount1 * supply) / reserve1);
        }
        require(liquidity > 0, "UniswapV2: INSUFFICIENT_LIQUIDITY_MINTED");
        _mint(to, liquidity);
        _updateReserves(balance0, balance1);
    }

    function burn(address to) external lock returns (uint256 amount0, uint256 amount1) {
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 liquidity = balanceOf(address(this));
        uint256 supply = totalSupply();
        amount0 = (liquidity * balance0) / supply;
        amount1 = (liquidity * balance1) / supply;
        require(amount0 > 0 && amount1 > 0, "UniswapV2: INSUFFICIENT_LIQUIDITY_BURNED");
        _burn(address(this), liquidity);
        IERC20(token0).transfer(to, amount0);
        IERC20(token1).transfer(to, amount1);
        _updateReserves(
            IERC20(token0).balanceOf(address(this)), IERC20(token1).balanceOf(address(this))
        );
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata)
        external
        lock
    {
        require(amount0Out > 0 || amount1Out > 0, "UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT");
        (uint112 r0, uint112 r1,) = getReserves();
        require(amount0Out < r0 && amount1Out < r1, "UniswapV2: INSUFFICIENT_LIQUIDITY");
        require(to != token0 && to != token1, "UniswapV2: INVALID_TO");
        if (amount0Out > 0) IERC20(token0).transfer(to, amount0Out);
        if (amount1Out > 0) IERC20(token1).transfer(to, amount1Out);
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0In = balance0 > r0 - amount0Out ? balance0 - (r0 - amount0Out) : 0;
        uint256 amount1In = balance1 > r1 - amount1Out ? balance1 - (r1 - amount1Out) : 0;
        require(amount0In > 0 || amount1In > 0, "UniswapV2: INSUFFICIENT_INPUT_AMOUNT");
        uint256 adjusted0 = balance0 * 1000 - amount0In * 3;
        uint256 adjusted1 = balance1 * 1000 - amount1In * 3;
        require(adjusted0 * adjusted1 >= uint256(r0) * uint256(r1) * 1000 ** 2, "UniswapV2: K");
        _updateReserves(balance0, balance1);
    }

    function skim(address to) external lock {
        IERC20(token0).transfer(to, IERC20(token0).balanceOf(address(this)) - reserve0);
        IERC20(token1).transfer(to, IERC20(token1).balanceOf(address(this)) - reserve1);
    }

    function sync() external lock {
        _updateReserves(
            IERC20(token0).balanceOf(address(this)), IERC20(token1).balanceOf(address(this))
        );
    }
}

contract MockV2Factory {
    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "UniswapV2: IDENTICAL_ADDRESSES");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "UniswapV2: ZERO_ADDRESS");
        require(getPair[token0][token1] == address(0), "UniswapV2: PAIR_EXISTS");
        pair = address(new MockV2Pair{salt: keccak256(abi.encodePacked(token0, token1))}());
        MockV2Pair(pair).initialize(token0, token1);
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);
    }
}

/// @dev Router minimal: cukup untuk mensimulasikan trader dan penyerang di tes.
contract MockV2Router {
    address public immutable factory;
    address public immutable WETH;

    constructor(address _factory, address _weth) {
        factory = _factory;
        WETH = _weth;
    }

    receive() external payable {}

    function _pair(address token) private view returns (MockV2Pair) {
        return MockV2Pair(MockV2Factory(factory).getPair(token, WETH));
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        public
        pure
        returns (uint256)
    {
        uint256 amountInWithFee = amountIn * 997;
        return (amountInWithFee * reserveOut) / (reserveIn * 1000 + amountInWithFee);
    }

    function reservesOf(address token)
        public
        view
        returns (uint256 reserveToken, uint256 reserveEth)
    {
        MockV2Pair pair = _pair(token);
        (uint112 r0, uint112 r1,) = pair.getReserves();
        (reserveToken, reserveEth) = pair.token0() == token ? (r0, r1) : (r1, r0);
    }

    /// @dev Menambah likuiditas langsung ke pair (tanpa pengecekan rasio), seperti penyerang.
    function addLiquidityETHRaw(address token, uint256 tokenAmount, address to)
        external
        payable
        returns (uint256 liquidity)
    {
        address pair = MockV2Factory(factory).getPair(token, WETH);
        if (pair == address(0)) pair = MockV2Factory(factory).createPair(token, WETH);
        IERC20(token).transferFrom(msg.sender, pair, tokenAmount);
        MockWETH(payable(WETH)).deposit{value: msg.value}();
        IERC20(WETH).transfer(pair, msg.value);
        liquidity = MockV2Pair(pair).mint(to);
    }

    function swapExactETHForTokens(address token, address to)
        external
        payable
        returns (uint256 out)
    {
        MockV2Pair pair = _pair(token);
        (uint256 reserveToken, uint256 reserveEth) = reservesOf(token);
        out = getAmountOut(msg.value, reserveEth, reserveToken);
        MockWETH(payable(WETH)).deposit{value: msg.value}();
        IERC20(WETH).transfer(address(pair), msg.value);
        bool tokenIsZero = pair.token0() == token;
        pair.swap(tokenIsZero ? out : 0, tokenIsZero ? 0 : out, to, "");
    }

    function swapExactTokensForETH(address token, uint256 amountIn, address to)
        external
        returns (uint256 out)
    {
        MockV2Pair pair = _pair(token);
        (uint256 reserveToken, uint256 reserveEth) = reservesOf(token);
        out = getAmountOut(amountIn, reserveToken, reserveEth);
        IERC20(token).transferFrom(msg.sender, address(pair), amountIn);
        bool tokenIsZero = pair.token0() == token;
        pair.swap(tokenIsZero ? 0 : out, tokenIsZero ? out : 0, address(this), "");
        MockWETH(payable(WETH)).withdraw(out);
        (bool ok,) = to.call{value: out}("");
        require(ok, "Router: transfer failed");
    }
}
