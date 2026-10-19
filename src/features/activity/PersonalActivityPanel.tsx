import { useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { confirmAction, showError, showSuccess } from '../../lib/alerts';
import { bangkokInstant, bangkokLocal, nextBangkokDay, overlapsDay, validateActivity } from '../../lib/activityDates';
import { cancelPersonalActivity, savePersonalActivity, type PersonalActivity } from '../../services/personalActivities';

interface Props {
  user: User | null;
  day: string;
  events: PersonalActivity[];
  busy: boolean;
  error: string;
  truncated: boolean;
  onUpdated: () => void;
}

export default function PersonalActivityPanel({ user, day, events, busy, error, truncated, onUpdated }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [start, setStart] = useState(day + 'T09:00');
  const [end, setEnd] = useState(day + 'T10:00');
  const [allDay, setAllDay] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEditing(null); setTitle(''); setNotes(''); setAllDay(false);
    setStart(day + 'T09:00'); setEnd(day + 'T10:00');
  }, [day, user?.uid]);

  const selectedEvents = events.filter((event) => overlapsDay(event.start, event.end, day));

  const edit = (event: PersonalActivity) => {
    setEditing(event.id);
    setTitle(event.title); setNotes(event.notes); setAllDay(event.allDay);
    setStart(bangkokLocal(event.start)); setEnd(bangkokLocal(event.end));

  };

  const reset = () => {
    setEditing(null); setTitle(''); setNotes(''); setAllDay(false);
    setStart(day + 'T09:00'); setEnd(day + 'T10:00');
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || saving) return;
    setSaving(true);
    try {
      const startAt = bangkokInstant(allDay ? start.slice(0, 10) + 'T00:00' : start);
      const endAt = bangkokInstant(allDay ? nextBangkokDay(start.slice(0, 10)) + 'T00:00' : end);
      const values = validateActivity({ title, notes, start: startAt, end: endAt });
      await savePersonalActivity(user, { ...values, start: startAt, end: endAt, allDay }, editing ?? undefined);
      reset(); onUpdated();
      showSuccess(editing ? 'แก้ไขกิจกรรมสำเร็จ' : 'สร้างกิจกรรมสำเร็จ');
    } catch (cause: unknown) {
      showError(cause instanceof Error ? cause.message : 'บันทึกไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  const cancel = async (id: string) => {
    if (!user || saving) return;
    if (!await confirmAction({ title: 'ยกเลิกกิจกรรมนี้หรือไม่?', text: 'กิจกรรมที่ยกเลิกแล้วไม่สามารถเปิดใช้งานอีกครั้ง', confirmText: 'ยกเลิกกิจกรรม' })) return;
    setSaving(true);
    try {
      await cancelPersonalActivity(user, id);
      if (editing === id) reset();
      onUpdated();
      showSuccess('ยกเลิกกิจกรรมแล้ว');
    } catch {
      showError('ยกเลิกกิจกรรมไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  return (
    <section className="personal-events" aria-label="กิจกรรมส่วนตัว">
      <div className="personal-heading"><div><h2>กิจกรรมส่วนตัว</h2>
        <p>เฉพาะบัญชีของคุณ · เวลา Asia/Bangkok</p></div><span className="private-chip">PRIVATE</span></div>
      {!user ? <p>เข้าสู่ระบบด้วย Google เพื่อจัดการกิจกรรมส่วนตัว</p> : <>
        {busy && <p role="status">กำลังโหลดกิจกรรม...</p>}
        {error && <p role="alert" className="personal-error">{error}</p>}
        {truncated && <p role="status">แสดงข้อมูลบางส่วน (สูงสุด 100 รายการต่อช่วงวันที่)</p>}
        {!busy && selectedEvents.length === 0 && <p>ยังไม่มีกิจกรรมในวันที่เลือก</p>}
        <ul className="personal-event-list">{selectedEvents.map((activity) => <li key={activity.id}>
          <div><strong>{activity.title}</strong><small>{activity.allDay ? 'ตลอดวัน' :
            bangkokLocal(activity.start).slice(11) + '–' + bangkokLocal(activity.end).slice(11)}
            {activity.notes ? ' · ' + activity.notes : ''}</small></div>
          <div className="personal-actions">
            <button type="button" disabled={saving} onClick={() => edit(activity)}>แก้ไข</button>
            <button type="button" disabled={saving} onClick={() => void cancel(activity.id)}>ยกเลิก</button>
          </div>
        </li>)}</ul>
        <form className="personal-form" onSubmit={(event) => void save(event)}>
          <h3>{editing ? 'แก้ไขกิจกรรม' : 'สร้างกิจกรรมส่วนตัว'}</h3>
          <label>ชื่อกิจกรรม <input value={title} onChange={(e) => setTitle(e.target.value)}
            maxLength={120} placeholder="เช่น นัดหมายส่วนตัว" required disabled={saving} /></label>
          <label>รายละเอียด (ไม่บังคับ) <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            maxLength={600} rows={2} disabled={saving} /></label>
          <label className="personal-check"><input type="checkbox" checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)} disabled={saving} /> ตลอดวัน</label>
          <div className="personal-time-grid">
            <label>เริ่ม <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)}
              required disabled={saving} /></label>
            {!allDay && <label>สิ้นสุด <input type="datetime-local" value={end}
              onChange={(e) => setEnd(e.target.value)} required disabled={saving} /></label>}
          </div>
          <div className="personal-actions">
            <button type="submit" disabled={saving}>{saving ? 'กำลังบันทึก...' :
              editing ? 'บันทึกการแก้ไข' : 'เพิ่มกิจกรรม'}</button>
            {editing && <button type="button" onClick={reset} disabled={saving}>ยกเลิกการแก้ไข</button>}
          </div>
        </form>
      </>}
    </section>
  );
}
