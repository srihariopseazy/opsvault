/**
 * RFC 6238 TOTP — pure Web Crypto API implementation (no CryptoJS dependency).
 * Uses HMAC-SHA-1, 30-second window, 6 digits.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(secret: string): Uint8Array {
  const clean = secret.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  const output: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

/** Returns seconds remaining in the current 30-second TOTP window (1–30). */
export function getTimeRemaining(): number {
  return 30 - (Math.floor(Date.now() / 1000) % 30);
}

/**
 * Generate the current 6-digit TOTP code for a base32-encoded secret.
 * Returns '------' if the secret is empty or invalid.
 */
export async function generateTOTP(secret: string): Promise<string> {
  const keyBytes = base32Decode(secret);
  if (keyBytes.length === 0) return '------';

  const counter = Math.floor(Date.now() / 1000 / 30);

  // 8-byte big-endian counter buffer
  const counterBuffer = new ArrayBuffer(8);
  const view = new DataView(counterBuffer);
  // High 32 bits (typically 0 for any timestamp in the next century)
  view.setUint32(0, Math.floor(counter / 0x100000000), false);
  // Low 32 bits
  view.setUint32(4, counter >>> 0, false);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );

  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, counterBuffer.buffer as ArrayBuffer));

  // Dynamic truncation
  const offset = sig[19] & 0x0f;
  const binCode =
    (((sig[offset]     & 0x7f) << 24) |
     ((sig[offset + 1] & 0xff) << 16) |
     ((sig[offset + 2] & 0xff) <<  8) |
      (sig[offset + 3] & 0xff));

  return String(binCode % 1_000_000).padStart(6, '0');
}

/** Basic validation — must be ≥8 base32 characters. */
export function isValidTOTPSecret(secret: string): boolean {
  if (!secret) return false;
  const clean = secret.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  return clean.length >= 8 && /^[A-Z2-7]+$/.test(clean);
}
