import { describe, expect, it } from 'vitest';
import { shiftDate } from './timeUtils';

describe('shiftDate', () => {
  it('현재 일정 일수만큼 종료일을 계산한다', () => {
    expect(shiftDate('2026-07-29', 9)).toBe('2026-08-07');
  });

  it('종료일에서 일정 일수만큼 시작일을 역산한다', () => {
    expect(shiftDate('2026-12-02', -9)).toBe('2026-11-23');
  });

  it('유효하지 않은 날짜는 계산하지 않는다', () => {
    expect(shiftDate('', 9)).toBe('');
    expect(shiftDate('2026-02-30', 9)).toBe('');
  });
});
