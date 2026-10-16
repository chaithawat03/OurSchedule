import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const { packages } = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const installed = Object.entries(packages)
  .filter(([path]) => path.endsWith('/@grpc/grpc-js'))
  .map(([path, info]) => ({ path, version: info.version }));

assert.ok(installed.length > 0, 'Expected Firestore gRPC dependency in the resolved lockfile');
for (const { path, version } of installed) {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const [major, minor, patch] = version.split('.').map(Number);
  assert.ok(major > 1 || (major === 1 && (minor > 14 || (minor === 14 && patch >= 5))),
    `Unpatched gRPC dependency at ${path}: ${version}`);
}
console.log('Patched gRPC lockfile versions:', installed.map(({ version }) => version).join(', '));
