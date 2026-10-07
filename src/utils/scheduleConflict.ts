import type { DayScheduleResponse, ScheduleUpdateRequest } from '../types/schedule';

export type ScheduleConflictFieldKey =
  | 'spotUserId' | 'spotName' | 'lat' | 'lng' | 'spotType'
  | 'startTime' | 'fixedStartTime' | 'duration' | 'movingDuration'
  | 'extraDuration' | 'extraMovingDuration' | 'transportation' | 'memo' | 'movingMemo';

export type ScheduleConflictChoice = 'mine' | 'latest';

export interface ScheduleConflictRow {
  key: ScheduleConflictFieldKey;
  label: string;
  base: unknown;
  mine: unknown;
  latest: unknown;
  localChanged: boolean;
  remoteChanged: boolean;
  conflict: boolean;
}

const fieldLabels: Record<ScheduleConflictFieldKey, string> = {
  spotUserId: '내 장소 연결',
  spotName: '장소명',
  lat: '위도',
  lng: '경도',
  spotType: '장소 유형',
  startTime: '시작 시간',
  fixedStartTime: '시작 시간 고정',
  duration: '체류 시간',
  movingDuration: '이동 시간',
  extraDuration: '체류 여유 시간',
  extraMovingDuration: '이동 여유 시간',
  transportation: '이동 수단',
  memo: '일정 메모',
  movingMemo: '이동 메모',
};

const fields = Object.keys(fieldLabels) as ScheduleConflictFieldKey[];

const valueFromSchedule = (schedule: DayScheduleResponse, key: ScheduleConflictFieldKey): unknown => {
  const value = schedule[key];
  if (key === 'startTime') return typeof value === 'string' ? value.slice(0, 5) : null;
  if (key === 'memo' || key === 'movingMemo' || key === 'spotName') return value ?? '';
  return value;
};

const valueFromPatch = (
  patch: ScheduleUpdateRequest,
  base: DayScheduleResponse,
  key: ScheduleConflictFieldKey,
): unknown => {
  const value = patch[key];
  if (value === undefined) return valueFromSchedule(base, key);
  if (key === 'startTime') return typeof value === 'string' ? value.slice(0, 5) : null;
  if (key === 'memo' || key === 'movingMemo' || key === 'spotName') return value ?? '';
  return value;
};

const areEqual = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export const getScheduleConflictRows = (
  base: DayScheduleResponse,
  mine: ScheduleUpdateRequest,
  latest: DayScheduleResponse,
): ScheduleConflictRow[] => fields.flatMap(key => {
  const originalValue = valueFromSchedule(base, key);
  const mineValue = valueFromPatch(mine, base, key);
  const latestValue = valueFromSchedule(latest, key);
  const localChanged = !areEqual(originalValue, mineValue);
  const remoteChanged = !areEqual(originalValue, latestValue);
  if (!localChanged && !remoteChanged) return [];
  return [{
    key,
    label: fieldLabels[key],
    base: originalValue,
    mine: mineValue,
    latest: latestValue,
    localChanged,
    remoteChanged,
    conflict: localChanged && remoteChanged && !areEqual(mineValue, latestValue),
  }];
});

export const mergeScheduleConflict = (
  base: DayScheduleResponse,
  mine: ScheduleUpdateRequest,
  latest: DayScheduleResponse,
  choices: Partial<Record<ScheduleConflictFieldKey, ScheduleConflictChoice>>,
): ScheduleUpdateRequest => {
  const merged: ScheduleUpdateRequest = { expectedVersion: latest.version };
  for (const row of getScheduleConflictRows(base, mine, latest)) {
    if (!row.localChanged) continue;
    if (row.conflict && choices[row.key] === 'latest') continue;
    if (row.conflict && choices[row.key] !== 'mine') continue;
    const value = mine[row.key];
    if (value !== undefined) (merged as unknown as Record<string, unknown>)[row.key] = value;
  }
  return merged;
};

export const formatScheduleConflictValue = (key: ScheduleConflictFieldKey, value: unknown): string => {
  if (value == null || value === '') return '비어 있음';
  if (key === 'spotUserId') return `내 장소 #${String(value)}`;
  if (key === 'fixedStartTime') return value ? '고정' : '자동';
  if (['duration', 'movingDuration', 'extraDuration', 'extraMovingDuration'].includes(key)) return `${String(value)}분`;
  if (key === 'lat' || key === 'lng') return Number(value).toFixed(6);
  return String(value);
};
