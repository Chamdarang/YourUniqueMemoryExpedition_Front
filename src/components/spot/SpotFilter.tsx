import { useState } from "react";

// Types
import type { SpotType } from "../../types/enums";

// Utils
import { SPOT_TYPE_INFO } from "../../utils/spotUtils"; // ✅ 공통 유틸리티 정보 임포트

export interface SpotSearchParams {
    keyword: string;
    type: SpotType | 'ALL';
    isVisit: 'ALL' | 'VISITED' | 'NOT_VISITED';
}

interface Props {
    onSearch: (params: SpotSearchParams) => void;
}

// ----------------------------------------------------------------
// 📝 상수 및 헬퍼
// ----------------------------------------------------------------

// 1. 필터 옵션 배열 (순서 보장)
const SPOT_TYPES: (SpotType | 'ALL')[] = [
    'ALL',
    'LANDMARK', 'HISTORICAL_SITE', 'RELIGIOUS_SITE', 'PARK', 'NATURE',
    'MUSEUM', 'SHOPPING', 'ACTIVITY', 'FOOD', 'CAFE', 'STATION',
    'ACCOMMODATION', 'OTHER'
];

// ❌ 기존의 하드코딩된 TYPE_LABELS 매핑을 삭제했습니다.

// ----------------------------------------------------------------
// 🚀 컴포넌트
// ----------------------------------------------------------------

export default function SpotFilter({ onSearch }: Props) {
    const [params, setParams] = useState<SpotSearchParams>({
        keyword: '',
        type: 'ALL',
        isVisit: 'ALL',
    });

    const handleSearch = () => {
        onSearch(params);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSearch();
    };

    return (
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 space-y-4 md:space-y-0 md:flex md:items-center md:gap-4 font-sans">

            {/* 1. 키워드 검색 */}
            <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                <input
                    type="text" aria-label="장소명 또는 주소 검색"
                    placeholder="장소명 또는 주소 검색..."
                    className="min-h-11 w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900 transition text-sm font-medium"
                    value={params.keyword}
                    onChange={(e) => setParams({ ...params, keyword: e.target.value })}
                    onKeyDown={handleKeyDown}
                />
            </div>

            {/* 2. 유형 필터 (공통 유틸리티 SPOT_TYPE_INFO 매핑) */}
            <select aria-label="장소 유형 필터"
                className="min-h-11 w-full md:w-40 px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900 bg-white text-sm font-bold cursor-pointer"
                value={params.type}
                onChange={(e) => setParams({ ...params, type: e.target.value as SpotType | 'ALL' })}
            >
                {SPOT_TYPES.map((type) => {
                    // 'ALL'인 경우 수동 라벨링, 그 외에는 유틸리티 정보 사용
                    const info = type === 'ALL' ? { label: '모든 유형', icon: '📁' } : SPOT_TYPE_INFO[type];
                    return (
                        <option key={type} value={type}>
                            {info?.icon} {info?.label}
                        </option>
                    );
                })}
            </select>

            {/* 3. 방문 여부 필터 */}
            <select aria-label="방문 상태 필터"
                className="min-h-11 w-full md:w-32 px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900 bg-white text-sm font-bold cursor-pointer"
                value={params.isVisit}
                onChange={(e) => setParams({ ...params, isVisit: e.target.value as 'ALL' | 'VISITED' | 'NOT_VISITED' })}
            >
                <option value="ALL">전체 상태</option>
                <option value="VISITED">✅ 방문함</option>
                <option value="NOT_VISITED">⬜ 미방문</option>
            </select>

            {/* 4. 조회 버튼 */}
            <button
                onClick={handleSearch}
                className="yume-button yume-button-primary w-full px-8 md:w-auto"
            >
                조회
            </button>
        </div>
    );
}
