// CipherString format: "<type>.<iv_base64>|<ciphertext_base64>"
// Type 2 = AES-256-CTR (crypto-js; used when WebCrypto is unavailable, and by
//          any account/item created before the WebCrypto/AES-GCM migration -
//          not actually GCM despite what this file used to claim)
// Type 3 = AES-256-GCM (WebCrypto, authenticated) - written whenever WebCrypto
//          is available; the ciphertext includes the GCM auth tag, appended
//          by SubtleCrypto's own encrypt() output

export const CIPHER_TYPE_CTR = '2';
export const CIPHER_TYPE_GCM = '3';

export function buildCipherString(type: string, iv: Uint8Array, ciphertext: Uint8Array): string {
  const ivB64 = btoa(String.fromCharCode(...iv));
  const ctB64 = btoa(String.fromCharCode(...ciphertext));
  return `${type}.${ivB64}|${ctB64}`;
}

export function parseCipherString(cipherString: string): {
  type: string;
  iv: Uint8Array;
  ciphertext: Uint8Array;
} {
  if (!cipherString || !cipherString.includes('.')) {
    throw new Error('Invalid CipherString format: missing type prefix');
  }

  const dotIndex = cipherString.indexOf('.');
  const type = cipherString.substring(0, dotIndex);
  const rest = cipherString.substring(dotIndex + 1);

  const pipeIndex = rest.indexOf('|');
  if (pipeIndex === -1) {
    throw new Error('Invalid CipherString format: missing pipe separator');
  }

  const ivB64 = rest.substring(0, pipeIndex);
  const ctB64 = rest.substring(pipeIndex + 1);

  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));

  return { type, iv, ciphertext };
}

export function isCipherString(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  return (
    (value.startsWith(`${CIPHER_TYPE_CTR}.`) || value.startsWith(`${CIPHER_TYPE_GCM}.`)) &&
    value.includes('|')
  );
}
