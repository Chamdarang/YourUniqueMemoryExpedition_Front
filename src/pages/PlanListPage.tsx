import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

// API
import { getPlans, getPlanDetail, deletePlan, importPlanData, updatePlan, createPlan, PlanEditConflictError, type GetPlansParams } from '../api/planApi';
import { acceptPlanInvitation, declinePlanInvitation, getPlanInvitations, getSharedPlans } from '../api/planMemberApi';

// Types & Utils
import type { PlanCreateRequest, PlanDetailResponse, PlanInvitationResponse, PlanResponse, PlanTransferData, SharedPlanResponse } from '../types/plan';
import { enforceFourDigitDateYear, getDurationInfo, limitDateYear } from '../utils/timeUtils';

// Components
import PlanList from '../components/plan/PlanList';
import PlanFilter, { type PlanStatus, type SearchParams } from '../components/plan/PlanFilter';
import GeneralImportModal from '../components/plan/GeneralImportModal';
import Pagination from '../components/common/Pagination'; // ✅ 페이지네이션 컴포넌트
import { useFeedback } from '../components/common/useFeedback';
import LoadErrorState from '../components/common/LoadErrorState';
import { useDialogFocus } from '../hooks/useDialogFocus';
import EditConflictPanel, { type EditConflictField } from '../components/common/EditConflictPanel';

interface ImportCompletionReport {
  plan: PlanResponse;
  source: 'JSON' | 'FILE';
  days: number;
  schedules: number;
  fixedStartTimes: number;
  linkedSpots: number;
  scheduleOnlySpots: number;
  skippedRows: number;
  issues: Array<{
    rowNumber: number;
    severity: 'WARNING' | 'ERROR';
    message: string;
    value: string | null;
  }>;
}

export default function PlanListPage() {
  const { confirm, runUndoable, showToast } = useFeedback();
  const navigate = useNavigate();
  const importInputRef = useRef<HTMLInputElement>(null);
  // 데이터 상태
  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [invitations, setInvitations] = useState<PlanInvitationResponse[]>([]);
  const [sharedPlans, setSharedPlans] = useState<SharedPlanResponse[]>([]);
  const [collaborationLoading, setCollaborationLoading] = useState(true);

  // ✅ 페이징 상태 추가
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const currentSearchParamsRef = useRef<SearchParams>({ startDate: '', endDate: '', selectedMonths: [] });
  const requestVersion = useRef(0);
  const currentStatusRef = useRef<PlanStatus>('ALL');

  const [filterVersion, setFilterVersion] = useState(0);
  const [viewStatus, setViewStatus] = useState<PlanStatus>('ALL');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [spreadsheetFile, setSpreadsheetFile] = useState<File | null>(null);
  const [importCompletion, setImportCompletion] = useState<ImportCompletionReport | null>(null);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [createForm, setCreateForm] = useState<PlanCreateRequest>({
    planName: '',
    planStartDate: '',
    planEndDate: '',
    planDays: 4,
    planMemo: '',
  });

  // 수정 팝업 상태
  const [editingPlan, setEditingPlan] = useState<PlanResponse | null>(null);
  const [editForm, setEditForm] = useState({ planName: '', planStartDate: '', planEndDate: '', planMemo: '' });
  const [editConflict, setEditConflict] = useState<{ original: PlanResponse; mine: typeof editForm; latest: PlanDetailResponse } | null>(null);

  const editDialogRef = useDialogFocus(editingPlan !== null, () => setEditingPlan(null));
  const importReportRef = useDialogFocus(importCompletion !== null, () => setImportCompletion(null));

  // 1. 목록 불러오기 (페이징 적용)
  const fetchPlans = useCallback(async (searchParams?: SearchParams, pageNum: number = 0, status?: PlanStatus) => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      // 검색 조건이 새로 들어오면 저장, 아니면 기존 저장된 조건 사용
      const paramsToUse = searchParams || currentSearchParamsRef.current;

      if (searchParams) {
        currentSearchParamsRef.current = searchParams;
        setPage(0); // 검색 조건이 바뀌면 1페이지(0)로 리셋
        pageNum = 0;
      }

      const apiParams: GetPlansParams = {
        page: pageNum,
        size: 10, // ✅ 한 페이지에 보여줄 개수
        from: paramsToUse.startDate || undefined,
        to: paramsToUse.endDate || undefined,
        months: paramsToUse.selectedMonths,
        status: status ?? currentStatusRef.current,
      };

      const data = await getPlans(apiParams);
      if (version !== requestVersion.current) return;

      // ✅ PageResponse 데이터 매핑
      setPlans(data.content);
      setTotalPages(data.totalPages);
      setTotalElements(data.totalElements);
      setPage(data.number);
      setLoadError(null);

    } catch (err) {
      if (version !== requestVersion.current) return;
      console.error(err);
      setLoadError('여행 계획 목록을 불러오지 못했습니다.');
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);

  // 초기 로드
  useEffect(() => { void fetchPlans(); }, [fetchPlans]);

  const refreshCollaboration = useCallback(async () => {
    try {
      const [pending, shared] = await Promise.all([getPlanInvitations(), getSharedPlans()]);
      setInvitations(pending);
      setSharedPlans(shared);
    } catch (err) {
      console.error(err);
      showToast({ message: '공동 계획 정보를 불러오지 못했습니다.', type: 'error' });
    } finally {
      setCollaborationLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void refreshCollaboration(); }, [refreshCollaboration]);

  const handleInvitation = async (invitation: PlanInvitationResponse, accept: boolean) => {
    try {
      if (accept) await acceptPlanInvitation(invitation.id);
      else await declinePlanInvitation(invitation.id);
      showToast({ message: accept ? '공동 편집 초대를 수락했습니다.' : '초대를 거절했습니다.', type: 'success' });
      await refreshCollaboration();
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : '초대를 처리하지 못했습니다.', type: 'error' });
    }
  };

  // ✅ 페이지 변경 핸들러
  const handlePageChange = (newPage: number) => {
    fetchPlans(undefined, newPage); // 기존 검색 조건 유지하며 페이지 이동
  };

  const handleStatusChange = (status: PlanStatus) => {
    setViewStatus(status);
    currentStatusRef.current = status;
    void fetchPlans(undefined, 0, status);
  };

  // 2. 삭제
  const handleDelete = async (id: number) => {
    const target = plans.find(plan => plan.id === id);
    if (!await confirm({
      title: '여행 계획 삭제',
      message: `'${target?.planName || '이 여행'}'과 포함된 모든 일정을 삭제할까요?`,
      confirmLabel: '삭제',
      danger: true,
    })) return;
    runUndoable({
      key: `plan-delete:${id}`,
      message: `'${target?.planName || '여행 계획'}'을 6초 후 삭제합니다.`,
      successMessage: '여행 계획을 삭제했습니다.',
      commit: async () => { await deletePlan(id); await fetchPlans(undefined, page); },
    });
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

  // 4. 저장
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    if (!editForm.planName.trim()) return showToast({ message: "여행 이름을 입력해 주세요.", type: 'info' });

    const info = getDurationInfo(editForm.planStartDate, editForm.planEndDate);
    if (!info.valid) return showToast({ message: info.msg, type: 'info' });

    try {
      const latestDetail = await getPlanDetail(editingPlan.id);
      const daysToDetach = latestDetail.days.filter(day => day.dayOrder > info.days);
      let detachDayIds: number[] = [];
      if (daysToDetach.length > 0) {
        const dayNames = daysToDetach.map(day => `${day.dayOrder}일차`).join(', ');
        const confirmed = await confirm({
          title: '여행 기간 단축',
          message: `여행 기간을 ${info.days}일로 줄이면 [ ${dayNames} ] 날짜가 하루 코스 보관함으로 이동됩니다. 계속할까요?`,
          confirmLabel: '보관함으로 이동',
        });
        if (!confirmed) return;
        detachDayIds = daysToDetach.map(day => day.id);
      }
      await updatePlan(editingPlan.id, {
        ...editForm,
        planDays: info.days,
        expectedVersion: editingPlan.version,
        detachDayIds,
      });

      setEditingPlan(null);
      showToast({ message: '여행 정보를 수정했습니다.', type: 'success' });
      fetchPlans(undefined, page); // 목록 갱신
    } catch (err) {
      if (err instanceof PlanEditConflictError && err.latestPlan) {
        try {
          const latest = await getPlanDetail(editingPlan.id);
          setEditConflict({ original: editingPlan, mine: editForm, latest });
        } catch {
          showToast({ message: '충돌 내용을 불러오지 못했습니다. 최신 여행 정보를 다시 열어 주세요.', type: 'error' });
        }
      } else showToast({ message: "여행 정보를 수정하지 못했습니다.", type: 'error' });
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
        const confirmed = await confirm({
          title: '여행 기간 단축',
          message: `여행 기간을 ${duration.days}일로 줄이면 [ ${dayNames} ] 날짜가 하루 코스 보관함으로 이동됩니다. 계속할까요?`,
          confirmLabel: '보관함으로 이동',
        });
        if (!confirmed) return;
        detachDayIds = daysToDetach.map(day => day.id);
      }
      await updatePlan(editConflict.latest.id, { ...merged, planDays: duration.days, expectedVersion: editConflict.latest.version, detachDayIds });
      setEditConflict(null);
      setEditingPlan(null);
      showToast({ message: '변경 내용을 병합해 저장했습니다.', type: 'success' });
      await fetchPlans(undefined, page);
    } catch (err) {
      if (err instanceof PlanEditConflictError && err.latestPlan) {
        try {
          const latest = await getPlanDetail(editConflict.latest.id);
          setEditConflict({ original: editConflict.latest, mine: merged, latest });
        } catch {
          showToast({ message: '충돌 내용을 불러오지 못했습니다. 최신 여행 정보를 다시 열어 주세요.', type: 'error' });
        }
      } else showToast({ message: '병합한 여행 정보를 저장하지 못했습니다. 최신 내용을 다시 불러와 주세요.', type: 'error' });
    }
  };

  const useLatestPlan = () => {
    if (!editConflict) return;
    setEditingPlan(editConflict.latest);
    setEditForm({ planName: editConflict.latest.planName, planStartDate: editConflict.latest.planStartDate, planEndDate: editConflict.latest.planEndDate, planMemo: editConflict.latest.planMemo || '' });
    setEditConflict(null);
  };

  const durationInfo = getDurationInfo(editForm.planStartDate, editForm.planEndDate);

  const addDaysToDate = (dateStr: string, days: number): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    date.setDate(date.getDate() + (days - 1));
    return date.toISOString().split('T')[0];
  };

  const calculateDuration = (startStr: string, endStr: string): number => {
    if (!startStr || !endStr) return 0;
    const start = new Date(startStr);
    const end = new Date(endStr);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };

  const handleCreatePlanSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!createForm.planName.trim()) {
      showToast({ message: '여행 이름을 입력해 주세요.', type: 'info' });
      return;
    }
    if (createForm.planDays <= 0) {
      showToast({ message: '여행 기간은 최소 1일 이상이어야 합니다.', type: 'info' });
      return;
    }

    try {
      await createPlan(createForm);
      setCreateForm({ planName: '', planStartDate: '', planEndDate: '', planDays: 4, planMemo: '' });
      setIsCreatingPlan(false);
      showToast({ message: `'${createForm.planName}' 여행을 만들었습니다! ✈️`, type: 'success' });
      await fetchPlans(undefined, 0, 'ALL');
      currentStatusRef.current = 'ALL';
      setViewStatus('ALL');
    } catch (error: unknown) {
      showToast({ message: error instanceof Error ? error.message : '여행을 만들지 못했습니다.', type: 'error' });
    }
  };

  const handleCreateDateChange = (field: 'planStartDate' | 'planEndDate', value: string) => {
    const date = limitDateYear(value);
    if (field === 'planStartDate') {
      setCreateForm(current => ({
        ...current,
        planStartDate: date,
        planEndDate: addDaysToDate(date, current.planDays),
      }));
      return;
    }
    const duration = calculateDuration(createForm.planStartDate, date);
    setCreateForm(current => ({ ...current, planEndDate: date, planDays: duration > 0 ? duration : 1 }));
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setSpreadsheetFile(file);
      return;
    }

    setImporting(true);
    try {
      const parsed = JSON.parse(await file.text()) as PlanTransferData;
      if (parsed?.formatVersion !== 1 || !parsed.planName || !Array.isArray(parsed.days)) {
        throw new Error("YUME에서 내보낸 계획 JSON 파일이 아닙니다.");
      }
      const imported = await importPlanData(parsed);
      const schedules = parsed.days.flatMap(day => day.schedules);
      setImportCompletion({
        plan: imported,
        source: 'JSON',
        days: parsed.days.length,
        schedules: schedules.length,
        fixedStartTimes: schedules.filter(schedule => schedule.fixedStartTime).length,
        linkedSpots: new Set(
          schedules.filter(schedule => schedule.spotUserId !== null).map(schedule => schedule.spotName).filter(Boolean),
        ).size,
        scheduleOnlySpots: new Set(
          schedules.filter(schedule => schedule.spotUserId === null).map(schedule => schedule.spotName).filter(Boolean),
        ).size,
        skippedRows: 0,
        issues: [],
      });
    } catch (error) {
      console.error(error);
      showToast({ message: error instanceof Error ? error.message : "계획을 불러오지 못했습니다.", type: 'error' });
    } finally {
      setImporting(false);
    }
  };

  const closeSpreadsheetImport = () => {
    if (importing) return;
    setSpreadsheetFile(null);
  };

  return (
      <div className="max-w-5xl mx-auto p-4 md:p-6 pb-20">

        {/* 헤더 */}
        <div className="flex flex-row justify-between items-end mb-6 gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">나의 여행 🗺️</h1>
            {/* 총 개수 표시 */}
            <p className="text-gray-500 mt-1 md:mt-2 text-sm">{loadError ? '목록을 다시 불러와 주세요.' : <>총 <span className="text-blue-600 font-bold">{totalElements}</span>개의 여행</>}</p>
          </div>

          <div data-guide-target="plans-actions" className="flex items-center gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept=".json,.xlsx,.xls,.csv,application/json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={handleImportFile}
            />
            <button
              type="button"
              data-guide-target="plans-import"
              disabled={importing}
              onClick={() => importInputRef.current?.click()}
              className="border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold py-2.5 px-3 md:px-4 rounded-xl shadow-sm transition text-sm shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {importing ? '불러오는 중...' : '📂 불러오기'}
            </button>
            <button data-guide-target="plans-create" data-guide-state={isCreatingPlan ? 'open' : 'closed'} type="button" onClick={() => setIsCreatingPlan(open => !open)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 md:px-5 rounded-xl shadow transition text-sm flex items-center gap-2 shrink-0 h-10 md:h-auto">
              <span>{isCreatingPlan ? '닫기' : '+ 새 여행'}</span>
            </button>
          </div>
        </div>

        {isCreatingPlan && (
          <section data-guide-target="plans-create-form" className="mb-6 p-6 bg-white rounded-xl shadow-lg border border-gray-100 animate-fade-in-down">
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><span>✨</span> 새로운 여행 만들기</h2>
            <form onSubmit={handleCreatePlanSubmit} className="space-y-4">
              <p className="text-xs text-gray-600">가는 날·오는 날과 기간은 함께 계산됩니다. 만든 뒤 여행을 열어 날짜별 일정을 추가하세요.</p>
              <div data-guide-target="plans-create-name">
                <label className="block text-sm font-bold text-gray-700 mb-1">여행 제목</label>
                <input type="text" required value={createForm.planName} onChange={event => setCreateForm(current => ({ ...current, planName: event.target.value }))} placeholder="예) 제주도 힐링 여행" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4" data-guide-target="plans-create-dates">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">가는 날</label>
                  <input type="date" max="9999-12-31" onInput={enforceFourDigitDateYear} value={createForm.planStartDate} onChange={event => handleCreateDateChange('planStartDate', event.target.value)} className="w-full px-3 py-2 border rounded-lg outline-none focus:border-blue-500" />
                </div>
                <div data-guide-target="plans-create-duration">
                  <label className="block text-sm font-bold text-gray-700 mb-1">기간 (일)</label>
                  <input type="number" min="1" value={createForm.planDays} onChange={event => {
                    const days = parseInt(event.target.value, 10) || 1;
                    setCreateForm(current => ({ ...current, planDays: days, planEndDate: addDaysToDate(current.planStartDate, days) }));
                  }} className="w-full px-3 py-2 border rounded-lg outline-none focus:border-blue-500 text-center font-bold text-blue-600" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">오는 날</label>
                  <input type="date" max="9999-12-31" onInput={enforceFourDigitDateYear} value={createForm.planEndDate} onChange={event => handleCreateDateChange('planEndDate', event.target.value)} className="w-full px-3 py-2 border rounded-lg outline-none focus:border-blue-500" />
                </div>
              </div>
              <div data-guide-target="plans-create-memo">
                <label className="block text-sm font-bold text-gray-700 mb-1">간단 메모</label>
                <textarea rows={3} value={createForm.planMemo} onChange={event => setCreateForm(current => ({ ...current, planMemo: event.target.value }))} placeholder="여행 테마나 계획을 적어보세요." className="w-full px-4 py-2 border rounded-lg outline-none resize-none" />
              </div>
              <button data-guide-target="plans-create-submit" type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition transform active:scale-95">여행 생성하기</button>
            </form>
          </section>
        )}

        {/* 필터 */}
        <div data-guide-target="plans-filter" className="mb-6">
          <PlanFilter key={filterVersion}
              status={viewStatus}
              onStatusChange={handleStatusChange}
              onSearch={(params) => fetchPlans(params, 0)} // 검색 시 0페이지부터
          />
        </div>

        {!collaborationLoading && invitations.length > 0 && (
          <section className="mb-6 rounded-2xl border border-violet-100 bg-violet-50/60 p-4 md:p-5">
            <h2 className="mb-3 text-sm font-bold text-violet-950">공동 편집 초대 <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700">{invitations.length}</span></h2>
            <ul className="space-y-2">
              {invitations.map(invitation => (
                <li key={invitation.id} className="flex flex-col gap-3 rounded-xl border border-violet-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{invitation.planName}</p>
                    <p className="mt-1 text-xs text-slate-500">{invitation.inviterUsername}님이 함께 계획하도록 초대했습니다.</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => void handleInvitation(invitation, false)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">거절</button>
                    <button type="button" onClick={() => void handleInvitation(invitation, true)} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700">수락</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!collaborationLoading && sharedPlans.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-lg font-bold text-slate-900">함께 계획 중 <span className="ml-1 text-sm font-medium text-slate-400">{sharedPlans.length}</span></h2>
            <div className="space-y-3">
              {sharedPlans.map(plan => {
                const duration = getDurationInfo(plan.planStartDate, plan.planEndDate);
                const today = new Date().toLocaleDateString('sv-SE');
                const status = plan.planStartDate > today
                  ? { label: 'UPCOMING', badge: 'bg-blue-100 text-blue-600', hover: 'hover:border-blue-300 hover:bg-blue-50/30' }
                  : plan.planEndDate < today
                    ? { label: 'DONE', badge: 'bg-gray-100 text-gray-500', hover: 'hover:border-gray-300 hover:bg-gray-50/50' }
                    : { label: 'NOW ✈️', badge: 'bg-orange-100 text-orange-600', hover: 'hover:border-orange-300 hover:bg-orange-50/30' };

                return (
                  <Link key={plan.id} to={`/plans/${plan.id}`} className={`relative flex flex-col justify-between gap-3 overflow-hidden rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md md:flex-row md:items-center md:px-6 md:py-5 ${status.hover}`}>
                    <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-center md:gap-6">
                      <span className={`inline-block shrink-0 self-start rounded-lg px-3 py-1 text-xs font-extrabold tracking-wide md:self-auto ${status.badge}`}>{status.label}</span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1 md:flex-row md:items-baseline md:gap-4">
                        <span className="truncate text-lg font-bold text-gray-900 transition-colors">{plan.planName}</span>
                        <span className="flex items-center gap-2 text-sm text-gray-500">
                          <span className="font-mono">{plan.planStartDate} ~ {plan.planEndDate}</span>
                          <span className="h-1 w-1 rounded-full bg-gray-300" />
                          <span className="whitespace-nowrap rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500">{duration.valid ? `${duration.nights}박 ${duration.days}일` : '날짜 오류'}</span>
                        </span>
                      </div>
                    </div>
                    <span className="ml-3 shrink-0 self-end rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-bold text-blue-700 md:ml-0 md:self-auto">공동 편집</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {loadError && <LoadErrorState message={loadError} retrying={loading} onRetry={() => void fetchPlans(undefined, page)} />}
        {loading && !plans.length && !loadError ? <div className="text-center p-20 text-gray-400">로딩 중...</div> :
            <>
              {/* 리스트 */}
              <div data-guide-target="plans-list">
                {(!loadError || plans.length > 0) && <PlanList plans={plans} onDelete={handleDelete} onEdit={handleEditClick}
                  filtered={Boolean(viewStatus !== 'ALL' || currentSearchParamsRef.current.startDate || currentSearchParamsRef.current.endDate || currentSearchParamsRef.current.selectedMonths.length)}
                  onReset={() => { currentStatusRef.current = 'ALL'; setViewStatus('ALL'); setFilterVersion(version => version + 1); void fetchPlans({ startDate: '', endDate: '', selectedMonths: [] }, 0, 'ALL'); }}
                  onCreate={() => { setIsCreatingPlan(true); requestAnimationFrame(() => document.querySelector('[data-guide-target="plans-create-form"]')?.scrollIntoView({ block: 'start' })); }} />}
              </div>

              {/* ✅ 페이지네이션 컴포넌트 추가 */}
              <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
              />
            </>
        }

        {/* 수정 팝업 */}
        {editingPlan && (
            <div ref={editDialogRef} role="dialog" aria-modal="true" aria-label="여행 정보 수정" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-3xl w-full max-w-2xl p-8 md:p-10 shadow-2xl animate-fade-in-down transform transition-all scale-100">

                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl font-extrabold text-gray-900">✏️ 여행 정보 수정</h3>
                  <button type="button" aria-label="여행 정보 수정 닫기" onClick={() => setEditingPlan(null)} className="min-h-11 min-w-11 text-gray-400 hover:text-gray-600 text-2xl transition">✕</button>
                </div>

                <form onSubmit={handleEditSubmit} className="space-y-6">
                  <div>
                    <label className="block text-base font-bold text-gray-700 mb-2">여행 이름</label>
                    <input
                        type="text"
                        className="w-full border border-gray-300 rounded-xl p-4 text-lg outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition shadow-sm"
                        value={editForm.planName}
                        onChange={e => setEditForm({ ...editForm, planName: e.target.value })}
                        data-dialog-initial-focus
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-base font-bold text-gray-700 mb-2">시작일</label>
                      <input
                          type="date"
                          max="9999-12-31"
                          onInput={enforceFourDigitDateYear}
                          className="w-full border border-gray-300 rounded-xl p-4 text-gray-700 outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition shadow-sm cursor-pointer"
                          value={editForm.planStartDate}
                          onChange={e => setEditForm({ ...editForm, planStartDate: limitDateYear(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="block text-base font-bold text-gray-700 mb-2">종료일</label>
                      <input
                          type="date"
                          max="9999-12-31"
                          onInput={enforceFourDigitDateYear}
                          className="w-full border border-gray-300 rounded-xl p-4 text-gray-700 outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition shadow-sm cursor-pointer"
                          value={editForm.planEndDate}
                          onChange={e => setEditForm({ ...editForm, planEndDate: limitDateYear(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className={`p-4 rounded-xl text-base font-bold text-center border-2 border-dashed transition-colors ${durationInfo.valid ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-red-50 border-red-200 text-red-500'}`}>
                    {durationInfo.msg}
                  </div>

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

                  <div className="flex gap-4 pt-4">
                    <button type="button" onClick={() => setEditingPlan(null)} className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-xl font-bold text-lg hover:bg-gray-200 transition">취소</button>
                    <button type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 shadow-lg hover:shadow-xl transition transform hover:-translate-y-0.5">저장하기</button>
                  </div>
                </form>
              </div>
            </div>
        )}

        {spreadsheetFile && (
          <GeneralImportModal
            file={spreadsheetFile}
            onClose={closeSpreadsheetImport}
            onImported={(imported, preview) => {
              setImportCompletion({
                plan: imported,
                source: 'FILE',
                days: preview.summary.importedDays,
                schedules: preview.summary.importedSchedules,
                fixedStartTimes: preview.summary.fixedStartTimes,
                linkedSpots: 0,
                scheduleOnlySpots: preview.summary.newSpots,
                skippedRows: preview.summary.skippedRows,
                issues: preview.issues,
              });
              setSpreadsheetFile(null);
              void fetchPlans(undefined, page);
            }}
          />
        )}

        {importCompletion && (
          <div ref={importReportRef} role="dialog" aria-modal="true" aria-label="여행 가져오기 결과" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl md:p-8">
              <div className="mb-6 text-center">
                <div className="mb-3 text-4xl">✅</div>
                <h3 className="text-2xl font-black text-gray-900">계획을 가져왔습니다</h3>
                <p className="mt-1 text-sm font-bold text-blue-600">{importCompletion.plan.planName}</p>
                <p className="mt-1 text-xs text-gray-400">{importCompletion.source} Import 결과</p>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {[
                  ['일차', importCompletion.days],
                  ['일정', importCompletion.schedules],
                  ['고정 시작', importCompletion.fixedStartTimes],
                  ['내 장소 연결', importCompletion.linkedSpots],
                  ['일정에만 추가', importCompletion.scheduleOnlySpots],
                  ['제외된 행', importCompletion.skippedRows],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl bg-blue-50 p-3 text-center">
                    <div className="text-xl font-black text-blue-700">{value}</div>
                    <div className="text-[11px] font-bold text-blue-400">{label}</div>
                  </div>
                ))}
              </div>

              {importCompletion.issues.length > 0 && (
                <div className="mt-5 max-h-36 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-2 text-xs font-black text-gray-700">가져오기 확인 사항</div>
                  {importCompletion.issues.map((issue, index) => (
                    <div
                      key={`${issue.rowNumber}-${index}`}
                      className={`mb-1 rounded-lg px-2 py-1.5 text-xs ${
                        issue.severity === 'ERROR'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      <b>{issue.severity === 'ERROR' ? '제외' : '경고'} · {issue.rowNumber}행</b>
                      {' · '}{issue.message}
                      {issue.value && <span className="ml-1 opacity-70">({issue.value})</span>}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setImportCompletion(null);
                    void fetchPlans(undefined, 0);
                  }}
                  className="flex-1 rounded-xl bg-gray-100 py-3 font-bold text-gray-600 hover:bg-gray-200"
                >
                  목록에 남기
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/plans/${importCompletion.plan.id}`)}
                  className="flex-[2] rounded-xl bg-blue-600 py-3 font-bold text-white shadow hover:bg-blue-700"
                >
                  계획 확인하기
                </button>
              </div>
            </div>
          </div>
        )}
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
