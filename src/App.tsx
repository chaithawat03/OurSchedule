import { useEffect, useMemo, useState } from 'react';
import PersonalActivityPanel from './features/activity/PersonalActivityPanel';
import DayAgenda from './features/activity/DayAgenda';
import { listPersonalActivities, type PersonalActivity } from './services/personalActivities';
import { overlapsDay, shiftBangkokDay } from './lib/activityDates';
import IdentityPanel from './features/identity/IdentityPanel';
import RoomPanel from './features/rooms/RoomPanel';
import { useIdentity } from './features/identity/useIdentity';
import { bangkokYearMonth, monthGrid, shiftMonth } from './lib/monthGrid';
import { listPrivateRoomCalendar } from './services/roomCalendar';
import { mergedCalendarEvents, type CalendarEvent, type CalendarRoom } from './lib/unifiedCalendar';

const EMPTY_PERSONAL_EVENTS: PersonalActivity[] = [];
type View = 'day' | 'month' | 'multi';
const viewNames: Record<View, string> = { day: 'รายวัน', month: 'รายเดือน', multi: 'หลายเดือน' };
const weekdays = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];

function Month({ year, monthIndex, selected, onSelect, events }: {
  year: number; monthIndex: number; selected: string; onSelect: (date: string) => void;
  events: CalendarEvent[];
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
  const [eventsUid, setEventsUid] = useState('');
  const [eventsBusy, setEventsBusy] = useState(false);
  const [eventsError, setEventsError] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [reload, setReload] = useState(0);
  // The room view is keyed to the actual authenticated UID. Never display
  // cached private room data after switching to a different Firebase account.
  const [roomState, setRoomState] = useState<{
    uid:string; rooms:CalendarRoom[]; events:CalendarEvent[]; truncated:boolean;
  } | null>(null);
  const [roomBusy, setRoomBusy] = useState(false);
  const [roomError, setRoomError] = useState('');
  const [hiddenState, setHiddenState] = useState<{uid:string; ids:string[]}>({uid:'', ids:[]});
  const [roomReload, setRoomReload] = useState(0);
  const currentRoomState = user && roomState?.uid === user.uid ? roomState : null;
  const hiddenRoomIds = useMemo(() => new Set(user && hiddenState.uid===user.uid ?
    hiddenState.ids : []), [hiddenState, user?.uid]);
  // Previous Firebase UID's private personal data must not be rendered even
  // for a single frame while React reloads after an account switch.
  const personalEvents = user && eventsUid === user.uid ? events : EMPTY_PERSONAL_EVENTS;
  const visibleEvents = useMemo(() =>
    mergedCalendarEvents(personalEvents, currentRoomState?.events ?? [], hiddenRoomIds),
    [personalEvents, currentRoomState, hiddenRoomIds]);
  const toggleRoom = (id:string) => {
    if (!user) return;
    setHiddenState(previous => {
      const hidden = new Set(previous.uid===user.uid ? previous.ids:[]);
      if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
      return {uid:user.uid,ids:[...hidden]};
    });
  };
  useEffect(() => {
    if (!user) { setEvents([]); setEventsUid(''); setEventsError(''); setTruncated(false); return; }
    let active = true;
    setEventsBusy(true); setEventsUid(''); setEventsError('');
    void listPersonalActivities(user, cursor.year, cursor.monthIndex, view === 'multi')
      .then((result) => { if (active) {
        setEvents(result.events); setEventsUid(user.uid); setTruncated(result.truncated);
      } })
      .catch(() => { if (active) { setEvents([]); setEventsUid(''); setEventsError('ไม่สามารถโหลดกิจกรรมส่วนตัวได้'); } })
      .finally(() => { if (active) setEventsBusy(false); });
    return () => { active = false; };
  }, [user, cursor.year, cursor.monthIndex, view, reload]);

  useEffect(() => {
    if (!user) {
      setRoomState(null); setRoomError(''); setRoomBusy(false);
      return;
    }
    let active=true;
    setRoomState(null); setRoomBusy(true); setRoomError('');
    void listPrivateRoomCalendar(user,cursor.year,cursor.monthIndex,view==='multi')
      .then(data => {
        if (active) setRoomState({uid:user.uid,...data});
      })
      .catch(() => {
        if (active) {
          setRoomState(null);
          setRoomError('โหลดกิจกรรมจากห้องไม่สำเร็จ กรุณาลองใหม่');
        }
      })
      .finally(() => { if (active) setRoomBusy(false); });
    return () => {active=false;};
  }, [user,cursor.year,cursor.monthIndex,view,roomReload]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><div className="mark">OS</div><div><strong>OurSchedule</strong><small>ปฏิทินของเรา</small></div></div>
        <span className="phase">M4 PRIVATE CALENDAR</span>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <p className="section-name">MY WORKSPACE</p>
          <div className="nav-current">ปฏิทินรวม</div>
          <p className="section-name room-heading">ROOMS</p>
          <p className="aside-note">สร้างห้องและเชิญสมาชิกได้แล้ว</p>
          <div className="aside-warning">M4a: แสดงเฉพาะกิจกรรมส่วนตัวและกิจกรรม PRIVATE ที่ได้รับสิทธิ์ กิจกรรม ROOM/BUSY_ONLY ยังไม่เปิดใช้งาน</div>
        </aside>
        <main className="content">
          <div className="heading-row">
            <div><p className="eyebrow">UNIFIED PRIVATE CALENDAR</p><h1>ตารางกิจกรรม</h1><p className="subtitle">รวมกิจกรรมส่วนตัวและงานจากห้องที่คุณได้รับสิทธิ์ โดยไม่เปิดเผยรายการ PRIVATE ของผู้อื่น</p></div>
            <span className="preview-pill">M4a PRIVATE</span>
          </div>
          <IdentityPanel identity={identity} />
          <RoomPanel user={identity.state.status === 'ready' ? identity.state.user : null} />
          {user && <section className="room-calendar-filters" aria-label="ตัวกรองห้องในปฏิทิน">
            <div className="room-calendar-heading"><div>
              <h2>แสดงกิจกรรมจากห้อง</h2>
              <p>กิจกรรมส่วนตัวจะแสดงเสมอ · ห้องที่เลือกจะแสดงเฉพาะ PRIVATE ที่ยอมรับแล้ว</p>
            </div><button type="button" disabled={roomBusy}
              onClick={() => setRoomReload(n=>n+1)}>โหลดปฏิทินใหม่</button></div>
            {roomBusy && <p role="status">กำลังโหลดปฏิทินห้อง...</p>}
            {roomError && <p role="alert" className="room-error">{roomError}</p>}
            {currentRoomState?.truncated && <p role="status">ข้อมูลห้องอาจไม่ครบ เนื่องจากขีดจำกัดจำนวนรายการที่อ่าน</p>}
            {!roomBusy && !roomError && currentRoomState?.rooms.length===0 &&
              <p>ยังไม่มีห้องที่เข้าร่วมหรือเป็นเจ้าของ</p>}
            <div className="room-calendar-options">
              {currentRoomState?.rooms.map(room => <label key={room.id}>
                <input type="checkbox" checked={!hiddenRoomIds.has(room.id)}
                  onChange={() => toggleRoom(room.id)} />
                <span>{room.name} · {room.role==='owner'?'Owner':'Member'}</span>
              </label>)}
            </div>
          </section>}
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
            <DayAgenda day={selected} heading={dateHeading} events={visibleEvents} busy={eventsBusy||roomBusy}
              error={eventsError} truncated={truncated||Boolean(currentRoomState?.truncated)}
              userReady={Boolean(user)} />
          ) : (
            <div className={'calendar-layout' + (view === 'multi' ? ' multi' : '')}>
              <Month year={cursor.year} monthIndex={cursor.monthIndex} selected={selected} onSelect={selectDay} events={visibleEvents} />
              {view === 'multi' && <Month year={nextMonth.year} monthIndex={nextMonth.monthIndex} selected={selected} onSelect={selectDay} events={visibleEvents} />}
            </div>
          )}
          <PersonalActivityPanel key={user?.uid ?? 'signed-out'} user={user} day={selected}
            events={personalEvents} busy={eventsBusy} error={eventsError} truncated={truncated}
            onUpdated={() => setReload((value) => value + 1)} />
          <p className="footnote">● M4a: PRIVATE ที่คุณเป็นเจ้าของหรือได้รับสิทธิ์เท่านั้น · ROOM/BUSY_ONLY อยู่ในแผนถัดไป <span>·</span> {dateHeading}</p>
        </main>
      </div>
    </div>
  );
}
