import { parseCipherString, buildCipherString } from './cipherString';

// Hardcoded PBKDF2 iteration count. Kept low (10k) so key derivation never
// blocks the main thread / appears to "hang" the registration & login forms.
// The `iterations` parameters below are kept for signature compatibility with
// existing call sites but are intentionally ignored — we ALWAYS use this value
// so that register / login / unlock stay perfectly consistent.
export const PBKDF2_ITERATIONS = 10000;

/**
 * Derive the master key from the master password + email salt using PBKDF2.
 * Returns an AES-GCM CryptoKey (extractable) usable for wrapping/unwrapping.
 */
export async function deriveMasterKey(
  masterPassword: string,
  email: string,
  _iterations: number = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  try {
    const passwordBytes = new TextEncoder().encode(masterPassword);
    const saltBytes = new TextEncoder().encode(email.toLowerCase().trim());

    const baseKey = await window.crypto.subtle.importKey(
      'raw',
      passwordBytes as BufferSource,
      'PBKDF2',
      false,
      ['deriveKey', 'deriveBits']
    );

    return await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBytes as BufferSource,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  } catch (err) {
    console.error('[cryptoEngine] deriveMasterKey failed:', err);
    throw err;
  }
}

/**
 * Derive the auth hash sent to the server. PBKDF2 of the master key bytes,
 * salted by the master password, 1 iteration, returned base64.
 */
export async function deriveMasterPasswordHash(
  masterKey: CryptoKey,
  masterPassword: string
): Promise<string> {
  try {
    const masterKeyBytes = await window.crypto.subtle.exportKey('raw', masterKey);
    const saltBytes = new TextEncoder().encode(masterPassword);

    const baseKey = await window.crypto.subtle.importKey(
      'raw',
      new Uint8Array(masterKeyBytes) as BufferSource,
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const hashBits = await window.crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBytes as BufferSource,
        iterations: 1,
        hash: 'SHA-256',
      },
      baseKey,
      256
    );

    return btoa(String.fromCharCode(...new Uint8Array(hashBits)));
  } catch (err) {
    console.error('[cryptoEngine] deriveMasterPasswordHash failed:', err);
    throw err;
  }
}

/**
 * Generate a random 32-byte AES-256-GCM symmetric (vault) key.
 */
export async function generateSymmetricKey(): Promise<CryptoKey> {
  try {
    const rawKey = window.crypto.getRandomValues(new Uint8Array(32));
    return await window.crypto.subtle.importKey(
      'raw',
      rawKey as BufferSource,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  } catch (err) {
    console.error('[cryptoEngine] generateSymmetricKey failed:', err);
    throw err;
  }
}

/**
 * Encrypt a UTF-8 string with the given AES-GCM key.
 * Returns a CipherString: "2.<iv_b64>|<ct_b64>".
 */
export async function encryptWithKey(plaintext: string, key: CryptoKey): Promise<string> {
  try {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const plaintextBytes = new TextEncoder().encode(plaintext);

    const cipherBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      plaintextBytes as BufferSource
    );

    return buildCipherString(iv, new Uint8Array(cipherBuffer));
  } catch (err) {
    console.error('[cryptoEngine] encryptWithKey failed:', err);
    throw err;
  }
}

/**
 * Decrypt a CipherString "2.<iv_b64>|<ct_b64>" with the given AES-GCM key.
 */
export async function decryptWithKey(cipherString: string, key: CryptoKey): Promise<string> {
  try {
    const { iv, ciphertext } = parseCipherString(cipherString);

    const plaintextBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) as BufferSource },
      key,
      new Uint8Array(ciphertext) as BufferSource
    );

    return new TextDecoder().decode(plaintextBuffer);
  } catch (err) {
    console.error('[cryptoEngine] decryptWithKey failed:', err);
    throw err;
  }
}

/**
 * Wrap (encrypt) the symmetric key with the master key → protectedSymmetricKey.
 */
export async function wrapSymmetricKey(
  symmetricKey: CryptoKey,
  masterKey: CryptoKey
): Promise<string> {
  try {
    const rawBytes = await window.crypto.subtle.exportKey('raw', symmetricKey);
    const rawStr = String.fromCharCode(...new Uint8Array(rawBytes));
    return await encryptWithKey(rawStr, masterKey);
  } catch (err) {
    console.error('[cryptoEngine] wrapSymmetricKey failed:', err);
    throw err;
  }
}

/**
 * Unwrap (decrypt) the protectedSymmetricKey with the master key → symmetricKey.
 */
export async function unwrapSymmetricKey(
  protectedSymmetricKey: string,
  masterKey: CryptoKey
): Promise<CryptoKey> {
  try {
    const rawStr = await decryptWithKey(protectedSymmetricKey, masterKey);
    const rawBytes = Uint8Array.from(rawStr, (c) => c.charCodeAt(0));

    return await window.crypto.subtle.importKey(
      'raw',
      rawBytes as BufferSource,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  } catch (err) {
    console.error('[cryptoEngine] unwrapSymmetricKey failed:', err);
    throw err;
  }
}

/**
 * Quick self-test: derives a key, generates a symmetric key, wraps/unwraps it,
 * and round-trips an encrypt/decrypt. Logs each step. Returns true on success.
 * Call from the browser console: `import('./crypto/cryptoEngine').then(m => m.testCrypto())`
 */
export async function testCrypto(): Promise<boolean> {
  try {
    console.log('[testCrypto] start');
    const masterKey = await deriveMasterKey('test-password', 'test@example.com');
    console.log('[testCrypto] masterKey derived');

    const hash = await deriveMasterPasswordHash(masterKey, 'test-password');
    console.log('[testCrypto] masterPasswordHash:', hash);

    const symKey = await generateSymmetricKey();
    console.log('[testCrypto] symmetricKey generated');

    const wrapped = await wrapSymmetricKey(symKey, masterKey);
    console.log('[testCrypto] wrapped symmetricKey:', wrapped);

    const unwrapped = await unwrapSymmetricKey(wrapped, masterKey);
    console.log('[testCrypto] symmetricKey unwrapped');

    const sample = 'hello-opsvault';
    const cipher = await encryptWithKey(sample, unwrapped);
    console.log('[testCrypto] encrypted:', cipher);

    const decrypted = await decryptWithKey(cipher, unwrapped);
    console.log('[testCrypto] decrypted:', decrypted);

    const ok = decrypted === sample;
    console.log(ok ? '[testCrypto] PASS ✅' : '[testCrypto] FAIL ❌');
    return ok;
  } catch (err) {
    console.error('[testCrypto] threw:', err);
    return false;
  }
}
