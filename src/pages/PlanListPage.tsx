import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

// API
import { getPlans, deletePlan, importPlanData, updatePlan, type GetPlansParams } from '../api/planApi';

// Types & Utils
import type { PlanResponse, PlanTransferData } from '../types/plan';
import { getDurationInfo } from '../utils/timeUtils';

// Components
import PlanList from '../components/plan/PlanList';
import PlanFilter, { type PlanStatus, type SearchParams } from '../components/plan/PlanFilter';
import GeneralImportModal from '../components/plan/GeneralImportModal';
import Pagination from '../components/common/Pagination'; // ✅ 페이지네이션 컴포넌트

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
  const navigate = useNavigate();
  const importInputRef = useRef<HTMLInputElement>(null);
  // 데이터 상태
  const [plans, setPlans] = useState<PlanResponse[]>([]);

  // ✅ 페이징 상태 추가
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const currentSearchParamsRef = useRef<SearchParams>({ startDate: '', endDate: '', selectedMonths: [] });

  const [viewStatus, setViewStatus] = useState<PlanStatus>('ALL');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [spreadsheetFile, setSpreadsheetFile] = useState<File | null>(null);
  const [importCompletion, setImportCompletion] = useState<ImportCompletionReport | null>(null);

  // 수정 팝업 상태
  const [editingPlan, setEditingPlan] = useState<PlanResponse | null>(null);
  const [editForm, setEditForm] = useState({ planName: '', planStartDate: '', planEndDate: '', planMemo: '' });

  // 1. 목록 불러오기 (페이징 적용)
  const fetchPlans = useCallback(async (searchParams?: SearchParams, pageNum: number = 0) => {
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
        months: paramsToUse.selectedMonths
      };

      const data = await getPlans(apiParams);

      // ✅ PageResponse 데이터 매핑
      setPlans(data.content);
      setTotalPages(data.totalPages);
      setTotalElements(data.totalElements);
      setPage(data.number);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 초기 로드
  useEffect(() => { void fetchPlans(); }, [fetchPlans]);

  // ✅ 페이지 변경 핸들러
  const handlePageChange = (newPage: number) => {
    fetchPlans(undefined, newPage); // 기존 검색 조건 유지하며 페이지 이동
  };

  // 2. 삭제
  const handleDelete = async (id: number) => {
    if (!confirm("정말 이 여행 계획을 삭제하시겠습니까?")) return;
    try {
      await deletePlan(id);
      // 삭제 후 목록 새로고침 (현재 페이지 유지)
      fetchPlans(undefined, page);
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

  // 4. 저장
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    if (!editForm.planName.trim()) return alert("여행 이름을 입력해주세요.");

    const info = getDurationInfo(editForm.planStartDate, editForm.planEndDate);
    if (!info.valid) return alert(info.msg);

    try {
      // PlanHeader와 동일 로직: planDays 포함하여 전송
      await updatePlan(editingPlan.id, {
        ...editForm,
        planDays: info.days
      });

      setEditingPlan(null);
      alert("수정되었습니다.");
      fetchPlans(undefined, page); // 목록 갱신
    } catch { alert("수정 실패"); }
  };

  // 5. 프론트엔드 필터링 (상태별 보기)
  // 주의: 서버 페이징을 사용할 경우, 이 필터링은 '현재 페이지에 로드된 데이터'에만 적용됩니다.
  // 완벽한 필터링을 위해서는 'status'도 API 파라미터로 보내야 하지만, 일단 기존 로직을 유지합니다.
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

  const durationInfo = getDurationInfo(editForm.planStartDate, editForm.planEndDate);

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
      alert(error instanceof Error ? error.message : "계획을 불러오지 못했습니다.");
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
            <p className="text-gray-500 mt-1 md:mt-2 text-sm">총 <span className="text-blue-600 font-bold">{totalElements}</span>개의 여행</p>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept=".json,.xlsx,.xls,.csv,application/json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={handleImportFile}
            />
            <button
              type="button"
              disabled={importing}
              onClick={() => importInputRef.current?.click()}
              className="border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold py-2.5 px-3 md:px-4 rounded-xl shadow-sm transition text-sm shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {importing ? '불러오는 중...' : '📂 불러오기'}
            </button>
            <Link to="/plans/create" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 md:px-5 rounded-xl shadow transition text-sm flex items-center gap-2 shrink-0 h-10 md:h-auto">
              <span>+</span> 새 여행
            </Link>
          </div>
        </div>

        {/* 필터 */}
        <div className="mb-6">
          <PlanFilter
              status={viewStatus}
              onStatusChange={setViewStatus}
              onSearch={(params) => fetchPlans(params, 0)} // 검색 시 0페이지부터
          />
        </div>

        {loading ? <div className="text-center p-20 text-gray-400">로딩 중...</div> :
            <>
              {/* 리스트 */}
              <PlanList plans={visiblePlans} onDelete={handleDelete} onEdit={handleEditClick} />

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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-3xl w-full max-w-2xl p-8 md:p-10 shadow-2xl animate-fade-in-down transform transition-all scale-100">

                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl font-extrabold text-gray-900">✏️ 여행 정보 수정</h3>
                  <button onClick={() => setEditingPlan(null)} className="text-gray-400 hover:text-gray-600 text-2xl transition">✕</button>
                </div>

                <form onSubmit={handleEditSubmit} className="space-y-6">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
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
      </div>
  );
}
