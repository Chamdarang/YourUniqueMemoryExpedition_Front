// "HH:mm" 문자열 -> 분(number) 변환
export const timeToMinutes = (timeStr?: string): number => {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

// 분(number) -> "HH:mm" 문자열 변환
export const minutesToTime = (totalMinutes: number): string => {
  let h = Math.floor(totalMinutes / 60) % 24;
  if (h < 0) h += 24; // 음수 시간 처리
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// 시작 시간 + 소요 시간 = 종료 시간 계산
export const calculateEndTime = (startTime?: string, duration?: number): string => {
  if (!startTime || duration === undefined) return '';
  const startMins = timeToMinutes(startTime);
  return minutesToTime(startMins + duration);
};

// ✅ [신규] 종료 시간 - 소요 시간 = 시작 시간 계산 (이동 시작 시간 역산용)
export const subtractTime = (endTime?: string, duration?: number): string => {
  if (!endTime || duration === undefined) return '';
  const endMins = timeToMinutes(endTime);
  return minutesToTime(endMins - duration);
};