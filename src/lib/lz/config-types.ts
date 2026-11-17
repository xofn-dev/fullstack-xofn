// Tipe konfigurasi message library (SendUln302.sol). ReceiveUln302 hanya mengenal ULN (2);
// meminta tipe 1 pada receive library akan revert LZ_ULN_InvalidConfigType.
export const CONFIG_TYPE_EXECUTOR = 1;
export const CONFIG_TYPE_ULN = 2;

// Nilai cadangan di konfigurasi custom (UlnBase.sol): 0 = pakai default, NIL = benar-benar nol.
export const NIL_DVN_COUNT = 255;
export const NIL_CONFIRMATIONS = '18446744073709551615';
