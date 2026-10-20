import { bangkokInstant, bangkokLocal, nextBangkokDay, overlapsDay } from './activityDates';
import type { PersonalActivity } from '../services/personalActivities';

export interface DayAgendaEntry {
  activity: PersonalActivity;
  timeLabel: string;
  startedEarlier: boolean;
  endsLater: boolean;
  minuteOfDay: number;
}

/**
 * Clip personal activities to a Bangkok civil day with an EXCLUSIVE end.
 * This does not query or project any shared-room/private-member data.
 * The event title and notes are read only from the signed-in user's own data.
 */
export function personalDayAgenda(events: PersonalActivity[], day: string): DayAgendaEntry[] {
  const begin = bangkokInstant(day + 'T00:00').getTime();
  const next = bangkokInstant(nextBangkokDay(day) + 'T00:00').getTime();
  return events.filter((item) =>
    Number.isFinite(item.start.getTime()) &&
    Number.isFinite(item.end.getTime()) &&
    item.end > item.start &&
    overlapsDay(item.start, item.end, day)
  ).map((activity) => {
    const starts = Math.max(activity.start.getTime(), begin);
    const ends = Math.min(activity.end.getTime(), next);
    const startedEarlier = activity.start.getTime() < begin;
    const endsLater = activity.end.getTime() > next;
    const startLabel = startedEarlier ? '00:00' : bangkokLocal(new Date(starts)).slice(11);
    // 24:00 is the exclusive end of the selected day; never show 00:00
    // for an event that ends exactly at the following midnight.
    const endLabel = ends === next ? '24:00' : bangkokLocal(new Date(ends)).slice(11);
    return {
      activity,
      timeLabel: activity.allDay ? 'ตลอดวัน' : startLabel + '–' + endLabel,
      startedEarlier,
      endsLater,
      minuteOfDay: Math.floor((starts - begin) / 60000),
    };
  }).sort((a, b) =>
    Number(b.activity.allDay) - Number(a.activity.allDay) ||
    a.minuteOfDay - b.minuteOfDay ||
    a.activity.end.getTime() - b.activity.end.getTime() ||
    a.activity.id.localeCompare(b.activity.id)
  );
}
