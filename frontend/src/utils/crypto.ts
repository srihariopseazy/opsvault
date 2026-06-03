/**
 * Browser-side cryptographic helpers for vault health / breach checking.
 * Uses the Web Crypto API (always available in modern browsers).
 */

/** Compute SHA-1 of a UTF-8 string. Returns lowercase hex. */
export async function computeSHA1(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** First 5 uppercase hex chars of a SHA-1 hash (HIBP k-anonymity prefix). */
export function getHashPrefix(hash: string): string {
  return hash.slice(0, 5).toUpperCase();
}

/** Remaining uppercase hex chars after the 5-char prefix. */
export function getHashSuffix(hash: string): string {
  return hash.slice(5).toUpperCase();
}

/** Password strength check — returns a score 0-4. */
export function passwordStrength(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8)  score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}

/** Returns true if a password is considered weak (score < 3). */
export function isWeakPassword(password: string): boolean {
  if (!password) return false;
  const hasUpper   = /[A-Z]/.test(password);
  const hasLower   = /[a-z]/.test(password);
  const hasDigit   = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  return password.length < 8 || !hasUpper || !hasDigit || !hasSpecial || !hasLower;
}
