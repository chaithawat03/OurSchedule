#!/usr/bin/env bash
# Controlled M3.2a staging-only release. Run from reviewed MERGED main commit.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
die() { printf 'STOP: %s\n' "$*" >&2; exit 1; }

[[ -f ".env.local" ]] || die "Missing ignored .env.local"
[[ -z "$(git status --porcelain)" ]] || die "Working tree contains uncommitted changes"
git fetch --quiet origin main
local_head="$(git rev-parse HEAD)"
remote_head="$(git rev-parse origin/main)"
[[ "$local_head" == "$remote_head" ]] || die "HEAD must be the reviewed merged origin/main commit"
node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major !== 24 || minor < 12) process.exit(1);
' || die "Node 24.12+ is required"
node --env-file=.env.local -e '
 const e = process.env;
 if (e.VITE_FIREBASE_PROJECT_ID !== "ourschedule"
   || !e.VITE_FIREBASE_APP_ID?.startsWith("1:400176852634:web:")
   || !e.VITE_FIREBASE_API_KEY
   || !e.VITE_FIREBASE_AUTH_DOMAIN) process.exit(1);
' || die "Firebase config is not the approved staging Web App"

echo "STAGING only: project ourschedule, source $local_head"
echo "No Production project will be touched."
read -r -p "Type DEPLOY M3.2A STAGING to continue: " confirmation
[[ "$confirmation" == "DEPLOY M3.2A STAGING" ]] || die "Operator did not confirm"

npm ci --no-audit --no-fund
node scripts/check-grpc-lock.mjs
npm audit --omit=dev --audit-level=high
npm run lint
npm run typecheck
npm run test:unit
npm run test:rules
npm run build

# M3.2a private owner-to-member event/inbox uses auto single-field indexes only.
# Never mutate or remove the M2 composite members index.
echo "Step 1/2: deploy reviewed M3.2a private-assignment Firestore Rules."
./node_modules/.bin/firebase deploy --only firestore:rules --project ourschedule
echo "Step 2/2: deploy M3.2a Hosting assets to staging."
./node_modules/.bin/firebase deploy --only hosting --project ourschedule

echo "Verifying deployed page and PWA assets..."
local_script="$(grep -oE '/assets/index-[^"]+\.js' dist/index.html | head -n1)"
[[ -n "$local_script" ]] || die "Built JS asset not found"
remote_html="$(curl --fail --silent --show-error --location --max-time 25 \
 'https://ourschedule.web.app/')"
[[ "$remote_html" == *"$local_script"* ]] || die "Hosting does not reference newly built JS asset"
curl --fail --silent --show-error --head 'https://ourschedule.web.app/manifest.webmanifest' >/dev/null
curl --fail --silent --show-error --head 'https://ourschedule.web.app/sw.js' >/dev/null

echo "DEPLOYMENT COMPLETE: M3.2A STAGING"
echo "MERGED COMMIT: $local_head"
echo "HOSTING URL: https://ourschedule.web.app"
echo "Next: owner creates PRIVATE recipient assignment and recipient accepts/declines with a second Auth UID; keep Anonymous provider disabled outside attended test; Production untouched."
