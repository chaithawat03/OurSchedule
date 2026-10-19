import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const assets = 'dist/assets';
const scripts = readdirSync(assets).filter((name) => name.endsWith('.js'));
if (!scripts.length) throw new Error('No production JS bundles found');
const forbidden = ['__ourscheduleE2e', 'Emulator test identity is not signed in'];
for (const name of scripts) {
  const body = readFileSync(join(assets, name), 'utf8');
  if (forbidden.some((value) => body.includes(value))) {
    throw new Error('Test bridge leaked into public production asset: ' + name);
  }
}
console.log('Production build excludes test-only Playwright identity bridge.');
