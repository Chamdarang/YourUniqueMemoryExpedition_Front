import { Link } from 'react-router-dom';
import type { PlanDayResponse } from '../../types/planDay.ts';
import { useFeedback } from '../common/useFeedback';

interface Props {
    days: PlanDayResponse[];
    onDelete: (id: number) => void;
    searchKeyword?: string;
    onResetSearch?: () => void;
}

export default function DayList({ days, onDelete, searchKeyword, onResetSearch }: Props) {
    const { isUndoablePending } = useFeedback();

    if (days.length === 0) {
        return (
            <div className="text-center py-20 bg-white rounded-xl border-2 border-dashed border-gray-200">
                <p className="text-gray-600">{searchKeyword ? `“${searchKeyword}”에 맞는 하루 코스가 없습니다.` : '등록된 하루 코스가 없습니다.'}</p>
                {searchKeyword && onResetSearch && <button type="button" onClick={onResetSearch} className="yume-button yume-button-soft mt-4">검색 초기화</button>}
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {days.map((day) => {
                const isDeletePending = isUndoablePending(`day-delete:${day.id}`);
                return (
                <div
                    key={day.id}
                    className={`
            flex items-start md:items-center justify-between gap-4
            bg-white p-4 md:p-5 rounded-2xl border border-gray-200 shadow-sm
            transition-all duration-200 cursor-pointer group
            hover:shadow-md hover:border-blue-300 hover:bg-blue-50/30 hover:-translate-y-0.5
            ${isDeletePending ? 'border-amber-300 bg-amber-50/70 opacity-70' : ''}
          `}
                >
                    {/* 왼쪽 정보 */}
                    <Link to={`/days/${day.id}`} className="rounded-lg focus-visible:outline-2 focus-visible:outline-blue-600 flex min-w-0 flex-1 items-start gap-3 md:items-center md:gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xl text-blue-600 transition-colors group-hover:bg-blue-100">
                            📅
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <h3 className="truncate text-lg font-bold text-gray-900 transition-colors group-hover:text-blue-700 md:text-xl">
                                    {day.dayName}
                                </h3>
                                <span className="shrink-0 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">
                                    {day.scheduleMode === 'DETAILED' ? '상세 일정' : '간편 일정'}
                                </span>
                            </div>
                            {day.memo ? (
                                <p className="line-clamp-2 text-sm leading-relaxed text-gray-600">
                                    {day.memo}
                                </p>
                            ) : (
                                <p className="flex items-center gap-1 text-xs text-gray-400">
                                    <span>📝</span> 메모 없음 · 클릭해서 내용을 추가해보세요.
                                </p>
                            )}
                        </div>
                    </Link>

                    {/* 우측 액션 영역 */}
                    <div className="flex shrink-0 items-center gap-2 md:gap-3">
                        {/* 편집하러 가기 화살표 */}
                        <div className="hidden h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-400 transition group-hover:bg-blue-600 group-hover:text-white md:flex">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                        </div>

                        {/* 삭제 버튼 */}
                        <button
                            disabled={isDeletePending}
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(day.id);
                            }}
                            className="rounded-xl border border-transparent p-2 text-gray-400 transition-colors hover:border-red-100 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:border-amber-100 disabled:bg-amber-100 disabled:text-amber-600"
                            title={isDeletePending ? "삭제 대기 중" : "삭제"}
                        >
                            {isDeletePending ? <span className="whitespace-nowrap text-xs font-bold">삭제 대기 중…</span> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>}
                        </button>
                    </div>
                </div>
                );
            })}
        </div>
    );
}
