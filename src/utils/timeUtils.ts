// "HH:mm" 문자열 -> 분(number) 변환
export const timeToMinutes = (timeStr?: string): number => {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

// 분(number) -> "HH:mm" 문자열 변환
export const minutesToTime = (totalMinutes: number): string => {
  let h = Math.floor(totalMinutes / 60) % 24;
  if (h < 0) h += 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export const calculateEndTime = (startTime?: string, duration?: number): string => {
  if (!startTime || duration === undefined) return '';
  const startMins = timeToMinutes(startTime);
  return minutesToTime(startMins + duration);
};

export const subtractTime = (endTime?: string, duration?: number): string => {
  if (!endTime || duration === undefined) return '';
  const endMins = timeToMinutes(endTime);
  return minutesToTime(endMins - duration);
};

// ✅ [신규] 날짜 유효성 검사 (2월 31일 등 존재하지 않는 날짜 차단)
export const isValidDate = (dateString: string): boolean => {
  if (!dateString) return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;

  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(y, m - 1, d);

  // JS Date 객체의 자동 보정 결과와 입력값이 다르면 유효하지 않은 날짜
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
};

// ✅ [신규] 기간 계산 및 검증 결과 반환
export const getDurationInfo = (startStr: string, endStr: string) => {
  if (!startStr || !endStr) return { valid: false, msg: '날짜를 입력해주세요' };

  if (!isValidDate(startStr) || !isValidDate(endStr)) {
    return { valid: false, msg: '🚫 달력에 없는 날짜입니다' };
  }

  const start = new Date(startStr).getTime();
  const end = new Date(endStr).getTime();

  if (start > end) return { valid: false, msg: '🚫 종료일이 더 빠릅니다' };

  const diff = (end - start) / (1000 * 60 * 60 * 24);
  const nights = Math.ceil(diff);

  return { valid: true, msg: `✨ ${nights}박 ${nights + 1}일`, nights, days: nights + 1 };
};