#!/usr/bin/env node
import { execSync } from 'child_process';
import { copyFileSync, mkdirSync, existsSync, cpSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = resolve(root, 'dist');
const isWatch = process.argv.includes('--watch');

mkdirSync(dist, { recursive: true });
mkdirSync(resolve(dist, 'icons'), { recursive: true });

const run = (cmd) => execSync(cmd, { stdio: 'inherit', cwd: root });

// 1. Build popup (React SPA via Vite)
console.log('Building popup…');
run(`npx vite build${isWatch ? ' --watch' : ''}`);

// 2. Build service worker
console.log('Building service worker…');
run(`npx esbuild src/background/service-worker.ts --bundle --platform=browser --format=esm --outfile=dist/service-worker.js --external:chrome`);

// 3. Build content script (IIFE so it doesn't need module loader)
console.log('Building content script…');
run(`npx esbuild src/content/autofill.ts --bundle --platform=browser --format=iife --outfile=dist/autofill.js`);

// 4. Copy manifest
console.log('Copying assets…');
copyFileSync(resolve(root, 'manifest.json'), resolve(dist, 'manifest.json'));

// 5. Copy icons if they exist
const iconsDir = resolve(root, 'icons');
if (existsSync(iconsDir)) {
  cpSync(iconsDir, resolve(dist, 'icons'), { recursive: true });
} else {
  // Create placeholder icon files so manifest doesn't error
  console.log('Note: no icons/ directory found — add PNG icons before publishing');
}

console.log('✓ Extension built to dist/');
