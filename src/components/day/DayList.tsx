import { useNavigate } from 'react-router-dom';
import type { PlanDayResponse } from '../../types/planday';

interface Props {
    days: PlanDayResponse[];
    onDelete: (id: number) => void;
}

export default function DayList({ days, onDelete }: Props) {
    const navigate = useNavigate();

    if (days.length === 0) {
        return (
            <div className="text-center py-20 bg-white rounded-xl border-2 border-dashed border-gray-200">
                <p className="text-gray-400">등록된 하루 계획이 없습니다.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {days.map((day) => (
                <div
                    key={day.id}
                    onClick={() => navigate(`/days/${day.id}`)}
                    className="
            relative flex items-center justify-between
            bg-white p-5 rounded-xl border border-gray-100 shadow-sm
            transition-all duration-200 cursor-pointer group
            hover:shadow-md hover:border-orange-300 hover:bg-orange-50/30 hover:-translate-y-0.5
            overflow-hidden
          "
                >
                    {/* 🎨 배경 장식 (은은한 지도 아이콘) */}
                    <div className="absolute right-16 top-1/2 -translate-y-1/2 text-9xl text-gray-50 opacity-[0.03] pointer-events-none group-hover:opacity-[0.07] transition-opacity">
                        🗺️
                    </div>

                    {/* 🎨 왼쪽 컬러 하이라이트 바 (오렌지) */}
                    <div className="absolute left-0 top-0 bottom-0 w-[6px] bg-orange-400 group-hover:bg-orange-500 transition-colors"></div>

                    {/* 좌측 정보 */}
                    <div className="flex flex-col gap-1.5 flex-1 min-w-0 pl-4 relative z-10">
                        {/* 뱃지 & 제목 */}
                        <div className="flex items-center gap-2">
               <span className="inline-block px-2 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-700 rounded border border-orange-200">
                DAY PLAN
              </span>
                            <h3 className="text-lg md:text-xl font-bold text-gray-900 truncate group-hover:text-orange-600 transition-colors">
                                {day.dayName}
                            </h3>
                        </div>

                        {/* 📝 [핵심] 메모 표시 영역 (휑함 해결!) */}
                        {day.memo ? (
                            <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed pr-4">
                                {day.memo}
                            </p>
                        ) : (
                            <p className="text-xs text-gray-400 flex items-center gap-1">
                                <span>📝 메모가 없습니다. 클릭해서 내용을 추가해보세요.</span>
                            </p>
                        )}
                    </div>

                    {/* 우측 액션 영역 */}
                    <div className="flex items-center gap-3 pl-4 relative z-10">
                        {/* 편집하러 가기 화살표 */}
                        <div className="hidden md:flex items-center justify-center w-8 h-8 rounded-full bg-gray-50 text-gray-300 group-hover:bg-orange-100 group-hover:text-orange-500 transition">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                        </div>

                        {/* 삭제 버튼 */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(day.id);
                            }}
                            className="text-gray-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"
                            title="삭제"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}