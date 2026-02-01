import { useState } from "react";
import { useNavigate } from "react-router-dom";

// API
import { deletePlan, updatePlan } from "../../api/planApi";

// Types & Utils
import type { PlanDetailResponse } from "../../types/plan";
import { getDurationInfo } from "../../utils/timeUtils";

interface Props {
  plan: PlanDetailResponse;
  onRefresh: () => void;
}

export default function PlanHeader({ plan, onRefresh }: Props) {
  const navigate = useNavigate();

  // 편집 모드 상태
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    planName: "",
    planStartDate: "",
    planEndDate: "",
    planMemo: ""
  });

  // 수정 시작
  const startEditing = () => {
    setEditForm({
      planName: plan.planName,
      planStartDate: plan.planStartDate,
      planEndDate: plan.planEndDate,
      planMemo: plan.planMemo || ""
    });
    setIsEditing(true);
  };

  // 저장 로직
  const handleSave = async () => {
    if (!editForm.planName.trim()) return alert("여행 이름을 입력해주세요.");

    const durationInfo = getDurationInfo(editForm.planStartDate, editForm.planEndDate);
    if (!durationInfo.valid) return alert(durationInfo.msg);

    try {
      await updatePlan(plan.id, editForm);
      setIsEditing(false);
      onRefresh(); // 데이터 갱신
    } catch {
      alert("수정 실패");
    }
  };

  const handleDelete = async () => {
    if (!confirm("정말 삭제하시겠습니까? 복구할 수 없습니다.")) return;
    try {
      await deletePlan(plan.id);
      navigate("/plans");
    } catch { alert("삭제 실패"); }
  };

  // 기간 및 상태 계산
  const viewDuration = getDurationInfo(plan.planStartDate, plan.planEndDate);
  const editDuration = getDurationInfo(editForm.planStartDate, editForm.planEndDate);

  const getStatusLabel = () => {
    const today = new Date().toISOString().split('T')[0];
    if (plan.planStartDate > today) return { text: "UPCOMING", color: "bg-blue-100 text-blue-600" };
    if (plan.planEndDate < today) return { text: "DONE", color: "bg-gray-100 text-gray-500" };
    return { text: "NOW ✈️", color: "bg-orange-100 text-orange-600" };
  };
  const status = getStatusLabel();

  return (
      <div className="mb-8">
        {/* 🔙 목록으로 돌아가기 (작게 표시) */}
        <button onClick={() => navigate('/plans')} className="text-gray-400 text-sm hover:text-gray-600 mb-3 flex items-center gap-1 transition">
          ← 목록으로
        </button>

        {/* 📄 메인 카드 컨테이너 */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden relative group transition-all hover:shadow-md">

          {/* 🎨 상단 컬러 바 (디자인 복구 포인트!) */}
          <div className="h-3 bg-blue-500 w-full" />

          <div className="p-6 md:p-8">

            {/* [1] 뷰 모드 (읽기 전용) */}
            {!isEditing ? (
                <div className="flex flex-col gap-4">
                  {/* 상단: 뱃지 및 버튼 */}
                  <div className="flex justify-between items-start">
                    <div className="flex gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-extrabold tracking-wide ${status.color}`}>
                    {status.text}
                  </span>
                      {viewDuration.valid && (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600">
                      {viewDuration.nights}박 {viewDuration.days}일
                    </span>
                      )}
                    </div>

                    {/* 설정 버튼 (톱니바퀴 대신 텍스트 버튼으로 깔끔하게) */}
                    <button
                        onClick={startEditing}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-xs font-bold hover:bg-gray-50 hover:text-blue-600 transition"
                    >
                      ⚙️ 정보 수정
                    </button>
                  </div>

                  {/* 제목 & 날짜 */}
                  <div>
                    <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-2 tracking-tight">
                      {plan.planName}
                    </h1>
                    <div className="flex items-center gap-2 text-gray-500 font-medium">
                      <span>📅</span>
                      <span className="font-mono text-lg">{plan.planStartDate} ~ {plan.planEndDate}</span>
                    </div>
                  </div>

                  {/* 메모 (줄바꿈 적용됨!) */}
                  <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 mt-2">
                    {plan.planMemo ? (
                        <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                          {plan.planMemo}
                        </p>
                    ) : (
                        <p className="text-gray-400 text-sm italic">작성된 메모가 없습니다.</p>
                    )}
                  </div>
                </div>
            ) : (

                /* [2] 수정 모드 (인라인) */
                <div className="flex flex-col gap-5 animate-fade-in-up">
                  {/* 헤더: 저장/취소 버튼 */}
                  <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                    <span className="text-sm font-bold text-blue-600">수정 모드 ✨</span>
                    <div className="flex gap-2">
                      <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm font-bold text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 transition">취소</button>
                      <button onClick={handleSave} className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-md transition">저장 완료</button>
                    </div>
                  </div>

                  {/* 제목 수정 */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1 ml-1">여행 이름</label>
                    <input
                        type="text"
                        className="w-full text-3xl font-extrabold text-gray-900 border-b-2 border-blue-200 focus:border-blue-500 bg-transparent outline-none py-1 transition placeholder-gray-300"
                        value={editForm.planName}
                        onChange={(e) => setEditForm({ ...editForm, planName: e.target.value })}
                        placeholder="여행 제목 입력"
                        autoFocus
                    />
                  </div>

                  {/* 날짜 수정 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1 ml-1">시작일</label>
                      <input
                          type="date"
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-mono text-gray-700 focus:ring-2 focus:ring-blue-100 outline-none transition"
                          value={editForm.planStartDate}
                          onChange={(e) => setEditForm({ ...editForm, planStartDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1 ml-1">종료일</label>
                      <input
                          type="date"
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-mono text-gray-700 focus:ring-2 focus:ring-blue-100 outline-none transition"
                          value={editForm.planEndDate}
                          onChange={(e) => setEditForm({ ...editForm, planEndDate: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* 기간 계산 미리보기 */}
                  <div className={`text-center py-2 rounded-lg text-sm font-bold ${editDuration.valid ? 'text-blue-600 bg-blue-50' : 'text-red-500 bg-red-50'}`}>
                    {editDuration.msg}
                  </div>

                  {/* 메모 수정 */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1 ml-1">메모</label>
                    <textarea
                        className="w-full bg-white border border-gray-300 rounded-xl p-4 text-sm text-gray-700 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none resize-none transition shadow-sm"
                        rows={5}
                        value={editForm.planMemo}
                        onChange={(e) => setEditForm({ ...editForm, planMemo: e.target.value })}
                        placeholder="여행에 대한 메모를 자유롭게 남겨보세요."
                    />
                  </div>

                  {/* 삭제 버튼 (수정 모드 하단에 배치하여 실수 방지) */}
                  <div className="pt-4 border-t border-gray-100 flex justify-center">
                    <button onClick={handleDelete} className="text-xs font-bold text-red-400 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded transition">
                      🗑️ 이 여행 계획 삭제하기
                    </button>
                  </div>
                </div>
            )}
          </div>
        </div>
      </div>
  );
}