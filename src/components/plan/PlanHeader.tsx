import { useState, useEffect } from "react";
// ❌ useBlocker 제거 (부모에게 위임)

import { updatePlan } from "../../api/planApi";
import { detachPlanDay } from "../../api/dayApi";
import type { PlanDetailResponse } from "../../types/plan";

interface Props {
  plan: PlanDetailResponse;
  onRefresh: () => void;
  // ✅ [추가] 수정 상태를 부모에게 알리는 함수
  onDirtyChange?: (isDirty: boolean) => void;
}

// 📅 여행 상태 계산 함수 (색상 규칙 적용)
const getTripStatus = (startDate: string, endDate: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  // 1. 여행 전 (D-Day) -> 주황색 (설렘)
  if (today < start) {
    const diff = start.getTime() - today.getTime();
    const dDay = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return {
      label: `D-${dDay}`,
      className: "bg-orange-100 text-orange-600 border border-orange-200"
    };
  }

  // 2. 여행 후 (완료) -> 회색 (지난 추억)
  if (today > end) {
    return {
      label: "여행 완료",
      className: "bg-gray-100 text-gray-500 border border-gray-200"
    };
  }

  // 3. 여행 중 (n일차) -> 파란색 (원래대로, 활기참)
  const diff = today.getTime() - start.getTime();
  const dayN = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
  return {
    label: `여행 ${dayN}일차`,
    className: "bg-blue-100 text-blue-600 border border-blue-200"
  };
};

export default function PlanHeader({ plan, onRefresh, onDirtyChange }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [form, setForm] = useState({
    planName: "",
    planStartDate: "",
    planEndDate: "",
    planMemo: ""
  });
  const [calculatedDays, setCalculatedDays] = useState(0);

  useEffect(() => {
    if (plan) {
      setForm({
        planName: plan.planName,
        planStartDate: plan.planStartDate,
        planEndDate: plan.planEndDate,
        planMemo: plan.planMemo || ""
      });
      setCalculatedDays(plan.planDays);
    }
  }, [plan, isEditing]);

  useEffect(() => {
    if (form.planStartDate && form.planEndDate) {
      const start = new Date(form.planStartDate);
      const end = new Date(form.planEndDate);
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const totalDays = diffDays >= 0 ? diffDays + 1 : 0;
      setCalculatedDays(totalDays);
    }
  }, [form.planStartDate, form.planEndDate]);

  // 상태 감지 로직
  const isChanged =
      form.planName !== plan.planName ||
      form.planStartDate !== plan.planStartDate ||
      form.planEndDate !== plan.planEndDate ||
      (form.planMemo || "") !== (plan.planMemo || "");

  const isDirty = isEditing && isChanged;

  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  const handleSave = async () => {
    if (calculatedDays <= 0) return alert("종료일이 시작일보다 빠를 수 없습니다.");
    if (!form.planName.trim()) return alert("여행 이름을 입력해주세요.");

    setIsProcessing(true);
    try {
      if (calculatedDays < plan.planDays) {
        const daysToDetach = plan.days.filter(d => d.dayOrder > calculatedDays);
        if (daysToDetach.length > 0) {
          const confirmMsg =
              `여행 기간이 줄어들어 ${daysToDetach.length}개의 일정(Day ${calculatedDays + 1} ~ Day ${plan.planDays})이 범위 밖으로 나갑니다.\n\n` +
              `이 일정들을 '보관함(나의 계획)'으로 이동시키고 수정하시겠습니까?`;

          if (!confirm(confirmMsg)) {
            setIsProcessing(false);
            return;
          }
          await Promise.all(daysToDetach.map(day => detachPlanDay(day.id)));
        }
      }

      await updatePlan(plan.id, { ...form, planDays: calculatedDays });

      alert("여행 정보가 수정되었습니다.");
      setIsEditing(false);
      onRefresh();
    } catch (err) {
      console.error(err);
      alert("수정 실패");
    } finally {
      setIsProcessing(false);
    }
  };

  const statusInfo = getTripStatus(plan.planStartDate, plan.planEndDate);

  return (
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden mb-8 relative transition-all">
        {/* 상단 컬러 바 (편집 시 주황, 평소 파랑/시안 그라데이션) */}
        <div className={`h-4 w-full transition-colors ${isEditing ? 'bg-orange-400' : 'bg-gradient-to-r from-blue-500 to-cyan-400'}`} />

        <div className="p-6 md:p-8">
          {!isEditing ? (
              <div className="animate-fade-in">
                <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      {/* ✅ 상태 배지 (주황/파랑/회색 적용) */}
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusInfo.className}`}>
                        {statusInfo.label}
                      </span>
                      <span className="text-gray-400 text-sm font-medium">
                        {plan.planDays - 1}박 {plan.planDays}일 ({plan.planDays} Days)
                      </span>
                    </div>
                    <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-2">
                      {plan.planName}
                    </h1>
                    <div className="text-gray-500 font-medium flex items-center gap-2">
                      📅 {plan.planStartDate} ~ {plan.planEndDate}
                    </div>
                  </div>

                  <button
                      onClick={() => setIsEditing(true)}
                      className="text-gray-500 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2 shrink-0"
                  >
                    ⚙️ 정보 수정
                  </button>
                </div>

                {plan.planMemo && (
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">
                      {plan.planMemo}
                    </div>
                )}
              </div>
          ) : (
              <div className="animate-fade-in space-y-4">
                <div>
                  <label className="block text-xs font-bold text-orange-500 mb-1">여행 이름</label>
                  <input
                      type="text"
                      className="w-full text-2xl md:text-3xl font-extrabold text-gray-900 border-b-2 border-orange-200 focus:border-orange-500 outline-none bg-transparent placeholder-gray-300 transition"
                      value={form.planName}
                      onChange={e => setForm({...form, planName: e.target.value})}
                      placeholder="여행 이름을 입력하세요"
                      autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">시작일</label>
                    <input
                        type="date"
                        className="w-full p-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-200 text-sm font-bold text-gray-700"
                        value={form.planStartDate}
                        onChange={e => setForm({...form, planStartDate: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">종료일</label>
                    <input
                        type="date"
                        className="w-full p-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-200 text-sm font-bold text-gray-700"
                        value={form.planEndDate}
                        onChange={e => setForm({...form, planEndDate: e.target.value})}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400">계산된 기간:</span>
                  <span className="font-bold text-orange-600">
                {calculatedDays > 0
                    ? `${calculatedDays - 1}박 ${calculatedDays}일 (${calculatedDays} Days)`
                    : '날짜를 확인해주세요'}
              </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">메모</label>
                  <textarea
                      className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-200 text-sm min-h-[80px] resize-none"
                      value={form.planMemo}
                      onChange={e => setForm({...form, planMemo: e.target.value})}
                      placeholder="여행 메모..."
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                  <button
                      onClick={() => setIsEditing(false)}
                      className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 font-bold text-sm hover:bg-gray-200 transition"
                  >
                    취소
                  </button>
                  <button
                      onClick={handleSave}
                      disabled={isProcessing}
                      className="px-6 py-2 rounded-lg bg-orange-500 text-white font-bold text-sm hover:bg-orange-600 shadow-md transition disabled:opacity-50"
                  >
                    {isProcessing ? '저장 중...' : '수정 완료'}
                  </button>
                </div>
              </div>
          )}
        </div>
      </div>
  );
}