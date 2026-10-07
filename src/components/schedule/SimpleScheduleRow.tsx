import { useEffect, useRef, useState } from 'react';
import type { DayScheduleResponse, ScheduleUpdateRequest } from '../../types/schedule';
import { getSchedulesByDay, ScheduleEditConflictError } from '../../api/scheduleApi';
import { useFeedback } from '../common/useFeedback';
import ScheduleConflictPanel from './ScheduleConflictPanel';

interface Props {
    schedule: DayScheduleResponse;
    onUpdate: (id: number, request: ScheduleUpdateRequest) => Promise<void | DayScheduleResponse[]>;
    onRefresh?: () => Promise<unknown>;
    onDelete: (id: number) => void;
    onToggleVisit: (id: number) => void;
    canToggleVisit?: boolean;
    onDirtyChange?: (scheduleId: number, isDirty: boolean) => void;
    onTransfer?: (schedule: DayScheduleResponse) => void;
}

const fieldsFrom = (schedule: DayScheduleResponse) => ({
    startTime: schedule.startTime?.slice(0, 5) || '',
    spotName: schedule.spotName || '',
    memo: schedule.memo || '',
});

export default function SimpleScheduleRow({ schedule, onUpdate, onRefresh, onDelete, onToggleVisit, canToggleVisit = true, onDirtyChange, onTransfer }: Props) {
    const { isUndoablePending } = useFeedback();
    const isDeletePending = isUndoablePending(`schedule-delete:${schedule.id}`);
    const [draft, setDraft] = useState(() => fieldsFrom(schedule));
    const [saveState, setSaveState] = useState<'IDLE' | 'SAVING' | 'SAVED' | 'ERROR'>('IDLE');
    const [validationError, setValidationError] = useState('');
    const [baseOverride, setBaseOverride] = useState<DayScheduleResponse | null>(null);
    const [conflictState, setConflictState] = useState<{ base: DayScheduleResponse; mine: ScheduleUpdateRequest; latest: DayScheduleResponse } | null>(null);
    const conflictStateRef = useRef(conflictState);
    conflictStateRef.current = conflictState;
    const previousFields = useRef(fieldsFrom(schedule));
    const versionRef = useRef(schedule.version);
    versionRef.current = schedule.version;
    const saveQueue = useRef<Promise<void>>(Promise.resolve());
    const pendingSaves = useRef(0);
    const original = fieldsFrom(baseOverride ?? schedule);
    const isDirty = draft.startTime !== original.startTime || draft.spotName !== original.spotName || draft.memo !== original.memo;

    // Keep newer edits when saved values arrive from the server.
    useEffect(() => {
        const next = fieldsFrom(baseOverride && schedule.version < baseOverride.version ? baseOverride : schedule);
        const previous = previousFields.current;
        setDraft(current => ({
            startTime: current.startTime === previous.startTime ? next.startTime : current.startTime,
            spotName: current.spotName === previous.spotName ? next.spotName : current.spotName,
            memo: current.memo === previous.memo ? next.memo : current.memo,
        }));
        previousFields.current = next;
        if (baseOverride && schedule.version >= baseOverride.version) setBaseOverride(null);
    }, [schedule.startTime, schedule.spotName, schedule.memo, schedule.version, baseOverride]);

    useEffect(() => {
        onDirtyChange?.(schedule.id, isDirty || saveState === 'SAVING');
    }, [isDirty, saveState, onDirtyChange, schedule.id]);
    useEffect(() => () => onDirtyChange?.(schedule.id, false), [onDirtyChange, schedule.id]);

    const save = () => {
        if (!isDirty || isDeletePending || conflictState) return;
        if (!draft.spotName.trim()) {
            setValidationError('장소명을 입력해 주세요.');
            setSaveState('ERROR');
            return;
        }
        if (!draft.startTime && original.startTime) {
            setValidationError('시작 시간을 입력해 주세요.');
            setSaveState('ERROR');
            return;
        }
        setValidationError('');
        const snapshot = { ...draft, spotName: draft.spotName.trim() };
        const request: ScheduleUpdateRequest = { expectedVersion: (baseOverride ?? schedule).version };
        if (snapshot.spotName !== original.spotName) request.spotName = snapshot.spotName;
        if (snapshot.memo !== original.memo) request.memo = snapshot.memo;
        if (snapshot.startTime && snapshot.startTime !== original.startTime) {
            request.startTime = snapshot.startTime;
            request.fixedStartTime = schedule.fixedStartTime || snapshot.startTime !== original.startTime;
        }
        pendingSaves.current += 1;
        setSaveState('SAVING');
        saveQueue.current = saveQueue.current.then(async () => {
            try {
                if (conflictStateRef.current) return;
                request.expectedVersion = versionRef.current;
                const updated = await onUpdate(schedule.id, request);
                if (Array.isArray(updated)) {
                    const updatedRow = updated.find(item => item.id === schedule.id);
                    if (updatedRow) versionRef.current = updatedRow.version;
                }
                setDraft(current => current.spotName.trim() === snapshot.spotName ? { ...current, spotName: snapshot.spotName } : current);
                setSaveState(pendingSaves.current > 1 ? 'SAVING' : 'SAVED');
            } catch (error) {
                if (error instanceof ScheduleEditConflictError) {
                    let latest = error.latestSchedule;
                    if (!latest) {
                        try {
                            latest = (await getSchedulesByDay(schedule.dayId)).find(item => item.id === schedule.id) ?? null;
                        } catch {
                            latest = null;
                        }
                    }
                    if (latest) {
                        const nextConflict = { base: baseOverride ?? schedule, mine: request, latest };
                        conflictStateRef.current = nextConflict;
                        setConflictState(nextConflict);
                        setSaveState('ERROR');
                        return;
                    }
                }
                setSaveState(pendingSaves.current > 1 ? 'SAVING' : 'ERROR');
            } finally {
                pendingSaves.current -= 1;
            }
        });
    };

    const applyConflictResolution = async (request: ScheduleUpdateRequest) => {
        if (!conflictState) return;
        setSaveState('SAVING');
        try {
            await onUpdate(schedule.id, request);
            try {
                const refreshed = (await getSchedulesByDay(schedule.dayId)).find(item => item.id === schedule.id);
                if (refreshed) {
                    setBaseOverride(refreshed);
                    setDraft(fieldsFrom(refreshed));
                    previousFields.current = fieldsFrom(refreshed);
                }
            } catch {
                // The update is already saved; the live refresh will reload the row.
            }
            conflictStateRef.current = null;
            setConflictState(null);
            setBaseOverride(null);
            setSaveState('SAVED');
        } catch (error) {
            if (error instanceof ScheduleEditConflictError) {
                let latest = error.latestSchedule;
                if (!latest) {
                    try {
                        latest = (await getSchedulesByDay(schedule.dayId)).find(item => item.id === schedule.id) ?? null;
                    } catch {
                        latest = null;
                    }
                }
                if (latest) {
                    setConflictState(previous => {
                        const next = previous ? { ...previous, latest } : previous;
                        conflictStateRef.current = next;
                        return next;
                    });
                    setSaveState('ERROR');
                    return;
                }
            }
            setSaveState('ERROR');
        }
    };

    const cancelConflict = () => {
        if (!conflictState) return;
        const latest = conflictState.latest;
        setBaseOverride(latest);
        setDraft(fieldsFrom(latest));
        previousFields.current = fieldsFrom(latest);
        conflictStateRef.current = null;
        setConflictState(null);
        setSaveState('IDLE');
        void onRefresh?.();
    };

    return (
        <div aria-busy={saveState === 'SAVING' || isDeletePending} className={`rounded-xl border p-3 shadow-sm ${isDeletePending ? 'border-amber-300 bg-amber-50/70' : schedule.isChecked ? 'border-green-200 bg-green-50/40' : 'border-gray-200 bg-white'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    {canToggleVisit && <button type="button" disabled={isDeletePending} onClick={() => onToggleVisit(schedule.id)} aria-pressed={schedule.isChecked} aria-label={schedule.isChecked ? '방문 완료 취소' : '방문 완료'} className="flex h-11 w-11 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50">
                        <span aria-hidden="true" className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${schedule.isChecked ? 'border-green-600 bg-green-600 text-white' : 'border-gray-400 text-transparent'}`}>✓</span>
                    </button>}
                    <input type="time" aria-label="시작 시간" disabled={isDeletePending || Boolean(conflictState)} value={draft.startTime} onChange={event => setDraft(current => ({ ...current, startTime: event.target.value }))} onBlur={save} className="min-h-11 w-36 rounded-lg border border-gray-200 bg-gray-50 px-2 text-sm font-semibold text-blue-700 focus-visible:outline-blue-400" />
                </div>
                <details className="relative shrink-0">
                    <summary aria-label="일정 작업" className="flex h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-lg px-3 text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-400">⋯</summary>
                    <div className="absolute right-0 z-50 mt-1 w-40 rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
                        {onTransfer && <button type="button" disabled={isDeletePending} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onTransfer(schedule); }} className="min-h-11 w-full rounded-lg px-3 text-left text-sm text-violet-700 hover:bg-violet-50">이동·복사</button>}
                        <button type="button" disabled={isDeletePending} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onDelete(schedule.id); }} className="min-h-11 w-full rounded-lg px-3 text-left text-sm text-red-700 hover:bg-red-50 disabled:opacity-50" aria-label={isDeletePending ? '일정 삭제 대기 중' : '일정 삭제'}>{isDeletePending ? '삭제 대기 중…' : '삭제'}</button>
                    </div>
                </details>
            </div>
            <div className="mt-2 space-y-2">
                <label className="block">
                    <span className="sr-only">장소명</span>
                    <input value={draft.spotName} maxLength={200} disabled={isDeletePending || Boolean(conflictState)} onChange={event => setDraft(current => ({ ...current, spotName: event.target.value }))} onBlur={save} onKeyDown={event => event.key === 'Enter' && event.currentTarget.blur()} className="min-h-11 w-full rounded-lg border border-gray-200 px-3 text-base font-semibold text-gray-900 focus-visible:outline-blue-400" />
                </label>
                <label className="block">
                    <span className="sr-only">일정 메모</span>
                    <textarea aria-label="일정 메모" rows={2} value={draft.memo} maxLength={500} placeholder="메모" disabled={isDeletePending || Boolean(conflictState)} onChange={event => setDraft(current => ({ ...current, memo: event.target.value }))} onBlur={save} className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed text-gray-700 focus-visible:outline-blue-400" />
                </label>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {schedule.lat != null && schedule.lng != null && <span className="text-blue-600">📍 지도 연결</span>}
                {isDeletePending && <span className="text-amber-700">삭제 대기 중…</span>}
                <span role="status" className={saveState === 'ERROR' ? 'text-red-700' : isDirty ? 'text-amber-700' : 'text-slate-500'}>
                    {saveState === 'SAVING' ? '저장 중…' : saveState === 'ERROR' ? validationError || '저장 실패 · 입력한 내용은 유지됩니다.' : isDirty ? '저장되지 않은 변경사항' : saveState === 'SAVED' ? '저장됨' : '다른 곳을 누르면 자동 저장'}
                </span>
                {saveState === 'ERROR' && <button type="button" onClick={save} className="min-h-11 rounded-lg bg-red-50 px-3 font-semibold text-red-700">저장 다시 시도</button>}
            </div>
            {conflictState && <div className="mt-3">
                <ScheduleConflictPanel
                    base={conflictState.base}
                    mine={conflictState.mine}
                    latest={conflictState.latest}
                    busy={saveState === 'SAVING'}
                    onApply={applyConflictResolution}
                    onCancel={cancelConflict}
                />
            </div>}
        </div>
    );
}
