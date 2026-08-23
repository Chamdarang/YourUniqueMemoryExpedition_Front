import { useCallback, useEffect, useState } from "react";
import { createIndependentDay, deleteDay, getIndependentDays } from "../api/dayApi";
import type { PlanDayResponse, ScheduleMode } from "../types/planDay.ts";

// Components
import DayList from "../components/day/DayList";
import Pagination from "../components/common/Pagination";

export default function DayListPage() {
    const [days, setDays] = useState<PlanDayResponse[]>([]);
    const [loading, setLoading] = useState(true);

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
        try {
            setLoading(true);

            const data = await getIndependentDays({
                page: pageNum,
                size: 9,
                keyword: currentSearchKeyword
            });

            setDays(data.content);
            setTotalPages(data.totalPages);
            setTotalElements(data.totalElements);
            setPage(data.number);

        } catch (err) {
            console.error("계획 목록 로드 실패:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void fetchDays(); }, [fetchDays]);

    // 2. 검색 핸들러
    const handleSearch = () => {
        setSearchKeyword(keyword);
        setPage(0);
        fetchDays(0, keyword);
    };

    // 3. 삭제 핸들러
    const handleDelete = async (id: number) => {
        if (!window.confirm("정말 이 하루 계획을 삭제하시겠습니까?")) return;
        try {
            await deleteDay(id);
            fetchDays(page, searchKeyword);
            alert("삭제되었습니다.");
        } catch {
            alert("삭제 실패");
        }
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
            alert('새로운 하루 계획이 생성되었습니다!');
        } catch {
            alert('생성 실패');
        }
    };

    return (
        <div className="max-w-5xl mx-auto p-4 md:p-6 pb-20">

            {/* ✅ [수정] 상단 헤더: 타이틀(좌) <-> 생성 버튼(우) */}
            <div className="flex flex-row justify-between items-end mb-4 gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2 leading-tight">
                        나의 계획 📅
                    </h1>
                    <p className="text-gray-500 mt-1 md:mt-2 text-sm">
                        총 <span className="text-orange-500 font-bold">{totalElements}</span>개의 하루 일정이 있습니다.
                    </p>
                </div>

                <button
                    onClick={() => setIsCreating(!isCreating)}
                    className="bg-gray-900 hover:bg-gray-800 text-white font-bold py-2.5 px-5 rounded-xl shadow-lg transition whitespace-nowrap text-sm shrink-0 h-10 md:h-auto flex items-center"
                >
                    {isCreating ? '닫기' : '+ 새 일정'}
                </button>
            </div>

            {/* ✅ [수정] 검색창을 별도 행으로 분리 */}
            <div className="mb-6">
                <div className="relative w-full">
                    <input
                        type="text"
                        placeholder="일정 제목 검색..."
                        className="w-full pl-4 pr-12 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-400 bg-white transition shadow-sm"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <button
                        onClick={handleSearch}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-orange-500 transition rounded-lg hover:bg-orange-50"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* ✨ 새 일정 만들기 폼 */}
            {isCreating && (
                <div className="mb-6 bg-orange-50 p-6 rounded-2xl border border-orange-100 animate-fade-in-down shadow-inner">
                    <h3 className="font-bold text-orange-800 mb-3 flex items-center gap-2">
                        <span>✨</span> 새로운 하루 계획 만들기
                    </h3>
                    <form onSubmit={handleCreate} className="space-y-3">
                        <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-1.5 shadow-sm">
                            <button type="button" onClick={() => setNewDayMode('SIMPLE')} className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${newDayMode === 'SIMPLE' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}>
                                간편 일정
                                <span className="mt-0.5 block text-[10px] font-medium opacity-75">장소 · 시간 · 메모만</span>
                            </button>
                            <button type="button" onClick={() => setNewDayMode('DETAILED')} className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${newDayMode === 'DETAILED' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}>
                                상세 일정
                                <span className="mt-0.5 block text-[10px] font-medium opacity-75">체류 · 이동 · 교통수단 포함</span>
                            </button>
                        </div>
                        <div className="flex gap-3">
                        <input
                            type="text"
                            placeholder="예) 오사카 맛집 탐방 (1일차 후보)"
                            value={newDayName}
                            onChange={(e) => setNewDayName(e.target.value)}
                            className="flex-1 px-4 py-3 border border-orange-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-400 bg-white transition"
                            autoFocus
                        />
                        <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3 rounded-xl transition shadow-md shadow-orange-200 whitespace-nowrap">
                            생성
                        </button>
                        </div>
                    </form>
                </div>
            )}

            {/* 📋 리스트 렌더링 */}
            {loading ? (
                <div className="text-center p-20 text-gray-400 animate-pulse">로딩 중... ⏳</div>
            ) : (
                <>
                    <DayList days={days} onDelete={handleDelete} />

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
