import type { SpotType } from "../types/enums";

// 타입별 설정 (라벨, Tailwind 색상, Hex 색상)
export const SPOT_TYPE_INFO: Record<string, { label: string; color: string; hex: string; icon: string }> = {
    LANDMARK: { label: '명소', color: 'text-purple-600 bg-purple-50', hex: '#9333ea', icon: '🗼' },
    HISTORICAL_SITE: { label: '유적지', color: 'text-stone-600 bg-stone-50', hex: '#57534e', icon: '🏯' },
    RELIGIOUS_SITE: { label: '종교시설', color: 'text-red-600 bg-red-50', hex: '#dc2626', icon: '⛩️' },
    PARK: { label: '공원', color: 'text-green-600 bg-green-50', hex: '#16a34a', icon: '🌳' },
    NATURE: { label: '자연', color: 'text-emerald-600 bg-emerald-50', hex: '#059669', icon: '⛰️' },
    MUSEUM: { label: '박물관', color: 'text-blue-600 bg-blue-50', hex: '#2563eb', icon: '🏛️' },
    SHOPPING: { label: '쇼핑', color: 'text-pink-600 bg-pink-50', hex: '#db2777', icon: '🛍️' },
    ACTIVITY: { label: '액티비티', color: 'text-orange-600 bg-orange-50', hex: '#ea580c', icon: '🎢' },
    FOOD: { label: '음식점', color: 'text-red-600 bg-red-50', hex: '#dc2626', icon: '🍚' },
    CAFE: { label: '카페', color: 'text-amber-700 bg-amber-50', hex: '#b45309', icon: '☕' },
    STATION: { label: '교통', color: 'text-gray-600 bg-gray-50', hex: '#4b5563', icon: '🚉' },
    ACCOMMODATION: { label: '숙소', color: 'text-indigo-600 bg-indigo-50', hex: '#4f46e5', icon: '🏨' },
    OTHER: { label: '기타', color: 'text-gray-500 bg-gray-50', hex: '#6b7280', icon: '📍' },
};

// 안전하게 정보를 가져오는 헬퍼 함수
export const getSpotTypeInfo = (type: string | undefined) => {
    return SPOT_TYPE_INFO[type as SpotType] || SPOT_TYPE_INFO.OTHER;
};