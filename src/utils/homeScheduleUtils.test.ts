import { describe, expect, it } from 'vitest';
import type { DayScheduleResponse } from '../types/schedule';
import { getHomeScheduleState } from './homeScheduleUtils';

const schedule = (id: number, startTime: string | null, overrides: Partial<DayScheduleResponse> = {}) => ({
  id, startTime, endTime: null, duration: 60, movingDuration: 0,
  isChecked: false, isSkipped: false, ...overrides,
}) as DayScheduleResponse;

describe('home timetable', () => {
  it('does not invent a next schedule for untimed places', () => {
    const result = getHomeScheduleState([schedule(1, null), schedule(2, null)], 600);
    expect(result.activeSchedule).toBeUndefined();
    expect(result.nextSchedule).toBeUndefined();
    expect(result.activeMovingIndex).toBe(-1);
  });

  it('keeps a visited place as the current schedule until its end time', () => {
    const visited = schedule(1, '10:00', { isChecked: true });
    expect(getHomeScheduleState([visited], 630).activeSchedule?.id).toBe(1);
    expect(getHomeScheduleState([visited], 660).activeSchedule).toBeUndefined();
  });

  it('chooses the nearest future time even if visited, ignoring untimed and past places', () => {
    const items = [schedule(1, null), schedule(2, '08:00'), schedule(3, '15:00'),
      schedule(4, '11:00', { isChecked: true })];
    expect(getHomeScheduleState(items, 600).nextSchedule?.id).toBe(4);
  });

  it('does not reuse an unfinished past schedule after the day ends', () => {
    expect(getHomeScheduleState([schedule(1, '09:00')], 1080).nextSchedule).toBeUndefined();
    expect(getHomeScheduleState([], 1080).nextSchedule).toBeUndefined();
  });

  it('retains movement to a visited destination but never invents movement to an untimed place', () => {
    const first = schedule(1, '09:00', { endTime: '10:00' });
    const destination = schedule(2, '10:30', { movingDuration: 30, isChecked: true });
    expect(getHomeScheduleState([first, destination], 610).activeMovingIndex).toBe(1);
    expect(getHomeScheduleState([first, { ...destination, startTime: null }], 610).activeMovingIndex).toBe(-1);
  });

  it('continues to exclude skipped schedules', () => {
    const result = getHomeScheduleState([
      schedule(1, '10:00', { isSkipped: true }), schedule(2, '11:00', { isSkipped: true }),
    ], 630);
    expect(result.activeSchedule).toBeUndefined();
    expect(result.nextSchedule).toBeUndefined();
  });
});
