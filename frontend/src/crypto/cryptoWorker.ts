/**
 * Off-main-thread PBKDF2 for browsers without WebCrypto (non-secure-context
 * origins, e.g. plain HTTP). Only needed because 600,000 crypto-js PBKDF2
 * iterations would otherwise block the UI thread for a noticeable pause.
 */
import CryptoJS from 'crypto-js';

export interface Pbkdf2WorkerRequest {
  id: number;
  password: string;
  salt: string;
  iterations: number;
  keySizeWords: number; // crypto-js keySize unit: 32-bit words
}

export interface Pbkdf2WorkerResponse {
  id: number;
  base64: string;
}

self.onmessage = (e: MessageEvent<Pbkdf2WorkerRequest>) => {
  const { id, password, salt, iterations, keySizeWords } = e.data;
  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: keySizeWords,
    iterations,
    hasher: CryptoJS.algo.SHA256,
  });
  const response: Pbkdf2WorkerResponse = { id, base64: key.toString(CryptoJS.enc.Base64) };
  (self as unknown as Worker).postMessage(response);
};
