import {
  doc, serverTimestamp, Timestamp, type Firestore, type Transaction,
} from 'firebase/firestore';

export type QuotaKind = 'rooms' | 'invites' | 'personalEvents' | 'roomEvents';
const LIMITS: Record<QuotaKind, number> = { rooms: 3, invites: 10, personalEvents: 20, roomEvents: 20 };
const WINDOW_MS = 24 * 60 * 60 * 1000;

export function getQuotaLimit(kind: QuotaKind): number {
  return LIMITS[kind];
}

export async function consumeQuota(
  transaction: Transaction, db: Firestore, uid: string, kind: QuotaKind, resourceId: string,
) {
  const ref = doc(db, 'users', uid, 'quotas', kind);
  const prior = await transaction.get(ref);
  const data = prior.data();
  const started = data?.windowStart instanceof Timestamp ? data.windowStart.toMillis() : 0;
  const expired = !prior.exists() || started <= Date.now() - WINDOW_MS;
  const count = expired ? 1 : Number(data?.count ?? 0) + 1;
  if (count > LIMITS[kind]) {
    throw new Error(kind === 'rooms'
      ? 'สร้างห้องได้ไม่เกิน 3 ห้องต่อ 24 ชั่วโมง'
      : kind === 'invites' ? 'สร้างคำเชิญได้ไม่เกิน 10 ครั้งต่อ 24 ชั่วโมง'
      : 'สร้างกิจกรรมได้ไม่เกิน 20 ครั้งต่อ 24 ชั่วโมง');
  }
  return {
    ref,
    next: {
      count,
      windowStart: expired ? serverTimestamp() : data!.windowStart,
      updatedAt: serverTimestamp(),
      lastResourceId: resourceId,
    },
  };
}
