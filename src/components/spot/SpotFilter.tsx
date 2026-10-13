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
    initialFilter?: SpotSearchParams;
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

export default function SpotFilter({ onSearch, initialFilter }: Props) {
    const [showFilters, setShowFilters] = useState(false);
    const [params, setParams] = useState<SpotSearchParams>(initialFilter || {
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
        <div className="yume-card mb-6 p-4 font-sans">
          <div className="flex min-w-0 flex-wrap items-center gap-2 md:flex-nowrap md:gap-4">

            {/* 1. 키워드 검색 */}
            <div className="relative min-w-0 basis-full md:flex-1 md:basis-0">
                <input
                    type="text" aria-label="장소명 또는 주소 검색"
                    placeholder="장소명 또는 주소 검색..."
                    className="yume-input text-sm"
                    value={params.keyword}
                    onChange={(e) => setParams({ ...params, keyword: e.target.value })}
                    onKeyDown={handleKeyDown}
                />
            </div>
            <button type="button" aria-expanded={showFilters} aria-controls="spot-filter-options" onClick={() => setShowFilters(open => !open)} className="yume-button yume-button-secondary flex-1 md:hidden">필터</button>
            <button type="button" onClick={handleSearch} className="yume-button yume-button-primary flex-1 md:flex-none md:shrink-0">조회</button>
          </div>
          <div id="spot-filter-options" className={`${showFilters ? 'grid' : 'hidden'} mt-3 grid-cols-2 gap-3 md:grid`}>

            {/* 2. 유형 필터 (공통 유틸리티 SPOT_TYPE_INFO 매핑) */}
            <select aria-label="장소 유형 필터"
                className="yume-input min-w-0 cursor-pointer text-sm"
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
                className="yume-input min-w-0 cursor-pointer text-sm"
                value={params.isVisit}
                onChange={(e) => setParams({ ...params, isVisit: e.target.value as 'ALL' | 'VISITED' | 'NOT_VISITED' })}
            >
                <option value="ALL">전체 상태</option>
                <option value="VISITED">✅ 방문함</option>
                <option value="NOT_VISITED">⬜ 미방문</option>
            </select>

          </div>
          {!showFilters && (params.type !== 'ALL' || params.isVisit !== 'ALL') && <p className="mt-2 text-xs text-gray-600 md:hidden">선택 필터: {[params.type !== 'ALL' ? SPOT_TYPE_INFO[params.type]?.label : '', params.isVisit === 'VISITED' ? '방문함' : params.isVisit === 'NOT_VISITED' ? '미방문' : ''].filter(Boolean).join(' · ')}</p>}
        </div>
    );
}
