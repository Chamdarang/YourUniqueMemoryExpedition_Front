import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

// API
import { deletePlan, updatePlan } from "../../api/planApi";
import { detachPlanDay } from "../../api/dayApi";

// Types & Utils
import type { PlanDetailResponse } from "../../types/plan";
import { getDurationInfo, shiftDate } from "../../utils/timeUtils";

interface Props {
  plan: PlanDetailResponse;
  onRefresh: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

export default function PlanHeader({ plan, onRefresh, onDirtyChange }: Props) {
  const navigate = useNavigate();

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    planName: "",
    planStartDate: "",
    planEndDate: "",
    planMemo: ""
  });

  useEffect(() => {
    if (!onDirtyChange) return;

    if (!isEditing) {
      onDirtyChange(false);
      return;
    }

    const isChanged =
        editForm.planName !== plan.planName ||
        editForm.planStartDate !== plan.planStartDate ||
        editForm.planEndDate !== plan.planEndDate ||
        (editForm.planMemo || "") !== (plan.planMemo || "");

    onDirtyChange(isChanged);
  }, [isEditing, editForm, plan, onDirtyChange]);

  const startEditing = () => {
    setEditForm({
      planName: plan.planName,
      planStartDate: plan.planStartDate,
      planEndDate: plan.planEndDate,
      planMemo: plan.planMemo || ""
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!editForm.planName.trim()) return alert("여행 이름을 입력해주세요.");

    const durationInfo = getDurationInfo(editForm.planStartDate, editForm.planEndDate);
    if (!durationInfo.valid) return alert(durationInfo.msg);

    const newPlanDays = durationInfo.days;

    try {
      if (plan.days && plan.days.length > 0) {
        const daysToDetach = plan.days.filter(day => day.dayOrder > newPlanDays);
        if (daysToDetach.length > 0) {
          const dayNames = daysToDetach.map(d => `${d.dayOrder}일차`).join(', ');
          const confirmMsg = `여행 기간이 ${newPlanDays}일로 줄어들었습니다.\n\n범위를 벗어나는 [ ${dayNames} ] 일정은 삭제되지 않고\n'내 계획(보관함)'으로 안전하게 이동됩니다.\n\n저장하시겠습니까?`;
          if (!confirm(confirmMsg)) return;
          await Promise.all(daysToDetach.map(day => detachPlanDay(day.id)));
        }
      }

      await updatePlan(plan.id, { ...editForm, planDays: newPlanDays });

      setIsEditing(false);
      onRefresh();
      alert("수정되었습니다.");
    } catch (err) {
      console.error(err);
      alert("수정 중 오류가 발생했습니다.");
    }
  };

  const handleDelete = async () => {
    if (!confirm("정말 삭제하시겠습니까? 복구할 수 없습니다.")) return;
    try {
      await deletePlan(plan.id);
      navigate("/plans");
    } catch { alert("삭제 실패"); }
  };

  const viewDuration = getDurationInfo(plan.planStartDate, plan.planEndDate);
  const editDuration = getDurationInfo(editForm.planStartDate, editForm.planEndDate);
  const scheduleDayCount = Math.max(1, plan.days?.length || plan.planDays || 1);

  const fitEndDateToSchedules = () => {
    const fittedEndDate = shiftDate(editForm.planStartDate, scheduleDayCount - 1);
    if (!fittedEndDate) return alert("시작일을 먼저 입력해주세요.");
    setEditForm(current => ({ ...current, planEndDate: fittedEndDate }));
  };

  const fitStartDateToSchedules = () => {
    const fittedStartDate = shiftDate(editForm.planEndDate, -(scheduleDayCount - 1));
    if (!fittedStartDate) return alert("종료일을 먼저 입력해주세요.");
    setEditForm(current => ({ ...current, planStartDate: fittedStartDate }));
  };

  const getStatusLabel = () => {
    // ✅ [수정] UTC 대신 로컬 타임존 기준으로 오늘 날짜 가져오기
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`; // "2026-02-07"

    if (plan.planStartDate > today) return { text: "UPCOMING", color: "bg-blue-100 text-blue-600" };
    if (plan.planEndDate < today) return { text: "DONE", color: "bg-gray-100 text-gray-500" };
    return { text: "NOW ✈️", color: "bg-orange-100 text-orange-600" };
  };

  const status = getStatusLabel();

  return (
      <div className="mb-8">

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden relative group transition-all hover:shadow-md">
          <div className="h-3 bg-blue-500 w-full" />
          <div className="p-6 md:p-8">
            {!isEditing ? (
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-start">
                    <div className="flex gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-extrabold tracking-wide ${status.color}`}>{status.text}</span>
                      {viewDuration.valid && (<span className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600">{viewDuration.nights}박 {viewDuration.days}일</span>)}
                    </div>
                    <button onClick={startEditing} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-xs font-bold hover:bg-gray-50 hover:text-blue-600 transition">⚙️ 정보 수정</button>
                  </div>
                  <div>
                    <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-2 tracking-tight">{plan.planName}</h1>
                    <div className="flex items-center gap-2 text-gray-500 font-medium"><span>📅</span><span className="font-mono text-lg">{plan.planStartDate} ~ {plan.planEndDate}</span></div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 mt-2">
                    {plan.planMemo ? (<p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{plan.planMemo}</p>) : (<p className="text-gray-400 text-sm italic">작성된 메모가 없습니다.</p>)}
                  </div>
                </div>
            ) : (
                <div className="flex flex-col gap-5 animate-fade-in-up">
                  <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                    <span className="text-sm font-bold text-blue-600">수정 모드 ✨</span>
                    <div className="flex gap-2">
                      <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm font-bold text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 transition">취소</button>
                      <button onClick={handleSave} className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-md transition">저장 완료</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1 ml-1">여행 이름</label>
                    <input type="text" className="w-full text-3xl font-extrabold text-gray-900 border-b-2 border-blue-200 focus:border-blue-500 bg-transparent outline-none py-1 transition placeholder-gray-300" value={editForm.planName} onChange={(e) => setEditForm({ ...editForm, planName: e.target.value })} placeholder="여행 제목 입력" autoFocus />
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1 ml-1">시작일</label>
                      <input type="date" min="1900-01-01" max="2100-12-31" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-mono text-gray-700 focus:ring-2 focus:ring-blue-100 outline-none transition" value={editForm.planStartDate} onChange={(e) => setEditForm({ ...editForm, planStartDate: e.target.value })} />
                      <button
                        type="button"
                        onClick={fitEndDateToSchedules}
                        className="mt-2 w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
                      >
                        시작일 기준으로 종료일 맞추기
                      </button>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1 ml-1">종료일</label>
                      <input type="date" min="1900-01-01" max="2100-12-31" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-mono text-gray-700 focus:ring-2 focus:ring-blue-100 outline-none transition" value={editForm.planEndDate} onChange={(e) => setEditForm({ ...editForm, planEndDate: e.target.value })} />
                      <button
                        type="button"
                        onClick={fitStartDateToSchedules}
                        className="mt-2 w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
                      >
                        종료일 기준으로 시작일 맞추기
                      </button>
                    </div>
                  </div>
                  <div className="text-center text-xs font-bold text-gray-400">현재 등록된 일정 {scheduleDayCount}일 기준</div>
                  <div className={`text-center py-2 rounded-lg text-sm font-bold ${editDuration.valid ? 'text-blue-600 bg-blue-50' : 'text-red-500 bg-red-50'}`}>{editDuration.msg}</div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1 ml-1">메모</label>
                    <textarea className="w-full bg-white border border-gray-300 rounded-xl p-4 text-sm text-gray-700 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none resize-none transition shadow-sm" rows={5} value={editForm.planMemo} onChange={(e) => setEditForm({ ...editForm, planMemo: e.target.value })} placeholder="여행에 대한 메모를 자유롭게 남겨보세요." />
                  </div>
                  <div className="pt-4 border-t border-gray-100 flex justify-center">
                    <button onClick={handleDelete} className="text-xs font-bold text-red-400 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded transition">🗑️ 이 여행 계획 삭제하기</button>
                  </div>
                </div>
            )}
          </div>
        </div>
      </div>
  );
}
