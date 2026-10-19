import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = 'src';
const bad = [];
function walk(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) { walk(path); continue; }
    if (!/\.tsx?$/.test(item.name)) continue;
    const source = readFileSync(path, 'utf8');
    if (/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(source)) bad.push(path);
  }
}
walk(root);
if (bad.length) {
  console.error('Native browser popup detected; use SweetAlert2 wrapper in src/lib/alerts.ts:', bad.join(', '));
  process.exitCode = 1;
} else {
  console.log('No native browser popup calls in src/');
}
