import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
// ✅ [수정 완료] 올바른 상대 경로
import ScheduleItem from "../schedule/ScheduleItem";
import type { DayScheduleResponse, ScheduleItemRequest } from "../../types/schedule";
import type { SpotType } from "../../types/enums";

interface Props {
    schedules: DayScheduleResponse[];
    selectedScheduleId?: number | null;
    showInjury: boolean;
    onSelect?: (id: number) => void;
    onUpdate: (id: number, data: Partial<ScheduleItemRequest> & { spotName?: string, spotType?: SpotType, lat?: number, lng?: number, isVisit?: boolean }) => void;
    onDelete: (id: number) => void;
    onInsert: (index: number) => void;
    variant?: 'page' | 'card';
    pickingTarget?: { dayId: number, scheduleId: number } | null;
    setPickingTarget?: (target: { dayId: number, scheduleId: number } | null) => void;
    dayId?: number;
}

export default function DayScheduleList({
                                            schedules,
                                            selectedScheduleId,
                                            showInjury,
                                            onSelect,
                                            onUpdate,
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

    return (
        <div className={containerClass}>
            <SortableContext items={schedules.map(s => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-4">
                    {schedules.length === 0 && (
                        <div
                            className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 hover:text-blue-500 hover:border-blue-300 transition"
                            onClick={() => onInsert(0)}
                        >
                            <div className="text-3xl mb-2 grayscale opacity-50">🗺️</div>
                            <p className="font-bold text-sm">+ 첫 일정 추가하기</p>
                        </div>
                    )}

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