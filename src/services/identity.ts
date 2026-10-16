import type { User, Auth } from 'firebase/auth';
import { GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';

export async function ensureOwnProfile(user: User, db: Firestore): Promise<void> {
  const ref = doc(db, 'users', user.uid);
  const displayName = (user.displayName?.trim() || 'ผู้ใช้งาน').slice(0, 80);
  const avatar = (user.photoURL || '').slice(0, 2048);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists()) return;
    transaction.set(ref, {
      displayName,
      avatar,
      locale: 'th-TH',
      timezone: 'Asia/Bangkok',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

export interface IdentityService {
  loginWithGoogle(): Promise<void>;
  logout(): Promise<void>;
}

export function createIdentityService(auth: Auth): IdentityService {
  return {
    async loginWithGoogle() {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    },
    logout() {
      return firebaseSignOut(auth);
    },
  };
}

export function identityErrorMessage(error: unknown): string {
  if (!(error instanceof FirebaseError)) return 'ไม่สามารถเชื่อมต่อบัญชีได้ กรุณาลองใหม่';
  switch (error.code) {
    case 'auth/popup-closed-by-user': return 'ยกเลิกการเข้าสู่ระบบแล้ว';
    case 'auth/popup-blocked': return 'เบราว์เซอร์บล็อกหน้าต่าง Google Sign-in กรุณาอนุญาตป๊อปอัปแล้วลองใหม่';
    case 'auth/unauthorized-domain': return 'โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase Authentication';
    case 'auth/operation-not-allowed': return 'ยังไม่ได้เปิด Google Sign-in ใน Firebase Authentication';
    case 'permission-denied': return 'ไม่สามารถสร้างโปรไฟล์ได้ เนื่องจากสิทธิ์ Firestore ยังไม่อนุญาต';
    case 'unavailable': return 'Firestore ไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง';
    default: return 'การเข้าสู่ระบบหรือสร้างโปรไฟล์ไม่สำเร็จ กรุณาลองใหม่';
  }
}
