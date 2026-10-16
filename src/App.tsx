import { useMemo, useState } from 'react';
import IdentityPanel from './features/identity/IdentityPanel';
import RoomPanel from './features/rooms/RoomPanel';
import { useIdentity } from './features/identity/useIdentity';
import { bangkokYearMonth, monthGrid, shiftMonth } from './lib/monthGrid';

type View = 'day' | 'month' | 'multi';
const viewNames: Record<View, string> = { day: 'รายวัน', month: 'รายเดือน', multi: 'หลายเดือน' };
const weekdays = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];

function Month({ year, monthIndex, selected, onSelect }: {
  year: number; monthIndex: number; selected: string; onSelect: (date: string) => void;
}) {
  const cells = useMemo(() => monthGrid(year, monthIndex), [year, monthIndex]);
  const heading = new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, monthIndex, 1)));
  return (
    <section className="month-card" aria-label={heading}>
      <h2>{heading}</h2>
      <div className="month-grid">
        {weekdays.map((day) => <span className="weekday" key={day}>{day}</span>)}
        {cells.map((cell) => <button
          type="button" key={cell.date} aria-label={cell.date} aria-pressed={selected === cell.date}
          className={'day-cell' + (cell.isCurrentMonth ? '' : ' outside') + (selected === cell.date ? ' selected' : '')}
          onClick={() => onSelect(cell.date)}
        >{cell.day}</button>)}
      </div>
    </section>
  );
}

export default function App() {
  const identity = useIdentity();
  const today = useMemo(() => bangkokYearMonth(new Date()), []);
  const [cursor, setCursor] = useState({ year: today.year, monthIndex: today.monthIndex });
  const [view, setView] = useState<View>('month');
  const [selected, setSelected] = useState(
    [today.year, String(today.monthIndex + 1).padStart(2, '0'), String(today.day).padStart(2, '0')].join('-'),
  );
  const dateHeading = new Intl.DateTimeFormat('th-TH', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(selected + 'T12:00:00Z'));
  const navigate = (offset: number) => setCursor((old) => shiftMonth(old.year, old.monthIndex, offset));
  const nextMonth = shiftMonth(cursor.year, cursor.monthIndex, 1);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><div className="mark">OS</div><div><strong>OurSchedule</strong><small>ปฏิทินของเรา</small></div></div>
        <span className="phase">M2 ROOM OWNERSHIP</span>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <p className="section-name">MY WORKSPACE</p>
          <div className="nav-current">ปฏิทินส่วนตัว</div>
          <p className="section-name room-heading">ROOMS</p>
          <p className="aside-note">สร้างห้องส่วนตัวได้แล้ว การเชิญสมาชิกจะเปิดใน M2 ระยะถัดไป</p>
          <div className="aside-warning">M2: ห้องที่สร้างยังเป็นส่วนตัว ไม่เปิดรับสมาชิกหรือกิจกรรมจนกว่ากฎการแชร์จะผ่านการตรวจสอบ</div>
        </aside>
        <main className="content">
          <div className="heading-row">
            <div><p className="eyebrow">CALENDAR FOUNDATION</p><h1>ตารางกิจกรรม</h1><p className="subtitle">เข้าสู่ระบบด้วย Google เพื่อใช้งานบัญชีส่วนตัว ฟังก์ชันกิจกรรมจะพัฒนาใน M3</p></div>
            <span className="preview-pill">Preview only</span>
          </div>
          <IdentityPanel identity={identity} />
          <RoomPanel user={identity.state.status === 'ready' ? identity.state.user : null} />
          <div className="toolbar">
            <div className="nav-month">
              <button type="button" onClick={() => navigate(-1)} aria-label="เดือนก่อนหน้า">‹</button>
              <button type="button" onClick={() => { setCursor({ year: today.year, monthIndex: today.monthIndex }); setSelected([today.year, String(today.monthIndex + 1).padStart(2, '0'), String(today.day).padStart(2, '0')].join('-')); }}>วันนี้</button>
              <button type="button" onClick={() => navigate(1)} aria-label="เดือนถัดไป">›</button>
            </div>
            <div className="view-switch" aria-label="รูปแบบปฏิทิน">
              {(Object.keys(viewNames) as View[]).map((key) => <button type="button" key={key} aria-pressed={key === view} className={view === key ? 'active' : ''} onClick={() => setView(key)}>{viewNames[key]}</button>)}
            </div>
          </div>
          {view === 'day' ? (
            <section className="empty-state">
              <p className="eyebrow">DAY VIEW</p><h2>{dateHeading}</h2><p>ยังไม่มีกิจกรรม ฟังก์ชันข้อมูลจริงจะเริ่มใน M3</p>
              <button type="button" onClick={() => setView('month')}>กลับสู่รายเดือน</button>
            </section>
          ) : (
            <div className={'calendar-layout' + (view === 'multi' ? ' multi' : '')}>
              <Month year={cursor.year} monthIndex={cursor.monthIndex} selected={selected} onSelect={setSelected} />
              {view === 'multi' && <Month year={nextMonth.year} monthIndex={nextMonth.monthIndex} selected={selected} onSelect={setSelected} />}
            </div>
          )}
          <p className="footnote">● M2: โปรไฟล์และห้องที่สร้างเองเท่านั้น กิจกรรมยังไม่เปิดใช้งาน <span>·</span> {dateHeading}</p>
        </main>
      </div>
    </div>
  );
}
