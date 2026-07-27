import { useState, useEffect } from "react";

// API
import { getPlans } from "../../api/planApi";

// Types
import type { PlanResponse } from "../../types/plan";
import type { SwapMode } from "../../types/enums";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (targetPlanId: number, targetDayOrder: number, mode: SwapMode) => void;
  currentDayName: string;
}

export default function PlanDaySwapModal({ isOpen, onClose, onSubmit, currentDayName }: Props) {
  const [plans, setPlans] = useState<PlanResponse[]>([]);

  // 상태 관리
  const [selectedPlanId, setSelectedPlanId] = useState<number>(0);
  const [targetDayOrder, setTargetDayOrder] = useState<number>(1);
  const [swapMode, setSwapMode] = useState<SwapMode>('REPLACE');

  // 모달 열릴 때 여행 목록 로드
  useEffect(() => {
    if (isOpen) {
      // ✅ [수정] 페이징 API 대응
      // 1. size를 100으로 설정하여 선택 가능한 여행을 충분히 가져옵니다.
      // 2. 응답이 PageResponse({ content: [...] }) 형태이므로 .content를 꺼내서 설정합니다.
      getPlans({ page: 0, size: 100 })
          .then((res) => setPlans(res.content))
          .catch(console.error);
    }
  }, [isOpen]);

  const selectedPlan = plans.find(p => p.id === selectedPlanId);

  const handleSubmit = () => {
    if (!selectedPlanId) return alert("여행을 선택해주세요.");
    onSubmit(selectedPlanId, targetDayOrder, swapMode);
  };

  if (!isOpen) return null;

  return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl animate-fade-in-up">

          {/* 헤더 */}
          <h2 className="text-lg font-bold text-gray-900 mb-1">일정 이동 / 관리</h2>
          <p className="text-sm text-gray-500 mb-4">'{currentDayName}' 처리 방법 선택</p>

          <div className="space-y-4">

            {/* 1. 처리 방식 선택 (SwapMode) */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">방식 선택</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                    onClick={() => setSwapMode('REPLACE')}
                    className={`py-2 text-xs rounded-lg border font-bold transition ${swapMode === 'REPLACE' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  덮어쓰기
                </button>
                <button
                    onClick={() => setSwapMode('SHIFT')}
                    className={`py-2 text-xs rounded-lg border font-bold transition ${swapMode === 'SHIFT' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  밀어내기
                </button>
                <button
                    onClick={() => setSwapMode('INDEPENDENT')}
                    className={`py-2 text-xs rounded-lg border font-bold transition ${swapMode === 'INDEPENDENT' ? 'bg-orange-50 border-orange-500 text-orange-700' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  독립시키기
                </button>
              </div>

              {/* 방식 설명 */}
              <p className="text-xs text-gray-500 mt-2 bg-gray-50 p-3 rounded-lg break-keep leading-relaxed border border-gray-100">
                {swapMode === 'REPLACE' && '⚠️ 대상 위치에 원래 있던 일정을 완전히 삭제하고, 이 일정으로 덮어씁니다.'}
                {swapMode === 'SHIFT' && '➡️ 대상 위치부터 뒤에 있는 일정들을 하루씩 뒤로 미룹니다.'}
                {swapMode === 'INDEPENDENT' && '📦 대상 위치에 원래 있던 일정을 여행에서 빼내어 "보관함(내 계획)"으로 옮기고, 이 일정을 넣습니다.'}
              </p>
            </div>

            {/* 2. 대상 여행 및 날짜 선택 */}
            <div className="animate-fade-in space-y-3 p-3 border border-gray-100 rounded-xl">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">대상 여행</label>
                <select
                    className="w-full p-2 border rounded-lg text-sm bg-white outline-none focus:border-blue-500 transition"
                    value={selectedPlanId}
                    onChange={(e) => { setSelectedPlanId(Number(e.target.value)); setTargetDayOrder(1); }}
                >
                  <option value={0}>여행 선택</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.planName} ({p.planDays}일)</option>)}
                </select>
              </div>

              {selectedPlan && (
                  <div className="animate-fade-in">
                    <label className="block text-xs font-bold text-gray-500 mb-1">날짜 (위치)</label>
                    <select
                        className="w-full p-2 border rounded-lg text-sm bg-white outline-none focus:border-blue-500 transition"
                        value={targetDayOrder}
                        onChange={(e) => setTargetDayOrder(Number(e.target.value))}
                    >
                      {Array.from({ length: selectedPlan.planDays }, (_, i) => i + 1).map(day => (
                          <option key={day} value={day}>{day}일차</option>
                      ))}
                    </select>
                  </div>
              )}
            </div>
          </div>

          {/* 하단 버튼 */}
          <div className="flex gap-2 mt-6">
            <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-200 transition"
            >
              취소
            </button>
            <button
                onClick={handleSubmit}
                className="flex-[2] py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 shadow-md transition"
            >
              확인
            </button>
          </div>
        </div>
      </div>
  );
}
