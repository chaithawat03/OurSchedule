import { useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { bangkokInstant, bangkokLocal, validateActivity } from '../../lib/activityDates';
import { listRoomMembers, type RoomMember } from '../../services/invitations';
import type { OwnedRoom } from '../../services/rooms';
import {
  cancelRoomActivity, createPrivateRoomAssignment, decideRoomActivityInvitation,
  getAssignedPrivateRoomActivity, listOwnedRoomActivities, listRoomActivityInvitations,
  type RoomActivity, type RoomActivityInvitation,
} from '../../services/roomActivities';

export default function RoomActivityPanel({ user, rooms }: {
  user: User;
  rooms: OwnedRoom[];
}) {
  const [roomId, setRoomId] = useState('');
  const [recipientUid, setRecipientUid] = useState('');
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [events, setEvents] = useState<RoomActivity[]>([]);
  const [inbox, setInbox] = useState<RoomActivityInvitation[]>([]);
  const [details, setDetails] = useState<RoomActivity | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [start, setStart] = useState(bangkokLocal(new Date()).slice(0, 10) + 'T09:00');
  const [end, setEnd] = useState(bangkokLocal(new Date()).slice(0, 10) + 'T10:00');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedRoom = rooms.find((r) => r.id === roomId);
  const recipients = members.filter((m) => m.role === 'member' && m.uid !== user.uid);

  useEffect(() => {
    if (!roomId || !rooms.some((r) => r.id === roomId)) {
      setRoomId(rooms[0]?.id ?? '');
    }
  }, [roomId, rooms]);

  useEffect(() => {
    let active = true;
    if (!roomId) { setMembers([]); setEvents([]); return; }
    void Promise.all([listRoomMembers(user, roomId), listOwnedRoomActivities(user, roomId)])
      .then(([membersNext, eventsNext]) => {
        if (!active) return;
        setMembers(membersNext); setEvents(eventsNext);
      })
      .catch(() => { if (active) setError('ไม่สามารถโหลดสมาชิกหรือกิจกรรมของห้องได้'); });
    return () => { active = false; };
  }, [user, roomId, refresh]);

  useEffect(() => {
    let active = true;
    void listRoomActivityInvitations(user).then((data) => {
      if (active) setInbox(data);
    }).catch(() => { if (active) setError('ไม่สามารถโหลดคำเชิญกิจกรรมได้'); });
    return () => { active = false; };
  }, [user, refresh]);

  const execute = async (fn: () => Promise<unknown>, success: string) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await fn();
      setNotice(success); setRefresh((n) => n + 1);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'ไม่สามารถดำเนินการได้');
    } finally { setBusy(false); }
  };

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void execute(async () => {
      const begins = bangkokInstant(start);
      const ends = bangkokInstant(end);
      const clean = validateActivity({ title, notes, start: begins, end: ends });
      await createPrivateRoomAssignment(user, roomId, recipientUid, {
        ...clean, start: begins, end: ends, allDay: false,
      });
      setTitle(''); setNotes('');
    }, 'ส่งกิจกรรมไปยังสมาชิกแล้ว');
  };

  const view = (invite: RoomActivityInvitation) => {
    void execute(async () => {
      const value = await getAssignedPrivateRoomActivity(user, invite.roomId, invite.eventId);
      setDetails(value);
    }, 'โหลดรายละเอียดกิจกรรมแล้ว');
  };

  return (
    <section className="room-activity-panel" aria-label="กิจกรรมที่มอบหมายในห้อง">
      <div className="room-panel-header">
        <div><h2>M3.2a · กิจกรรมที่มอบหมาย</h2>
          <p>เฉพาะ Owner มอบหมายให้ Member ทีละคน ข้อมูล PRIVATE ไม่มีรายการสาธารณะของห้อง</p>
        </div><span className="private-chip">PRIVATE</span>
      </div>
      {error && <p role="alert" className="room-error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {rooms.length > 0 && <form className="personal-form" onSubmit={create}>
        <label>ห้องที่ต้องการมอบหมาย
          <select value={roomId} onChange={(e) => { setRoomId(e.target.value); setRecipientUid(''); }}
            disabled={busy} required>
            {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
          </select>
        </label>
        <p className="room-assignment-policy">
          นโยบายการตอบรับ: {selectedRoom?.assignmentPolicy === 'AUTO_ASSIGN' ?
            'รับกิจกรรมโดยอัตโนมัติ' : 'Member ต้องกดยอมรับหรือปฏิเสธ'}
        </p>
        <label>สมาชิกผู้รับกิจกรรม
          <select value={recipientUid} disabled={busy || recipients.length === 0}
            onChange={(e) => setRecipientUid(e.target.value)} required>
            <option value="">เลือกสมาชิก</option>
            {recipients.map((member) =>
              <option key={member.uid} value={member.uid}>Member · {member.uid.slice(0, 8)}…</option>)}
          </select>
        </label>
        {recipients.length === 0 && <p>ยังไม่มี Member ที่สามารถมอบหมายในห้องนี้ได้</p>}
        <label>ชื่อกิจกรรม
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            maxLength={120} required disabled={busy} placeholder="กิจกรรมสำหรับสมาชิก" />
        </label>
        <label>รายละเอียด
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            rows={2} maxLength={600} disabled={busy} />
        </label>
        <div className="personal-time-grid">
          <label>เริ่ม
            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)}
              required disabled={busy}/>
          </label>
          <label>สิ้นสุด
            <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)}
              required disabled={busy}/>
          </label>
        </div>
        <div className="personal-actions">
          <button type="submit" disabled={busy || !recipientUid || !roomId}>ส่งกิจกรรม</button>
          <button type="button" disabled={busy} onClick={() => setRefresh((n) => n + 1)}>
            โหลดใหม่
          </button>
        </div>
      </form>}
      {roomId && <div className="room-activity-list">
        <h3>กิจกรรมที่คุณมอบหมาย (สูงสุด 20)</h3>
        {events.length === 0 && <p>ยังไม่มีรายการกิจกรรมที่มอบหมายในห้องนี้</p>}
        <ul>{events.map((activity) => <li key={activity.id}>
          <div><strong>{activity.title}</strong>
            <small>{bangkokLocal(activity.start)} · Member {activity.recipientUid.slice(0, 8)}…</small>
            {activity.status === 'cancelled' && <small>ยกเลิกแล้ว</small>}
            <small>ตอบรับ: {activity.assignmentState ?? 'ยังไม่พบสถานะ'}</small>
          </div>
          {activity.status === 'active' && <button type="button" disabled={busy}
            onClick={() => {
              if (window.confirm('ยกเลิกกิจกรรมที่มอบหมายนี้หรือไม่?')) {
                void execute(() => cancelRoomActivity(user, activity.roomId, activity.id), 'ยกเลิกกิจกรรมแล้ว');
              }
            }}>ยกเลิก</button>}
        </li>)}</ul>
      </div>}
      <div className="room-activity-list">
        <div className="room-activity-inbox-header">
          <h3>คำเชิญกิจกรรมสำหรับฉัน (สูงสุด 20)</h3>
          <button type="button" disabled={busy} onClick={() => setRefresh((n) => n + 1)}>
            โหลดคำเชิญใหม่
          </button>
        </div>
        {inbox.length === 0 && <p>ยังไม่มีคำเชิญกิจกรรม</p>}
        <ul>{inbox.map((item) => <li key={item.eventId}>
          <div><strong>{item.title}</strong>
            <small>{bangkokLocal(item.start)}–{bangkokLocal(item.end)} · {item.state}</small>
          </div>
          <div className="personal-actions">
            {item.state === 'PENDING' && <>
              <button type="button" disabled={busy} onClick={() => void execute(
                () => decideRoomActivityInvitation(user, item.eventId, 'ACCEPTED'), 'ยอมรับกิจกรรมแล้ว')}>
                ยอมรับ
              </button>
              <button type="button" disabled={busy} onClick={() => void execute(
                () => decideRoomActivityInvitation(user, item.eventId, 'DECLINED'), 'ปฏิเสธกิจกรรมแล้ว')}>
                ปฏิเสธ
              </button>
            </>}
            {item.state === 'ACCEPTED' && <button type="button" disabled={busy}
              onClick={() => view(item)}>ดูรายละเอียด</button>}
          </div>
        </li>)}</ul>
        {details && <div className="room-activity-details">
          <strong>{details.title}</strong>
          <p>{details.notes || 'ไม่มีรายละเอียดเพิ่มเติม'}</p>
          <p>{bangkokLocal(details.start)}–{bangkokLocal(details.end)}</p>
          <button type="button" onClick={() => setDetails(null)}>ปิดรายละเอียด</button>
        </div>}
      </div>
    </section>
  );
}
