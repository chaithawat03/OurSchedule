import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { listJoinedRooms, type JoinedRoom } from '../../services/rooms';
import { leaveRoom } from '../../services/invitations';

export default function JoinedRooms({ user, refreshKey }: { user: User; refreshKey: number }) {
  const [rooms, setRooms] = useState<JoinedRoom[]>([]);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let current = true;
    setMessage('');
    setRooms([]);
    void listJoinedRooms(user)
      .then((values) => { if (current) setRooms(values); })
      .catch(() => { if (current) setMessage('ไม่สามารถโหลดห้องที่เข้าร่วมได้'); });
    return () => { current = false; };
  }, [user, refreshKey]);

  const leave = async (roomId: string) => {
    if (working) return;
    setWorking(true);
    setMessage('');
    try {
      await leaveRoom(user, roomId);
      setRooms((previous) => previous.filter((room) => room.id !== roomId));
      setMessage('ออกจากห้องแล้ว');
    } catch {
      setMessage('ไม่สามารถออกจากห้องได้ กรุณาลองใหม่');
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="joined-rooms" aria-label="ห้องที่ฉันเข้าร่วม">
      <h2>ห้องที่ฉันเข้าร่วม</h2>
      <p>รายชื่อสมาชิกของคุณจะกลับมาเมื่อ Refresh หรือเข้าสู่ระบบครั้งถัดไป</p>
      {rooms.length === 0 ? <p>ยังไม่มีห้องที่เข้าร่วม</p> : (
        <ul className="room-list">
          {rooms.map((room) => <li key={room.id}>
            <strong>{room.name}</strong>
            <small>Member · เข้าถึงเฉพาะข้อมูลห้องที่ได้รับสิทธิ์</small>
            <button type="button" disabled={working} onClick={() => void leave(room.id)}>ออกจากห้อง</button>
          </li>)}
        </ul>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
