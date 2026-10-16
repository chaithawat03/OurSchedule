import { doc, getDoc, serverTimestamp } from 'firebase/firestore';

// Emulator test utility: constructs a quota transition in the same batch.
// Production code uses an SDK transaction for contention-safe retries.
export async function includeQuota(batch, db, uid, kind, resourceId) {
  const ref = doc(db, 'users', uid, 'quotas', kind);
  const snapshot = await getDoc(ref);
  const previous = snapshot.data();
  batch.set(ref, {
    count: snapshot.exists() ? previous.count + 1 : 1,
    windowStart: snapshot.exists() ? previous.windowStart : serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastResourceId: resourceId,
  });
}
