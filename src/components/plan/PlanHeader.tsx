import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

// API
import { deletePlan, getPlanDetail, PlanEditConflictError, updatePlan } from "../../api/planApi";

// Types & Utils
import type { PlanDetailResponse, PlanResponse } from "../../types/plan";
import EditConflictPanel, { type EditConflictField } from "../common/EditConflictPanel";
import { enforceFourDigitDateYear, getDurationInfo, limitDateYear, shiftDate } from "../../utils/timeUtils";
import { useFeedback } from '../common/useFeedback';

interface Props {
  plan: PlanDetailResponse;
  onRefresh: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

export default function PlanHeader({ plan, onRefresh, onDirtyChange }: Props) {
  const { confirm, runUndoable, isUndoablePending, showToast } = useFeedback();
  const navigate = useNavigate();
  const isPlanDeletePending = isUndoablePending(`plan-delete:${plan.id}`);
  const isOwner = plan.accessRole === 'OWNER';

  const [isEditing, setIsEditing] = useState(false);
  const [isMemoExpanded, setIsMemoExpanded] = useState(false);
  const [editForm, setEditForm] = useState({
    planName: "",
    planStartDate: "",
    planEndDate: "",
    planMemo: ""
  });
  const [editConflict, setEditConflict] = useState<{ original: PlanResponse; mine: typeof editForm; latest: PlanDetailResponse } | null>(null);

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
    if (!editForm.planName.trim()) return showToast({ message: "여행 이름을 입력해 주세요.", type: 'info' });

    const durationInfo = getDurationInfo(editForm.planStartDate, editForm.planEndDate);
    if (!durationInfo.valid) return showToast({ message: durationInfo.msg, type: 'info' });

    const newPlanDays = durationInfo.days;

    try {
      let detachDayIds: number[] = [];
      if (plan.days && plan.days.length > 0) {
        const daysToDetach = plan.days.filter(day => day.dayOrder > newPlanDays);
        if (daysToDetach.length > 0) {
          if (!isOwner) return showToast({ message: '일정이 등록된 범위보다 짧게 줄이려면 여행 소유자가 날짜를 먼저 정리해야 합니다.', type: 'info' });
          const dayNames = daysToDetach.map(d => `${d.dayOrder}일차`).join(', ');
          const confirmMsg = `여행 기간이 ${newPlanDays}일로 줄어들었습니다.\n\n범위를 벗어나는 [ ${dayNames} ] 일정은 삭제되지 않고\n'하루 코스 보관함'으로 안전하게 이동됩니다.\n\n저장하시겠습니까?`;
          if (!await confirm({ title: '여행 기간 단축', message: confirmMsg, confirmLabel: '보관함으로 이동' })) return;
          detachDayIds = daysToDetach.map(day => day.id);
        }
      }

      await updatePlan(plan.id, { ...editForm, planDays: newPlanDays, expectedVersion: plan.version, detachDayIds });

      setIsEditing(false);
      onRefresh();
      showToast({ message: "여행 정보를 수정했습니다.", type: 'success' });
    } catch (err) {
      if (err instanceof PlanEditConflictError && err.latestPlan) {
        try {
          const latest = await getPlanDetail(plan.id);
          setEditConflict({ original: plan, mine: editForm, latest });
          return;
        } catch {
          showToast({ message: '충돌 내용을 불러오지 못했습니다. 최신 여행 정보를 다시 열어 주세요.', type: 'error' });
          return;
        }
      }
      console.error(err);
      showToast({ message: "여행 정보를 수정하지 못했습니다.", type: 'error' });
    }
  };

  const conflictFields: EditConflictField[] = editConflict ? [
    { key: 'planName', label: '여행 이름', original: editConflict.original.planName, mine: editConflict.mine.planName, latest: editConflict.latest.planName },
    { key: 'planStartDate', label: '시작일', original: editConflict.original.planStartDate, mine: editConflict.mine.planStartDate, latest: editConflict.latest.planStartDate },
    { key: 'planEndDate', label: '종료일', original: editConflict.original.planEndDate, mine: editConflict.mine.planEndDate, latest: editConflict.latest.planEndDate },
    { key: 'planMemo', label: '메모', original: editConflict.original.planMemo || '', mine: editConflict.mine.planMemo || '', latest: editConflict.latest.planMemo || '' },
  ] : [];

  const applyConflictMerge = async (values: Record<string, string | null>) => {
    if (!editConflict) return;
    const merged = { planName: values.planName ?? '', planStartDate: values.planStartDate ?? '', planEndDate: values.planEndDate ?? '', planMemo: values.planMemo ?? '' };
    const duration = getDurationInfo(merged.planStartDate, merged.planEndDate);
    if (!duration.valid) return showToast({ message: duration.msg, type: 'info' });
    try {
      const daysToDetach = editConflict.latest.days.filter(day => day.dayOrder > duration.days);
      let detachDayIds: number[] = [];
      if (daysToDetach.length > 0) {
        const dayNames = daysToDetach.map(day => `${day.dayOrder}일차`).join(', ');
        if (!isOwner) return showToast({ message: '일정이 등록된 범위보다 짧게 줄이려면 여행 소유자가 날짜를 먼저 정리해야 합니다.', type: 'info' });
        const confirmed = await confirm({ title: '여행 기간 단축', message: `여행 기간을 ${duration.days}일로 줄이면 [ ${dayNames} ] 날짜가 하루 코스 보관함으로 이동됩니다. 계속할까요?`, confirmLabel: '보관함으로 이동' });
        if (!confirmed) return;
        detachDayIds = daysToDetach.map(day => day.id);
      }
      await updatePlan(plan.id, { ...merged, planDays: duration.days, expectedVersion: editConflict.latest.version, detachDayIds });
      setEditConflict(null);
      setIsEditing(false);
      onRefresh();
      showToast({ message: '변경 내용을 병합해 저장했습니다.', type: 'success' });
    } catch (err) {
      if (err instanceof PlanEditConflictError && err.latestPlan) {
        try {
          const latest = await getPlanDetail(plan.id);
          setEditConflict({ original: editConflict.latest, mine: merged, latest });
        } catch {
          showToast({ message: '충돌 내용을 불러오지 못했습니다. 최신 여행 정보를 다시 열어 주세요.', type: 'error' });
        }
      }
      else showToast({ message: '병합한 여행 정보를 저장하지 못했습니다. 최신 내용을 다시 불러와 주세요.', type: 'error' });
    }
  };

  const useLatestPlan = () => {
    if (!editConflict) return;
    setEditForm({ planName: editConflict.latest.planName, planStartDate: editConflict.latest.planStartDate, planEndDate: editConflict.latest.planEndDate, planMemo: editConflict.latest.planMemo || '' });
    setEditConflict(null);
    setIsEditing(false);
    onRefresh();
  };

  const handleDelete = async () => {
    if (isPlanDeletePending) return;
    if (!await confirm({ title: '여행 계획 삭제', message: `'${plan.planName}'과 포함된 모든 일정을 삭제할까요?`, confirmLabel: '삭제', danger: true })) return;
    runUndoable({
      key: `plan-delete:${plan.id}`,
      message: `'${plan.planName}'을 6초 후 삭제합니다.`,
      successMessage: '여행 계획을 삭제했습니다.',
      commit: async () => { await deletePlan(plan.id); navigate("/plans"); },
    });
  };

  const viewDuration = getDurationInfo(plan.planStartDate, plan.planEndDate);
  const editDuration = getDurationInfo(editForm.planStartDate, editForm.planEndDate);
  const scheduleDayCount = Math.max(1, plan.days?.length || plan.planDays || 1);

  const fitEndDateToSchedules = () => {
    const fittedEndDate = shiftDate(editForm.planStartDate, scheduleDayCount - 1);
    if (!fittedEndDate) return showToast({ message: "시작일을 먼저 입력해 주세요.", type: 'info' });
    setEditForm(current => ({ ...current, planEndDate: fittedEndDate }));
  };

  const fitStartDateToSchedules = () => {
    const fittedStartDate = shiftDate(editForm.planEndDate, -(scheduleDayCount - 1));
    if (!fittedStartDate) return showToast({ message: "종료일을 먼저 입력해 주세요.", type: 'info' });
    setEditForm(current => ({ ...current, planStartDate: fittedStartDate }));
  };

  const getStatusLabel = () => {
    // ✅ [수정] UTC 대신 로컬 타임존 기준으로 오늘 날짜 가져오기
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`; // "2026-02-07"

    if (plan.planStartDate > today) return { text: "예정", color: "bg-blue-100 text-blue-600" };
    if (plan.planEndDate < today) return { text: "완료", color: "bg-gray-100 text-gray-500" };
    return { text: "여행 중 ✈️", color: "bg-orange-100 text-orange-600" };
  };

  const status = getStatusLabel();

  return (
      <div className="mb-4">

        <div className="yume-card overflow-hidden">
          <div className="p-4 md:p-5">
            {!isEditing ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap justify-between items-start gap-2">
                    <div className="flex flex-wrap gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-extrabold tracking-wide ${status.color}`}>{status.text}</span>
                      {viewDuration.valid && (<span className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600">{viewDuration.nights}박 {viewDuration.days}일</span>)}
                    </div>
                    <button type="button" onClick={startEditing} className="yume-button yume-button-secondary">정보 수정</button>
                  </div>
                  <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 tracking-tight break-keep [overflow-wrap:break-word]">{plan.planName}</h1>
                    <div className="flex items-start gap-2 text-gray-600 font-medium text-sm"><span>📅</span><span className="font-mono">{plan.planStartDate} ~ {plan.planEndDate}</span></div>
                  </div>
                  {plan.planMemo && <div className="bg-gray-50 rounded-xl p-2 border border-gray-100">
                    <button type="button" aria-expanded={isMemoExpanded} aria-controls={`plan-memo-${plan.id}`} onClick={() => setIsMemoExpanded(open => !open)} className="inline-flex min-h-11 w-full items-center text-sm font-semibold text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg px-2">{isMemoExpanded ? '메모 접기' : '여행 메모 보기'}</button>
                    <p id={`plan-memo-${plan.id}`} hidden={!isMemoExpanded} className="max-h-48 overflow-y-auto p-2 text-gray-700 text-sm leading-relaxed whitespace-pre-wrap break-words">{plan.planMemo}</p>
                  </div>}
                </div>
            ) : (
                <div className="flex flex-col gap-5 animate-fade-in-up">
                  <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                    <span className="text-sm font-bold text-blue-600">수정 모드 ✨</span>
                    <div className="flex gap-2">
                      <button onClick={() => setIsEditing(false)} className="yume-button yume-button-secondary">취소</button>
                      <button onClick={handleSave} className="yume-button yume-button-primary">저장</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1 ml-1">여행 이름</label>
                    <input type="text" className="w-full text-3xl font-extrabold text-gray-900 border-b-2 border-blue-200 focus:border-blue-500 bg-transparent outline-none py-1 transition placeholder-gray-300" value={editForm.planName} onChange={(e) => setEditForm({ ...editForm, planName: e.target.value })} placeholder="여행 제목 입력" autoFocus />
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1 ml-1">시작일</label>
                      <input type="date" min="1900-01-01" max="2100-12-31" onInput={enforceFourDigitDateYear} className="yume-input yume-input-soft font-mono" value={editForm.planStartDate} onChange={(e) => setEditForm({ ...editForm, planStartDate: limitDateYear(e.target.value) })} />
                      <button
                        type="button"
                        onClick={fitEndDateToSchedules}
                        className="yume-button yume-button-soft mt-2 w-full"
                      >
                        시작일 기준으로 종료일 맞추기
                      </button>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1 ml-1">종료일</label>
                      <input type="date" min="1900-01-01" max="2100-12-31" onInput={enforceFourDigitDateYear} className="yume-input yume-input-soft font-mono" value={editForm.planEndDate} onChange={(e) => setEditForm({ ...editForm, planEndDate: limitDateYear(e.target.value) })} />
                      <button
                        type="button"
                        onClick={fitStartDateToSchedules}
                        className="yume-button yume-button-soft mt-2 w-full"
                      >
                        종료일 기준으로 시작일 맞추기
                      </button>
                    </div>
                  </div>
                  <div className="text-center text-xs font-bold text-gray-600">현재 등록된 일정 {scheduleDayCount}일 기준</div>
                  <div className={`text-center py-2 rounded-lg text-sm font-bold ${editDuration.valid ? 'text-blue-600 bg-blue-50' : 'text-red-500 bg-red-50'}`}>{editDuration.msg}</div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1 ml-1">메모</label>
                    <textarea className="w-full bg-white border border-gray-300 rounded-xl p-4 text-sm text-gray-700 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none resize-none transition shadow-sm" rows={5} value={editForm.planMemo} onChange={(e) => setEditForm({ ...editForm, planMemo: e.target.value })} placeholder="여행에 대한 메모를 자유롭게 남겨보세요." />
                  </div>
                  {isOwner && <div className="pt-4 border-t border-gray-100 flex justify-center">
                    <button type="button" disabled={isPlanDeletePending} onClick={handleDelete} className="yume-button yume-button-danger-outline">{isPlanDeletePending ? '⏳ 삭제 대기 중…' : '🗑️ 이 여행 계획 삭제하기'}</button>
                  </div>}
                </div>
            )}
          </div>
        </div>
        {editConflict && <EditConflictPanel
          title="여행 정보 충돌"
          fields={conflictFields}
          onApply={values => void applyConflictMerge(values)}
          onUseLatest={useLatestPlan}
          onCancel={() => setEditConflict(null)}
        />}
      </div>
  );
}
