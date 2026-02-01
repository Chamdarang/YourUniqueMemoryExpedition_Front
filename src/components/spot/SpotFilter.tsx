import { useState } from "react";

// Types
import type { SpotType } from "../../types/enums";

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
  'FOOD', 'CAFE',
  'LANDMARK', 'HISTORICAL_SITE', 'RELIGIOUS_SITE', 'MUSEUM', 'PARK',
  'SHOPPING', 'ACCOMMODATION', 'STATION',
  'NATURE', 'ACTIVITY', 'OTHER'
];

// 2. 라벨 매핑 (이모지 포함)
const TYPE_LABELS: Record<SpotType | 'ALL', string> = {
  ALL: '모든 유형',
  FOOD: '🍚 음식점',
  CAFE: '☕ 카페',
  LANDMARK: '🗼 명소',
  HISTORICAL_SITE: '🏯 유적지',
  RELIGIOUS_SITE: '🙏 종교시설',
  MUSEUM: '🖼 박물관',
  PARK: '🌳 공원',
  SHOPPING: '🛍️ 쇼핑',
  ACCOMMODATION: '🏨 숙소',
  STATION: '🚉 교통',
  NATURE: '🌲 자연',
  ACTIVITY: '🎢 액티비티',
  OTHER: '📍 기타',
};

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
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 space-y-4 md:space-y-0 md:flex md:items-center md:gap-4">

        {/* 1. 키워드 검색 */}
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
              type="text"
              placeholder="장소명 또는 주소 검색..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500 transition"
              value={params.keyword}
              onChange={(e) => setParams({ ...params, keyword: e.target.value })}
              onKeyDown={handleKeyDown}
          />
        </div>

        {/* 2. 유형 필터 (상수 배열 매핑) */}
        <select
            className="w-full md:w-40 px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500 bg-white"
            value={params.type}
            onChange={(e) => setParams({ ...params, type: e.target.value as SpotType | 'ALL' })}
        >
          {SPOT_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type] || type}
              </option>
          ))}
        </select>

        {/* 3. 방문 여부 필터 */}
        <select
            className="w-full md:w-32 px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500 bg-white"
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
            className="w-full md:w-auto bg-gray-900 hover:bg-gray-800 text-white font-bold px-6 py-2 rounded-lg transition"
        >
          조회
        </button>
      </div>
  );
}