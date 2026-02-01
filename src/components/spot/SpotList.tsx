import { Link, useNavigate } from 'react-router-dom';

// Types
import type { SpotResponse } from "../../types/spot";
import type { SpotType } from "../../types/enums";

// Components
import SpotListItem from "./SpotListItem";

interface Props {
  spots: SpotResponse[];
  onDelete: (id: number) => void;
  onToggleVisit?: (spot: SpotResponse) => void;
}

// ----------------------------------------------------------------
// 🎨 스타일 & 아이콘 매핑 헬퍼
// ----------------------------------------------------------------
const getTypeInfo = (type: SpotType) => {
  switch (type) {
    case 'FOOD': return { icon: '🍚', label: '음식점', color: 'text-red-600 bg-red-50 border-red-100' };
    case 'CAFE': return { icon: '☕', label: '카페', color: 'text-amber-700 bg-amber-50 border-amber-100' };
    case 'LANDMARK': return { icon: '🗼', label: '명소', color: 'text-purple-600 bg-purple-50 border-purple-100' };
    case 'HISTORICAL_SITE': return { icon: '🏯', label: '유적지', color: 'text-stone-600 bg-stone-50 border-stone-100' };
    case 'RELIGIOUS_SITE': return { icon: '🙏', label: '종교시설', color: 'text-orange-600 bg-orange-50 border-orange-100' };
    case 'MUSEUM': return { icon: '🖼', label: '박물관', color: 'text-blue-600 bg-blue-50 border-blue-100' };
    case 'PARK': return { icon: '🌳', label: '공원', color: 'text-green-600 bg-green-50 border-green-100' };
    case 'NATURE': return { icon: '🌲', label: '자연', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' };
    case 'SHOPPING': return { icon: '🛍️', label: '쇼핑', color: 'text-pink-600 bg-pink-50 border-pink-100' };
    case 'ACTIVITY': return { icon: '🎢', label: '액티비티', color: 'text-yellow-600 bg-yellow-50 border-yellow-100' };
    case 'ACCOMMODATION': return { icon: '🏨', label: '숙소', color: 'text-indigo-600 bg-indigo-50 border-indigo-100' };
    case 'STATION': return { icon: '🚉', label: '교통', color: 'text-gray-600 bg-gray-50 border-gray-100' };
    default: return { icon: '📍', label: '기타', color: 'text-gray-500 bg-gray-50 border-gray-100' };
  }
};

// ----------------------------------------------------------------
// 🚀 컴포넌트
// ----------------------------------------------------------------
export default function SpotList({ spots, onDelete, onToggleVisit }: Props) {
  const navigate = useNavigate();

  if (!spots || spots.length === 0) {
    return (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200 shadow-sm">
          <p className="text-gray-500 text-lg">조건에 맞는 장소가 없습니다.</p>
        </div>
    );
  }

  return (
      <>
        {/* ------------------------------------------------------
          📱 [모바일용 뷰] 카드 리스트 형태
      ------------------------------------------------------ */}
        <div className="block md:hidden space-y-4">
          {spots.map((spot) => {
            if (!spot) return null;
            const info = getTypeInfo(spot.spotType);
            return (
                <div key={spot.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">

                  {/* 상단: 유형 & 방문상태 */}
                  <div className="flex justify-between items-start mb-2">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold border ${info.color}`}>
                  {info.icon} {info.label}
                </span>

                    <button
                        onClick={() => onToggleVisit && onToggleVisit(spot)}
                        className={`text-[10px] px-1.5 py-0.5 rounded border font-bold transition
                    ${spot.isVisit
                            ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                        }`}
                    >
                      {spot.isVisit ? '✅ 방문함' : '⬜ 미방문'}
                    </button>
                  </div>

                  {/* 내용: 제목 & 주소 */}
                  <div className="mb-4">
                    <Link to={`/spots/${spot.id}`} className="font-bold text-gray-900 text-lg mb-1 block">
                      {spot.spotName}
                    </Link>
                    <p className="text-sm text-gray-500 line-clamp-2">
                      {spot.shortAddress || spot.address || '주소 정보 없음'}
                    </p>
                  </div>

                  {/* 하단 버튼 */}
                  <div className="flex gap-2 pt-3 border-t border-gray-100">
                    <button
                        onClick={() => navigate(`/spots/${spot.id}`)}
                        className="flex-1 py-2 text-sm font-bold text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100"
                    >
                      상세
                    </button>
                    <button
                        onClick={() => onDelete(spot.id)}
                        className="flex-1 py-2 text-sm font-bold text-red-500 bg-red-50 rounded-lg hover:bg-red-100"
                    >
                      삭제
                    </button>
                  </div>
                </div>
            );
          })}
        </div>

        {/* ------------------------------------------------------
          🖥️ [PC용 뷰] 테이블 형태
      ------------------------------------------------------ */}
        <div className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            {/* ✅ table-fixed 추가: 너비 고정 */}
            <table className="min-w-full divide-y divide-gray-200 table-fixed">

              {/* ✅ 컬럼 비율 설정 (합계 100%) */}
              <colgroup>
                <col className="w-[10%]" /> {/* 유형 */}
                <col className="w-[40%]" /> {/* 장소명 (가장 넓게) */}
                <col className="w-[30%]" /> {/* 주소 */}
                <col className="w-[10%]" /> {/* 방문여부 */}
                <col className="w-[10%]" /> {/* 관리 */}
              </colgroup>

              <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">유형</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">장소명</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">주소</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">방문여부</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">관리</th>
              </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
              {spots.map((spot) => {
                if (!spot) return null;
                return (
                    <SpotListItem
                        key={spot.id}
                        spot={spot}
                        onDelete={onDelete}
                        onToggleVisit={onToggleVisit}
                    />
                );
              })}
              </tbody>
            </table>
          </div>
        </div>
      </>
  );
}