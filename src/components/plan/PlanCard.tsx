import { Link } from "react-router-dom";

// Types
import type { PlanResponse } from "../../types/plan";

interface PlanCardProps {
  plan: PlanResponse;
}

export default function PlanCard({ plan }: PlanCardProps) {
  return (
      <div className="yume-card yume-card-interactive overflow-hidden group">

        {/* 🎨 상단 컬러 포인트 */}
        <div className="h-1.5 bg-blue-500 w-full" />

        <div className="p-6">

          {/* 제목 */}
          <h2 className="text-xl font-bold text-gray-800 mb-2 group-hover:text-blue-600 transition">
            {plan.planName}
          </h2>

          {/* 📅 날짜 및 기간 */}
          <div className="flex items-center text-sm text-gray-500 mb-4 space-x-2">
            <span>📅</span>
            <span>{plan.planStartDate} ~ {plan.planEndDate}</span>
            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
            {plan.planDays}일간
          </span>
          </div>

          {/* 📝 메모 */}
          <p className="text-gray-600 text-sm bg-gray-50 p-3 rounded-lg line-clamp-2 mb-4 min-h-16">
            {plan.planMemo || "메모가 없습니다."}
          </p>

          {/* 하단 버튼 */}
          <Link
              to={`/plans/${plan.id}`}
              className="yume-button yume-button-primary w-full"
          >
            상세 일정 보기
          </Link>
        </div>
      </div>
  );
}
