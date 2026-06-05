#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { loginCommand, logoutCommand, statusCommand } from './auth';
import { listCommand, getCommand, addCommand, editCommand, deleteCommand, copyCommand } from './vault';
import { generateCommand } from './generate';
import { exportCommand } from './export';
import { getConfigValue, setConfigValue, loadConfig } from './config';

const program = new Command();

program
  .name('ovault')
  .description('OPSVAULT CLI — zero-knowledge password manager')
  .version('1.0.0');

// ─── Auth ─────────────────────────────────────────────────────────────────────

program
  .command('login')
  .description('Authenticate with your OPSVAULT server')
  .option('-s, --server <url>', 'Server URL')
  .option('-k, --key <apikey>', 'Pre-supply an existing API key (from web UI)')
  .action(async (opts: { server?: string; key?: string }) => {
    await loginCommand(opts);
  });

program
  .command('logout')
  .description('Clear stored credentials')
  .action(() => logoutCommand());

program
  .command('status')
  .description('Show connection status')
  .action(() => statusCommand());

// ─── Vault ────────────────────────────────────────────────────────────────────

program
  .command('list')
  .description('List vault items')
  .option('-t, --type <type>', 'Filter by type (login|note|card|identity)')
  .option('-s, --search <query>', 'Search by name')
  .action(async (opts: { type?: string; search?: string }) => {
    await listCommand(opts);
  });

program
  .command('get <name-or-uuid>')
  .description('Show item details')
  .option('--show', 'Reveal passwords in plaintext')
  .action(async (nameOrUuid: string, opts: { show?: boolean }) => {
    await getCommand(nameOrUuid, opts);
  });

program
  .command('add')
  .description('Interactively add a new vault item')
  .action(async () => {
    await addCommand();
  });

program
  .command('edit <name-or-uuid>')
  .description('Interactively edit a vault item')
  .action(async (nameOrUuid: string) => {
    await editCommand(nameOrUuid);
  });

program
  .command('delete <name-or-uuid>')
  .description('Move an item to trash')
  .action(async (nameOrUuid: string) => {
    await deleteCommand(nameOrUuid);
  });

program
  .command('copy <name-or-uuid>')
  .description('Copy a field to clipboard (clears after 30s)')
  .option('-f, --field <field>', 'Field to copy (default: password)', 'password')
  .action(async (nameOrUuid: string, opts: { field?: string }) => {
    await copyCommand(nameOrUuid, opts);
  });

// ─── Generator ────────────────────────────────────────────────────────────────

program
  .command('generate')
  .description('Generate a secure password')
  .option('-l, --length <n>', 'Password length', '20')
  .option('--no-symbols', 'Letters and numbers only')
  .option('--pin [length]', 'Generate numeric PIN (default: 6 digits)')
  .option('-c, --copy', 'Copy to clipboard')
  .action((opts: { length?: string; noSymbols?: boolean; pin?: string; copy?: boolean }) => {
    generateCommand(opts);
  });

// ─── Export ───────────────────────────────────────────────────────────────────

program
  .command('export')
  .description('Export vault items to file')
  .option('-f, --format <fmt>', 'Format: json or csv', 'json')
  .option('-o, --output <path>', 'Output file path')
  .action(async (opts: { format?: string; output?: string }) => {
    await exportCommand(opts);
  });

// ─── Config ───────────────────────────────────────────────────────────────────

const configCmd = program
  .command('config')
  .description('Manage CLI configuration');

configCmd
  .command('set <key> <value>')
  .description('Set a config value (e.g. server, email)')
  .action((key: string, value: string) => {
    const allowed = ['server', 'email'];
    if (!allowed.includes(key)) {
      console.error(`Unknown config key "${key}". Allowed: ${allowed.join(', ')}`);
      process.exit(1);
    }
    setConfigValue(key as 'server' | 'email', value);
    console.log(chalk.green(`✓ ${key} = ${value}`));
  });

configCmd
  .command('get <key>')
  .description('Get a config value')
  .action((key: string) => {
    const value = getConfigValue(key as 'server' | 'email');
    if (value === undefined) {
      console.log(chalk.gray('(not set)'));
    } else {
      console.log(value);
    }
  });

configCmd
  .command('show')
  .description('Show all config')
  .action(() => {
    const config = loadConfig();
    console.log();
    Object.entries(config).forEach(([k, v]) => {
      const display = k === 'apiKey' && v ? String(v).slice(0, 16) + '…' :
                      k === 'protectedSymmetricKey' && v ? '[encrypted]' : String(v ?? '');
      console.log(`  ${chalk.cyan(k.padEnd(24))} ${display}`);
    });
    console.log();
  });

// ─── Parse ────────────────────────────────────────────────────────────────────

program.parse(process.argv);

if (process.argv.length <= 2) {
  program.help();
}
