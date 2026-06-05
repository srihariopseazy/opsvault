import Table from 'cli-table3';
import chalk from 'chalk';

export function printTable(headers: string[], rows: string[][]): void {
  const table = new Table({
    head: headers.map((h) => chalk.cyan(h)),
    style: { head: [], border: ['gray'] },
    wordWrap: true,
  });
  rows.forEach((row) => table.push(row));
  console.log(table.toString());
}

export function printCard(title: string, pairs: Array<[string, string | undefined]>): void {
  console.log();
  console.log(chalk.bold.white(`  ${title}`));
  console.log(chalk.gray('  ' + '─'.repeat(Math.min(title.length + 2, 50))));
  pairs.forEach(([label, value]) => {
    if (value !== undefined) {
      console.log(`  ${chalk.cyan(label.padEnd(16))} ${value}`);
    }
  });
  console.log();
}

export function printKeyValue(pairs: Array<[string, string | undefined]>): void {
  pairs.forEach(([label, value]) => {
    if (value !== undefined) {
      console.log(`  ${chalk.cyan(label + ':')} ${value}`);
    }
  });
}

export function printSuccess(msg: string): void {
  console.log(chalk.green('✓') + ' ' + msg);
}

export function printError(msg: string): void {
  console.error(chalk.red('✗') + ' ' + msg);
}

export function printWarning(msg: string): void {
  console.warn(chalk.yellow('⚠') + ' ' + msg);
}

export function printInfo(msg: string): void {
  console.log(chalk.blue('ℹ') + ' ' + msg);
}

export function mask(value: string): string {
  return chalk.gray('••••••••');
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export function truncate(str: string, max = 36): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

export function codeBlock(code: string): string {
  return chalk.bgBlack.white(' ' + code + ' ');
}
