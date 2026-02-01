import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

// API
import { getPlans, type GetPlansParams } from '../api/planApi';

// Types
import type { PlanResponse } from '../types/plan';

// Components
import PlanList from '../components/plan/PlanList';
import PlanFilter, { type PlanStatus, type SearchParams } from '../components/plan/PlanFilter';

export default function PlanListPage() {
  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [viewStatus, setViewStatus] = useState<PlanStatus>('ALL');
  const [loading, setLoading] = useState(true);

  // 1. 계획 목록 불러오기 (검색 조건 포함)
  const fetchPlans = async (searchParams?: SearchParams) => {
    setLoading(true);
    try {
      const apiParams: GetPlansParams = {};

      if (searchParams) {
        apiParams.from = searchParams.startDate || undefined;
        apiParams.to = searchParams.endDate || undefined;
        apiParams.months = searchParams.selectedMonths;
      }

      const data = await getPlans(apiParams);
      setPlans(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  // 2. 프론트엔드 필터링 (탭 전환: 전체/다가오는/지난)
  const visiblePlans = useMemo(() => {
    if (!plans) return [];
    const today = new Date().toISOString().split('T')[0];

    return plans.filter((plan) => {
      if (viewStatus === 'ALL') return true;
      if (viewStatus === 'UPCOMING') return plan.planStartDate >= today;
      if (viewStatus === 'PAST') return plan.planEndDate < today;
      return true;
    });
  }, [plans, viewStatus]);

  return (
      <div className="max-w-5xl mx-auto p-4 md:p-6">

        {/* 헤더 영역 */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              나의 여행 계획 🗺️
            </h1>
            <p className="text-gray-500 mt-2 text-sm md:text-base">
              총 {visiblePlans.length}개의 여행이 있습니다.
            </p>
          </div>

          <Link
              to="/plans/create"
              className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl shadow transition text-center"
          >
            + 새 여행 만들기
          </Link>
        </div>

        {/* 필터 및 탭 */}
        <div className="mb-8">
          <PlanFilter
              status={viewStatus}
              onStatusChange={setViewStatus}
              onSearch={fetchPlans}
          />
        </div>

        {/* 목록 렌더링 */}
        {loading ? (
            <div className="text-center p-20 text-gray-400">일정을 불러오는 중입니다...</div>
        ) : (
            <PlanList plans={visiblePlans} />
        )}
      </div>
  );
}