/**
 * Key exchange for vault sharing.
 *
 * Because OPSVAULT runs on plain HTTP (no HTTPS on production), the Web Crypto
 * SubtleCrypto API is not available. We use crypto-js AES-256-CTR for the key
 * exchange instead of RSA-OAEP — the "public key" uploaded to the server is a
 * random 256-bit AES key, and the "private key" stored locally is that same key
 * encrypted with the user's vault symmetric key.
 *
 * Sharing flow:
 *   1. Sharer generates a random per-share AES key (shareKey).
 *   2. Sharer encrypts the item JSON with shareKey → encrypted_item_data.
 *   3. Sharer fetches recipient's public key (their AES key) from the server.
 *   4. Sharer encrypts shareKey with recipient's public key → encrypted_item_key.
 *   5. Server stores both. Recipient decrypts encrypted_item_key with their
 *      private key (same AES key) to recover shareKey, then decrypts item data.
 */

import CryptoJS from 'crypto-js';
import { encryptWithKey, decryptWithKey } from '../crypto/cryptoEngine';

const PRIVATE_KEY_STORAGE_KEY = 'opsvault_share_privkey';

/** Generate a random 256-bit AES key — serves as both public & private key. */
export function generateShareKeyPair(): string {
  return CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Base64);
}

/** The "public key" is just the raw base64 AES key — uploaded to server. */
export function exportPublicKey(keyPair: string): string {
  return keyPair;
}

/** Encrypt and persist the key pair private half using the vault symmetric key. */
export async function storePrivateKey(keyPair: string, symmetricKey: string): Promise<void> {
  const encrypted = await encryptWithKey(keyPair, symmetricKey);
  localStorage.setItem(PRIVATE_KEY_STORAGE_KEY, encrypted);
}

/** Load and decrypt the private key from localStorage. Returns null if absent. */
export async function loadPrivateKey(symmetricKey: string): Promise<string | null> {
  const encrypted = localStorage.getItem(PRIVATE_KEY_STORAGE_KEY);
  if (!encrypted) return null;
  try {
    return await decryptWithKey(encrypted, symmetricKey);
  } catch {
    return null;
  }
}

/** Generate a random per-share AES key used to encrypt item content. */
export function generateShareKey(): string {
  return CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Base64);
}

/**
 * Encrypt an item's plaintext JSON for sharing.
 * Returns `encrypted_item_data` (item encrypted with shareKey) and
 * `encrypted_item_key` (shareKey encrypted with recipient's public key).
 */
export async function encryptItemForShare(
  item: { name: string; type: string; itemData: unknown; notes?: string },
  recipientPublicKey: string,
): Promise<{ encrypted_item_data: string; encrypted_item_key: string }> {
  const shareKey = generateShareKey();
  const plaintext = JSON.stringify(item);
  const encrypted_item_data = await encryptWithKey(plaintext, shareKey);
  const encrypted_item_key  = await encryptWithKey(shareKey, recipientPublicKey);
  return { encrypted_item_data, encrypted_item_key };
}

/**
 * Decrypt a shared item.
 * Uses the recipient's private key to recover shareKey, then decrypts the item.
 */
export async function decryptSharedItem(
  encryptedItemData: string,
  encryptedItemKey: string,
  privateKey: string,
): Promise<{ name: string; type: string; itemData: Record<string, unknown>; notes?: string }> {
  const shareKey = await decryptWithKey(encryptedItemKey, privateKey);
  const plaintext = await decryptWithKey(encryptedItemData, shareKey);
  return JSON.parse(plaintext);
}
