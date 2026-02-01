import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

// API
import { getPlans, deletePlan, updatePlan, type GetPlansParams } from '../api/planApi';

// Types & Utils
import type { PlanResponse } from '../types/plan';
import { getDurationInfo } from '../utils/timeUtils'; // ✅ 유틸 사용

// Components
import PlanList from '../components/plan/PlanList';
import PlanFilter, { type PlanStatus, type SearchParams } from '../components/plan/PlanFilter';

export default function PlanListPage() {
  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [viewStatus, setViewStatus] = useState<PlanStatus>('ALL');
  const [loading, setLoading] = useState(true);

  // 수정 팝업 상태
  const [editingPlan, setEditingPlan] = useState<PlanResponse | null>(null);
  const [editForm, setEditForm] = useState({ planName: '', planStartDate: '', planEndDate: '', planMemo: '' });

  // 1. 목록 불러오기
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
      // 최신순 정렬
      setPlans(data.sort((a, b) => b.id - a.id));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchPlans(); }, []);

  // 2. 삭제
  const handleDelete = async (id: number) => {
    if (!confirm("정말 이 여행 계획을 삭제하시겠습니까?")) return;
    try {
      await deletePlan(id);
      setPlans(prev => prev.filter(p => p.id !== id));
    } catch { alert("삭제 실패"); }
  };

  // 3. 수정 팝업 열기
  const handleEditClick = (plan: PlanResponse) => {
    setEditingPlan(plan);
    setEditForm({
      planName: plan.planName,
      planStartDate: plan.planStartDate,
      planEndDate: plan.planEndDate,
      planMemo: plan.planMemo || ''
    });
  };

  // 4. 저장 (유효성 검사 적용)
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;

    if (!editForm.planName.trim()) return alert("여행 이름을 입력해주세요.");

    // ✅ timeUtils의 함수로 검사
    const info = getDurationInfo(editForm.planStartDate, editForm.planEndDate);
    if (!info.valid) return alert(info.msg);

    try {
      const updated = await updatePlan(editingPlan.id, editForm);
      setPlans(prev => prev.map(p => p.id === editingPlan.id ? updated : p));
      setEditingPlan(null);
      alert("수정되었습니다.");
    } catch { alert("수정 실패"); }
  };

  // 5. 필터링
  const visiblePlans = useMemo(() => {
    if (!plans) return [];
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return plans.filter((plan) => {
      if (viewStatus === 'ALL') return true;
      if (viewStatus === 'UPCOMING') return plan.planStartDate > today;
      if (viewStatus === 'PAST') return plan.planEndDate < today;
      return true;
    });
  }, [plans, viewStatus]);

  // UI용 기간 정보
  const durationInfo = getDurationInfo(editForm.planStartDate, editForm.planEndDate);

  return (
      <div className="max-w-5xl mx-auto p-4 md:p-6 pb-20">
        <div className="flex flex-col md:flex-row justify-between items-end mb-6 gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">나의 여행 계획 🗺️</h1>
            <p className="text-gray-500 mt-2 text-sm">총 <span className="text-blue-600 font-bold">{visiblePlans.length}</span>개의 여행</p>
          </div>
          <Link to="/plans/create" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-xl shadow text-sm flex items-center gap-2"><span>+</span> 새 여행</Link>
        </div>

        <div className="mb-6"><PlanFilter status={viewStatus} onStatusChange={setViewStatus} onSearch={fetchPlans} /></div>

        {loading ? <div className="text-center p-20 text-gray-400">로딩 중...</div> :
            <PlanList plans={visiblePlans} onDelete={handleDelete} onEdit={handleEditClick} />
        }

        {/* ✅ 수정 팝업 (사이즈 대폭 확대) */}
        {editingPlan && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              {/* max-w-2xl로 너비 키움, p-10으로 여백 확보 */}
              <div className="bg-white rounded-3xl w-full max-w-2xl p-8 md:p-10 shadow-2xl animate-fade-in-down transform transition-all scale-100">

                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl font-extrabold text-gray-900">✏️ 여행 정보 수정</h3>
                  <button onClick={() => setEditingPlan(null)} className="text-gray-400 hover:text-gray-600 text-2xl transition">✕</button>
                </div>

                <form onSubmit={handleEditSubmit} className="space-y-6">
                  {/* 여행 이름 */}
                  <div>
                    <label className="block text-base font-bold text-gray-700 mb-2">여행 이름</label>
                    <input
                        type="text"
                        className="w-full border border-gray-300 rounded-xl p-4 text-lg outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition shadow-sm"
                        value={editForm.planName}
                        onChange={e => setEditForm({ ...editForm, planName: e.target.value })}
                        autoFocus
                    />
                  </div>

                  {/* 날짜 입력 (Grid 간격 조정) */}
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-base font-bold text-gray-700 mb-2">시작일</label>
                      <input
                          type="date"
                          className="w-full border border-gray-300 rounded-xl p-4 text-gray-700 outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition shadow-sm cursor-pointer"
                          value={editForm.planStartDate}
                          onChange={e => setEditForm({ ...editForm, planStartDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-base font-bold text-gray-700 mb-2">종료일</label>
                      <input
                          type="date"
                          className="w-full border border-gray-300 rounded-xl p-4 text-gray-700 outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition shadow-sm cursor-pointer"
                          value={editForm.planEndDate}
                          onChange={e => setEditForm({ ...editForm, planEndDate: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* 기간 계산 결과 표시 */}
                  <div className={`p-4 rounded-xl text-base font-bold text-center border-2 border-dashed transition-colors ${durationInfo.valid ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-red-50 border-red-200 text-red-500'}`}>
                    {durationInfo.msg}
                  </div>

                  {/* 메모 */}
                  <div>
                    <label className="block text-base font-bold text-gray-700 mb-2">메모</label>
                    <textarea
                        className="w-full border border-gray-300 rounded-xl p-4 text-gray-700 outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition shadow-sm resize-none"
                        rows={5}
                        placeholder="여행에 대한 간단한 메모를 남겨보세요."
                        value={editForm.planMemo}
                        onChange={e => setEditForm({ ...editForm, planMemo: e.target.value })}
                    />
                  </div>

                  {/* 버튼 그룹 (크기 확대) */}
                  <div className="flex gap-4 pt-4">
                    <button type="button" onClick={() => setEditingPlan(null)} className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-xl font-bold text-lg hover:bg-gray-200 transition">취소</button>
                    <button type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 shadow-lg hover:shadow-xl transition transform hover:-translate-y-0.5">저장하기</button>
                  </div>
                </form>
              </div>
            </div>
        )}
      </div>
  );
}