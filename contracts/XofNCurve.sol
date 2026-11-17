// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IXofNCurve} from "./interfaces/IXofNCurve.sol";

/// @title XofNCurve
/// @notice Bonding curve di home chain. Satu implementation, satu clone per launch (PRD §5.2).
/// @dev Curve constant-product dengan cadangan virtual. Dua parameter dari owner (PRD P8)
///      menentukan bentuknya, ditambah porsi supply yang dijual (P16):
///      - `startPrice`: harga awal, wei per 1 token utuh (1e18 satuan);
///      - `graduationThreshold`: ETH yang harus terkumpul;
///      - `saleSupply`: token yang terjual tepat saat ambang tercapai.
///      Dari situ diturunkan cadangan virtual `virtualTokens` (Y0) dan `virtualEth` (V0) sehingga
///      harga awal = V0 / Y0 dan menjual `saleSupply` mengumpulkan tepat `graduationThreshold`.
///
///      Invarian: (V0 + ethRaised) * (Y0 - tokensSold) >= V0 * Y0. Pembulatan selalu memihak
///      curve, jadi beli lalu jual tidak pernah menghasilkan ETH lebih.
///
///      Tidak ada fee trading (PRD P17: default sampai owner memutuskan lain) dan tidak ada
///      fungsi admin. Parameter tidak bisa diubah setelah `initialize`.
contract XofNCurve is IXofNCurve, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant WAD = 1e18;

    /// @notice Kontrak yang membuat clone ini; satu-satunya yang boleh memanggil `graduate`.
    address public graduator;
    IERC20 public token;

    uint256 public saleSupply;
    uint256 public graduationThreshold;
    uint256 public virtualEth;
    uint256 public virtualTokens;

    uint256 public ethRaised;
    uint256 public tokensSold;
    bool public graduated;

    event Bought(address indexed buyer, uint256 ethIn, uint256 tokensOut, uint256 ethRaised);
    event Sold(address indexed seller, uint256 tokensIn, uint256 ethOut, uint256 ethRaised);
    event CurveGraduated(uint256 ethAmount, uint256 tokenAmount);

    error AlreadyInitialized();
    error InvalidCurveParams();
    error OnlyGraduator();
    error TradingClosed();
    error ThresholdNotReached();
    error AlreadyGraduated();
    error ZeroAmount();
    error SlippageExceeded(uint256 actual, uint256 minimum);
    error EthTransferFailed();

    /// @dev Implementation tidak boleh dipakai langsung; hanya clone yang di-initialize.
    constructor() {
        graduator = address(0xdead);
    }

    /// @inheritdoc IXofNCurve
    /// @dev Dipanggil sekali oleh pembuat clone dalam transaksi yang sama dengan pembuatannya.
    function initialize(
        address _token,
        uint256 _saleSupply,
        uint256 _startPrice,
        uint256 _graduationThreshold
    ) external {
        if (graduator != address(0)) revert AlreadyInitialized();
        if (_token == address(0) || _saleSupply == 0 || _startPrice == 0) {
            revert InvalidCurveParams();
        }

        // Harga rata-rata penjualan harus di atas harga awal: E > p0 * S.
        uint256 startCost = Math.mulDiv(_startPrice, _saleSupply, WAD);
        if (_graduationThreshold <= startCost) revert InvalidCurveParams();

        uint256 y0 =
            Math.mulDiv(_graduationThreshold, _saleSupply, _graduationThreshold - startCost);
        uint256 v0 = Math.mulDiv(_startPrice, y0, WAD);
        if (v0 == 0 || y0 <= _saleSupply) revert InvalidCurveParams();

        graduator = msg.sender;
        token = IERC20(_token);
        saleSupply = _saleSupply;
        graduationThreshold = _graduationThreshold;
        virtualEth = v0;
        virtualTokens = y0;
    }

    // ───────────────────────────── Trading ─────────────────────────────

    /// @notice Beli token dengan ETH. Kelebihan di atas ambang graduation dikembalikan.
    function buy(uint256 minTokensOut) external payable nonReentrant returns (uint256 tokensOut) {
        if (msg.value == 0) revert ZeroAmount();
        uint256 raised = ethRaised;
        uint256 threshold = graduationThreshold;
        if (raised >= threshold) revert TradingClosed();

        uint256 ethIn = Math.min(msg.value, threshold - raised);
        uint256 newRaised = raised + ethIn;
        uint256 newSold = _soldAt(newRaised);
        tokensOut = newSold - tokensSold;
        // Pembelian yang menutup curve tetap diterima walau pembulatan menghasilkan 0 token;
        // kalau tidak, ambang bisa tidak pernah tercapai.
        if (tokensOut == 0 && newRaised < threshold) revert ZeroAmount();
        if (tokensOut < minTokensOut) revert SlippageExceeded(tokensOut, minTokensOut);

        ethRaised = newRaised;
        tokensSold = newSold;

        token.safeTransfer(msg.sender, tokensOut);
        emit Bought(msg.sender, ethIn, tokensOut, newRaised);

        uint256 refund = msg.value - ethIn;
        if (refund != 0) _sendEth(msg.sender, refund);
    }

    /// @notice Jual token kembali ke curve. Butuh approval. Ditutup begitu ambang tercapai.
    function sell(uint256 tokensIn, uint256 minEthOut)
        external
        nonReentrant
        returns (uint256 ethOut)
    {
        if (tokensIn == 0) revert ZeroAmount();
        uint256 raised = ethRaised;
        if (raised >= graduationThreshold) revert TradingClosed();

        uint256 newSold = tokensSold - tokensIn;
        ethOut = raised - _raisedAt(newSold);
        if (ethOut < minEthOut) revert SlippageExceeded(ethOut, minEthOut);

        tokensSold = newSold;
        ethRaised = raised - ethOut;

        token.safeTransferFrom(msg.sender, address(this), tokensIn);
        emit Sold(msg.sender, tokensIn, ethOut, raised - ethOut);

        if (ethOut != 0) _sendEth(msg.sender, ethOut);
    }

    // ───────────────────────────── Graduation ─────────────────────────────

    /// @inheritdoc IXofNCurve
    /// @dev Gagal sebelum ambang tercapai dan hanya bisa dijalankan sekali. Seluruh ETH dan sisa
    ///      token dipindahkan ke Graduator, yang membuat pool dalam transaksi yang sama.
    function graduate() external nonReentrant returns (uint256 ethAmount, uint256 tokenAmount) {
        if (msg.sender != graduator) revert OnlyGraduator();
        if (graduated) revert AlreadyGraduated();
        if (ethRaised < graduationThreshold) revert ThresholdNotReached();

        graduated = true;
        ethAmount = address(this).balance;
        tokenAmount = token.balanceOf(address(this));

        token.safeTransfer(msg.sender, tokenAmount);
        emit CurveGraduated(ethAmount, tokenAmount);
        _sendEth(msg.sender, ethAmount);
    }

    // ───────────────────────────── View ─────────────────────────────

    /// @inheritdoc IXofNCurve
    function thresholdReached() public view returns (bool) {
        return ethRaised >= graduationThreshold;
    }

    /// @notice Perkiraan hasil beli. `ethUsed` bisa lebih kecil dari `ethIn` di dekat ambang.
    function quoteBuy(uint256 ethIn) external view returns (uint256 tokensOut, uint256 ethUsed) {
        uint256 raised = ethRaised;
        uint256 threshold = graduationThreshold;
        if (raised >= threshold || ethIn == 0) return (0, 0);
        ethUsed = Math.min(ethIn, threshold - raised);
        tokensOut = _soldAt(raised + ethUsed) - tokensSold;
    }

    /// @notice Perkiraan hasil jual. Mengembalikan 0 bila trading sudah ditutup.
    function quoteSell(uint256 tokensIn) external view returns (uint256 ethOut) {
        uint256 raised = ethRaised;
        if (raised >= graduationThreshold || tokensIn == 0 || tokensIn > tokensSold) return 0;
        ethOut = raised - _raisedAt(tokensSold - tokensIn);
    }

    /// @notice Harga spot, wei per 1 token utuh.
    function currentPrice() external view returns (uint256) {
        return Math.mulDiv(virtualEth + ethRaised, WAD, virtualTokens - tokensSold);
    }

    // ───────────────────────────── Internal ─────────────────────────────

    /// @dev Token terjual kumulatif pada `raised` ETH. Dibulatkan ke bawah (memihak curve).
    ///      Tepat di ambang, hasilnya dipaksa `saleSupply` supaya sisa token untuk pool pasti.
    function _soldAt(uint256 raised) private view returns (uint256) {
        uint256 cap = saleSupply;
        if (raised >= graduationThreshold) return cap;
        uint256 v0 = virtualEth;
        uint256 y0 = virtualTokens;
        uint256 sold = y0 - Math.mulDiv(v0, y0, v0 + raised, Math.Rounding.Ceil);
        return Math.min(sold, cap);
    }

    /// @dev ETH yang harus tetap ada pada `sold` token terjual. Dibulatkan ke atas.
    function _raisedAt(uint256 sold) private view returns (uint256) {
        if (sold == 0) return 0;
        uint256 v0 = virtualEth;
        uint256 y0 = virtualTokens;
        uint256 needed = Math.mulDiv(v0, y0, y0 - sold, Math.Rounding.Ceil) - v0;
        // Tidak pernah melebihi yang terkumpul selama invarian terjaga; dijepit sebagai pengaman.
        return Math.min(needed, ethRaised);
    }

    function _sendEth(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert EthTransferFailed();
    }
}
