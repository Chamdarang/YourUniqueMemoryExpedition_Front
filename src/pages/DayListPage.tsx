import { useCallback, useEffect, useRef, useState } from "react";
import { createIndependentDay, deleteDay, getIndependentDays } from "../api/dayApi";
import type { PlanDayResponse, ScheduleMode } from "../types/planDay.ts";

// Components
import DayList from "../components/day/DayList";
import Pagination from "../components/common/Pagination";
import { useFeedback } from '../components/common/useFeedback';
import LoadErrorState from '../components/common/LoadErrorState';

export default function DayListPage() {
    const { confirm, runUndoable, showToast } = useFeedback();
    const fetchGeneration = useRef(0);
    const [days, setDays] = useState<PlanDayResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    // ✅ 페이징 상태
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [totalElements, setTotalElements] = useState(0);

    // 🔍 검색 및 생성 상태
    const [keyword, setKeyword] = useState(''); // 입력창 값
    const [searchKeyword, setSearchKeyword] = useState(''); // 실제 검색에 사용된 키워드
    const [isCreating, setIsCreating] = useState(false);
    const [newDayName, setNewDayName] = useState('');
    const [newDayMode, setNewDayMode] = useState<ScheduleMode>('SIMPLE');

    // 1. 목록 불러오기
    const fetchDays = useCallback(async (pageNum = 0, currentSearchKeyword = '') => {
        const generation = ++fetchGeneration.current;
        try {
            setLoading(true);

            const data = await getIndependentDays({
                page: pageNum,
                size: 9,
                keyword: currentSearchKeyword
            });

            if (generation !== fetchGeneration.current) return;
            setDays(data.content);
            setTotalPages(data.totalPages);
            setTotalElements(data.totalElements);
            setPage(data.number);
            setLoadError(null);

        } catch (err) {
            if (generation !== fetchGeneration.current) return;
            console.error("계획 목록 로드 실패:", err);
            setLoadError('하루 일정 목록을 불러오지 못했습니다.');
        } finally {
            if (generation === fetchGeneration.current) setLoading(false);
        }
    }, []);

    useEffect(() => { void fetchDays(); }, [fetchDays]);

    // 2. 검색 핸들러
    const handleSearch = () => {
        setSearchKeyword(keyword.trim());
        setPage(0);
        fetchDays(0, keyword.trim());
    };

    const resetSearch = () => { setKeyword(''); setSearchKeyword(''); void fetchDays(0); };

    // 3. 삭제 핸들러
    const handleDelete = async (id: number) => {
        const target = days.find(day => day.id === id);
        if (!await confirm({ title: '하루 일정 삭제', message: `'${target?.dayName || '하루 일정'}'을 삭제할까요?`, confirmLabel: '삭제', danger: true })) return;
        runUndoable({
            key: `day-delete:${id}`,
            message: `'${target?.dayName || '하루 일정'}'을 6초 후 삭제합니다.`,
            successMessage: '하루 일정을 삭제했습니다.',
            commit: async () => { await deleteDay(id); await fetchDays(page, searchKeyword); },
        });
    };

    // 4. 생성 핸들러
    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newDayName.trim()) return;
        try {
            await createIndependentDay({ dayName: newDayName, scheduleMode: newDayMode });
            setNewDayName('');
            setIsCreating(false);
            setPage(0);
            setSearchKeyword('');
            setKeyword('');
            fetchDays(0, '');
            showToast({ message: '새로운 하루 일정을 만들었습니다.', type: 'success' });
        } catch {
            showToast({ message: '하루 일정을 만들지 못했습니다.', type: 'error' });
        }
    };

    return (
        <div className="max-w-5xl mx-auto p-4 md:p-6 pb-20">

            {/* ✅ [수정] 상단 헤더: 타이틀(좌) <-> 생성 버튼(우) */}
            <div className="flex flex-row justify-between items-end mb-4 gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2 leading-tight">
                        하루 코스 📅
                    </h1>
                    <p className="text-gray-500 mt-1 md:mt-2 text-sm">
                        {loadError ? '목록을 다시 불러와 주세요.' : <>총 <span className="text-orange-500 font-bold">{totalElements}</span>개의 하루 일정이 있습니다.</>}
                    </p>
                </div>

                <button
                    data-guide-target="days-create"
                    data-guide-state={isCreating ? 'open' : 'closed'}
                    onClick={() => setIsCreating(!isCreating)}
                    className={`yume-button shrink-0 whitespace-nowrap ${isCreating ? 'yume-button-secondary' : 'yume-button-primary'}`}
                >
                    {isCreating ? '닫기' : '+ 새 일정'}
                </button>
            </div>

            {/* ✅ [수정] 검색창을 별도 행으로 분리 */}
            <div className="mb-6">
                <div className="relative w-full">
                    <input
                        type="text"
                        aria-label="하루 코스 제목 검색" placeholder="하루 코스 제목 검색..."
                        className="yume-input yume-input-search"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <button
                        aria-label="하루 코스 검색 실행"
                        onClick={handleSearch}
                        className="yume-icon-button absolute right-1 top-1/2 -translate-y-1/2 text-blue-600"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* ✨ 새 일정 만들기 폼 */}
            {isCreating && (
                <div data-guide-target="days-create-form" className="mb-6 bg-white p-6 rounded-xl border border-gray-100 animate-fade-in-down shadow-lg">
                    <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <span>✨</span> 새로운 하루 코스 만들기
                    </h3>
                    <form onSubmit={handleCreate} className="space-y-3">
                        <p className="text-xs text-gray-600">여행 날짜를 정하기 전 후보 코스를 만들어 두세요. 저장한 코스는 여행 일정에 가져올 수 있어요.</p>
                        <div data-guide-target="days-create-mode" className="yume-segmented grid grid-cols-2">
                            <button type="button" aria-pressed={newDayMode === 'SIMPLE'} onClick={() => setNewDayMode('SIMPLE')} className="yume-segment flex-col text-center">
                                간편 일정
                                <span className="mt-0.5 block text-xs font-medium opacity-75">장소·시간·메모</span>
                            </button>
                            <button type="button" aria-pressed={newDayMode === 'DETAILED'} onClick={() => setNewDayMode('DETAILED')} className="yume-segment flex-col text-center">
                                상세 일정
                                <span className="mt-0.5 block text-xs font-medium opacity-75">체류·이동·교통</span>
                            </button>
                        </div>
                        <label htmlFor="new-day-name" className="block text-sm font-semibold text-gray-700">코스 제목</label>
                        <div className="flex flex-col gap-3 sm:flex-row">
                        <input
                            id="new-day-name"
                            data-guide-target="days-create-name"
                            type="text"
                            placeholder="예) 오사카 맛집 탐방 (1일차 후보)"
                            value={newDayName}
                            onChange={(e) => setNewDayName(e.target.value)}
                            className="yume-input min-w-0 flex-1"
                            autoFocus
                        />
                        <button data-guide-target="days-create-submit" type="submit" className="yume-button yume-button-primary whitespace-nowrap">
                            생성
                        </button>
                        </div>
                    </form>
                </div>
            )}

            {/* 📋 리스트 렌더링 */}
            {loadError && <LoadErrorState message={loadError} retrying={loading} onRetry={() => void fetchDays(page, searchKeyword)} />}
            {loading && !days.length && !loadError ? (
                <div className="text-center p-20 text-gray-400 animate-pulse">로딩 중... ⏳</div>
            ) : (
                <>
                    <div data-guide-target="days-list">
                        {(!loadError || days.length > 0) && <DayList days={days} onDelete={handleDelete} searchKeyword={searchKeyword} onResetSearch={resetSearch} />}
                    </div>

                    <Pagination
                        currentPage={page}
                        totalPages={totalPages}
                        onPageChange={(p) => fetchDays(p, searchKeyword)}
                    />
                </>
            )}
        </div>
    );
}
