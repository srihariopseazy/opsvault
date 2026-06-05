import fs from 'fs';
import path from 'path';
import ora from 'ora';
import { requireAuth } from './config';
import { createClient, apiError } from './api';
import { decryptWithKey } from './crypto';
import { printSuccess, printError, printWarning } from './utils';
import { promptForSymmetricKey } from './auth';

interface RawVaultItem {
  uuid: string;
  type: string;
  name: string;
  notes?: string;
  favorite: boolean;
  item_data: string;
  deleted_at?: string;
  created_at?: string;
  updated_at?: string;
}

export async function exportCommand(opts: {
  format?: string;
  output?: string;
}): Promise<void> {
  const config  = requireAuth();
  const format  = opts.format || 'json';
  const outFile = opts.output || `opsvault-export-${Date.now()}.${format}`;

  if (format === 'csv') {
    printWarning('CSV export contains PLAINTEXT passwords. Ensure the file is stored securely.');
    printWarning('This export is NOT encrypted.');
  }

  const symKey  = await promptForSymmetricKey(config.email!, config.protectedSymmetricKey!);
  const spinner = ora('Fetching vault…').start();

  try {
    const client = createClient();
    const { data } = await client.get<{ items: RawVaultItem[] }>('/vault/sync');

    const items = data.items.filter((i) => !i.deleted_at);
    spinner.text = `Decrypting ${items.length} items…`;

    const decrypted = items.map((raw) => {
      try {
        const name     = decryptWithKey(raw.name, symKey);
        const dataStr  = decryptWithKey(raw.item_data, symKey);
        const itemData = JSON.parse(dataStr) as Record<string, unknown>;
        const notes    = raw.notes ? decryptWithKey(raw.notes, symKey) : undefined;
        return { uuid: raw.uuid, type: raw.type, name, notes, favorite: raw.favorite, itemData, created_at: raw.created_at };
      } catch {
        return null;
      }
    }).filter(Boolean);

    spinner.text = 'Writing file…';
    const absPath = path.resolve(outFile);

    if (format === 'csv') {
      const lines = ['uuid,type,name,username,password,url,notes'];
      decrypted.forEach((item) => {
        if (!item) return;
        const d = item.itemData;
        const uris = d.uris as Array<{ uri: string }> | undefined;
        const row = [
          item.uuid,
          item.type,
          csvEscape(item.name),
          csvEscape(String(d.username ?? '')),
          csvEscape(String(d.password ?? '')),
          csvEscape(String(uris?.[0]?.uri ?? '')),
          csvEscape(item.notes ?? ''),
        ].join(',');
        lines.push(row);
      });
      fs.writeFileSync(absPath, lines.join('\n'), 'utf-8');
    } else {
      fs.writeFileSync(absPath, JSON.stringify({ exported_at: new Date().toISOString(), items: decrypted }, null, 2), 'utf-8');
    }

    spinner.succeed(`Exported ${decrypted.length} items`);
    printSuccess(`Saved to: ${absPath}`);
  } catch (err) {
    spinner.fail('Export failed');
    printError(apiError(err));
    process.exit(1);
  }
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}
