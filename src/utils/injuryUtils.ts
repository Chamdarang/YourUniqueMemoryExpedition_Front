// src/utils/injuryUtils.ts

/**
 * 메모 내의 시스템 태그(#si:, #mi:, #visited)를 제거하고 순수 텍스트만 반환합니다.
 */
export const cleanMemoTags = (memo: string): string => {
    if (!memo) return '';
    return memo
        .replace(/#si:\s*\d+/g, '')
        .replace(/#mi:\s*\d+/g, '')
        .replace(/#visited/g, '')
        .trim();
};

/**
 * 메모 내의 특정 인저리 타임 태그에서 숫자 값을 파싱합니다.
 * @param tag '#si:' (Stay Injury) 또는 '#mi:' (Moving Injury)
 */
export const parseInjuryFromMemo = (memo: string | null, tag: '#si:' | '#mi:'): number => {
    if (!memo) return 0;
    const regex = new RegExp(`${tag}\\s*(\\d+)`);
    const match = memo.match(regex);
    return match ? parseInt(match[1], 10) : 0;
};