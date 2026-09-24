import CryptoJS from 'crypto-js';

/**
 * Extension crypto: always uses WebCrypto (PBKDF2-SHA256 + AES-256-GCM,
 * authenticated) since chrome-extension:// is always a secure context - no
 * plain-HTTP fallback is needed here, unlike the web frontend. crypto-js is
 * kept only to decrypt legacy ("2." CTR) ciphertexts written before this
 * migration; all new encryption uses GCM ("3.").
 */
export const CURRENT_KDF_ITERATIONS = 600000;

const CIPHER_TYPE_CTR = '2';
const CIPHER_TYPE_GCM = '3';

function bufToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuf(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Derive the master key from the master password + email salt using
 * PBKDF2-SHA256. `iterations` must be the account's actual stored value
 * (fetch via GET /auth/kdf-params before login). Returns base64.
 */
export async function deriveMasterKey(password: string, email: string, iterations: number): Promise<string> {
  const salt = email.toLowerCase().trim();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
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
 * the frontend and CLI compute for the same account, since crypto-js and
 * WebCrypto produce byte-identical PBKDF2 output for the same inputs.
 */
export async function deriveMasterPasswordHash(masterKey: string, password: string): Promise<string> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(masterKey),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(password), iterations: 1, hash: 'SHA-256' },
    baseKey,
    256
  );
  return bufToBase64(bits);
}

/** Encrypt a UTF-8 string with the given base64 AES key. Always writes GCM ("3."). */
export async function encryptWithKey(plaintext: string, keyBase64: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey('raw', base64ToBuf(keyBase64), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, new TextEncoder().encode(plaintext));
  return `${CIPHER_TYPE_GCM}.${bufToBase64(iv)}|${bufToBase64(ciphertext)}`;
}

async function decryptWithKeyGcm(ivB64: string, ctB64: string, keyBase64: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey('raw', base64ToBuf(keyBase64), 'AES-GCM', false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt(
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
  if (!cipherString || cipherString.length < 2 || cipherString[1] !== '.') {
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

/** Extract the hostname/domain from a URL for URI matching. */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Check if an item URI matches the current tab URL. */
export function uriMatchesDomain(itemUri: string, tabDomain: string): boolean {
  try {
    const itemDomain = extractDomain(itemUri).replace(/^www\./, '');
    return itemDomain === tabDomain || tabDomain.endsWith('.' + itemDomain) || itemDomain.endsWith('.' + tabDomain);
  } catch {
    return false;
  }
}
