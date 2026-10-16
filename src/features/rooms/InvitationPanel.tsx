import { useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import type { OwnedRoom } from '../../services/rooms';
import { firebaseClient } from '../../services/firebaseClient';
import {
  acceptRoomInvite, createRoomInvite, inspectRoomInvite, revokeRoomInvite, leaveRoom,
} from '../../services/invitations';
import { inviteFromHash, inviteLink, parseInviteToken } from '../../lib/invites';

function decodeInput(text: string): string {
  const value = text.trim();
  if (value.startsWith('https://')) {
    const link = new URL(value);
    if (link.origin !== window.location.origin || link.pathname !== '/') {
      throw new Error('ลิงก์นี้ไม่ใช่ OurSchedule Staging');
    }
    const token = inviteFromHash(link.hash);
    if (!token) throw new Error('ลิงก์ไม่มีรหัสคำเชิญที่ถูกต้อง');
    return token;
  }
  return parseInviteToken(value);
}

export default function InvitationPanel({ user, rooms, onJoined }: { user: User; rooms: OwnedRoom[]; onJoined: () => void }) {
  const [roomId, setRoomId] = useState('');
  const [issued, setIssued] = useState('');
  const [input, setInput] = useState(() => inviteFromHash(window.location.hash) ?? '');
  const [joinedRoom, setJoinedRoom] = useState('');
  const [joinedRoomId, setJoinedRoomId] = useState('');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setIssued('');
    setJoinedRoom('');
    setJoinedRoomId('');
    setMessage('');
  }, [user.uid]);

  const issue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (working || !rooms.some((room) => room.id === roomId)) return;
    setWorking(true);
    setMessage('');
    try {
      const token = await createRoomInvite(user, roomId);
      setIssued(token);
      setMessage('สร้างคำเชิญแล้ว ลิงก์นี้ใช้ได้ครั้งเดียวและหมดอายุภายใน 48 ชั่วโมง');
    } catch {
      setMessage('สร้างคำเชิญไม่สำเร็จ โปรดตรวจสอบว่าคุณเป็นเจ้าของห้อง');
    } finally {
      setWorking(false);
    }
  };

  const redeem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (working) return;
    setWorking(true);
    setMessage('');
    try {
      const token = decodeInput(input);
      const summary = await inspectRoomInvite(user, token);
      if (summary.state !== 'pending' || summary.expiresAt.getTime() <= Date.now()) {
        throw new Error('คำเชิญนี้ถูกใช้ ถูกยกเลิก หรือหมดอายุแล้ว');
      }
      const joinedId = await acceptRoomInvite(user, token);
      if (!firebaseClient) throw new Error('Firebase ยังไม่พร้อม');
      const snapshot = await getDoc(doc(firebaseClient.db, 'rooms', joinedId));
      setJoinedRoom(snapshot.exists() ? String(snapshot.data().name) : 'ห้องใหม่');
      setJoinedRoomId(joinedId);
      onJoined();
      setInput('');
      if (inviteFromHash(window.location.hash) === token) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      setMessage('เข้าร่วมห้องสำเร็จ');
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'รับคำเชิญไม่สำเร็จ');
    } finally {
      setWorking(false);
    }
  };

  const revoke = async () => {
    if (!issued || working) return;
    setWorking(true);
    try {
      await revokeRoomInvite(user, issued);
      setIssued('');
      setMessage('ยกเลิกคำเชิญแล้ว');
    } catch {
      setMessage('ยกเลิกคำเชิญไม่สำเร็จ (อาจถูกใช้ไปแล้ว)');
    } finally {
      setWorking(false);
    }
  };


  const leaveJoinedRoom = async () => {
    if (!joinedRoomId || working) return;
    setWorking(true);
    try {
      await leaveRoom(user, joinedRoomId);
      setJoinedRoom('');
      setJoinedRoomId('');
      setMessage('ออกจากห้องแล้ว');
    } catch {
      setMessage('ออกจากห้องไม่สำเร็จ');
    } finally { setWorking(false); }
  };

  return (
    <div className="invite-section" aria-label="คำเชิญเข้าร่วมห้อง">
      <h2>คำเชิญเข้าร่วมห้อง (ทดลอง M2.2)</h2>
      <p className="invite-warning">ลิงก์คำเชิญเป็นสิทธิ์แบบใช้ครั้งเดียว ผู้ได้รับลิงก์ต้องเข้าสู่ระบบก่อน และสามารถส่งต่อให้ผู้อื่นได้ อย่าส่งในช่องทางสาธารณะ</p>
      {rooms.length > 0 && (
        <form className="invite-form" onSubmit={(event) => void issue(event)}>
          <select aria-label="เลือกห้องเพื่อเชิญ" value={roomId} onChange={(event) => setRoomId(event.target.value)} required disabled={working}>
            <option value="">เลือกห้องของฉัน</option>
            {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
          </select>
          <button type="submit" disabled={working || !roomId}>สร้างลิงก์เชิญ</button>
        </form>
      )}
      {issued && (
        <div>
          <p>ลิงก์สำหรับแชร์ (ผู้ถือครองลิงก์สามารถใช้สิทธิ์ครั้งเดียว)</p>
          <div className="invite-link">{inviteLink(issued, window.location.origin)}</div>
          <button type="button" className="invite-danger" onClick={() => void revoke()} disabled={working}>ยกเลิกคำเชิญนี้</button>
        </div>
      )}
      <form className="invite-form" onSubmit={(event) => void redeem(event)}>
        <input aria-label="ลิงก์หรือรหัสคำเชิญ" value={input} onChange={(event) => setInput(event.target.value)}
          placeholder="วางลิงก์เชิญหรือรหัสคำเชิญ" disabled={working} required />
        <button type="submit" disabled={working || !input.trim()}>เข้าร่วมห้อง</button>
      </form>
      {joinedRoom && <div><p className="invite-status">คุณเข้าร่วม: {joinedRoom}</p>
        <button type="button" onClick={() => void leaveJoinedRoom()} disabled={working}>ออกจากห้องนี้</button></div>}
      {message && <p role="status" className="invite-status">{message}</p>}
    </div>
  );
}
