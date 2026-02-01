import { useEffect, useState } from "react";
import { createIndependentDay, deleteDay, getIndependentDays } from "../api/dayApi";
import type { PlanDayResponse } from "../types/planday";

// ✅ 분리한 컴포넌트 import
import DayList from "../components/day/DayList";

export default function DayListPage() {
    const [days, setDays] = useState<PlanDayResponse[]>([]);
    const [loading, setLoading] = useState(true);

    // 🔍 검색 및 생성 상태
    const [keyword, setKeyword] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [newDayName, setNewDayName] = useState('');

    // 1. 목록 불러오기
    const fetchDays = async () => {
        try {
            setLoading(true);
            const data = await getIndependentDays();
            setDays(data.sort((a, b) => b.id - a.id));
        } catch (err) {
            console.error("계획 목록 로드 실패:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchDays(); }, []);

    // 2. 검색 필터링
    const filteredDays = days.filter(day =>
        day.dayName.toLowerCase().includes(keyword.toLowerCase())
    );

    // 3. 삭제 핸들러
    const handleDelete = async (id: number) => {
        if (!window.confirm("정말 이 하루 계획을 삭제하시겠습니까?")) return;
        try {
            await deleteDay(id);
            setDays(prev => prev.filter(day => day.id !== id));
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
            await createIndependentDay({ dayName: newDayName });
            setNewDayName('');
            setIsCreating(false);
            fetchDays();
            alert('새로운 하루 계획이 생성되었습니다!');
        } catch {
            alert('생성 실패');
        }
    };

    return (
        <div className="max-w-5xl mx-auto p-4 md:p-6 pb-20">
            {/* 헤더 & 검색 영역 */}
            <div className="flex flex-col md:flex-row justify-between items-end mb-6 gap-4">
                <div className="w-full md:w-auto">
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2 mb-2">
                        나의 계획 📅
                    </h1>
                    <p className="text-gray-500 text-sm">
                        총 <span className="text-orange-500 font-bold">{filteredDays.length}</span>개의 하루 일정이 있습니다.
                    </p>
                </div>

                <div className="flex gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <input
                            type="text"
                            placeholder="일정 제목 검색..."
                            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-400 bg-white transition"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                        />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                    </div>
                    <button
                        onClick={() => setIsCreating(!isCreating)}
                        className="bg-gray-900 hover:bg-gray-800 text-white font-bold py-2.5 px-5 rounded-xl shadow-lg transition whitespace-nowrap text-sm"
                    >
                        {isCreating ? '닫기' : '+ 새 일정'}
                    </button>
                </div>
            </div>

            {/* ✨ 새 일정 만들기 폼 */}
            {isCreating && (
                <div className="mb-6 bg-orange-50 p-6 rounded-2xl border border-orange-100 animate-fade-in-down shadow-inner">
                    <h3 className="font-bold text-orange-800 mb-3 flex items-center gap-2">
                        <span>✨</span> 새로운 하루 계획 만들기
                    </h3>
                    <form onSubmit={handleCreate} className="flex gap-3">
                        <input
                            type="text"
                            placeholder="예) 오사카 맛집 탐방 (1일차 후보)"
                            value={newDayName}
                            onChange={(e) => setNewDayName(e.target.value)}
                            className="flex-1 px-4 py-3 border border-orange-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-400 bg-white transition"
                            autoFocus
                        />
                        <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3 rounded-xl transition shadow-md shadow-orange-200">
                            생성
                        </button>
                    </form>
                </div>
            )}

            {/* 📋 리스트 렌더링 (분리된 컴포넌트 사용) */}
            {loading ? (
                <div className="text-center p-20 text-gray-400 animate-pulse">로딩 중... ⏳</div>
            ) : (
                <DayList days={filteredDays} onDelete={handleDelete} />
            )}
        </div>
    );
}