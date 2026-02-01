import { useState, useEffect } from "react";
import { useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSensor, useSensors, PointerSensor, DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";

// Types & Utils
import type { DayScheduleResponse } from "../../types/schedule";
import type { PlanDayResponse } from "../../types/planday";
import { recalculateSchedules } from "../../utils/scheduleUtils";
import { timeToMinutes, minutesToTime } from "../../utils/timeUtils";
import { syncSchedules } from "../../api/scheduleApi";
import { updatePlanDay } from "../../api/dayApi";

// ✅ [변경] ScheduleItem 직접 사용 X -> DayScheduleList 사용 O
import DayScheduleList from "../day/DayScheduleList";

interface Props {
    id: number | string;
    dayOrder: number;
    data?: PlanDayResponse;
    schedules: DayScheduleResponse[];
    showInjury: boolean;
    onRefresh: () => void;
    onUpdateDayInfo: (dayId: number, newName: string, newMemo: string) => void;
    onSchedulesChange: (dayId: number, schedules: DayScheduleResponse[]) => void;
    setDirty: (id: string, isDirty: boolean) => void;
    onToggle: (dayId: number, dayOrder: number, isOpen: boolean) => void;
    pickingTarget: { dayId: number, scheduleId: number } | null;
    setPickingTarget: (target: { dayId: number, scheduleId: number } | null) => void;
    isVisibleOnMap: boolean;
    onToggleMapVisibility: (dayId: number) => void;
}

const DAY_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];
const getDayColor = (dayOrder: number) => DAY_COLORS[(dayOrder - 1) % DAY_COLORS.length];

const decodeTempSpot = (memo: string) => {
    if (!memo) return null;
    const idx = memo.indexOf(" #tmp:");
    if (idx === -1) return null;
    try { return JSON.parse(memo.substring(idx + 6)); } catch { return null; }
};

export default function PlanDayItem({
                                        id, dayOrder, data, schedules, showInjury, onRefresh, onUpdateDayInfo,
                                        onSchedulesChange, setDirty, onToggle, pickingTarget, setPickingTarget,
                                        isVisibleOnMap, onToggleMapVisibility
                                    }: Props) {

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 999 : 'auto', opacity: isDragging ? 0.5 : 1 };

    const [isExpanded, setIsExpanded] = useState(false);
    const [isDayDirty, setIsDayDirty] = useState(false);

    // 수정 모드 상태
    const [isEditingInfo, setIsEditingInfo] = useState(false);
    const [editTitle, setEditTitle] = useState("");
    const [editMemo, setEditMemo] = useState("");

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

    useEffect(() => {
        if (data) {
            setEditTitle(data.dayName);
            setEditMemo(data.memo || "");
        }
    }, [data]);

    const handleToggle = () => {
        if (isEditingInfo) return;
        if (data) {
            const newExpanded = !isExpanded;
            setIsExpanded(newExpanded);
            onToggle(data.id, dayOrder, newExpanded);
        }
    };

    const handleSaveInfo = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!data) return;

        try {
            // 1. 서버에 저장 요청 (비동기)
            await updatePlanDay(data.id, { dayName: editTitle, memo: editMemo });

            // 2. 편집 모드 종료
            setIsEditingInfo(false);

            onUpdateDayInfo(data.id, editTitle, editMemo);

        } catch {
            alert("정보 수정에 실패했습니다.");
        }
    };

    const handleCancelEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditingInfo(false);
        if (data) {
            setEditTitle(data.dayName);
            setEditMemo(data.memo || "");
        }
    };

    const updateLocalSchedules = (newSchedules: DayScheduleResponse[]) => {
        if (!data) return;
        const recalculated = recalculateSchedules(newSchedules);
        onSchedulesChange(data.id, recalculated);
        setIsDayDirty(true);
        setDirty(`day-${data.id}`, true);
    };

    const handleItemUpdate = (itemId: number, updatedData: any) => {
        if (!data) return;
        const index = schedules.findIndex(s => s && s.id === itemId);
        if (index === -1) return;

        if (updatedData.startTime && index > 0) {
            const prevItem = schedules[index - 1];
            if (prevItem) {
                const prevEndTimeMinutes = timeToMinutes(prevItem.endTime);
                const movingTime = schedules[index].movingDuration || 0;
                const newStartTimeMinutes = timeToMinutes(updatedData.startTime);
                const minPossibleTime = prevEndTimeMinutes + movingTime;
                if (newStartTimeMinutes < minPossibleTime) {
                    alert(`시간 설정 오류: ${minutesToTime(minPossibleTime)} 이후로만 가능합니다.`);
                    return;
                }
            }
        }

        const currentList = schedules.map((item, i) => {
            if (i === index) {
                const newItem = { ...item, ...updatedData };
                if (updatedData.isVisit !== undefined && newItem.spot) {
                    newItem.spot = { ...newItem.spot, isVisit: updatedData.isVisit };
                }
                return newItem;
            }
            if (i > index) return { ...item, startTime: null };
            return item;
        });

        updateLocalSchedules(currentList);
    };

    const handleItemDelete = (itemId: number) => {
        if (!confirm("삭제하시겠습니까?")) return;
        updateLocalSchedules(schedules.filter(s => s && s.id !== itemId));
    };

    const handleItemInsert = (index: number) => {
        if (!data) return;
        let startTime = "10:00";
        if (index > 0 && schedules[index - 1]) startTime = schedules[index - 1].endTime;

        const newItem: DayScheduleResponse = {
            endTime: "", isVisit: false, lat: 0, lng: 0,
            id: -Date.now(), dayId: data.id, scheduleOrder: index + 1, spotId: 0, spotName: "", spotType: "OTHER",
            startTime, duration: 60, movingDuration: 0, transportation: 'WALK', memo: '', movingMemo: ''
        };
        const newList = [...schedules];
        newList.splice(index, 0, newItem);
        updateLocalSchedules(newList);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = schedules.findIndex(s => s && s.id === active.id);
            const newIndex = schedules.findIndex(s => s && s.id === over.id);
            if (oldIndex !== -1 && newIndex !== -1) {
                updateLocalSchedules(arrayMove(schedules, oldIndex, newIndex));
            }
        }
    };

    const handleSaveDay = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!data) return;
        if (schedules.some(s => s.spotId === 0 && !decodeTempSpot(s.memo) && !s.spotName)) return alert("장소를 선택해주세요.");
        try {
            const syncReq = schedules.map((s, idx) => ({ ...s, id: s.id < 0 ? null : s.id, scheduleOrder: idx + 1, spotId: s.spotId === 0 ? null : s.spotId }));
            await syncSchedules(data.id, { schedules: syncReq });
            setIsDayDirty(false);
            setDirty(`day-${data.id}`, false);
            alert("저장되었습니다.");
            onRefresh();
        } catch { alert("저장 실패"); }
    };

    if (!data) return null;
    const dayColor = getDayColor(dayOrder);
    const safeSchedules = (schedules || []).filter(s => s !== undefined && s !== null);

    return (
        <div ref={setNodeRef} style={style} className="mb-4">
            <div className={`bg-white rounded-2xl border transition overflow-hidden shadow-sm ${isExpanded ? `border-[${dayColor}]` : 'border-gray-200'}`} style={isExpanded ? { borderColor: dayColor } : {}}>

                {/* Header (Accordion Title) */}
                <div className="p-4 cursor-pointer relative z-10 flex flex-col justify-center min-h-[72px]" onClick={handleToggle}>
                    <div className="flex items-start md:items-center gap-4 w-full">
                        {!isEditingInfo && (
                            <div {...attributes} {...listeners} onClick={e => e.stopPropagation()} className="cursor-grab text-gray-300 text-xl px-1 hover:text-orange-500 mt-1 md:mt-0">⠿</div>
                        )}
                        <div className="w-12 h-12 rounded-xl flex flex-col items-center justify-center border shrink-0 text-white shadow-sm" style={{ backgroundColor: dayColor, borderColor: dayColor }}>
                            <span className="text-[10px] uppercase font-bold opacity-80">Day</span>
                            <span className="text-xl font-extrabold leading-none">{dayOrder}</span>
                        </div>

                        <div className="flex-1 min-w-0 mr-2">
                            {isEditingInfo ? (
                                <div className="flex flex-col gap-2" onClick={e => e.stopPropagation()}>
                                    <input type="text" className="w-full border border-orange-300 rounded px-2 py-1 text-sm font-bold focus:outline-none" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} autoFocus />
                                    <textarea className="w-full border border-gray-200 rounded px-2 py-1 text-xs resize-none" value={editMemo} onChange={(e) => setEditMemo(e.target.value)} rows={2} />
                                    <div className="flex gap-2 mt-1">
                                        <button onClick={handleSaveInfo} className="bg-orange-500 text-white text-xs px-3 py-1.5 rounded font-bold hover:bg-orange-600">저장</button>
                                        <button onClick={handleCancelEdit} className="bg-gray-100 text-gray-600 text-xs px-3 py-1.5 rounded font-bold hover:bg-gray-200">취소</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="group relative">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-lg font-bold text-gray-900 truncate">{data.dayName}</h3>
                                        <button onClick={(e) => { e.stopPropagation(); setIsEditingInfo(true); setIsExpanded(true); }} className="text-gray-300 hover:text-orange-500 opacity-0 group-hover:opacity-100 transition p-1">✎</button>
                                    </div>
                                    <p className={`text-xs truncate mt-0.5 ${data.memo ? 'text-gray-500' : 'text-gray-300'}`}>{data.memo || "메모 없음"}</p>
                                </div>
                            )}
                        </div>

                        {!isEditingInfo && (
                            <div className="flex items-center gap-2 self-start md:self-center">
                                <button onClick={(e) => { e.stopPropagation(); onToggleMapVisibility(data.id); }} className={`w-9 h-9 flex items-center justify-center rounded-xl transition border ${isVisibleOnMap ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-sm' : 'bg-white text-gray-300 border-gray-100 hover:bg-gray-50 hover:text-gray-400'}`}>
                                    {isVisibleOnMap ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" /><path fillRule="evenodd" d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 010-1.113zM17.25 12a5.25 5.25 0 11-10.5 0 5.25 5.25 0 0110.5 0z" clipRule="evenodd" /></svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M3.53 2.47a.75.75 0 00-1.06 1.06l18 18a.75.75 0 101.06-1.06l-18-18zM22.676 12.553a11.249 11.249 0 01-2.631 4.31l-3.099-3.099a5.25 5.25 0 00-6.71-6.71L7.759 4.577a11.217 11.217 0 014.242-.827c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113z" /><path d="M15.75 12c0 .18-.013.357-.037.53l-4.244-4.243A3.75 3.75 0 0115.75 12zM12.53 15.713l-4.243-4.244a3.75 3.75 0 004.243 4.243z" /><path d="M6.75 12c0-.619.107-1.213.304-1.764l-3.1-3.1a11.25 11.25 0 00-2.63 4.31c-.12.362-.12.752 0 1.114 1.489 4.467 5.704 7.69 10.675 7.69 1.5 0 2.933-.294 4.242-.827l-2.477-2.477A5.25 5.25 0 016.75 12z" /></svg>
                                    )}
                                </button>
                                {isDayDirty && <button onClick={handleSaveDay} className="bg-orange-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-orange-600 shadow-sm transition">저장</button>}
                                <span className="text-gray-400 text-xs ml-1">{isExpanded ? '▲' : '▼'}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* ✅ [핵심] Content (이제 DayScheduleList 컴포넌트를 재사용!) */}
                {isExpanded && (
                    <div className="border-t border-gray-100 p-4 bg-gray-50/30">
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            {/* variant="card"를 전달하여 카드 내부 스타일로 렌더링 */}
                            <DayScheduleList
                                variant="card"
                                schedules={safeSchedules}
                                showInjury={showInjury}
                                onUpdate={handleItemUpdate}
                                onDelete={handleItemDelete}
                                onInsert={handleItemInsert}
                                pickingTarget={pickingTarget}
                                setPickingTarget={setPickingTarget}
                                dayId={data.id}
                            />
                        </DndContext>
                    </div>
                )}
            </div>
        </div>
    );
}