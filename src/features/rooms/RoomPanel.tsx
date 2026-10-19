import { useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { createOwnedRoom, listOwnedRooms, type OwnedRoom } from '../../services/rooms';
import InvitationPanel from './InvitationPanel';
import JoinedRooms from './JoinedRooms';
import MemberManager from './MemberManager';
import RoomActivityPanel from './RoomActivityPanel';

export default function RoomPanel({ user }: { user: User | null }) {
  const [name, setName] = useState('');
  const [rooms, setRooms] = useState<OwnedRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!user) {
      setRooms([]);
      setLoading(false);
      setError('');
      return;
    }
    let active = true;
    setLoading(true);
    void listOwnedRooms(user)
      .then((data) => { if (active) setRooms(data); })
      .catch(() => { if (active) setError('ไม่สามารถโหลดห้องที่เป็นเจ้าของได้'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user, refresh]);

  const createRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || saving) return;
    setSaving(true);
    setError('');
    try {
      await createOwnedRoom(user, name);
      setName('');
      setRefresh((value) => value + 1);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'ไม่สามารถสร้างห้องได้');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="room-panel" aria-label="ห้องกิจกรรมของฉัน">
      <div className="room-panel-header">
        <div>
          <h2>ห้องของฉัน</h2>
          <p>คำเชิญทดลองแบบใช้ครั้งเดียว อายุไม่เกิน 48 ชั่วโมง พร้อมการยืนยันบัญชีผู้รับก่อนเข้าร่วมห้อง</p>
        </div>
        <span className="room-count">สูงสุด 20 ห้องในรายการ</span>
      </div>
      {user ? (
        <>
          <form className="room-form" onSubmit={(event) => void createRoom(event)}>
            <input aria-label="ชื่อห้องใหม่" value={name} onChange={(event) => setName(event.target.value)}
              maxLength={60} placeholder="ชื่อห้องใหม่ เช่น ทีมท่องเที่ยว" disabled={saving} required />
            <button type="submit" disabled={saving}>{saving ? 'กำลังสร้าง...' : 'สร้างห้อง'}</button>
          </form>
          {error && <p className="room-error" role="alert">{error}</p>}
          {loading ? <p role="status">กำลังโหลดห้อง...</p>
            : rooms.length === 0 ? <p>ยังไม่มีห้องที่คุณเป็นเจ้าของ</p>
              : <ul className="room-list">{rooms.map((room) =>
                <li key={room.id}><strong>{room.name}</strong><small>Owner · จัดการสมาชิกได้ด้านล่าง</small></li>,
              )}</ul>}
          <InvitationPanel user={user} rooms={rooms} onJoined={() => setRefresh((value) => value + 1)} />
          <JoinedRooms user={user} refreshKey={refresh} />
          <MemberManager user={user} rooms={rooms} />
          <RoomActivityPanel user={user} rooms={rooms} />
        </>
      ) : <p>เข้าสู่ระบบด้วย Google เพื่อสร้างและดูห้องที่คุณเป็นเจ้าของ</p>}
    </section>
  );
}
