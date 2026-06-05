import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import clipboard from 'clipboardy';
import { requireAuth } from './config';
import { createClient, apiError } from './api';
import { decryptWithKey, encryptWithKey } from './crypto';
import { printTable, printCard, printSuccess, printError, printInfo, printWarning, mask, formatDate, truncate } from './utils';
import { promptForSymmetricKey } from './auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawVaultItem {
  uuid: string;
  type: string;
  name: string;       // encrypted
  notes?: string;
  favorite: boolean;
  folder_id?: string;
  item_data: string;  // encrypted JSON
  custom_fields?: string;
  totp_secret?: string;
  reprompt: boolean;
  deleted_at?: string;
  created_at?: string;
  updated_at?: string;
  revision_date?: string;
}

interface VaultItem {
  uuid: string;
  type: string;
  name: string;
  notes?: string;
  favorite: boolean;
  folder_id?: string;
  itemData: Record<string, unknown>;
  deleted_at?: string;
  created_at?: string;
  updated_at?: string;
  revision_date?: string;
}

// ─── Session cache ────────────────────────────────────────────────────────────

let _sessionSymKey: string | null = null;

async function getSymKey(): Promise<string> {
  if (_sessionSymKey) return _sessionSymKey;
  const config = requireAuth();
  if (!config.protectedSymmetricKey) {
    printError('No vault key found. Please run `ovault login` again.');
    process.exit(1);
  }
  _sessionSymKey = await promptForSymmetricKey(config.email!, config.protectedSymmetricKey);
  return _sessionSymKey;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function decryptItem(raw: RawVaultItem, symKey: string): VaultItem | null {
  try {
    const name     = decryptWithKey(raw.name, symKey);
    const dataStr  = decryptWithKey(raw.item_data, symKey);
    const itemData = JSON.parse(dataStr) as Record<string, unknown>;
    return {
      uuid: raw.uuid,
      type: raw.type,
      name,
      notes: raw.notes ? decryptWithKey(raw.notes, symKey) : undefined,
      favorite: raw.favorite,
      folder_id: raw.folder_id,
      itemData,
      deleted_at: raw.deleted_at,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
      revision_date: raw.revision_date,
    };
  } catch {
    return null;
  }
}

async function fetchAndDecrypt(symKey: string): Promise<VaultItem[]> {
  const client = createClient();
  const { data } = await client.get<{ items: RawVaultItem[] }>('/vault/sync');
  return data.items
    .filter((i) => !i.deleted_at)
    .map((i) => decryptItem(i, symKey))
    .filter((i): i is VaultItem => i !== null);
}

function findItem(items: VaultItem[], nameOrUuid: string): VaultItem | undefined {
  const q = nameOrUuid.toLowerCase();
  return (
    items.find((i) => i.uuid === nameOrUuid) ||
    items.find((i) => i.name.toLowerCase() === q) ||
    items.find((i) => i.name.toLowerCase().includes(q))
  );
}

function getSubtitle(item: VaultItem): string {
  const d = item.itemData;
  if (item.type === 'login') return String(d.username ?? '');
  if (item.type === 'card')  return String(d.cardholderName ?? '');
  if (item.type === 'identity') return [d.firstName, d.lastName].filter(Boolean).join(' ');
  return '';
}

// ─── Commands ─────────────────────────────────────────────────────────────────

export async function listCommand(opts: { type?: string; search?: string }): Promise<void> {
  requireAuth();
  const symKey  = await getSymKey();
  const spinner = ora('Fetching vault…').start();
  try {
    let items = await fetchAndDecrypt(symKey);
    spinner.stop();

    if (opts.type)   items = items.filter((i) => i.type === opts.type);
    if (opts.search) {
      const q = opts.search.toLowerCase();
      items = items.filter((i) => i.name.toLowerCase().includes(q) || getSubtitle(i).toLowerCase().includes(q));
    }

    if (items.length === 0) {
      printInfo('No items found.');
      return;
    }

    printTable(
      ['Name', 'Type', 'Username / Info', 'Updated'],
      items.map((i) => [
        truncate(i.name, 32),
        i.type,
        truncate(getSubtitle(i), 28),
        formatDate(i.revision_date || i.updated_at),
      ]),
    );
    console.log(chalk.gray(`  ${items.length} item${items.length === 1 ? '' : 's'}`));
  } catch (err) {
    spinner.fail('Failed');
    printError(apiError(err));
    process.exit(1);
  }
}

export async function getCommand(nameOrUuid: string, opts: { show?: boolean }): Promise<void> {
  requireAuth();
  const symKey  = await getSymKey();
  const spinner = ora('Fetching vault…').start();
  try {
    const items = await fetchAndDecrypt(symKey);
    spinner.stop();

    const item = findItem(items, nameOrUuid);
    if (!item) {
      printError(`Item not found: ${nameOrUuid}`);
      process.exit(1);
    }

    const d = item.itemData;
    const showSensitive = opts.show ?? false;

    const pairs: Array<[string, string]> = [
      ['UUID', item.uuid],
      ['Type', item.type],
      ['Name', item.name],
    ];

    if (item.type === 'login') {
      if (d.username) pairs.push(['Username', String(d.username)]);
      if (d.password) pairs.push(['Password', showSensitive ? String(d.password) : mask(String(d.password))]);
      const uris = d.uris as Array<{ uri: string }> | undefined;
      if (uris?.length) pairs.push(['URL', String(uris[0].uri)]);
    } else if (item.type === 'card') {
      if (d.cardholderName) pairs.push(['Cardholder', String(d.cardholderName)]);
      if (d.number)         pairs.push(['Number', showSensitive ? String(d.number) : mask(String(d.number))]);
      if (d.expMonth && d.expYear) pairs.push(['Expires', `${d.expMonth}/${d.expYear}`]);
      if (d.code)           pairs.push(['CVV', showSensitive ? String(d.code) : mask(String(d.code))]);
      if (d.brand)          pairs.push(['Brand', String(d.brand)]);
    } else if (item.type === 'identity') {
      const fields: Array<keyof typeof d> = ['firstName', 'lastName', 'company', 'email', 'phone', 'address1', 'city', 'country'];
      fields.forEach((f) => { if (d[f]) pairs.push([String(f), String(d[f])]); });
    } else if (item.type === 'note') {
      const content = d.content ? String(d.content) : '';
      pairs.push(['Content', showSensitive || content.length <= 80 ? content : content.slice(0, 80) + '…']);
    }

    if (item.notes) pairs.push(['Notes', item.notes]);
    if (item.favorite) pairs.push(['Favorite', '★']);
    pairs.push(['Updated', formatDate(item.revision_date || item.updated_at)]);

    printCard(item.name, pairs);

    if (!showSensitive && (item.type === 'login' || item.type === 'card')) {
      printInfo('Use --show to reveal passwords');
    }
  } catch (err) {
    spinner.fail('Failed');
    printError(apiError(err));
    process.exit(1);
  }
}

export async function addCommand(): Promise<void> {
  requireAuth();
  const symKey = await getSymKey();

  const { type } = await inquirer.prompt([{
    type: 'list',
    name: 'type',
    message: 'Item type:',
    choices: ['login', 'note', 'card', 'identity'],
  }]);

  const { name } = await inquirer.prompt([{
    type: 'input',
    name: 'name',
    message: 'Name:',
    validate: (v: string) => v.trim() ? true : 'Name is required',
  }]);

  let itemData: Record<string, unknown> = {};

  if (type === 'login') {
    const answers = await inquirer.prompt([
      { type: 'input',    name: 'username', message: 'Username:' },
      { type: 'password', name: 'password', message: 'Password:', mask: '*' },
      { type: 'input',    name: 'url',      message: 'URL (optional):' },
    ]);
    itemData = {
      username: answers.username,
      password: answers.password,
      uris: answers.url ? [{ uri: answers.url, match: null }] : [],
    };
  } else if (type === 'note') {
    const { content } = await inquirer.prompt([{
      type: 'editor',
      name: 'content',
      message: 'Secure note content:',
    }]);
    itemData = { content };
  } else if (type === 'card') {
    const answers = await inquirer.prompt([
      { type: 'input', name: 'cardholderName', message: 'Cardholder name:' },
      { type: 'input', name: 'number',         message: 'Card number:' },
      { type: 'input', name: 'expMonth',        message: 'Expiry month (MM):' },
      { type: 'input', name: 'expYear',         message: 'Expiry year (YYYY):' },
      { type: 'input', name: 'code',            message: 'CVV:' },
      { type: 'input', name: 'brand',           message: 'Brand (Visa/Mastercard/etc):' },
    ]);
    itemData = answers;
  } else {
    const answers = await inquirer.prompt([
      { type: 'input', name: 'firstName', message: 'First name:' },
      { type: 'input', name: 'lastName',  message: 'Last name:' },
      { type: 'input', name: 'email',     message: 'Email:' },
      { type: 'input', name: 'phone',     message: 'Phone:' },
      { type: 'input', name: 'company',   message: 'Company:' },
    ]);
    itemData = answers;
  }

  const { notes, favorite } = await inquirer.prompt([
    { type: 'input',   name: 'notes',    message: 'Notes (optional):' },
    { type: 'confirm', name: 'favorite', message: 'Mark as favorite?', default: false },
  ]);

  const spinner = ora('Saving…').start();
  try {
    const client = createClient();
    await client.post('/vault/items', {
      type,
      name:      encryptWithKey(name, symKey),
      item_data: encryptWithKey(JSON.stringify(itemData), symKey),
      notes:     notes ? encryptWithKey(notes, symKey) : null,
      favorite,
      reprompt:  false,
    });
    spinner.succeed('Item created');
    printSuccess(`"${name}" added to vault`);
  } catch (err) {
    spinner.fail('Failed');
    printError(apiError(err));
    process.exit(1);
  }
}

export async function editCommand(nameOrUuid: string): Promise<void> {
  requireAuth();
  const symKey  = await getSymKey();
  const spinner = ora('Fetching vault…').start();
  try {
    const items = await fetchAndDecrypt(symKey);
    spinner.stop();

    const item = findItem(items, nameOrUuid);
    if (!item) {
      printError(`Item not found: ${nameOrUuid}`);
      process.exit(1);
    }

    console.log(chalk.cyan(`\nEditing: ${item.name}\n`));

    const { newName } = await inquirer.prompt([{
      type: 'input',
      name: 'newName',
      message: 'Name:',
      default: item.name,
    }]);

    let itemData: Record<string, unknown> = { ...item.itemData };

    if (item.type === 'login') {
      const d = item.itemData;
      const answers = await inquirer.prompt([
        { type: 'input',    name: 'username', message: 'Username:', default: String(d.username ?? '') },
        { type: 'password', name: 'password', message: 'Password (leave blank to keep):', mask: '*' },
        { type: 'input',    name: 'url',      message: 'URL:', default: String((d.uris as Array<{uri:string}>)?.[0]?.uri ?? '') },
      ]);
      itemData = {
        ...d,
        username: answers.username,
        password: answers.password || d.password,
        uris: answers.url ? [{ uri: answers.url, match: null }] : d.uris,
      };
    }

    const { notes } = await inquirer.prompt([{
      type: 'input',
      name: 'notes',
      message: 'Notes:',
      default: item.notes || '',
    }]);

    const client = createClient();
    spinner.start('Saving…');
    await client.put(`/vault/items/${item.uuid}`, {
      name:      encryptWithKey(newName, symKey),
      item_data: encryptWithKey(JSON.stringify(itemData), symKey),
      notes:     notes ? encryptWithKey(notes, symKey) : null,
    });
    spinner.succeed('Item updated');
    printSuccess(`"${newName}" saved`);
  } catch (err) {
    spinner.fail('Failed');
    printError(apiError(err));
    process.exit(1);
  }
}

export async function deleteCommand(nameOrUuid: string): Promise<void> {
  requireAuth();
  const symKey  = await getSymKey();
  const spinner = ora('Fetching vault…').start();
  try {
    const items = await fetchAndDecrypt(symKey);
    spinner.stop();

    const item = findItem(items, nameOrUuid);
    if (!item) {
      printError(`Item not found: ${nameOrUuid}`);
      process.exit(1);
    }

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Move "${item.name}" to trash?`,
      default: false,
    }]);

    if (!confirm) { printInfo('Cancelled'); return; }

    const client = createClient();
    spinner.start('Deleting…');
    await client.delete(`/vault/items/${item.uuid}`);
    spinner.succeed('Moved to trash');
    printSuccess(`"${item.name}" moved to trash`);
  } catch (err) {
    spinner.fail('Failed');
    printError(apiError(err));
    process.exit(1);
  }
}

export async function copyCommand(nameOrUuid: string, opts: { field?: string }): Promise<void> {
  requireAuth();
  const symKey  = await getSymKey();
  const spinner = ora('Fetching vault…').start();
  try {
    const items = await fetchAndDecrypt(symKey);
    spinner.stop();

    const item = findItem(items, nameOrUuid);
    if (!item) {
      printError(`Item not found: ${nameOrUuid}`);
      process.exit(1);
    }

    const field  = opts.field || 'password';
    const d      = item.itemData;
    let value: string | undefined;

    if (field === 'password' && item.type === 'login') {
      value = String(d.password ?? '');
    } else if (field === 'username') {
      value = String(d.username ?? '');
    } else if (field === 'url') {
      const uris = d.uris as Array<{ uri: string }> | undefined;
      value = uris?.[0]?.uri;
    } else if (d[field] !== undefined) {
      value = String(d[field]);
    } else {
      printError(`Field "${field}" not found on this item`);
      process.exit(1);
    }

    if (!value) {
      printWarning(`Field "${field}" is empty`);
      return;
    }

    clipboard.writeSync(value);
    printSuccess(`"${item.name}" → ${field} copied to clipboard`);
    printInfo('Clipboard will be cleared in 30 seconds…');

    // Keep process alive while waiting to clear
    const timer = setInterval(() => {}, 1000);
    setTimeout(() => {
      clipboard.writeSync('');
      clearInterval(timer);
      printInfo('Clipboard cleared');
    }, 30_000);
  } catch (err) {
    spinner.fail('Failed');
    printError(apiError(err));
    process.exit(1);
  }
}
