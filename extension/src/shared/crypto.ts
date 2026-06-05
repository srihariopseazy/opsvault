import CryptoJS from 'crypto-js';

const ITERATIONS = 10000;

export function deriveMasterKey(password: string, email: string): string {
  const key = CryptoJS.PBKDF2(password, email.toLowerCase().trim(), {
    keySize: 256 / 32,
    iterations: ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  });
  return key.toString(CryptoJS.enc.Base64);
}

export function deriveMasterPasswordHash(masterKey: string, password: string): string {
  return CryptoJS.PBKDF2(masterKey, password, {
    keySize: 256 / 32,
    iterations: 1,
    hasher: CryptoJS.algo.SHA256,
  }).toString(CryptoJS.enc.Base64);
}

export function decryptWithKey(cipherString: string, keyBase64: string): string {
  if (!cipherString?.startsWith('2.')) throw new Error('Bad ciphertext');
  const rest = cipherString.slice(2);
  const pipe = rest.indexOf('|');
  if (pipe === -1) throw new Error('Bad ciphertext format');

  const key    = CryptoJS.enc.Base64.parse(keyBase64);
  const iv     = CryptoJS.enc.Base64.parse(rest.slice(0, pipe));
  const ct     = CryptoJS.enc.Base64.parse(rest.slice(pipe + 1));
  const params = CryptoJS.lib.CipherParams.create({ ciphertext: ct });

  const dec = CryptoJS.AES.decrypt(params, key, {
    iv,
    mode: CryptoJS.mode.CTR,
    padding: CryptoJS.pad.NoPadding,
  });
  return dec.toString(CryptoJS.enc.Utf8);
}

export function unwrapSymmetricKey(protectedKey: string, masterKey: string): string {
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
