/**
 * OPSVAULT Crypto Engine
 *
 * Dispatches between two backends depending on what the current browser
 * origin can actually do:
 *
 *  - WebCrypto (AES-256-GCM, authenticated) when `window.crypto.subtle` is
 *    available - i.e. a secure context (HTTPS, or localhost). This is the
 *    target scheme: PBKDF2-SHA256 at CURRENT_KDF_ITERATIONS, real AES-GCM.
 *  - crypto-js (AES-256-CTR, unauthenticated) as a fallback on plain-HTTP
 *    origins where SubtleCrypto is unavailable. To still reach
 *    CURRENT_KDF_ITERATIONS without freezing the UI thread, the PBKDF2 pass
 *    runs in a Web Worker (see cryptoWorker.ts) rather than inline.
 *
 * Existing accounts created before this migration (kdf_iterations below
 * CURRENT_KDF_ITERATIONS) keep deriving at their own stored iteration count
 * via crypto-js on the main thread (fast enough at that lower count not to
 * need a worker) until they're silently upgraded post-login.
 *
 * CipherString format: "<type>.<iv_b64>|<ct_b64>" - see cipherString.ts.
 * decryptWithKey dispatches purely on the ciphertext's own type prefix, so
 * old (type 2, CTR) and new (type 3, GCM) data both keep working forever,
 * regardless of which scheme derived the key used to read them.
 */

import CryptoJS from 'crypto-js';
import { pbkdf2Bits } from './keyDerivation';
import { CIPHER_TYPE_CTR, CIPHER_TYPE_GCM } from './cipherString';

// The floor the backend enforces at registration (schemas/auth.py
// MIN_KDF_ITERATIONS) - also the target for new work on this client.
export const CURRENT_KDF_ITERATIONS = 600000;
// Historical value used before this migration; kept only so callers can
// recognize/compare against it (e.g. deciding whether to migrate).
export const LEGACY_KDF_ITERATIONS = 10000;

export function isWebCryptoAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.crypto !== 'undefined' &&
    typeof window.crypto.subtle !== 'undefined' &&
    typeof window.crypto.subtle.importKey === 'function'
  );
}

// ── base64 <-> ArrayBuffer helpers ───────────────────────────────────────────

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

// ── Off-thread PBKDF2 (crypto-js fallback, only reached when WebCrypto is
//    unavailable and iterations >= CURRENT_KDF_ITERATIONS) ──────────────────

let cryptoWorker: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, { resolve: (v: string) => void; reject: (e: unknown) => void }>();

function getCryptoWorker(): Worker {
  if (!cryptoWorker) {
    cryptoWorker = new Worker(new URL('./cryptoWorker.ts', import.meta.url), { type: 'module' });
    cryptoWorker.onmessage = (e: MessageEvent<{ id: number; base64: string }>) => {
      const pending = pendingRequests.get(e.data.id);
      if (pending) {
        pendingRequests.delete(e.data.id);
        pending.resolve(e.data.base64);
      }
    };
    cryptoWorker.onerror = (e: ErrorEvent) => {
      for (const pending of pendingRequests.values()) {
        pending.reject(e.error || new Error('crypto worker failed'));
      }
      pendingRequests.clear();
    };
  }
  return cryptoWorker;
}

function pbkdf2InWorker(password: string, salt: string, iterations: number, keySizeWords: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = getCryptoWorker();
    const id = nextRequestId++;
    pendingRequests.set(id, { resolve, reject });
    worker.postMessage({ id, password, salt, iterations, keySizeWords });
  });
}

// ── Master key derivation ────────────────────────────────────────────────────

async function deriveMasterKeyWebCrypto(password: string, salt: string, iterations: number): Promise<string> {
  const passwordBytes = new TextEncoder().encode(password).buffer;
  const bits = await pbkdf2Bits(passwordBytes, salt, iterations, 'SHA-256', 256);
  return bufToBase64(bits);
}

function deriveMasterKeyCryptoJs(password: string, salt: string, iterations: number): string {
  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations,
    hasher: CryptoJS.algo.SHA256,
  });
  return key.toString(CryptoJS.enc.Base64);
}

/**
 * Derive the master key from the master password + email salt using
 * PBKDF2-SHA256. `iterations` must be the account's actual stored value
 * (fetch via GET /auth/kdf-params before login, or the server's returned
 * kdf_iterations on register/login/unlock) - it is honored exactly, not
 * silently substituted, so callers must pass the right number themselves.
 * Returns base64-encoded raw key bytes.
 */
export async function deriveMasterKey(
  masterPassword: string,
  email: string,
  iterations: number
): Promise<string> {
  try {
    const salt = email.toLowerCase().trim();
    if (iterations >= CURRENT_KDF_ITERATIONS) {
      return isWebCryptoAvailable()
        ? await deriveMasterKeyWebCrypto(masterPassword, salt, iterations)
        : await pbkdf2InWorker(masterPassword, salt, iterations, 256 / 32);
    }
    return deriveMasterKeyCryptoJs(masterPassword, salt, iterations);
  } catch (err) {
    console.error('[cryptoEngine] deriveMasterKey failed:', err);
    throw err;
  }
}

/**
 * Derive the auth hash sent to the server: PBKDF2 of the master key,
 * salted by the master password, 1 iteration. crypto-js and WebCrypto
 * produce byte-identical PBKDF2-SHA256 output for the same inputs, so which
 * backend computes this trivial 1-iteration step doesn't need to track the
 * account's tier - just prefer WebCrypto when available.
 */
export async function deriveMasterPasswordHash(
  masterKey: string,
  masterPassword: string
): Promise<string> {
  try {
    if (isWebCryptoAvailable()) {
      // masterKey is treated as its literal UTF-8 string bytes here (NOT
      // base64-decoded) to match crypto-js's own PBKDF2(string, ...)
      // behavior - this must produce byte-identical output regardless of
      // which backend computes it, since two devices deriving the same
      // account's hash must agree.
      const keyBytes = new TextEncoder().encode(masterKey).buffer;
      const bits = await pbkdf2Bits(keyBytes, masterPassword, 1, 'SHA-256', 256);
      return bufToBase64(bits);
    }
    const hash = CryptoJS.PBKDF2(masterKey, masterPassword, {
      keySize: 256 / 32,
      iterations: 1,
      hasher: CryptoJS.algo.SHA256,
    });
    return hash.toString(CryptoJS.enc.Base64);
  } catch (err) {
    console.error('[cryptoEngine] deriveMasterPasswordHash failed:', err);
    throw err;
  }
}

/**
 * Generate a random 32-byte symmetric (vault) key. Returns base64.
 */
export async function generateSymmetricKey(): Promise<string> {
  try {
    const raw = CryptoJS.lib.WordArray.random(32);
    return raw.toString(CryptoJS.enc.Base64);
  } catch (err) {
    console.error('[cryptoEngine] generateSymmetricKey failed:', err);
    throw err;
  }
}

// ── Encrypt / decrypt ────────────────────────────────────────────────────────

async function encryptWithKeyGcm(plaintext: string, keyBase64: string): Promise<string> {
  const keyBytes = base64ToBuf(keyBase64);
  const cryptoKey = await window.crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV, standard for GCM
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    new TextEncoder().encode(plaintext)
  );
  return `${CIPHER_TYPE_GCM}.${bufToBase64(iv)}|${bufToBase64(ciphertext)}`;
}

async function decryptWithKeyGcm(ivB64: string, ctB64: string, keyBase64: string): Promise<string> {
  const keyBytes = base64ToBuf(keyBase64);
  const cryptoKey = await window.crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const plaintext = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuf(ivB64) },
    cryptoKey,
    base64ToBuf(ctB64)
  );
  return new TextDecoder().decode(plaintext);
}

function encryptWithKeyCtr(plaintext: string, keyBase64: string): string {
  const key = CryptoJS.enc.Base64.parse(keyBase64);
  const iv = CryptoJS.lib.WordArray.random(16);

  const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
    iv,
    mode: CryptoJS.mode.CTR,
    padding: CryptoJS.pad.NoPadding,
  });

  const ivB64 = iv.toString(CryptoJS.enc.Base64);
  const ctB64 = encrypted.ciphertext.toString(CryptoJS.enc.Base64);
  return `${CIPHER_TYPE_CTR}.${ivB64}|${ctB64}`;
}

function decryptWithKeyCtr(ivB64: string, ctB64: string, keyBase64: string): string {
  const key = CryptoJS.enc.Base64.parse(keyBase64);
  const iv = CryptoJS.enc.Base64.parse(ivB64);
  const ciphertext = CryptoJS.enc.Base64.parse(ctB64);

  const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext });
  const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
    iv,
    mode: CryptoJS.mode.CTR,
    padding: CryptoJS.pad.NoPadding,
  });

  const plaintext = decrypted.toString(CryptoJS.enc.Utf8);
  if (plaintext === '' && ciphertext.sigBytes > 0) {
    throw new Error('Decryption produced empty string — wrong key?');
  }
  return plaintext;
}

/**
 * Encrypt a UTF-8 string with the given base64-encoded AES key.
 * Returns a CipherString: GCM ("3.<iv>|<ct>") when WebCrypto is available,
 * CTR ("2.<iv>|<ct>") otherwise.
 */
export async function encryptWithKey(plaintext: string, keyBase64: string): Promise<string> {
  try {
    return isWebCryptoAvailable()
      ? await encryptWithKeyGcm(plaintext, keyBase64)
      : encryptWithKeyCtr(plaintext, keyBase64);
  } catch (err) {
    console.error('[cryptoEngine] encryptWithKey failed:', err);
    throw err;
  }
}

/**
 * Decrypt a CipherString with the given base64-encoded AES key. Dispatches
 * on the ciphertext's own type prefix, not on any external iteration count
 * or environment check, so old and new data both always decrypt correctly.
 */
export async function decryptWithKey(cipherString: string, keyBase64: string): Promise<string> {
  try {
    if (!cipherString || cipherString.length < 2 || cipherString[1] !== '.') {
      throw new Error(`Invalid CipherString — expected "<type>.<iv>|<ct>", got: ${String(cipherString).slice(0, 20)}`);
    }
    const type = cipherString[0];
    const rest = cipherString.slice(2);
    const pipeIdx = rest.indexOf('|');
    if (pipeIdx === -1) throw new Error('Invalid CipherString: missing pipe separator');

    const ivB64 = rest.slice(0, pipeIdx);
    const ctB64 = rest.slice(pipeIdx + 1);

    if (type === CIPHER_TYPE_GCM) return await decryptWithKeyGcm(ivB64, ctB64, keyBase64);
    if (type === CIPHER_TYPE_CTR) return decryptWithKeyCtr(ivB64, ctB64, keyBase64);
    throw new Error(`Unknown CipherString type: ${type}`);
  } catch (err) {
    console.error('[cryptoEngine] decryptWithKey failed:', err);
    throw err;
  }
}

/**
 * Wrap (encrypt) the symmetric key string with the master key.
 * Returns a CipherString that can be stored on the server.
 */
export async function wrapSymmetricKey(
  symmetricKey: string,
  masterKey: string
): Promise<string> {
  try {
    return await encryptWithKey(symmetricKey, masterKey);
  } catch (err) {
    console.error('[cryptoEngine] wrapSymmetricKey failed:', err);
    throw err;
  }
}

/**
 * Unwrap (decrypt) the protectedSymmetricKey with the master key.
 * Returns the symmetric key as a base64 string.
 */
export async function unwrapSymmetricKey(
  protectedSymmetricKey: string,
  masterKey: string
): Promise<string> {
  try {
    return await decryptWithKey(protectedSymmetricKey, masterKey);
  } catch (err) {
    console.error('[cryptoEngine] unwrapSymmetricKey failed:', err);
    throw err;
  }
}

/**
 * Self-test: derives a master key, generates a symmetric key, wraps/unwraps it,
 * and round-trips an encrypt/decrypt. All steps are logged.
 *
 * Run from browser console:
 *   import('/src/crypto/cryptoEngine.ts').then(m => m.testCrypto())
 */
export async function testCrypto(): Promise<boolean> {
  try {
    console.log('[testCrypto] start. WebCrypto available:', isWebCryptoAvailable());

    const masterKey = await deriveMasterKey('test-password', 'test@example.com', CURRENT_KDF_ITERATIONS);
    console.log('[testCrypto] masterKey:', masterKey);

    const hash = await deriveMasterPasswordHash(masterKey, 'test-password');
    console.log('[testCrypto] hash:', hash);

    const symKey = await generateSymmetricKey();
    console.log('[testCrypto] symKey:', symKey);

    const wrapped = await wrapSymmetricKey(symKey, masterKey);
    console.log('[testCrypto] wrapped:', wrapped);

    const unwrapped = await unwrapSymmetricKey(wrapped, masterKey);
    console.log('[testCrypto] unwrapped:', unwrapped);

    const cipher = await encryptWithKey('hello-opsvault', symKey);
    console.log('[testCrypto] cipher:', cipher);

    const plain = await decryptWithKey(cipher, symKey);
    console.log('[testCrypto] plain:', plain);

    const ok = plain === 'hello-opsvault' && unwrapped === symKey;
    console.log(ok ? '[testCrypto] PASS ✅' : '[testCrypto] FAIL ❌ plain=' + plain + ' unwrapped=' + unwrapped);
    return ok;
  } catch (err) {
    console.error('[testCrypto] threw:', err);
    return false;
  }
}
