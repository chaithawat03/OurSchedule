import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { confirmAction, showError, showSuccess } from '../../lib/alerts';
import type { OwnedRoom } from '../../services/rooms';
import { listRoomMembers, removeRoomMember, type RoomMember } from '../../services/invitations';

export default function MemberManager({ user, rooms }: { user: User; rooms: OwnedRoom[] }) {
  const [roomId, setRoomId] = useState('');
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setRoomId(''); setMembers([]); }, [user.uid]);

  const load = async (id: string) => {
    setRoomId(id);
    setMembers([]);
    if (!id) return;
    setBusy(true);
    try {
      setMembers(await listRoomMembers(user, id));
    } catch {
      showError('โหลดรายชื่อสมาชิกไม่สำเร็จ');
    } finally { setBusy(false); }
  };

  const remove = async (uid: string) => {
    if (!roomId || busy || uid === user.uid) return;
    if (!await confirmAction({ title: 'เพิกถอนสิทธิ์สมาชิก?', text: `Member ${uid.slice(0, 8)}… จะไม่สามารถเข้าถึงห้องนี้ได้`, confirmText: 'ลบสมาชิก' })) return;
    setBusy(true);
    try {
      await removeRoomMember(user, roomId, uid);
      setMembers((items) => items.filter((item) => item.uid !== uid));
      showSuccess('เพิกถอนสิทธิ์สมาชิกแล้ว');
    } catch {
      showError('ไม่สามารถเพิกถอนสิทธิ์สมาชิกได้');
    } finally { setBusy(false); }
  };

  return (
    <div className="room-member-manager" aria-label="จัดการสมาชิกห้อง">
      <h2>จัดการสมาชิก (Owner)</h2>
      <p>เจ้าของห้องสามารถลบได้เฉพาะ Member เท่านั้น Owner ไม่สามารถลบได้</p>
      <select aria-label="เลือกห้องเพื่อจัดการสมาชิก" value={roomId}
        onChange={(event) => void load(event.target.value)} disabled={busy}>
        <option value="">เลือกห้องของฉัน</option>
        {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
      </select>
      {roomId && <ul className="room-members">{members.map((member) =>
        <li key={member.uid}>
          <span>{member.uid.slice(0, 8)}… · {member.role}</span>
          {member.role === 'member' && <button type="button" onClick={() => void remove(member.uid)}
            disabled={busy}>ลบสมาชิก</button>}
        </li>,
      )}</ul>}
    </div>
  );
}
