import chalk from 'chalk';
import clipboard from 'clipboardy';
import { generatePassword } from './crypto';
import { printSuccess, printInfo } from './utils';

export function generateCommand(opts: {
  length?: string;
  noSymbols?: boolean;
  pin?: string;
  copy?: boolean;
}): void {
  const isPinMode = opts.pin !== undefined;
  const length    = isPinMode
    ? parseInt(opts.pin || '6', 10)
    : parseInt(opts.length || '20', 10);

  if (isNaN(length) || length < 1) {
    console.error('Invalid length');
    process.exit(1);
  }

  const password = generatePassword({
    length,
    noSymbols: opts.noSymbols ?? false,
    pin: isPinMode,
    pinLength: length,
  });

  console.log();
  console.log(chalk.bold.white('  Generated password:'));
  console.log(`  ${chalk.green.bold(password)}`);
  console.log(`  ${chalk.gray(`Length: ${password.length} · Strength: ${strengthLabel(password)}`)}`);
  console.log();

  if (opts.copy) {
    clipboard.writeSync(password);
    printSuccess('Password copied to clipboard');
    printInfo('Clipboard will be cleared in 30 seconds…');
    const timer = setInterval(() => {}, 1000);
    setTimeout(() => {
      clipboard.writeSync('');
      clearInterval(timer);
      printInfo('Clipboard cleared');
    }, 30_000);
  }
}

function strengthLabel(pwd: string): string {
  const hasLower   = /[a-z]/.test(pwd);
  const hasUpper   = /[A-Z]/.test(pwd);
  const hasNumbers = /\d/.test(pwd);
  const hasSymbols = /[^a-zA-Z0-9]/.test(pwd);
  const score      = [hasLower, hasUpper, hasNumbers, hasSymbols].filter(Boolean).length;

  if (pwd.length < 8)           return chalk.red('Weak');
  if (score <= 2 || pwd.length < 12) return chalk.yellow('Fair');
  if (score === 3)              return chalk.blue('Good');
  return chalk.green('Strong');
}
