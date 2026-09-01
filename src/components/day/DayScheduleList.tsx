import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import ScheduleItem from "../schedule/ScheduleItem";
import type { DayScheduleResponse, ScheduleCreateRequest, ScheduleUpdateRequest } from "../../types/schedule";
import { getScheduleTimingWarning } from "../../utils/scheduleUtils";
import QuickScheduleAdd from "../schedule/QuickScheduleAdd";
import SimpleScheduleRow from "../schedule/SimpleScheduleRow";
import type { ScheduleMode } from "../../types/planDay";

interface Props {
    schedules: DayScheduleResponse[];
    selectedScheduleId?: number | null;
    showInjury: boolean;
    onSelect?: (id: number) => void;
    onUpdate: (id: number, req: ScheduleUpdateRequest) => Promise<void>;
    onToggleVisit: (id: number) => void;
    onDelete: (id: number) => void;
    onInsert: (index: number) => void;
    onQuickAdd: (request: ScheduleCreateRequest) => Promise<boolean>;
    onQuickMapPickStart?: () => void;
    scheduleMode?: ScheduleMode;
    variant?: 'page' | 'card';
    pickingTarget?: { dayId: number, scheduleId: number } | null;
    setPickingTarget?: (target: { dayId: number, scheduleId: number } | null) => void;
    dayId?: number;
    routeDate?: string;
    focusRequest?: { scheduleId: number; key: number; openEditor: boolean };
    onItemDirtyChange?: (scheduleId: number, isDirty: boolean) => void;
    onTransfer?: (schedule: DayScheduleResponse) => void;
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
                                            onQuickAdd,
                                            onQuickMapPickStart,
                                            scheduleMode = 'DETAILED',
                                            variant = 'page',
                                            pickingTarget,
                                            setPickingTarget,
                                            dayId,
                                            routeDate,
                                            focusRequest,
                                            onItemDirtyChange,
                                            onTransfer
                                        }: Props) {

    const containerClass = variant === 'page'
        ? "flex-1 overflow-y-auto p-4 pb-24 bg-white scrollbar-hide"
        : "space-y-4";

    // ✅ schedules 내부에 null이나 undefined가 섞이지 않도록 필터링하여 items 생성
    const validScheduleIds = (schedules || [])
        .filter(s => s && s.id !== undefined && s.id !== null)
        .map(s => s.id);

    if (scheduleMode === 'SIMPLE') {
        return (
            <div className={containerClass}>
                <div className="space-y-3">
                    <QuickScheduleAdd scheduleOrder={schedules.length} onSubmit={onQuickAdd} onMapPickStart={onQuickMapPickStart} />
                    {schedules.length === 0 && (
                        <div className="rounded-xl border-2 border-dashed border-gray-200 px-4 py-8 text-center text-sm font-medium text-gray-400">
                            위의 간편 일정 추가를 눌러 첫 장소를 입력해 주세요.
                        </div>
                    )}
                    {schedules.map((schedule) => (
                        <div
                            key={`${schedule.id}-${schedule.startTime}-${schedule.spotName}-${schedule.memo}`}
                            data-schedule-id={schedule.id}
                            className={`scroll-mt-24 rounded-xl transition ${selectedScheduleId === schedule.id ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
                            onClick={() => onSelect?.(schedule.id)}
                        >
                            <SimpleScheduleRow
                                schedule={schedule}
                                onUpdate={onUpdate}
                                onDelete={onDelete}
                                onToggleVisit={onToggleVisit}
                                onDirtyChange={onItemDirtyChange}
                                onTransfer={onTransfer}
                            />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

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

                        const timingWarning = getScheduleTimingWarning(
                            index > 0 ? schedules[index - 1] : null,
                            schedule,
                        );

                        return (
                            <div
                                key={schedule.id}
                                data-schedule-id={schedule.id}
                                className={`scroll-mt-24 transition-all duration-200 ${
                                    selectedScheduleId === schedule.id
                                        ? 'ring-2 ring-blue-500 ring-offset-2 rounded-xl bg-blue-50/50'
                                        : ''
                                }`}
                                onClick={() => onSelect && onSelect(schedule.id)}
                            >
                                {timingWarning && (
                                    <div className={`mb-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold ${
                                        timingWarning.type === 'CONFLICT'
                                            ? 'border-red-200 bg-red-50 text-red-700'
                                            : 'border-orange-200 bg-orange-50 text-orange-700'
                                    }`}>
                                        <span>{timingWarning.type === 'CONFLICT' ? '⚠️' : '⏳'}</span>
                                        <span>{timingWarning.message}</span>
                                    </div>
                                )}
                                <ScheduleItem
                                    schedule={schedule}
                                    previousSchedule={index > 0 ? schedules[index - 1] : null}
                                    routeDate={routeDate}
                                    index={index}
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
                                    openEditRequestKey={focusRequest?.scheduleId === schedule.id && focusRequest.openEditor ? focusRequest.key : undefined}
                                    onDirtyChange={onItemDirtyChange}
                                    onTransfer={onTransfer}
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
