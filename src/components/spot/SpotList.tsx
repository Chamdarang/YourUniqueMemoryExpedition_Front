// Types
import type { SpotResponse } from "../../types/spot";

// Components
import SpotListItem from "./SpotListItem";
import SpotCard from "./SpotCard"; // ✅ 공통 카드 컴포넌트 임포트

interface Props {
  spots: SpotResponse[];
  onDelete: (id: number) => void;
  onToggleVisit?: (spot: SpotResponse) => void;
}

export default function SpotList({ spots, onDelete, onToggleVisit }: Props) {

  if (!spots || spots.length === 0) {
    return (
        <div className="text-center py-20 bg-white rounded-xl border-2 border-gray-100 shadow-sm">
          <p className="text-gray-400 text-sm font-bold italic">조건에 맞는 장소가 없습니다.</p>
        </div>
    );
  }

  return (
      <>
        {/* ------------------------------------------------------
          📱 [모바일용 뷰] SpotCard를 사용하여 일관성 확보
      ------------------------------------------------------ */}
        <div className="block md:hidden space-y-4 px-1">
          {spots.map((spot) => (
              <SpotCard
                  key={spot.id}
                  spot={spot}
                  onDelete={onDelete}
                  onToggleVisit={onToggleVisit} // ✅ 방문 여부 토글 기능 연결
              />
          ))}
        </div>

        {/* ------------------------------------------------------
          🖥️ [PC용 뷰] 테이블 형태
      ------------------------------------------------------ */}
        <div className="hidden md:block bg-white border-2 border-gray-100 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 table-fixed">
              <colgroup>
                <col className="w-[12%]" />
                <col className="w-[38%]" />
                <col className="w-[25%]" />
                <col className="w-[12%]" />
                <col className="w-[13%]" />
              </colgroup>

              <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-[11px] font-black text-gray-400 uppercase tracking-widest">유형</th>
                <th className="px-6 py-4 text-left text-[11px] font-black text-gray-400 uppercase tracking-widest">장소명</th>
                <th className="px-4 py-4 text-left text-[11px] font-black text-gray-400 uppercase tracking-widest">주소</th>
                <th className="px-4 py-4 text-center text-[11px] font-black text-gray-400 uppercase tracking-widest">방문여부</th>
                <th className="px-6 py-4 text-right text-[11px] font-black text-gray-400 uppercase tracking-widest">관리</th>
              </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-50">
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