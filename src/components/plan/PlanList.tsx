import { useNavigate } from 'react-router-dom';
import type { PlanResponse } from '../../types/plan';
import { getDurationInfo } from '../../utils/timeUtils'; // ✅ 유틸 재사용

interface Props {
    plans: PlanResponse[];
    onDelete: (id: number) => void;
    onEdit: (plan: PlanResponse) => void; // ✅ 수정 핸들러 받기
}

const getPlanStatus = (startDate: string, endDate: string) => {
    // 로컬 시간 기준 오늘 날짜
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (startDate > today) return { label: 'UPCOMING', color: 'blue' };
    if (endDate < today) return { label: 'DONE', color: 'gray' };
    return { label: 'NOW ✈️', color: 'orange' };
};

export default function PlanList({ plans, onDelete, onEdit }: Props) {
    const navigate = useNavigate();

    if (!plans || plans.length === 0) {
        return (
            <div className="text-center py-20 bg-white rounded-xl border-2 border-dashed border-gray-200">
                <p className="text-gray-400">등록된 여행 계획이 없습니다.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {plans.map((plan) => {
                const { label, color } = getPlanStatus(plan.planStartDate, plan.planEndDate);
                // 유틸 함수로 기간 텍스트 생성 (예: 3박 4일)
                const duration = getDurationInfo(plan.planStartDate, plan.planEndDate);
                const durationText = duration.valid ? `${duration.nights}박 ${duration.days}일` : "날짜 오류";

                const colorClasses = {
                    blue: { bar: 'bg-blue-500', badge: 'bg-blue-100 text-blue-600', text: 'group-hover:text-blue-600 text-gray-900' },
                    orange: { bar: 'bg-orange-500', badge: 'bg-orange-100 text-orange-600', text: 'group-hover:text-orange-600 text-gray-900' },
                    gray: { bar: 'bg-gray-300', badge: 'bg-gray-100 text-gray-500', text: 'text-gray-500' },
                };
                // @ts-ignore
                const styles = colorClasses[color] || colorClasses.blue;

                return (
                    <div
                        key={plan.id}
                        onClick={() => navigate(`/plans/${plan.id}`)}
                        className={`
                            relative flex flex-col md:flex-row md:items-center justify-between
                            bg-white p-4 md:px-6 md:py-5 rounded-xl border border-gray-100 shadow-sm
                            transition-all duration-200 cursor-pointer group
                            hover:shadow-md hover:border-gray-300 hover:bg-gray-50/50 hover:-translate-y-0.5
                            overflow-hidden
                        `}
                    >
                        {/* 컬러 바 */}
                        <div className={`absolute left-0 top-0 bottom-0 w-[6px] ${styles.bar}`}></div>

                        {/* 정보 영역 */}
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6 flex-1 min-w-0 pl-3">
                            <div className="shrink-0">
                                <span className={`inline-block px-3 py-1 text-xs font-extrabold rounded-lg tracking-wide ${styles.badge}`}>
                                    {label}
                                </span>
                            </div>

                            <div className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-4 flex-1 min-w-0">
                                <h3 className={`text-lg font-bold truncate transition-colors ${styles.text}`}>
                                    {plan.planName}
                                </h3>
                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                    <span className="font-mono">{plan.planStartDate} ~ {plan.planEndDate}</span>
                                    <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                    <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 font-medium">
                                        {durationText}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* ✅ [버튼 그룹] 수정(✏️) / 삭제(🗑️) */}
                        <div className="flex items-center justify-end mt-3 md:mt-0 pl-3 gap-1">
                            {/* 수정 버튼 */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation(); // 상세페이지 이동 방지
                                    onEdit(plan);        // 팝업 열기
                                }}
                                className="text-gray-400 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-colors"
                                title="수정"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.69 1.04l-3.296 1.042a.75.75 0 01-.977-.977l1.042-3.296a4.5 4.5 0 011.04-1.69l9.612-9.612z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 7.125L16.862 4.487" />
                                </svg>
                            </button>

                            {/* 삭제 버튼 */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(plan.id);
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
                );
            })}
        </div>
    );
}