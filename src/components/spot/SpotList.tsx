// Types
import type { SpotResponse } from "../../types/spot";

// Components
import SpotListItem from "./SpotListItem";
import SpotCard from "./SpotCard"; // ✅ 공통 카드 컴포넌트 임포트
import EmptyListState from '../common/EmptyListState';

interface Props {
  spots: SpotResponse[];
  filtered?: boolean;
  onReset?: () => void;
  onDelete: (id: number) => void;
  onToggleVisit?: (spot: SpotResponse) => void;
}

export default function SpotList({ spots, onDelete, onToggleVisit, filtered, onReset }: Props) {

  if (!spots || spots.length === 0) {
    return <EmptyListState item="장소" filtered={filtered} onReset={onReset} createHref="/map" createLabel="장소 탐색하기" />;
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
        <div className="yume-card hidden overflow-hidden md:block">
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
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">유형</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">장소명</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">주소</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">방문 여부</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500">관리</th>
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
