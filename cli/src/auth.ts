import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig, saveConfig, clearConfig } from './config';
import { createRawClient, apiError, getKdfParams, migrateKdf } from './api';
import {
  deriveMasterKey,
  deriveMasterPasswordHash,
  unwrapSymmetricKey,
  wrapSymmetricKey,
  CURRENT_KDF_ITERATIONS,
} from './crypto';
import { printSuccess, printError } from './utils';

/** Best-effort, non-blocking: upgrade a still-legacy account's KDF scheme
 * right after a successful login. Failures are swallowed - the account
 * just stays on its current tier and gets another chance next login. */
async function maybeUpgradeKdf(
  email: string,
  password: string,
  oldMasterKey: string,
  currentIterations: number,
  protectedSymmetricKey: string,
  accessToken: string,
  server: string,
): Promise<void> {
  if (currentIterations >= CURRENT_KDF_ITERATIONS) return;
  try {
    const oldHash = await deriveMasterPasswordHash(oldMasterKey, password);
    const symmetricKey = await unwrapSymmetricKey(protectedSymmetricKey, oldMasterKey);

    const newMasterKey = await deriveMasterKey(password, email, CURRENT_KDF_ITERATIONS);
    const newHash = await deriveMasterPasswordHash(newMasterKey, password);
    const newProtectedSymmetricKey = await wrapSymmetricKey(symmetricKey, newMasterKey);

    await migrateKdf(
      { oldMasterPasswordHash: oldHash, newMasterPasswordHash: newHash, newProtectedSymmetricKey, newKdfIterations: CURRENT_KDF_ITERATIONS },
      accessToken,
      server,
    );
  } catch {
    // Silent - never surfaced, never blocks login.
  }
}

export async function loginCommand(opts: { server?: string }): Promise<void> {
  const config = loadConfig();

  const { server, email } = await inquirer.prompt([
    {
      type: 'input',
      name: 'server',
      message: 'Server URL:',
      default: opts.server || config.server || 'http://opsvault.opseazy.com:8081',
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
    const kdfParams          = await getKdfParams(email, server);
    const masterKey          = await deriveMasterKey(password, email, kdfParams.kdf_iterations);
    const masterPasswordHash = await deriveMasterPasswordHash(masterKey, password);
    const raw = createRawClient(server);

    const { data: authData } = await raw.post('/auth/login', {
      email,
      masterPasswordHash,
      device_fingerprint: 'cli-tool',
    });

    let accessToken: string;
    let refreshToken: string;
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
      refreshToken = mfaData.refresh_token;
      protectedSymmetricKey = mfaData.protected_symmetric_key;
    } else {
      accessToken = authData.access_token;
      refreshToken = authData.refresh_token;
      protectedSymmetricKey = authData.protected_symmetric_key;
    }

    // Best-effort, doesn't block the rest of login.
    void maybeUpgradeKdf(email, password, masterKey, kdfParams.kdf_iterations, protectedSymmetricKey, accessToken, server);

    saveConfig({ server, accessToken, refreshToken, email, protectedSymmetricKey, kdfIterations: kdfParams.kdf_iterations });
    spinner.succeed('Logged in');
    printSuccess(`Connected to ${server} as ${email}`);
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
    { label: 'Session',   value: config.accessToken ? chalk.green('logged in') : chalk.gray('(none)') },
    { label: 'Vault key', value: config.protectedSymmetricKey ? chalk.green('present') : chalk.gray('missing') },
  ];
  rows.forEach(({ label, value }) => {
    console.log(`  ${chalk.cyan(label.padEnd(12))} ${value}`);
  });
  console.log();
  if (!config.accessToken) {
    console.log(chalk.yellow('  Run `ovault login` to authenticate.\n'));
  }
}

/** Prompt for master password and return the unwrapped symmetric key.
 * `iterations` should be the account's actual stored value (config.kdfIterations,
 * falling back to the legacy default for a config saved before this field existed). */
export async function promptForSymmetricKey(email: string, protectedKey: string, iterations: number): Promise<string> {
  const { password } = await inquirer.prompt([{
    type: 'password',
    name: 'password',
    message: 'Master password (to decrypt vault):',
    mask: '*',
  }]);
  try {
    const masterKey = await deriveMasterKey(password, email, iterations);
    return await unwrapSymmetricKey(protectedKey, masterKey);
  } catch {
    printError('Incorrect master password');
    process.exit(1);
  }
}
