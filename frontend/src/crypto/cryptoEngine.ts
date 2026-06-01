import { parseCipherString, buildCipherString } from './cipherString';

export async function deriveMasterKey(
  masterPassword: string,
  email: string,
  iterations: number = 600000
): Promise<CryptoKey> {
  const passwordBytes = new TextEncoder().encode(masterPassword);
  const saltBytes = new TextEncoder().encode(email.toLowerCase().trim());

  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveKey', 'deriveBits']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt', 'deriveKey', 'deriveBits']
  );
}

export async function deriveMasterPasswordHash(
  masterKey: CryptoKey,
  masterPassword: string
): Promise<string> {
  const masterKeyBytes = await window.crypto.subtle.exportKey('raw', masterKey);
  const saltBytes = new TextEncoder().encode(masterPassword);

  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    masterKeyBytes,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hashBits = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 1,
      hash: 'SHA-256',
    },
    baseKey,
    256
  );

  return btoa(String.fromCharCode(...new Uint8Array(hashBits)));
}

export async function generateSymmetricKey(): Promise<CryptoKey> {
  return window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function encryptWithKey(
  plaintext: string,
  key: CryptoKey
): Promise<string> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = new TextEncoder().encode(plaintext);

  const cipherBytes = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintextBytes
  );

  return buildCipherString(iv, new Uint8Array(cipherBytes));
}

export async function decryptWithKey(
  cipherString: string,
  key: CryptoKey
): Promise<string> {
  const { iv, ciphertext } = parseCipherString(cipherString);

  const plaintextBytes = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plaintextBytes);
}

export async function wrapSymmetricKey(
  symmetricKey: CryptoKey,
  masterKey: CryptoKey
): Promise<string> {
  const rawBytes = await window.crypto.subtle.exportKey('raw', symmetricKey);
  const rawStr = String.fromCharCode(...new Uint8Array(rawBytes));
  return encryptWithKey(rawStr, masterKey);
}

export async function unwrapSymmetricKey(
  protectedSymmetricKey: string,
  masterKey: CryptoKey
): Promise<CryptoKey> {
  const rawStr = await decryptWithKey(protectedSymmetricKey, masterKey);
  const rawBytes = Uint8Array.from(rawStr, (c) => c.charCodeAt(0));

  return window.crypto.subtle.importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}
