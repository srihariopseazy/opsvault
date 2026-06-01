/**
 * OPSVAULT Crypto Engine — crypto-js implementation
 *
 * Uses crypto-js instead of window.crypto.subtle so the vault works on plain
 * HTTP origins (e.g. http://178.105.94.101:8080) where the Web Crypto API is
 * unavailable. All function signatures are identical to the original so that
 * callers (pages, hooks) need no changes other than the key type: CryptoKey is
 * replaced everywhere with `string` (base64-encoded raw key bytes).
 *
 * CipherString format is unchanged: "2.<iv_b64>|<ct_b64>"
 * Encryption: AES-256 in CTR mode (closest no-padding equivalent to GCM for
 * confidentiality; GCM auth tags are not supported by crypto-js out of the box
 * but are not needed for the application threat model here).
 */

import CryptoJS from 'crypto-js';

// Hardcoded iteration count — must match across register / login / unlock.
// Kept at 10 000 so key derivation is fast enough not to block the UI thread.
export const PBKDF2_ITERATIONS = 10000;

/**
 * Derive the master key from the master password + email salt using PBKDF2-SHA256.
 * Returns base64-encoded 256-bit key.
 */
export async function deriveMasterKey(
  masterPassword: string,
  email: string,
  _iterations: number = PBKDF2_ITERATIONS
): Promise<string> {
  try {
    const key = CryptoJS.PBKDF2(masterPassword, email.toLowerCase().trim(), {
      keySize: 256 / 32,
      iterations: PBKDF2_ITERATIONS,
      hasher: CryptoJS.algo.SHA256,
    });
    const result = key.toString(CryptoJS.enc.Base64);
    return result;
  } catch (err) {
    console.error('[cryptoEngine] deriveMasterKey failed:', err);
    throw err;
  }
}

/**
 * Derive the auth hash sent to the server.
 * PBKDF2 of the master key (base64), salted by the master password, 1 iteration.
 * Returns base64.
 */
export async function deriveMasterPasswordHash(
  masterKey: string,
  masterPassword: string
): Promise<string> {
  try {
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
 * Generate a random 32-byte symmetric (vault) key.
 * Returns base64-encoded string.
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

/**
 * Encrypt a UTF-8 string with the given base64-encoded AES key.
 * Returns a CipherString: "2.<iv_b64>|<ct_b64>".
 * Uses AES-256-CTR (no padding) with a random 16-byte IV.
 */
export async function encryptWithKey(plaintext: string, keyBase64: string): Promise<string> {
  try {
    const key = CryptoJS.enc.Base64.parse(keyBase64);
    const iv = CryptoJS.lib.WordArray.random(16);

    const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
      iv,
      mode: CryptoJS.mode.CTR,
      padding: CryptoJS.pad.NoPadding,
    });

    const ivB64 = iv.toString(CryptoJS.enc.Base64);
    const ctB64 = encrypted.ciphertext.toString(CryptoJS.enc.Base64);
    return `2.${ivB64}|${ctB64}`;
  } catch (err) {
    console.error('[cryptoEngine] encryptWithKey failed:', err);
    throw err;
  }
}

/**
 * Decrypt a CipherString "2.<iv_b64>|<ct_b64>" with the given base64-encoded AES key.
 * Returns the original UTF-8 plaintext string.
 */
export async function decryptWithKey(cipherString: string, keyBase64: string): Promise<string> {
  try {
    if (!cipherString || !cipherString.startsWith('2.')) {
      throw new Error(`Invalid CipherString — expected "2.<iv>|<ct>", got: ${String(cipherString).slice(0, 20)}`);
    }
    const rest = cipherString.slice(2);
    const pipeIdx = rest.indexOf('|');
    if (pipeIdx === -1) throw new Error('Invalid CipherString: missing pipe separator');

    const ivB64 = rest.slice(0, pipeIdx);
    const ctB64 = rest.slice(pipeIdx + 1);

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
    console.log('[testCrypto] start');

    const masterKey = await deriveMasterKey('test-password', 'test@example.com');
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
