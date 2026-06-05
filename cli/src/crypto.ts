import CryptoJS from 'crypto-js';

const PBKDF2_ITERATIONS = 10000;

export function deriveMasterKey(password: string, email: string): string {
  const key = CryptoJS.PBKDF2(password, email.toLowerCase().trim(), {
    keySize: 256 / 32,
    iterations: PBKDF2_ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  });
  return key.toString(CryptoJS.enc.Base64);
}

export function deriveMasterPasswordHash(masterKey: string, password: string): string {
  const hash = CryptoJS.PBKDF2(masterKey, password, {
    keySize: 256 / 32,
    iterations: 1,
    hasher: CryptoJS.algo.SHA256,
  });
  return hash.toString(CryptoJS.enc.Base64);
}

export function decryptWithKey(cipherString: string, keyBase64: string): string {
  if (!cipherString?.startsWith('2.')) {
    throw new Error(`Invalid CipherString: ${String(cipherString).slice(0, 20)}`);
  }
  const rest    = cipherString.slice(2);
  const pipeIdx = rest.indexOf('|');
  if (pipeIdx === -1) throw new Error('Invalid CipherString: missing pipe');

  const key        = CryptoJS.enc.Base64.parse(keyBase64);
  const iv         = CryptoJS.enc.Base64.parse(rest.slice(0, pipeIdx));
  const ciphertext = CryptoJS.enc.Base64.parse(rest.slice(pipeIdx + 1));
  const params     = CryptoJS.lib.CipherParams.create({ ciphertext });

  const decrypted = CryptoJS.AES.decrypt(params, key, {
    iv,
    mode: CryptoJS.mode.CTR,
    padding: CryptoJS.pad.NoPadding,
  });
  return decrypted.toString(CryptoJS.enc.Utf8);
}

export function encryptWithKey(plaintext: string, keyBase64: string): string {
  const key = CryptoJS.enc.Base64.parse(keyBase64);
  const iv  = CryptoJS.lib.WordArray.random(16);

  const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
    iv,
    mode: CryptoJS.mode.CTR,
    padding: CryptoJS.pad.NoPadding,
  });

  return `2.${iv.toString(CryptoJS.enc.Base64)}|${encrypted.ciphertext.toString(CryptoJS.enc.Base64)}`;
}

export function unwrapSymmetricKey(protectedKey: string, masterKey: string): string {
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
