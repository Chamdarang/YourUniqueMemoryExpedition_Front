import { useEffect, useState } from "react";
import type { DayScheduleResponse, ScheduleUpdateRequest } from "../../types/schedule";
import { useFeedback } from "../common/useFeedback";

interface Props {
    schedule: DayScheduleResponse;
    onUpdate: (id: number, request: ScheduleUpdateRequest) => Promise<void>;
    onDelete: (id: number) => void;
    onToggleVisit: (id: number) => void;
    onDirtyChange?: (scheduleId: number, isDirty: boolean) => void;
    onTransfer?: (schedule: DayScheduleResponse) => void;
}

export default function SimpleScheduleRow({ schedule, onUpdate, onDelete, onToggleVisit, onDirtyChange, onTransfer }: Props) {
    const { isUndoablePending } = useFeedback();
    const isDeletePending = isUndoablePending(`schedule-delete:${schedule.id}`);
    const [startTime, setStartTime] = useState(schedule.startTime?.slice(0, 5) || "");
    const [spotName, setSpotName] = useState(schedule.spotName || "");
    const [memo, setMemo] = useState(schedule.memo || "");
    const [saveState, setSaveState] = useState<'IDLE' | 'SAVING' | 'SAVED' | 'ERROR'>('IDLE');
    const isDirty = startTime !== (schedule.startTime?.slice(0, 5) || "")
        || spotName !== (schedule.spotName || "")
        || memo !== (schedule.memo || "");

    useEffect(() => {
        onDirtyChange?.(schedule.id, isDirty);
    }, [isDirty, onDirtyChange, schedule.id]);

    useEffect(() => () => onDirtyChange?.(schedule.id, false), [onDirtyChange, schedule.id]);

    const save = async (request: ScheduleUpdateRequest) => {
        setSaveState('SAVING');
        try {
            await onUpdate(schedule.id, request);
            setSaveState('SAVED');
            window.setTimeout(() => setSaveState('IDLE'), 1500);
        } catch {
            setSaveState('ERROR');
        }
    };

    const saveTime = () => {
        const original = schedule.startTime?.slice(0, 5) || "";
        if (startTime && startTime !== original) {
            void save({ startTime, fixedStartTime: true });
        }
    };

    const saveName = () => {
        const trimmed = spotName.trim();
        if (!trimmed) {
            setSpotName(schedule.spotName || "");
            return;
        }
        if (trimmed !== schedule.spotName) void save({ spotName: trimmed });
    };

    const saveMemo = () => {
        if (memo !== (schedule.memo || "")) void save({ memo });
    };

    return (
        <div aria-busy={isDeletePending} className={`rounded-xl border p-3 shadow-sm transition ${isDeletePending ? "border-amber-300 bg-amber-50/70 opacity-70" : schedule.isChecked ? "border-green-200 bg-green-50/40" : "border-gray-100 bg-white"}`}>
            <div className="flex items-start gap-2">
                <button
                    type="button"
                    onClick={() => onToggleVisit(schedule.id)}
                    className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-black ${schedule.isChecked ? "border-green-500 bg-green-500 text-white" : "border-gray-300 text-transparent hover:border-green-400"}`}
                    aria-label={schedule.isChecked ? "방문 완료 취소" : "방문 완료"}
                >
                    ✓
                </button>
                <input
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    onBlur={saveTime}
                    className="w-[7.5rem] min-w-[7.5rem] shrink-0 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm font-bold text-blue-700 outline-none focus:border-blue-400"
                />
                <div className="min-w-0 flex-1">
                    <input
                        value={spotName}
                        maxLength={200}
                        onChange={(event) => setSpotName(event.target.value)}
                        onBlur={saveName}
                        onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
                        className="w-full border-0 bg-transparent px-1 py-1 text-sm font-extrabold text-gray-900 outline-none focus:bg-blue-50"
                    />
                    <input
                        value={memo}
                        maxLength={500}
                        placeholder="메모"
                        onChange={(event) => setMemo(event.target.value)}
                        onBlur={saveMemo}
                        onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
                        className="mt-0.5 w-full border-0 bg-transparent px-1 py-1 text-xs text-gray-500 outline-none placeholder:text-gray-300 focus:bg-blue-50"
                    />
                    {schedule.lat != null && schedule.lng != null && (
                        <span className="ml-1 text-[10px] font-bold text-blue-500">📍 지도 연결</span>
                    )}
                    {saveState !== 'IDLE' && (
                        <span className={`ml-2 text-[10px] font-bold ${saveState === 'ERROR' ? 'text-red-500' : saveState === 'SAVED' ? 'text-green-600' : 'text-gray-400'}`}>
                            {saveState === 'SAVING' ? '저장 중...' : saveState === 'SAVED' ? '저장됨' : '저장 실패'}
                        </span>
                    )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                    {onTransfer && <button type="button" onClick={() => onTransfer(schedule)} className="rounded-lg px-2 py-1 text-[10px] font-bold text-violet-500 hover:bg-violet-50">이동·복사</button>}
                    <button type="button" disabled={isDeletePending} onClick={() => onDelete(schedule.id)} className="rounded-lg px-2 py-1 text-xs font-bold text-gray-300 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:bg-amber-100 disabled:text-amber-600" aria-label={isDeletePending ? "일정 삭제 대기 중" : "일정 삭제"}>
                        {isDeletePending ? '삭제 대기 중…' : '삭제'}
                    </button>
                </div>
            </div>
        </div>
    );
}
