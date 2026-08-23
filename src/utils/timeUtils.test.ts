import { describe, expect, it } from 'vitest';
import { limitDateYear, shiftDate } from './timeUtils';

describe('limitDateYear', () => {
  it('연도를 네 자리까지만 유지한다', () => {
    expect(limitDateYear('123456-07-29')).toBe('1234-07-29');
    expect(limitDateYear('20260')).toBe('2026');
  });

  it('네 자리 연도와 빈 값은 변경하지 않는다', () => {
    expect(limitDateYear('2026-07-29')).toBe('2026-07-29');
    expect(limitDateYear('')).toBe('');
  });
});

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
