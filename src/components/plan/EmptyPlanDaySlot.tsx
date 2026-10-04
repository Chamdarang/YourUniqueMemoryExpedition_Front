import { useState } from 'react';
import { getIndependentDays } from '../../api/dayApi';
import type { PlanDayResponse, ScheduleMode } from '../../types/planDay';
import { useFeedback } from '../common/useFeedback';

interface EmptyPlanDaySlotProps {
    dayOrder: number;
    onCreateNew: (scheduleMode: ScheduleMode) => void;
    onImportSelect: (id: number) => void;
}

export default function EmptyPlanDaySlot({ dayOrder, onCreateNew, onImportSelect }: EmptyPlanDaySlotProps) {
    const { showToast } = useFeedback();
    const [isExpanded, setIsExpanded] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [candidates, setCandidates] = useState<PlanDayResponse[]>([]);
    const [loading, setLoading] = useState(false);

    const loadCandidates = async () => {
        setShowImport(true);
        setLoading(true);
        try {
            setCandidates((await getIndependentDays()).content);
        } catch {
            showToast({ message: '하루 일정 목록을 불러오지 못했습니다.', type: 'error' });
            setShowImport(false);
        } finally {
            setLoading(false);
        }
    };

    if (!isExpanded) {
        return (
            <button type="button" data-plan-day-order={dayOrder} onClick={() => setIsExpanded(true)} className="mb-3 flex w-full scroll-mt-24 items-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-4 text-left font-bold text-gray-400 transition hover:border-blue-400 hover:bg-white hover:text-blue-600">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-200 text-lg">+</span>
                Day {dayOrder} 일정 추가하기
            </button>
        );
    }

    return (
        <div data-plan-day-order={dayOrder} className="mb-4 scroll-mt-24 rounded-2xl border-2 border-blue-100 bg-blue-50/60 p-4">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="font-bold text-blue-900">Day {dayOrder} 일정 방식 선택</h3>
                <button type="button" onClick={() => { setIsExpanded(false); setShowImport(false); }} className="text-xs font-bold text-gray-400">닫기</button>
            </div>
            {!showImport ? (
                <div className="grid gap-2 sm:grid-cols-3">
                    <button type="button" onClick={() => onCreateNew('SIMPLE')} className="rounded-xl border border-blue-200 bg-white px-3 py-3 font-bold text-blue-700 shadow-sm hover:bg-blue-50">간편 일정<span className="mt-1 block text-[10px] font-medium text-gray-400">장소 · 시간 · 메모</span></button>
                    <button type="button" onClick={() => onCreateNew('DETAILED')} className="rounded-xl border border-orange-200 bg-white px-3 py-3 font-bold text-orange-600 shadow-sm hover:bg-orange-50">상세 일정<span className="mt-1 block text-[10px] font-medium text-gray-400">체류 · 이동 · 교통수단</span></button>
                    <button type="button" onClick={loadCandidates} className="rounded-xl border border-gray-200 bg-white px-3 py-3 font-bold text-gray-600 shadow-sm hover:bg-gray-50">기존 일정 가져오기</button>
                </div>
            ) : (
                <div className="overflow-hidden rounded-xl border border-blue-100 bg-white">
                    <div className="flex items-center justify-between border-b border-blue-50 bg-blue-50/40 px-3 py-2">
                        <button type="button" onClick={() => setShowImport(false)} className="text-xs font-bold text-blue-600 hover:text-blue-800">
                            ← 일정 방식 선택
                        </button>
                        {!loading && candidates.length > 0 && (
                            <span className="text-[10px] font-bold text-gray-400">{candidates.length}개</span>
                        )}
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                        {loading ? (
                            <p className="p-6 text-center text-sm text-gray-400">불러오는 중...</p>
                        ) : candidates.length === 0 ? (
                            <div className="px-4 py-8 text-center">
                                <p className="text-sm font-bold text-gray-500">가져올 수 있는 하루 일정이 없습니다.</p>
                                <p className="mt-1 text-xs text-gray-400">내 하루 일정에서 먼저 일정을 만들어 주세요.</p>
                            </div>
                        ) : candidates.map(day => (
                            <button type="button" key={day.id} onClick={() => onImportSelect(day.id)} className="flex w-full items-center justify-between border-b border-gray-50 p-3 text-left last:border-0 hover:bg-blue-50">
                                <span className="font-bold text-gray-700">{day.dayName}</span>
                                <span className="rounded bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-500">{day.scheduleMode === 'SIMPLE' ? '간편' : '상세'}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
