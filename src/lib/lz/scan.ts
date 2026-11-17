// Tautan LayerZero Scan. API Scan terverifikasi bisa dibaca tanpa key (pelengkap Phase 0).
// Pola URL HALAMAN pesan belum terverifikasi (situs merespons 429 saat diperiksa), jadi yang
// disediakan hanya URL API; builder halaman ditambahkan setelah polanya dipastikan.

const SCAN_API = 'https://scan.layerzero-api.com/v1';

export function scanApiMessagesByOApp(eid: number, address: string): string {
  return `${SCAN_API}/messages/oapp/${eid}/${address.toLowerCase()}`;
}

export function scanApiMessageByGuid(guid: string): string {
  return `${SCAN_API}/messages/guid/${guid}`;
}

export function scanApiMessagesByTx(txHash: string): string {
  return `${SCAN_API}/messages/tx/${txHash}`;
}
