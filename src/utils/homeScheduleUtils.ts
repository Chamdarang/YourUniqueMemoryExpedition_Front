import type { DayScheduleResponse } from '../types/schedule';

const minutes = (time: string) => {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
};

export function getHomeScheduleState(schedules: DayScheduleResponse[], now: number) {
  // Visit completion is a record, not a change to the timetable.
  const timed = schedules.filter(item => !item.isSkipped && item.startTime != null)
    .sort((a, b) => minutes(a.startTime!) - minutes(b.startTime!));
  const activeSchedule = timed.find(item => {
    const start = minutes(item.startTime!);
    return start <= now && now < start + item.duration;
  });
  const nextSchedule = timed.find(item => minutes(item.startTime!) > now);
  const activeMovingIndex = activeSchedule ? -1 : schedules.findIndex((item, index) => {
    const previousEnd = schedules[index - 1]?.endTime;
    if (item.isSkipped || !item.startTime || !previousEnd) return false;
    const start = minutes(previousEnd);
    return start <= now && now < Math.min(start + item.movingDuration, minutes(item.startTime));
  });
  return { activeSchedule, nextSchedule, activeMovingIndex };
}
