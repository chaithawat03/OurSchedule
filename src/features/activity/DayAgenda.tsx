import { useMemo } from 'react';
import type { CalendarEvent } from '../../lib/unifiedCalendar';
import { personalDayAgenda } from '../../lib/dayAgenda';

interface Props {
  day: string;
  heading: string;
  events: CalendarEvent[];
  userReady: boolean;
  busy: boolean;
  error: string;
  truncated: boolean;
}

export default function DayAgenda({ day, heading, events, userReady, busy, error, truncated }: Props) {
  const agenda = useMemo(() => personalDayAgenda(events, day), [events, day]);
  return (
    <section className="day-agenda" aria-label="กำหนดการรายวัน" aria-busy={busy}>
      <div className="day-agenda-heading">
        <div><p className="eyebrow">DAY AGENDA · ASIA/BANGKOK</p><h2>{heading}</h2></div>
        <span className="private-chip">PRIVATE · เฉพาะที่ได้รับสิทธิ์</span>
      </div>
      {!userReady && <p className="day-agenda-message">เข้าสู่ระบบเพื่อดูกำหนดการส่วนตัวของวันนี้</p>}
      {userReady && <>
        {busy && <p role="status" className="day-agenda-message">กำลังโหลดกำหนดการ...</p>}
        {error && <p role="alert" className="day-agenda-message">{error}</p>}
        {truncated && <p role="status" className="day-agenda-message">ข้อมูลอาจไม่ครบ (จำกัด 100 รายการต่อช่วงวันที่)</p>}
        {!busy && !error && agenda.length === 0 &&
          <p className="day-agenda-message">ยังไม่มีกิจกรรมในวันที่เลือก สามารถสร้างกิจกรรมด้านล่าง</p>}
        <ol className="day-agenda-list">
          {agenda.map(({ activity, timeLabel, startedEarlier, endsLater }) =>
            <li key={activity.id} className="day-agenda-item">
              <span className="day-agenda-time">{timeLabel}</span>
              <div className="day-agenda-details">
                <strong>{activity.title}</strong>
                {activity.source === 'room' && <small className="day-agenda-source">ห้อง: {activity.roomName}</small>}
                {activity.notes && <p>{activity.notes}</p>}
                {startedEarlier && <small>ต่อเนื่องจากวันก่อนหน้า</small>}
                {endsLater && <small>ต่อเนื่องถึงวันถัดไป</small>}
              </div>
            </li>)}
        </ol>
      </>}
      <p className="day-agenda-helper">แสดงกิจกรรมส่วนตัวและกิจกรรม PRIVATE ที่ได้รับสิทธิ์จากห้องที่เลือก · แก้ไขกิจกรรมส่วนตัวด้านล่าง</p>
    </section>
  );
}
