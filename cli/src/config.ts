import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR  = path.join(os.homedir(), '.opsvault');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export interface OpsVaultConfig {
  server: string;
  apiKey?: string;
  email?: string;
  protectedSymmetricKey?: string;
}

const DEFAULTS: OpsVaultConfig = {
  server: 'http://178.105.94.101:8080',
};

export function loadConfig(): OpsVaultConfig {
  if (!fs.existsSync(CONFIG_FILE)) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(config: OpsVaultConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600, encoding: 'utf-8' });
}

export function clearConfig(): void {
  if (fs.existsSync(CONFIG_FILE)) fs.unlinkSync(CONFIG_FILE);
}

export function getConfigValue(key: keyof OpsVaultConfig): string | undefined {
  return loadConfig()[key] as string | undefined;
}

export function setConfigValue(key: keyof OpsVaultConfig, value: string): void {
  const config = loadConfig();
  (config as Record<string, string>)[key] = value;
  saveConfig(config);
}

export function requireAuth(): OpsVaultConfig {
  const config = loadConfig();
  if (!config.apiKey || !config.email) {
    console.error('Not logged in. Run: ovault login');
    process.exit(1);
  }
  return config;
}
