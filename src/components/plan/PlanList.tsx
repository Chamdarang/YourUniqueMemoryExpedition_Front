// Types
import type { PlanResponse } from "../../types/plan";

// Components
import PlanCard from "./PlanCard";

interface PlanListProps {
  plans: PlanResponse[];
}

export default function PlanList({ plans }: PlanListProps) {

  // 1. 계획이 없을 때 (Empty State)
  if (plans.length === 0) {
    return (
        <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-gray-200">
          <p className="text-gray-500 text-lg">아직 계획된 여행이 없어요</p>
        </div>
    );
  }

  // 2. 계획이 있을 때 (Grid Layout)
  return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>
  );
}