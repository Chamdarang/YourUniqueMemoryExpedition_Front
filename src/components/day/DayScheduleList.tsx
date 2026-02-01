import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import ScheduleItem from "../schedule/ScheduleItem";
import type { DayScheduleResponse, ScheduleItemRequest } from "../../types/schedule";
import type { SpotType } from "../../types/enums";

interface Props {
    schedules: DayScheduleResponse[];
    selectedScheduleId?: number | null;
    showInjury: boolean;
    onSelect?: (id: number) => void;
    // ✅ 타입 정의를 ScheduleItem과 맞춤
    onUpdate: (id: number, data: Partial<ScheduleItemRequest> & { spotName?: string, spotType?: SpotType, lat?: number, lng?: number, isVisit?: boolean }) => void;
    onDelete: (id: number) => void;
    onInsert: (index: number) => void;

    // ✅ [신규] 스타일 모드 (page: 전체화면용, card: 아코디언 내부용)
    variant?: 'page' | 'card';

    // ✅ [신규] 지도 픽 관련 (PlanDayItem에서도 씀)
    pickingTarget?: { dayId: number, scheduleId: number } | null;
    setPickingTarget?: (target: { dayId: number, scheduleId: number } | null) => void;
    dayId?: number; // card 모드에서 pickingTarget 비교를 위해 필요
}

export default function DayScheduleList({
                                            schedules,
                                            selectedScheduleId,
                                            showInjury,
                                            onSelect,
                                            onUpdate,
                                            onDelete,
                                            onInsert,
                                            variant = 'page', // 기본값은 페이지 모드
                                            pickingTarget,
                                            setPickingTarget,
                                            dayId
                                        }: Props) {

    // 스타일 분기 처리
    const containerClass = variant === 'page'
        ? "flex-1 overflow-y-auto p-4 pb-24 bg-white scrollbar-hide" // 페이지용 (스크롤 O)
        : "space-y-4"; // 카드용 (스크롤 X, 그냥 나열)

    return (
        <div className={containerClass}>
            <SortableContext items={schedules.map(s => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-4">

                    {/* 일정 없음 안내 */}
                    {schedules.length === 0 && (
                        <div
                            className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 hover:text-blue-500 hover:border-blue-300 transition"
                            onClick={() => onInsert(0)}
                        >
                            <div className="text-3xl mb-2 grayscale opacity-50">🗺️</div>
                            <p className="font-bold text-sm">+ 첫 일정 추가하기</p>
                        </div>
                    )}

                    {/* 일정 리스트 */}
                    {schedules.map((schedule, index) => (
                        <div
                            key={schedule.id}
                            className={`transition-all duration-200 ${
                                selectedScheduleId === schedule.id
                                    ? 'ring-2 ring-blue-500 ring-offset-2 rounded-xl bg-blue-50/50'
                                    : ''
                            }`}
                            onClick={() => onSelect && onSelect(schedule.id)}
                        >
                            <ScheduleItem
                                schedule={schedule}
                                index={index}
                                isLast={index === schedules.length - 1}
                                showInjury={showInjury}
                                onUpdate={onUpdate}
                                onDelete={() => onDelete(schedule.id)}
                                onInsert={onInsert}
                                // 지도 픽 로직 연결
                                onRequestMapPick={() => {
                                    if (setPickingTarget && dayId) {
                                        if (pickingTarget?.scheduleId === schedule.id) setPickingTarget(null);
                                        else setPickingTarget({ dayId, scheduleId: schedule.id });
                                    }
                                }}
                                isPickingMap={pickingTarget?.scheduleId === schedule.id}
                            />
                        </div>
                    ))}

                    {/* 하단 추가 버튼 */}
                    {schedules.length > 0 && (
                        <button
                            onClick={() => onInsert(schedules.length)}
                            className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 font-bold hover:border-orange-400 hover:text-orange-500 hover:bg-orange-50 transition text-sm"
                        >
                            + 맨 아래에 장소 추가
                        </button>
                    )}
                </div>
            </SortableContext>
        </div>
    );
}