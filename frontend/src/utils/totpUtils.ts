/**
 * RFC 6238 TOTP implementation using CryptoJS HMAC-SHA1.
 * No window.crypto.subtle — fully compatible with plain HTTP origins.
 */
import CryptoJS from 'crypto-js';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  const output: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue; // skip unknown chars
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface TOTPResult {
  code: string;           // 6-digit code, zero-padded
  secondsRemaining: number; // seconds until the current code expires
}

/**
 * Generate the current TOTP code for the given base32-encoded secret.
 * Standard 30-second window, 6 digits, SHA-1.
 */
export function generateTOTP(secret: string): TOTPResult {
  const now = Math.floor(Date.now() / 1000);
  const step = 30;
  const timeCounter = Math.floor(now / step);
  const secondsRemaining = step - (now % step);

  // Encode time counter as 8-byte big-endian
  const counterBytes = new Uint8Array(8);
  let remaining = timeCounter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }

  const secretBytes = base32Decode(secret);
  if (secretBytes.length === 0) {
    return { code: '------', secondsRemaining };
  }

  const keyHex = uint8ArrayToHex(secretBytes);
  const msgHex = uint8ArrayToHex(counterBytes);

  const hmac = CryptoJS.HmacSHA1(
    CryptoJS.enc.Hex.parse(msgHex),
    CryptoJS.enc.Hex.parse(keyHex)
  );
  const hmacHex = hmac.toString(CryptoJS.enc.Hex);

  // Build HMAC byte array (20 bytes for SHA-1)
  const hmacBytes = new Uint8Array(20);
  for (let i = 0; i < 20; i++) {
    hmacBytes[i] = parseInt(hmacHex.substring(i * 2, i * 2 + 2), 16);
  }

  // Dynamic truncation
  const offset = hmacBytes[19] & 0x0f;
  const binCode =
    ((hmacBytes[offset] & 0x7f) << 24) |
    ((hmacBytes[offset + 1] & 0xff) << 16) |
    ((hmacBytes[offset + 2] & 0xff) << 8) |
    (hmacBytes[offset + 3] & 0xff);

  const code = binCode % 1_000_000;

  return {
    code: String(code).padStart(6, '0'),
    secondsRemaining,
  };
}

/** Returns true if the string looks like a valid base32 TOTP secret. */
export function isValidTOTPSecret(secret: string): boolean {
  if (!secret) return false;
  const clean = secret.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  return clean.length >= 8 && /^[A-Z2-7]+$/.test(clean);
}
