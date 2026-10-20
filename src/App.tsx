import { useEffect, useMemo, useState } from 'react';
import PersonalActivityPanel from './features/activity/PersonalActivityPanel';
import DayAgenda from './features/activity/DayAgenda';
import { listPersonalActivities, type PersonalActivity } from './services/personalActivities';
import { overlapsDay, shiftBangkokDay } from './lib/activityDates';
import IdentityPanel from './features/identity/IdentityPanel';
import RoomPanel from './features/rooms/RoomPanel';
import { useIdentity } from './features/identity/useIdentity';
import { bangkokYearMonth, monthGrid, shiftMonth } from './lib/monthGrid';

type View = 'day' | 'month' | 'multi';
const viewNames: Record<View, string> = { day: 'รายวัน', month: 'รายเดือน', multi: 'หลายเดือน' };
const weekdays = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];

function Month({ year, monthIndex, selected, onSelect, events }: {
  year: number; monthIndex: number; selected: string; onSelect: (date: string) => void;
  events: PersonalActivity[];
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
        >{cell.day}{events.some((event) => overlapsDay(event.start, event.end, cell.date)) &&
          <span className="day-activity-count" aria-label="มีกิจกรรม">●</span>}</button>)}
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
  const navigate = (offset: number) => setCursor((old) => {
    const next = shiftMonth(old.year, old.monthIndex, offset);
    setSelected([next.year, String(next.monthIndex + 1).padStart(2, '0'), '01'].join('-'));
    return next;
  });
  const selectDay = (date: string) => {
    setSelected(date);
    const [year, month] = date.split('-').map(Number);
    // Selecting a calendar overflow cell must load its actual month.
    if (year !== cursor.year || month - 1 !== cursor.monthIndex) {
      setCursor({ year, monthIndex: month - 1 });
    }
  };
  const navigateDay = (delta: number) => selectDay(shiftBangkokDay(selected, delta));
  const nextMonth = shiftMonth(cursor.year, cursor.monthIndex, 1);
  const user = identity.state.status === 'ready' ? identity.state.user : null;
  const [events, setEvents] = useState<PersonalActivity[]>([]);
  const [eventsBusy, setEventsBusy] = useState(false);
  const [eventsError, setEventsError] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!user) { setEvents([]); setEventsError(''); setTruncated(false); return; }
    let active = true;
    setEventsBusy(true); setEventsError('');
    void listPersonalActivities(user, cursor.year, cursor.monthIndex, view === 'multi')
      .then((result) => { if (active) { setEvents(result.events); setTruncated(result.truncated); } })
      .catch(() => { if (active) { setEvents([]); setEventsError('ไม่สามารถโหลดกิจกรรมส่วนตัวได้'); } })
      .finally(() => { if (active) setEventsBusy(false); });
    return () => { active = false; };
  }, [user, cursor.year, cursor.monthIndex, view, reload]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><div className="mark">OS</div><div><strong>OurSchedule</strong><small>ปฏิทินของเรา</small></div></div>
        <span className="phase">M3 PERSONAL ACTIVITIES</span>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <p className="section-name">MY WORKSPACE</p>
          <div className="nav-current">ปฏิทินส่วนตัว</div>
          <p className="section-name room-heading">ROOMS</p>
          <p className="aside-note">สร้างห้องและเชิญสมาชิกได้แล้ว</p>
          <div className="aside-warning">M3.1: กิจกรรมส่วนตัวพร้อมใช้งาน กิจกรรมของห้องและการแชร์รายละเอียดจะอยู่ใน M3.2</div>
        </aside>
        <main className="content">
          <div className="heading-row">
            <div><p className="eyebrow">PERSONAL CALENDAR</p><h1>ตารางกิจกรรม</h1><p className="subtitle">เข้าสู่ระบบเพื่อสร้างและจัดการกิจกรรมส่วนตัว โดยไม่เปิดเผยให้สมาชิกห้อง</p></div>
            <span className="preview-pill">M3.1 PRIVATE</span>
          </div>
          <IdentityPanel identity={identity} />
          <RoomPanel user={identity.state.status === 'ready' ? identity.state.user : null} />
          <div className="toolbar">
            <div className="nav-month">
              <button type="button" onClick={() => view === 'day' ? navigateDay(-1) : navigate(-1)}
                aria-label={view === 'day' ? 'วันก่อนหน้า' : 'เดือนก่อนหน้า'}>‹</button>
              <button type="button" onClick={() => { setCursor({ year: today.year, monthIndex: today.monthIndex }); setSelected([today.year, String(today.monthIndex + 1).padStart(2, '0'), String(today.day).padStart(2, '0')].join('-')); }}>วันนี้</button>
              <button type="button" onClick={() => view === 'day' ? navigateDay(1) : navigate(1)}
                aria-label={view === 'day' ? 'วันถัดไป' : 'เดือนถัดไป'}>›</button>
            </div>
            <div className="view-switch" aria-label="รูปแบบปฏิทิน">
              {(Object.keys(viewNames) as View[]).map((key) => <button type="button" key={key} aria-pressed={key === view} className={view === key ? 'active' : ''} onClick={() => setView(key)}>{viewNames[key]}</button>)}
            </div>
          </div>
          {view === 'day' ? (
            <DayAgenda day={selected} heading={dateHeading} events={events} busy={eventsBusy}
              error={eventsError} truncated={truncated} userReady={Boolean(user)} />
          ) : (
            <div className={'calendar-layout' + (view === 'multi' ? ' multi' : '')}>
              <Month year={cursor.year} monthIndex={cursor.monthIndex} selected={selected} onSelect={selectDay} events={events} />
              {view === 'multi' && <Month year={nextMonth.year} monthIndex={nextMonth.monthIndex} selected={selected} onSelect={selectDay} events={events} />}
            </div>
          )}
          <PersonalActivityPanel key={user?.uid ?? 'signed-out'} user={user} day={selected}
            events={events} busy={eventsBusy} error={eventsError} truncated={truncated}
            onUpdated={() => setReload((value) => value + 1)} />
          <p className="footnote">● M3.1: กิจกรรมส่วนตัว PRIVATE ไม่เปิดเผยให้สมาชิกห้อง <span>·</span> {dateHeading}</p>
        </main>
      </div>
    </div>
  );
}
