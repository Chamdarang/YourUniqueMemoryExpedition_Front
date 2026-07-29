import { describe, expect, it } from 'vitest';
import type { DayScheduleResponse } from '../types/schedule';
import { getScheduleTimingWarning } from './scheduleUtils';

const schedule = (
  id: number,
  startTime: string,
  endTime: string,
  movingDuration = 0,
): DayScheduleResponse => ({
  id,
  dayId: 1,
  scheduleOrder: id,
  spotUserId: id,
  spotName: `장소 ${id}`,
  spotType: 'OTHER',
  isChecked: false,
  lat: 35,
  lng: 135,
  startTime,
  fixedStartTime: true,
  duration: 60,
  endTime,
  movingDuration,
  extraDuration: 0,
  extraMovingDuration: 0,
  transportation: 'WALK',
  memo: '',
  movingMemo: '',
});

describe('getScheduleTimingWarning', () => {
  it('warns when the next fixed schedule starts before arrival', () => {
    const warning = getScheduleTimingWarning(
      schedule(1, '09:00', '10:00'),
      schedule(2, '10:20', '11:20', 30),
    );

    expect(warning).toMatchObject({ type: 'CONFLICT', minutes: 10 });
  });

  it('warns when there is a gap of at least 30 minutes', () => {
    const warning = getScheduleTimingWarning(
      schedule(1, '09:00', '10:00'),
      schedule(2, '11:15', '12:15', 30),
    );

    expect(warning).toMatchObject({ type: 'GAP', minutes: 45 });
  });

  it('does not warn for a short buffer', () => {
    const warning = getScheduleTimingWarning(
      schedule(1, '09:00', '10:00'),
      schedule(2, '10:40', '11:40', 30),
    );

    expect(warning).toBeNull();
  });

  it('calculates conflicts correctly across midnight', () => {
    const warning = getScheduleTimingWarning(
      schedule(1, '22:30', '23:30'),
      schedule(2, '00:00', '01:00', 45),
    );

    expect(warning).toMatchObject({ type: 'CONFLICT', minutes: 15 });
  });
});
