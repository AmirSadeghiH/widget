// Reproducible headless Chromium with no external browser download. The npm
// package supplies the binary and NSS libraries needed by lean Linux sandboxes.
// WIDGET_BROWSER_PATH can point to a locally installed browser instead.
import chromium from '@sparticuz/chromium';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export async function browserOptions() {
  if (process.env.WIDGET_BROWSER_PATH) return { executablePath: process.env.WIDGET_BROWSER_PATH, args: ['--no-sandbox'] };
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const bin = path.join(root, 'node_modules/@sparticuz/chromium/bin');
  const libs = path.join(root, '.cache/chromium-libs');
  if (process.platform === 'linux' && !existsSync(path.join(libs, 'lib/libnspr4.so'))) {
    mkdirSync(libs, { recursive: true });
    const archive = path.join(root, '.cache/al2023.tar');
    writeFileSync(archive, brotliDecompressSync(readFileSync(path.join(bin, 'al2023.tar.br'))));
    execFileSync('tar', ['-xf', archive, '-C', libs]);
  }
  return {
    executablePath: await chromium.executablePath(),
    // Unlike serverless defaults, retain normal origin and CORS enforcement.
    args: chromium.args.filter(arg => !['--disable-web-security', '--allow-running-insecure-content', '--single-process'].includes(arg)),
    env: { ...process.env, LD_LIBRARY_PATH: [path.join(libs, 'lib'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') }
  };
}
