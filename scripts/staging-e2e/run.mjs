/**
 * Minimal LIVE Staging browser + Rules smoke, intentionally not M3.2a writes.
 * NEVER import the demo emulator-only bridge or deploy test assets.
 */
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { build } from 'vite';
import { STAGING_ORIGIN, SYNTHETIC_UIDS, validateStagingEnv } from './guard.mjs';
import { reconcileSyntheticAuthUser, mintFirebaseCustomToken, rulesGetDocument } from './identity.mjs';

const BOOTSTRAP_PATH = '/__ourschedule_staging_e2e_bootstrap__';

async function getBootstrapCode() {
  const result = await build({
    configFile: false,
    publicDir: false,
    logLevel: 'error',
    build: {
      write: false,
      minify: true,
      sourcemap: false,
      rollupOptions: {
        input: 'tests/staging/auth-bootstrap.js',
        output: { inlineDynamicImports: true, format: 'es' },
      },
    },
  });
  const entry = result.output.find((value) => value.type === 'chunk' && value.isEntry);
  assert.ok(entry && entry.code && !entry.imports.length,
    'Auth bootstrap must be a self-contained, runner-only module');
  return entry.code;
}

async function createBrowserIdentity(browser, firebaseConfig, code, uid, serviceAccount, oauthToken, registerContext) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  registerContext(context);
  const page = await context.newPage();
  const jwt = await mintFirebaseCustomToken({ serviceAccount, oauthToken, uid });
  await page.route(STAGING_ORIGIN + BOOTSTRAP_PATH, async (route) => {
    await route.fulfill({
      status: 200, contentType: 'text/html',
      body: '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',
    });
  });
  await page.goto(STAGING_ORIGIN + BOOTSTRAP_PATH, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ type: 'module', content: code });
  await page.waitForFunction(() => typeof window.__seedStagingE2eAuth === 'function');
  const session = await page.evaluate(
    async ([config, token]) => window.__seedStagingE2eAuth(config, token),
    [firebaseConfig, jwt],
  );
  assert.equal(session.uid, uid, 'Authentication identity mismatch');
  // The real deployed UI sees the IndexedDB Auth state created on the same origin.
  await page.goto(STAGING_ORIGIN + '/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/เชื่อมต่อบัญชีแล้ว:/)).toBeVisible({ timeout: 30000 });
  return { context, idToken: session.idToken, uid };
}

async function main() {
  const config = validateStagingEnv(process.env);
  const bundle = await getBootstrapCode();
  const browser = await chromium.launch({ headless: true });
  const sessions = [];
  const contexts = [];
  let failure = null;
  const cleanupFailures = [];
  try {
    for (const uid of SYNTHETIC_UIDS) {
      sessions.push(await createBrowserIdentity(
        browser, config.firebaseConfig, bundle, uid, config.serviceAccount,
        process.env.GOOGLE_OAUTH_ACCESS_TOKEN, (context) => contexts.push(context),
      ));
    }
    const [owner, member] = sessions;
    // These are Firebase ID tokens, never OAuth or Admin tokens.
    // Test the real deployed UI and live Firestore Security Rules.
    await expect.poll(
      () => rulesGetDocument(owner.idToken, ['users', owner.uid]), { timeout: 25000 },
    ).toBe(200);
    await expect.poll(
      () => rulesGetDocument(member.idToken, ['users', member.uid]), { timeout: 25000 },
    ).toBe(200);
    assert.equal(await rulesGetDocument(member.idToken, ['users', owner.uid]), 403,
      'Member unexpectedly read Owner private profile');
    assert.equal(await rulesGetDocument(owner.idToken, ['users', member.uid]), 403,
      'Owner unexpectedly read Member private profile');
    console.log('STAGING E2E: PASS (two deployed UI sessions and bidirectional UID Rules isolation)');
  } catch (error) {
    failure = error;
  } finally {
    // Browser setup can fail after Auth account creation but before the returned
    // session is recorded. Re-auth and self-delete both allowlisted synthetic
    // UIDs independently of browser/session state, even on mid-sign-in failure.
    // This uses Firebase user credentials; it never bypasses Firestore Rules.
    for (const uid of [...SYNTHETIC_UIDS].reverse()) {
      const role = uid === SYNTHETIC_UIDS[0] ? 'owner' : 'member';
      try {
        await reconcileSyntheticAuthUser({
          uid, apiKey: config.apiKey, serviceAccount: config.serviceAccount,
          oauthToken: process.env.GOOGLE_OAUTH_ACCESS_TOKEN,
        });
        console.log('STAGING E2E: synthetic Auth cleanup ' + role + ': PASS');
      } catch (error) {
        // Log only the role and an allowlisted HTTP status. Never leak raw
        // Firebase errors, signed tokens, UIDs, response bodies or OAuth data.
        const status = error instanceof Error
          ? error.message.match(/\bHTTP ([45]\d\d)\b/)?.[1] : undefined;
        console.error('STAGING E2E: synthetic Auth cleanup ' + role +
          ': FAILED' + (status ? ' (HTTP ' + status + ')' : ' (unclassified)'));
        cleanupFailures.push('synthetic Auth UID reconciliation');
      }
    }
    for (const context of [...contexts].reverse()) {
      try { await context.close(); } catch { cleanupFailures.push('browser context'); }
    }
    try { await browser.close(); } catch { cleanupFailures.push('browser close'); }
  }
  if (failure || cleanupFailures.length) {
    // Avoid emitting raw auth SDK/network errors, keys, signed JWTs or ID tokens.
    throw new Error('STAGING E2E failed; inspect configured project and cleanup. ' +
      (failure ? 'Browser/Rules gate incomplete. ' : '') +
      (cleanupFailures.length ? 'Manual test Auth UID reconciliation required.' : ''));
  }
  console.log('STAGING E2E: Both allowlisted synthetic Auth UIDs reconciled and deleted; two stable profile docs may remain.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
