import { Link } from "react-router-dom";

// Types
import type { PlanDayResponse } from "../../types/planDay.ts";

interface DayCardProps {
  day: PlanDayResponse;
}

export default function DayCard({ day }: DayCardProps) {
  return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition group flex flex-col relative h-full">

        {/* 상단 포인트 컬러 (오렌지) */}
        <div className="h-1.5 bg-orange-400 w-full" />

        <div className="p-6 flex-1 flex flex-col">
          {/* 아이콘 & 배지 */}
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-xl">
              📅
            </div>
            <span className="bg-gray-100 text-gray-500 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
            DRAFT
          </span>
          </div>

          {/* 제목 */}
          <h2 className="text-lg font-bold text-gray-900 mb-2 line-clamp-1 group-hover:text-orange-500 transition">
            {day.dayName}
          </h2>

          {/* 설명 텍스트 */}
          <p className="text-sm text-gray-400 mb-6 leading-relaxed">
            아직 여행에 포함되지 않은<br/>하루 일정입니다.
          </p>

          {/* 액션 버튼 */}
          <Link
              to={`/days/${day.id}`}
              className="mt-auto block w-full text-center py-2.5 rounded-lg border border-gray-200 text-gray-600 font-bold text-sm hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 transition"
          >
            일정 짜기 ✏️
          </Link>
        </div>
      </div>
  );
}