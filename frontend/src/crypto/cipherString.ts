// CipherString format: "2.<iv_base64>|<ciphertext_base64>"
// Type 2 = AES-256-GCM

export const CIPHER_TYPE = '2';

export function buildCipherString(iv: Uint8Array, ciphertext: Uint8Array): string {
  const ivB64 = btoa(String.fromCharCode(...iv));
  const ctB64 = btoa(String.fromCharCode(...ciphertext));
  return `${CIPHER_TYPE}.${ivB64}|${ctB64}`;
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
  return value.startsWith(`${CIPHER_TYPE}.`) && value.includes('|');
}
