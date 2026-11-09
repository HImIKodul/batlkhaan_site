/** Interactive-transaction limits for the heavy write paths (answer submission, completion, frozen diagnosis/strategy snapshots).
 *  Default 30 s as before. Measured: a 5.4 MB strategy snapshot freeze takes about 2.5 s alone and 6.6 s with 8 concurrent freezes, so the default has ~4x headroom;
 *  two 30 s expiries were observed only while the host was swapping. Operators may raise it (10-300 s) with MMRI_TX_TIMEOUT_MS instead of patching code. */
const raw = Number(process.env.MMRI_TX_TIMEOUT_MS);
export const LONG_TX = {
  maxWait: 10_000,
  timeout: Number.isFinite(raw) && raw >= 10_000 && raw <= 300_000 ? Math.floor(raw) : 30_000
} as const;
