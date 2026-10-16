#!/usr/bin/env bash
# Controlled M2 staging-only release. Run from reviewed MERGED main commit.
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
read -r -p "Type DEPLOY STAGING to continue: " confirmation
[[ "$confirmation" == "DEPLOY STAGING" ]] || die "Operator did not confirm"

npm ci --no-audit --no-fund
node scripts/check-grpc-lock.mjs
npm audit --omit=dev --audit-level=high
npm run lint
npm run typecheck
npm run test:unit
npm run test:rules
npm run build

echo "Step 1/3: create Firestore composite index; Rules and Hosting unchanged."
./node_modules/.bin/firebase deploy --only firestore:indexes --project ourschedule

echo "Waiting for COLLECTION_GROUP members(uid,role,membershipState) index READY..."
ready=0
for ((attempt=1; attempt<=20; attempt++)); do
  if json="$(gcloud firestore indexes composite list \
      --project=ourschedule --database='(default)' --format=json 2>/dev/null)"; then
    if printf '%s' "$json" | python3 -c '
import sys,json
indexes=json.load(sys.stdin)
for i in indexes:
  parts=i.get("name","").split("/")
  if "collectionGroups" not in parts: continue
  group=parts[parts.index("collectionGroups")+1]
  if group != "members" or i.get("state") != "READY" or i.get("queryScope") != "COLLECTION_GROUP": continue
  fields=[f.get("fieldPath") for f in i.get("fields",[])]
  if fields[:3] == ["uid","role","membershipState"]: sys.exit(0)
sys.exit(1)
'; then
      ready=1
      break
    fi
  fi
  echo "Index not READY ($attempt/20); waiting 15 seconds..."
  sleep 15
done
[[ "$ready" -eq 1 ]] || die "Index not verified READY. Rules/Hosting NOT deployed. Re-run when ready."

echo "Step 2/3: deploy reviewed Firestore Rules to staging."
./node_modules/.bin/firebase deploy --only firestore:rules --project ourschedule
echo "Step 3/3: deploy prebuilt Hosting assets to staging."
./node_modules/.bin/firebase deploy --only hosting --project ourschedule

echo "Verifying deployed page and PWA assets..."
local_script="$(grep -oE '/assets/index-[^"]+\.js' dist/index.html | head -n1)"
[[ -n "$local_script" ]] || die "Built JS asset not found"
remote_html="$(curl --fail --silent --show-error --location --max-time 25 \
 'https://ourschedule.web.app/')"
[[ "$remote_html" == *"$local_script"* ]] || die "Hosting does not reference newly built JS asset"
curl --fail --silent --show-error --head 'https://ourschedule.web.app/manifest.webmanifest' >/dev/null
curl --fail --silent --show-error --head 'https://ourschedule.web.app/sw.js' >/dev/null

echo "DEPLOYMENT COMPLETE: M2 STAGING"
echo "MERGED COMMIT: $local_head"
echo "HOSTING URL: https://ourschedule.web.app"
echo "Next: live UI/security tests; Production not touched."
