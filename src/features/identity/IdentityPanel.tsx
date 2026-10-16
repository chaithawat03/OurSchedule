import { useIdentity } from './useIdentity';

export default function IdentityPanel() {
  const { state, busy, signIn, signOut } = useIdentity();
  const authenticated = state.status === 'ready' || (state.status === 'error' && state.user !== null);
  const label = state.status === 'ready'
    ? `เชื่อมต่อบัญชีแล้ว: ${state.user.displayName || 'ผู้ใช้งาน'}`
    : state.status === 'unconfigured'
      ? 'ยังไม่ได้ตั้งค่า Firebase สำหรับ Environment นี้'
      : state.status === 'loading'
        ? 'กำลังตรวจสอบบัญชีและโปรไฟล์...'
        : 'เข้าสู่ระบบด้วย Google เพื่อใช้งานโปรไฟล์ส่วนตัว';
  return (
    <section className="identity-panel" aria-label="บัญชีผู้ใช้">
      <div>
        <strong>บัญชี OurSchedule</strong>
        <p>{label}</p>
        {state.status === 'error' && <p className="identity-error" role="alert">{state.message}</p>}
      </div>
      {authenticated ? (
        <button type="button" onClick={() => void signOut()} disabled={busy}>ออกจากระบบ</button>
      ) : (
        <button type="button" onClick={() => void signIn()}
          disabled={busy || state.status === 'loading' || state.status === 'unconfigured'}>
          {busy ? 'กำลังเปิด Google...' : 'เข้าสู่ระบบด้วย Google'}
        </button>
      )}
    </section>
  );
}
