import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

// API
import { getPlans, deletePlan, importPlanData, previewPlanSpreadsheet, updatePlan, type GetPlansParams } from '../api/planApi';

// Types & Utils
import type { PlanResponse, PlanTransferData } from '../types/plan';
import { getDurationInfo } from '../utils/timeUtils';

// Components
import PlanList from '../components/plan/PlanList';
import PlanFilter, { type PlanStatus, type SearchParams } from '../components/plan/PlanFilter';
import Pagination from '../components/common/Pagination'; // ✅ 페이지네이션 컴포넌트

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
  const [spreadsheetName, setSpreadsheetName] = useState('');
  const [spreadsheetStartDate, setSpreadsheetStartDate] = useState('');
  const [spreadsheetPreview, setSpreadsheetPreview] = useState<PlanTransferData | null>(null);

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

    if (/\.(xlsx|xls)$/i.test(file.name)) {
      setSpreadsheetFile(file);
      setSpreadsheetName(file.name.replace(/\.(xlsx|xls)$/i, ''));
      setSpreadsheetStartDate('');
      setSpreadsheetPreview(null);
      return;
    }

    setImporting(true);
    try {
      const parsed = JSON.parse(await file.text()) as PlanTransferData;
      if (parsed?.formatVersion !== 1 || !parsed.planName || !Array.isArray(parsed.days)) {
        throw new Error("YUME에서 내보낸 계획 JSON 파일이 아닙니다.");
      }
      const imported = await importPlanData(parsed);
      alert("새 여행 계획으로 불러왔습니다.");
      navigate(`/plans/${imported.id}`);
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
    setSpreadsheetPreview(null);
  };

  const handleSpreadsheetPreview = async () => {
    if (!spreadsheetFile) return;
    if (!spreadsheetName.trim()) return alert("여행 이름을 입력해 주세요.");
    if (!spreadsheetStartDate) return alert("여행 시작일을 입력해 주세요.");

    setImporting(true);
    try {
      const preview = await previewPlanSpreadsheet(
        spreadsheetFile,
        spreadsheetName.trim(),
        spreadsheetStartDate,
      );
      setSpreadsheetPreview(preview);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "엑셀을 분석하지 못했습니다.");
    } finally {
      setImporting(false);
    }
  };

  const handleSpreadsheetImport = async () => {
    if (!spreadsheetPreview) return;
    setImporting(true);
    try {
      const imported = await importPlanData(spreadsheetPreview);
      alert("엑셀 계획을 새 여행으로 불러왔습니다.");
      navigate(`/plans/${imported.id}`);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "계획을 불러오지 못했습니다.");
    } finally {
      setImporting(false);
    }
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
              accept=".json,.xlsx,.xls,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 md:p-8 shadow-2xl">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-extrabold text-gray-900">📊 Excel 계획 불러오기</h3>
                  <p className="mt-1 text-xs text-gray-500">{spreadsheetFile.name}</p>
                </div>
                <button
                  type="button"
                  disabled={importing}
                  onClick={closeSpreadsheetImport}
                  className="text-xl text-gray-400 hover:text-gray-600 disabled:opacity-50"
                >
                  ✕
                </button>
              </div>

              {!spreadsheetPreview ? (
                <div className="space-y-5">
                  <div>
                    <label className="mb-1.5 block text-sm font-bold text-gray-700">여행 이름</label>
                    <input
                      value={spreadsheetName}
                      onChange={event => setSpreadsheetName(event.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      maxLength={200}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-bold text-gray-700">여행 시작일</label>
                    <input
                      type="date"
                      value={spreadsheetStartDate}
                      onChange={event => setSpreadsheetStartDate(event.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                    <p className="mt-2 text-xs leading-relaxed text-gray-400">
                      엑셀의 일자 열에 연도와 월이 없을 수 있어 첫날 날짜를 기준으로 일차별 날짜를 계산합니다.
                    </p>
                  </div>
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-relaxed text-blue-700">
                    `일자 / 목적 / 시작시간 / 소요시간 / 종료시간 / 비고` 열을 찾아 일정으로 변환합니다.
                    이동 행은 목적지와 이동수단을 추출하고, 바로 다음 활동 행과 자동으로 묶습니다.
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      disabled={importing}
                      onClick={closeSpreadsheetImport}
                      className="flex-1 rounded-xl bg-gray-100 py-3 font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      disabled={importing}
                      onClick={handleSpreadsheetPreview}
                      className="flex-[2] rounded-xl bg-blue-600 py-3 font-bold text-white shadow hover:bg-blue-700 disabled:opacity-50"
                    >
                      {importing ? '분석 중...' : '미리보기 만들기'}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-5 grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-blue-50 p-3 text-center">
                      <div className="text-lg font-black text-blue-700">{spreadsheetPreview.planDays}</div>
                      <div className="text-[11px] font-bold text-blue-400">일차</div>
                    </div>
                    <div className="rounded-xl bg-blue-50 p-3 text-center">
                      <div className="text-lg font-black text-blue-700">
                        {spreadsheetPreview.days.reduce((sum, day) => sum + day.schedules.length, 0)}
                      </div>
                      <div className="text-[11px] font-bold text-blue-400">일정</div>
                    </div>
                    <div className="rounded-xl bg-blue-50 p-3 text-center">
                      <div className="truncate text-sm font-black text-blue-700">{spreadsheetPreview.planStartDate}</div>
                      <div className="text-[11px] font-bold text-blue-400">시작일</div>
                    </div>
                  </div>

                  <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
                    {spreadsheetPreview.days.map(day => (
                      <div key={day.dayOrder} className="rounded-xl border border-gray-200 p-4">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <h4 className="font-extrabold text-gray-800">{day.dayName}</h4>
                          <span className="shrink-0 text-xs font-bold text-blue-600">{day.schedules.length}개 일정</span>
                        </div>
                        <p className="text-xs leading-relaxed text-gray-500">
                          {day.schedules.slice(0, 5).map(schedule => schedule.spotName).filter(Boolean).join(' → ')}
                          {day.schedules.length > 5 ? ' → …' : ''}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 flex gap-3">
                    <button
                      type="button"
                      disabled={importing}
                      onClick={() => setSpreadsheetPreview(null)}
                      className="flex-1 rounded-xl bg-gray-100 py-3 font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                    >
                      다시 설정
                    </button>
                    <button
                      type="button"
                      disabled={importing}
                      onClick={handleSpreadsheetImport}
                      className="flex-[2] rounded-xl bg-blue-600 py-3 font-bold text-white shadow hover:bg-blue-700 disabled:opacity-50"
                    >
                      {importing ? '등록 중...' : '새 계획으로 등록'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
  );
}
