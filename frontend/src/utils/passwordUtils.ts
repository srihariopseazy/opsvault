import CryptoJS from 'crypto-js';

export interface PasswordStrength {
  score: number;   // 0–4
  label: 'Weak' | 'Fair' | 'Strong' | 'Very Strong';
  color: string;   // Tailwind bg class
  pct: number;     // 0–100 for progress bar width
}

export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: 'Weak', color: 'bg-red-500', pct: 5 };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 14) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const levels: PasswordStrength[] = [
    { score: 0, label: 'Weak',        color: 'bg-red-500',    pct: 15 },
    { score: 1, label: 'Weak',        color: 'bg-red-400',    pct: 25 },
    { score: 2, label: 'Fair',        color: 'bg-orange-400', pct: 50 },
    { score: 3, label: 'Strong',      color: 'bg-yellow-400', pct: 75 },
    { score: 4, label: 'Very Strong', color: 'bg-green-500',  pct: 100 },
  ];

  return levels[Math.min(score, 4)];
}

export function isWeakPassword(password: string): boolean {
  const { score } = getPasswordStrength(password);
  return score <= 1;
}

export interface GeneratorOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
}

export const DEFAULT_GENERATOR_OPTIONS: GeneratorOptions = {
  length: 20,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
};

const CHARSETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{}|;:,.<>?',
};

export function generatePassword(opts: GeneratorOptions): string {
  let charset = '';
  if (opts.uppercase) charset += CHARSETS.uppercase;
  if (opts.lowercase) charset += CHARSETS.lowercase;
  if (opts.numbers)   charset += CHARSETS.numbers;
  if (opts.symbols)   charset += CHARSETS.symbols;
  if (!charset) charset = CHARSETS.lowercase + CHARSETS.numbers;

  // Use CryptoJS for random bytes (no window.crypto.subtle)
  const wordArray = CryptoJS.lib.WordArray.random(opts.length * 2);
  const bytes: number[] = [];
  for (let i = 0; i < wordArray.words.length; i++) {
    const word = wordArray.words[i];
    bytes.push((word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff);
  }

  let password = '';
  for (let i = 0; i < opts.length; i++) {
    password += charset[bytes[i] % charset.length];
  }
  return password;
}

const GEN_HISTORY_KEY = 'opsvault_gen_history';

export function getGeneratorHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(GEN_HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveToGeneratorHistory(password: string): void {
  const history = getGeneratorHistory();
  const updated = [password, ...history.filter((p) => p !== password)].slice(0, 10);
  localStorage.setItem(GEN_HISTORY_KEY, JSON.stringify(updated));
}
