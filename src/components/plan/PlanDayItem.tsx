import { useState, useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSensor, useSensors, PointerSensor, DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";

// Types & API
import type { DayScheduleResponse, ScheduleUpdateRequest } from "../../types/schedule";
import type { PlanDayResponse } from "../../types/planDay.ts";
import { updatePlanDay } from "../../api/dayApi";

// ✅ 훅 기반 개별 작업 전환
import { useSchedule } from "../../hooks/useSchedule";
import DayScheduleList from "../day/DayScheduleList";

interface Props {
    id: number | string;
    dayOrder: number;
    data?: PlanDayResponse;
    // schedules Props 제거: 이제 훅이 직접 서버에서 가져오고 관리합니다.
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
    onExportDay: () => void;
}

const DAY_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];
const getDayColor = (dayOrder: number) => DAY_COLORS[(dayOrder - 1) % DAY_COLORS.length];

export default function PlanDayItem({
                                        id, dayOrder, data, showInjury, onUpdateDayInfo,
                                        onSchedulesChange, onToggle, pickingTarget, setPickingTarget,
                                        isVisibleOnMap, onToggleMapVisibility, onExportDay
                                    }: Props) {

    // ✅ [변경] 개별 스케줄 작업용 훅 연결
    const {
        schedules,
        fetchSchedules,
        addSchedule,
        updateSchedule,
        removeSchedule,
        toggleVisit,
        reorderSchedule
    } = useSchedule();

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 999 : 'auto', opacity: isDragging ? 0.5 : 1 };

    const [isExpanded, setIsExpanded] = useState(false);

    const [isEditingInfo, setIsEditingInfo] = useState(false);
    const [editTitle, setEditTitle] = useState("");
    const [editMemo, setEditMemo] = useState("");

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

    // ✅ 펼쳐질 때 해당 일차의 스케줄 로드
    useEffect(() => {
        if (isExpanded && data?.id) {
            fetchSchedules(data.id);
        }
    }, [isExpanded, data?.id, fetchSchedules]);

    // ✅ 훅의 데이터가 변경될 때마다 부모(지도 핀 등) 동기화
    useEffect(() => {
        if (data?.id) {
            onSchedulesChange(data.id, schedules);
        }
    }, [schedules, data?.id]);

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
            await updatePlanDay(data.id, { dayName: editTitle, memo: editMemo });
            setIsEditingInfo(false);
            onUpdateDayInfo(data.id, editTitle, editMemo);
        } catch { alert("정보 수정에 실패했습니다."); }
    };

    const handleCancelEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditingInfo(false);
        if (data) {
            setEditTitle(data.dayName);
            setEditMemo(data.memo || "");
        }
    };

    // ✅ [변경] 훅을 통한 개별 업데이트 처리
    const handleItemUpdate = async (scheduleId: number, req: ScheduleUpdateRequest) => {
        await updateSchedule(scheduleId, req);
    };

    const handleItemDelete = async (scheduleId: number) => {
        await removeSchedule(scheduleId);
    };

    const handleItemInsert = async (orderIndex: number) => {
        if (data?.id) {
            await addSchedule(data.id, { scheduleOrder: orderIndex });
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            if (!data?.id) return;

            const scheduleId = Number(active.id);
            const newIndex = schedules.findIndex(s => s.id === over.id);

            if (newIndex !== -1) {
                // 사용자님의 API 규격: (dayId, scheduleId, { scheduleOrder })
                await reorderSchedule(data.id, scheduleId, {
                    scheduleOrder: newIndex
                });
            }
        }
    };

    if (!data) return null;
    const dayColor = getDayColor(dayOrder);

    return (
        <div ref={setNodeRef} style={style} className="mb-4">
            <div className={`bg-white rounded-2xl border transition overflow-hidden shadow-sm ${isExpanded ? `border-[${dayColor}]` : 'border-gray-200'}`} style={isExpanded ? { borderColor: dayColor } : {}}>

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
                                <button
                                    onClick={(e) => { e.stopPropagation(); onExportDay(); }}
                                    className="w-9 h-9 flex items-center justify-center rounded-xl transition border bg-white text-gray-400 border-gray-100 hover:bg-gray-50 hover:text-gray-600 shadow-sm"
                                    title="이 일정만 이미지로 저장"
                                >
                                    📸
                                </button>

                                <button onClick={(e) => { e.stopPropagation(); onToggleMapVisibility(data.id); }} className={`w-9 h-9 flex items-center justify-center rounded-xl transition border ${isVisibleOnMap ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-sm' : 'bg-white text-gray-300 border-gray-100 hover:bg-gray-50 hover:text-gray-400'}`}>
                                    {isVisibleOnMap ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" /><path fillRule="evenodd" d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 010-1.113zM17.25 12a5.25 5.25 0 11-10.5 0 5.25 5.25 0 0110.5 0z" clipRule="evenodd" /></svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M3.53 2.47a.75.75 0 00-1.06 1.06l18 18a.75.75 0 101.06-1.06l-18-18zM22.676 12.553a11.249 11.249 0 01-2.631 4.31l-3.099-3.099a5.25 5.25 0 00-6.71-6.71L7.759 4.577a11.217 11.217 0 014.242-.827c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113z" /><path d="M15.75 12c0 .18-.013.357-.037.53l-4.244-4.243A3.75 3.75 0 0115.75 12zM12.53 15.713l-4.243-4.244a3.75 3.75 0 004.243 4.243z" /><path d="M6.75 12c0-.619.107-1.213.304-1.764l-3.1-3.1a11.25 11.25 0 00-2.63 4.31c-.12.362-.12.752 0 1.114 1.489 4.467 5.704 7.69 10.675 7.69 1.5 0 2.933-.294 4.242-.827l-2.477-2.477A5.25 5.25 0 016.75 12z" /></svg>
                                    )}
                                </button>
                                <span className="text-gray-400 text-xs ml-1">{isExpanded ? '▲' : '▼'}</span>
                            </div>
                        )}
                    </div>
                </div>

                {isExpanded && (
                    <div className="border-t border-gray-100 p-4 bg-gray-50/30">
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <DayScheduleList
                                variant="card"
                                schedules={schedules}
                                showInjury={showInjury}
                                onUpdate={handleItemUpdate}
                                onToggleVisit={toggleVisit}
                                onDelete={handleItemDelete}
                                onInsert={handleItemInsert}
                                pickingTarget={pickingTarget}
                                setPickingTarget={setPickingTarget}
                                dayId={data?.id}
                            />
                        </DndContext>
                    </div>
                )}
            </div>
        </div>
    );
}