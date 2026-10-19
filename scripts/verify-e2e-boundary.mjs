import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cfg = readFileSync('playwright.config.mjs', 'utf8');
const firebaseClient = readFileSync('src/services/firebaseClient.ts', 'utf8');
const workflow = readFileSync('.github/workflows/emulator-e2e.yml', 'utf8');
assert.match(cfg, /demo-ourschedule-e2e/);
assert.match(cfg, /fake-demo-e2e-only/);
assert.match(firebaseClient, /if \(emulatorRequested && !emulatorAllowed\)/);
assert.match(firebaseClient, /import\.meta\.env\.DEV/);
assert.match(workflow, /npm run test:e2e/);
assert.doesNotMatch(cfg, /ourschedule\.web\.app|400176852634/);
assert.doesNotMatch(workflow, /gcloud auth|google-github-actions\/auth|secrets\./);
console.log('E2E is bound to isolated demo emulators with no cloud credentials.');
