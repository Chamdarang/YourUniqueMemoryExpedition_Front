// Types
import type { SpotType } from "../../types/enums";
import type { SpotResponse } from "../../types/spot";

interface SpotCardProps {
  spot: SpotResponse;
  onDelete?: (id: number) => void;
}

// ----------------------------------------------------------------
// 🎨 스타일 & 아이콘 매핑 헬퍼
// ----------------------------------------------------------------
const getTypeInfo = (type: SpotType) => {
  switch (type) {
    case 'FOOD': return { icon: '🍚', label: '음식점', color: 'bg-red-50 text-red-600 border-red-100' };
    case 'CAFE': return { icon: '☕', label: '카페', color: 'bg-amber-50 text-amber-700 border-amber-100' };
    case 'LANDMARK': return { icon: '🗼', label: '명소', color: 'bg-purple-50 text-purple-600 border-purple-100' };
    case 'HISTORICAL_SITE': return { icon: '🏯', label: '유적지', color: 'bg-stone-50 text-stone-600 border-stone-100' };
    case 'RELIGIOUS_SITE': return { icon: '🙏', label: '종교시설', color: 'bg-orange-50 text-orange-600 border-orange-100' };
    case 'MUSEUM': return { icon: '🖼', label: '박물관', color: 'bg-blue-50 text-blue-600 border-blue-100' };
    case 'PARK': return { icon: '🌳', label: '공원', color: 'bg-green-50 text-green-600 border-green-100' };
    case 'NATURE': return { icon: '🌲', label: '자연', color: 'bg-emerald-50 text-emerald-600 border-emerald-100' };
    case 'SHOPPING': return { icon: '🛍️', label: '쇼핑', color: 'bg-pink-50 text-pink-600 border-pink-100' };
    case 'ACTIVITY': return { icon: '🎢', label: '액티비티', color: 'bg-yellow-50 text-yellow-600 border-yellow-100' };
    case 'ACCOMMODATION': return { icon: '🏨', label: '숙소', color: 'bg-indigo-50 text-indigo-600 border-indigo-100' };
    case 'STATION': return { icon: '🚉', label: '교통', color: 'bg-gray-50 text-gray-600 border-gray-100' };
    default: return { icon: '📍', label: '기타', color: 'bg-gray-50 text-gray-500 border-gray-100' };
  }
};

export default function SpotCard({ spot, onDelete }: SpotCardProps) {
  const info = getTypeInfo(spot.spotType);

  return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition group h-full flex flex-col relative">

        {/* 방문 상태 표시 바 */}
        <div className={`h-1.5 w-full ${spot.isVisit ? 'bg-green-500' : 'bg-gray-200'}`} />

        <div className="p-5 flex-1 flex flex-col">

          {/* 상단: 타입 & 방문 여부 */}
          <div className="flex justify-between items-start mb-3">
          <span className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border ${info.color}`}>
            {info.icon} {info.label}
          </span>

            {spot.isVisit ? (
                <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded border border-green-200 font-bold">
              ✅ 방문함
            </span>
            ) : (
                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200">
              미방문
            </span>
            )}
          </div>

          {/* 제목 */}
          <h3 className="text-lg font-bold text-gray-900 mb-1 line-clamp-1 group-hover:text-green-600 transition">
            {spot.spotName}
          </h3>

          {/* 주소 */}
          <p className="text-xs text-gray-400 mb-3">
            {spot.shortAddress || spot.address || "주소 정보 없음"}
          </p>

          {/* 설명 */}
          {spot.description && (
              <p className="text-sm text-gray-600 mb-4 line-clamp-2 bg-gray-50 p-2 rounded-lg leading-relaxed">
                {spot.description}
              </p>
          )}

          {/* 하단 액션 버튼 */}
          <div className="mt-auto pt-4 border-t border-gray-50 flex gap-2">
            {spot.googleMapUrl ? (
                <a
                    href={spot.googleMapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center text-xs font-bold text-blue-600 py-2 bg-blue-50 rounded-lg hover:bg-blue-100 transition"
                >
                  🗺️ 지도 보기
                </a>
            ) : (
                <button className="flex-1 text-xs font-bold text-gray-400 py-2 bg-gray-50 rounded-lg cursor-not-allowed">
                  지도 없음
                </button>
            )}

            {onDelete && (
                <button
                    onClick={() => onDelete(spot.id)}
                    className="px-3 text-xs font-bold text-gray-400 py-2 bg-gray-50 rounded-lg hover:bg-red-50 hover:text-red-500 transition"
                >
                  삭제
                </button>
            )}
          </div>
        </div>
      </div>
  );
}