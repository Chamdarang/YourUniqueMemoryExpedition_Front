import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import ScheduleItem from "../schedule/ScheduleItem";
import type { DayScheduleResponse, ScheduleUpdateRequest } from "../../types/schedule";

interface Props {
    schedules: DayScheduleResponse[];
    selectedScheduleId?: number | null;
    showInjury: boolean;
    onSelect?: (id: number) => void;
    onUpdate: (id: number, req: ScheduleUpdateRequest) => void;
    onToggleVisit: (id: number) => void;
    onDelete: (id: number) => void;
    onInsert: (index: number) => void;
    variant?: 'page' | 'card';
    pickingTarget?: { dayId: number, scheduleId: number } | null;
    setPickingTarget?: (target: { dayId: number, scheduleId: number } | null) => void;
    dayId?: number;
}

export default function DayScheduleList({
                                            schedules = [], // ✅ 기본값 빈 배열 설정으로 null 방지
                                            selectedScheduleId,
                                            showInjury,
                                            onSelect,
                                            onUpdate,
                                            onToggleVisit,
                                            onDelete,
                                            onInsert,
                                            variant = 'page',
                                            pickingTarget,
                                            setPickingTarget,
                                            dayId
                                        }: Props) {

    const containerClass = variant === 'page'
        ? "flex-1 overflow-y-auto p-4 pb-24 bg-white scrollbar-hide"
        : "space-y-4";

    // ✅ schedules 내부에 null이나 undefined가 섞이지 않도록 필터링하여 items 생성
    const validScheduleIds = (schedules || [])
        .filter(s => s && s.id !== undefined && s.id !== null)
        .map(s => s.id);

    return (
        <div className={containerClass}>
            {/* ✅ 필터링된 ID 배열을 사용하여 'in' operator 에러 방지 */}
            <SortableContext items={validScheduleIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-4">
                    {(!schedules || schedules.length === 0) && (
                        <div
                            className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 hover:text-blue-500 hover:border-blue-300 transition"
                            onClick={() => onInsert(0)}
                        >
                            <div className="text-3xl mb-2 grayscale opacity-50">🗺️</div>
                            <p className="font-bold text-sm">+ 첫 일정 추가하기</p>
                        </div>
                    )}

                    {(schedules || []).map((schedule, index) => {
                        // ✅ 각 항목 렌더링 시에도 유효성 검사 추가
                        if (!schedule || !schedule.id) return null;

                        return (
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
                                    isLast={index === (schedules?.length || 0) - 1}
                                    showInjury={showInjury}
                                    onUpdate={onUpdate}
                                    onDelete={onDelete}
                                    onInsert={onInsert}
                                    onToggleVisit={onToggleVisit}
                                    onRequestMapPick={() => {
                                        if (setPickingTarget && dayId) {
                                            if (pickingTarget?.scheduleId === schedule.id) setPickingTarget(null);
                                            else setPickingTarget({ dayId, scheduleId: schedule.id });
                                        }
                                    }}
                                    isPickingMap={pickingTarget?.scheduleId === schedule.id}
                                />
                            </div>
                        );
                    })}

                    {schedules && schedules.length > 0 && (
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