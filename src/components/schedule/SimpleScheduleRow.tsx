import { useState } from "react";
import type { DayScheduleResponse, ScheduleUpdateRequest } from "../../types/schedule";

interface Props {
    schedule: DayScheduleResponse;
    onUpdate: (id: number, request: ScheduleUpdateRequest) => Promise<void>;
    onDelete: (id: number) => void;
    onToggleVisit: (id: number) => void;
}

export default function SimpleScheduleRow({ schedule, onUpdate, onDelete, onToggleVisit }: Props) {
    const [startTime, setStartTime] = useState(schedule.startTime?.slice(0, 5) || "");
    const [spotName, setSpotName] = useState(schedule.spotName || "");
    const [memo, setMemo] = useState(schedule.memo || "");

    const saveTime = () => {
        const original = schedule.startTime?.slice(0, 5) || "";
        if (startTime && startTime !== original) {
            void onUpdate(schedule.id, { startTime, fixedStartTime: true });
        }
    };

    const saveName = () => {
        const trimmed = spotName.trim();
        if (!trimmed) {
            setSpotName(schedule.spotName || "");
            return;
        }
        if (trimmed !== schedule.spotName) void onUpdate(schedule.id, { spotName: trimmed });
    };

    const saveMemo = () => {
        if (memo !== (schedule.memo || "")) void onUpdate(schedule.id, { memo });
    };

    return (
        <div className={`rounded-xl border bg-white p-3 shadow-sm transition ${schedule.isChecked ? "border-green-200 bg-green-50/40" : "border-gray-100"}`}>
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
                </div>
                <button type="button" onClick={() => onDelete(schedule.id)} className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-gray-300 hover:bg-red-50 hover:text-red-500" aria-label="일정 삭제">
                    삭제
                </button>
            </div>
        </div>
    );
}
