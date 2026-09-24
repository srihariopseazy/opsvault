import CryptoJS from 'crypto-js';
import { webcrypto } from 'node:crypto';

/**
 * CLI crypto: always uses Node's native WebCrypto (PBKDF2-SHA256 +
 * AES-256-GCM, authenticated) - unlike the browser frontend, Node has no
 * "secure context" restriction, so there's no plain-HTTP fallback to worry
 * about here. crypto-js is kept only to decrypt legacy ("2." CTR)
 * ciphertexts written before this migration; all new encryption uses GCM
 * ("3."). Also used unchanged for generatePassword's CSPRNG.
 */
export const CURRENT_KDF_ITERATIONS = 600000;
// Historical value used by every account/config predating this migration.
export const LEGACY_KDF_ITERATIONS = 10000;

const CIPHER_TYPE_CTR = '2';
const CIPHER_TYPE_GCM = '3';

function bufToBase64(buf: ArrayBuffer | Uint8Array): string {
  return Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString('base64');
}

function base64ToBuf(base64: string): ArrayBuffer {
  const b = Buffer.from(base64, 'base64');
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

/**
 * Derive the master key from the master password + email salt using
 * PBKDF2-SHA256. `iterations` must be the account's actual stored value
 * (fetch via GET /auth/kdf-params before login). Returns base64.
 */
export async function deriveMasterKey(password: string, email: string, iterations: number): Promise<string> {
  const salt = email.toLowerCase().trim();
  const baseKey = await webcrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await webcrypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations, hash: 'SHA-256' },
    baseKey,
    256
  );
  return bufToBase64(bits);
}

/**
 * Derive the auth hash sent to the server: PBKDF2 of the master key, salted
 * by the master password, 1 iteration. masterKey is treated as its literal
 * UTF-8 string bytes (NOT base64-decoded) - this must match exactly what
 * the frontend and extension compute for the same account.
 */
export async function deriveMasterPasswordHash(masterKey: string, password: string): Promise<string> {
  const baseKey = await webcrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(masterKey),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await webcrypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(password), iterations: 1, hash: 'SHA-256' },
    baseKey,
    256
  );
  return bufToBase64(bits);
}

/** Encrypt a UTF-8 string with the given base64 AES key. Always writes GCM ("3."). */
export async function encryptWithKey(plaintext: string, keyBase64: string): Promise<string> {
  const cryptoKey = await webcrypto.subtle.importKey('raw', base64ToBuf(keyBase64), 'AES-GCM', false, ['encrypt']);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, new TextEncoder().encode(plaintext));
  return `${CIPHER_TYPE_GCM}.${bufToBase64(iv)}|${bufToBase64(ciphertext)}`;
}

async function decryptWithKeyGcm(ivB64: string, ctB64: string, keyBase64: string): Promise<string> {
  const cryptoKey = await webcrypto.subtle.importKey('raw', base64ToBuf(keyBase64), 'AES-GCM', false, ['decrypt']);
  const plaintext = await webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuf(ivB64) },
    cryptoKey,
    base64ToBuf(ctB64)
  );
  return new TextDecoder().decode(plaintext);
}

function decryptWithKeyCtr(ivB64: string, ctB64: string, keyBase64: string): string {
  const key = CryptoJS.enc.Base64.parse(keyBase64);
  const iv = CryptoJS.enc.Base64.parse(ivB64);
  const ciphertext = CryptoJS.enc.Base64.parse(ctB64);
  const params = CryptoJS.lib.CipherParams.create({ ciphertext });
  const decrypted = CryptoJS.AES.decrypt(params, key, {
    iv,
    mode: CryptoJS.mode.CTR,
    padding: CryptoJS.pad.NoPadding,
  });
  return decrypted.toString(CryptoJS.enc.Utf8);
}

/** Decrypt a CipherString, dispatching on its own type prefix - old ("2." CTR)
 * and new ("3." GCM) data both keep working regardless of which wrote them. */
export async function decryptWithKey(cipherString: string, keyBase64: string): Promise<string> {
  if (!cipherString?.length || cipherString[1] !== '.') {
    throw new Error(`Invalid CipherString: ${String(cipherString).slice(0, 20)}`);
  }
  const type = cipherString[0];
  const rest = cipherString.slice(2);
  const pipeIdx = rest.indexOf('|');
  if (pipeIdx === -1) throw new Error('Invalid CipherString: missing pipe');

  const ivB64 = rest.slice(0, pipeIdx);
  const ctB64 = rest.slice(pipeIdx + 1);

  if (type === CIPHER_TYPE_GCM) return decryptWithKeyGcm(ivB64, ctB64, keyBase64);
  if (type === CIPHER_TYPE_CTR) return decryptWithKeyCtr(ivB64, ctB64, keyBase64);
  throw new Error(`Unknown CipherString type: ${type}`);
}

export async function wrapSymmetricKey(symmetricKey: string, masterKey: string): Promise<string> {
  return encryptWithKey(symmetricKey, masterKey);
}

export async function unwrapSymmetricKey(protectedKey: string, masterKey: string): Promise<string> {
  return decryptWithKey(protectedKey, masterKey);
}

export function generatePassword(opts: {
  length?: number;
  noSymbols?: boolean;
  pin?: boolean;
  pinLength?: number;
}): string {
  const { length = 20, noSymbols = false, pin = false, pinLength = 6 } = opts;

  const randomByte = (): number => {
    const buf = CryptoJS.lib.WordArray.random(1);
    return (buf.words[0] >>> 24) & 0xff;
  };

  if (pin) {
    const digits = '0123456789';
    return Array.from({ length: pinLength }, () => digits[randomByte() % digits.length]).join('');
  }

  const lower   = 'abcdefghijklmnopqrstuvwxyz';
  const upper   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()-_=+[]{}|;:,.<>?';
  const pool    = noSymbols ? lower + upper + numbers : lower + upper + numbers + symbols;

  return Array.from({ length }, () => pool[randomByte() % pool.length]).join('');
}
