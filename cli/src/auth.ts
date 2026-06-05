import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig, saveConfig, clearConfig } from './config';
import { createBearerClient, createRawClient, apiError } from './api';
import { deriveMasterKey, deriveMasterPasswordHash, unwrapSymmetricKey } from './crypto';
import { printSuccess, printError } from './utils';

export async function loginCommand(opts: { server?: string; key?: string }): Promise<void> {
  const config = loadConfig();

  const { server, email } = await inquirer.prompt([
    {
      type: 'input',
      name: 'server',
      message: 'Server URL:',
      default: opts.server || config.server || 'http://178.105.94.101:8080',
    },
    {
      type: 'input',
      name: 'email',
      message: 'Email:',
      default: config.email || '',
      validate: (v: string) => v.includes('@') ? true : 'Enter a valid email',
    },
  ]);

  const { password } = await inquirer.prompt([{
    type: 'password',
    name: 'password',
    message: 'Master password:',
    mask: '*',
  }]);

  const spinner = ora('Authenticating…').start();
  try {
    const masterKey          = deriveMasterKey(password, email);
    const masterPasswordHash = deriveMasterPasswordHash(masterKey, password);
    const raw = createRawClient(server);

    const { data: authData } = await raw.post('/auth/login', {
      email,
      master_password_hash: masterPasswordHash,
      device_fingerprint: 'cli-tool',
    });

    let accessToken: string;
    let protectedSymmetricKey: string;

    if (authData.mfa_required) {
      spinner.stop();
      const { code } = await inquirer.prompt([{
        type: 'input',
        name: 'code',
        message: 'TOTP code:',
        validate: (v: string) => (v.length === 6 && /^\d+$/.test(v)) ? true : 'Enter 6 digits',
      }]);
      spinner.start('Verifying MFA…');
      const { data: mfaData } = await raw.post('/auth/verify-mfa', {
        mfa_token: authData.mfa_token,
        totp_code: code,
        trust_device: false,
        device_fingerprint: 'cli-tool',
        device_name: 'OPSVAULT CLI',
      });
      accessToken = mfaData.access_token;
      protectedSymmetricKey = mfaData.protected_symmetric_key;
    } else {
      accessToken = authData.access_token;
      protectedSymmetricKey = authData.protected_symmetric_key;
    }

    // If a pre-supplied API key was provided, skip key creation and use it directly
    if (opts.key) {
      saveConfig({ server, apiKey: opts.key, email, protectedSymmetricKey });
      spinner.succeed('Logged in');
      printSuccess(`Connected to ${server} as ${email}`);
      return;
    }

    spinner.text = 'Creating CLI API key…';
    const bearer = createBearerClient(accessToken, server);
    const { data: keyData } = await bearer.post('/api-keys', {
      name: 'CLI',
      scopes: ['read', 'write'],
      expires_at: null,
    });

    saveConfig({ server, apiKey: keyData.full_key, email, protectedSymmetricKey });
    spinner.succeed('Logged in');
    printSuccess(`Connected to ${server} as ${email}`);
    printSuccess(`API key stored: ${String(keyData.full_key).slice(0, 16)}…`);
  } catch (err) {
    spinner.fail('Login failed');
    printError(apiError(err));
    process.exit(1);
  }
}

export function logoutCommand(): void {
  clearConfig();
  printSuccess('Logged out — credentials cleared');
}

export function statusCommand(): void {
  const config = loadConfig();
  console.log(chalk.bold('\nOPSVAULT CLI\n'));
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Server',    value: config.server },
    { label: 'Email',     value: config.email    || chalk.gray('(not set)') },
    { label: 'API Key',   value: config.apiKey   ? config.apiKey.slice(0, 16) + '…' : chalk.gray('(none)') },
    { label: 'Vault key', value: config.protectedSymmetricKey ? chalk.green('present') : chalk.gray('missing') },
  ];
  rows.forEach(({ label, value }) => {
    console.log(`  ${chalk.cyan(label.padEnd(12))} ${value}`);
  });
  console.log();
  if (!config.apiKey) {
    console.log(chalk.yellow('  Run `ovault login` to authenticate.\n'));
  }
}

/** Prompt for master password and return the unwrapped symmetric key. */
export async function promptForSymmetricKey(email: string, protectedKey: string): Promise<string> {
  const { password } = await inquirer.prompt([{
    type: 'password',
    name: 'password',
    message: 'Master password (to decrypt vault):',
    mask: '*',
  }]);
  try {
    return unwrapSymmetricKey(protectedKey, deriveMasterKey(password, email));
  } catch {
    printError('Incorrect master password');
    process.exit(1);
  }
}
