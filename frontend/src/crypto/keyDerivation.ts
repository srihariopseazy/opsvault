export interface KdfParams {
  iterations: number;
  hash: string;
  keyLength: number;
}

export const DEFAULT_KDF_PARAMS: KdfParams = {
  iterations: 600000,
  hash: 'SHA-256',
  keyLength: 256,
};

export async function pbkdf2(
  password: string | ArrayBuffer,
  salt: string | ArrayBuffer,
  iterations: number,
  hash: string,
  keyUsages: KeyUsage[]
): Promise<CryptoKey> {
  const passwordBytes =
    typeof password === 'string'
      ? new TextEncoder().encode(password)
      : password;

  const saltBytes =
    typeof salt === 'string' ? new TextEncoder().encode(salt) : salt;

  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveKey', 'deriveBits']
  );

  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    keyUsages
  );
}

export async function pbkdf2Bits(
  password: ArrayBuffer,
  salt: string | ArrayBuffer,
  iterations: number,
  hash: string,
  bits: number
): Promise<ArrayBuffer> {
  const saltBytes =
    typeof salt === 'string' ? new TextEncoder().encode(salt) : salt;

  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    password,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  return window.crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash },
    baseKey,
    bits
  );
}

export async function exportKeyToBase64(key: CryptoKey): Promise<string> {
  const raw = await window.crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

export async function importKeyFromBase64(base64: string): Promise<CryptoKey> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return window.crypto.subtle.importKey(
    'raw',
    bytes,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}
