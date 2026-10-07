import { useEffect, useState } from 'react';
import type { DayScheduleResponse, ScheduleUpdateRequest } from '../../types/schedule';
import {
  formatScheduleConflictValue,
  getScheduleConflictRows,
  mergeScheduleConflict,
  type ScheduleConflictChoice,
  type ScheduleConflictFieldKey,
} from '../../utils/scheduleConflict';

interface Props {
  base: DayScheduleResponse;
  mine: ScheduleUpdateRequest;
  latest: DayScheduleResponse;
  busy?: boolean;
  onApply: (request: ScheduleUpdateRequest) => void | Promise<void>;
  onCancel: () => void;
}

export default function ScheduleConflictPanel({ base, mine, latest, busy = false, onApply, onCancel }: Props) {
  const [choices, setChoices] = useState<Partial<Record<ScheduleConflictFieldKey, ScheduleConflictChoice>>>({});
  const rows = getScheduleConflictRows(base, mine, latest);
  const conflictRows = rows.filter(row => row.conflict);

  useEffect(() => setChoices({}), [latest.version]);

  const canApply = conflictRows.every(row => choices[row.key] != null);

  return (
    <section aria-label="일정 수정 충돌 비교" className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <h4 className="font-bold">다른 편집자가 이 일정을 먼저 수정했습니다</h4>
      <p className="mt-1 leading-relaxed">
        처음 값, 내 수정, 최신 저장값을 비교해 주세요. 겹치지 않는 필드 변경은 함께 반영하고, 서로 다르게 바꾼 필드만 선택을 기다립니다.
      </p>
      <div className="mt-3 space-y-3">
        {rows.map(row => (
          <div key={row.key} className={`rounded-lg border bg-white p-3 ${row.conflict ? 'border-amber-400' : 'border-amber-100'}`}>
            <div className="font-semibold">{row.label}</div>
            <dl className="mt-2 grid gap-2 sm:grid-cols-3">
              <div><dt className="text-xs text-slate-500">처음 값</dt><dd className="break-words">{formatScheduleConflictValue(row.key, row.base)}</dd></div>
              <div><dt className="text-xs text-slate-500">내 수정</dt><dd className="break-words">{formatScheduleConflictValue(row.key, row.mine)}</dd></div>
              <div><dt className="text-xs text-slate-500">최신 저장값</dt><dd className="break-words">{formatScheduleConflictValue(row.key, row.latest)}</dd></div>
            </dl>
            {row.conflict ? (
              <div role="group" aria-label={`${row.label} 반영 선택`} className="mt-3 flex flex-wrap gap-2">
                <button type="button" aria-pressed={choices[row.key] === 'mine'} onClick={() => setChoices(previous => ({ ...previous, [row.key]: 'mine' }))} className={`min-h-10 rounded-lg border px-3 font-semibold ${choices[row.key] === 'mine' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
                  내 수정 적용
                </button>
                <button type="button" aria-pressed={choices[row.key] === 'latest'} onClick={() => setChoices(previous => ({ ...previous, [row.key]: 'latest' }))} className={`min-h-10 rounded-lg border px-3 font-semibold ${choices[row.key] === 'latest' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
                  최신 값 적용
                </button>
              </div>
            ) : (
              <p className="mt-2 text-xs font-medium text-emerald-700">
                {row.localChanged ? '겹치지 않아 내 수정도 함께 저장됩니다.' : '내가 수정하지 않은 필드라 최신 값을 유지합니다.'}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" disabled={busy} onClick={onCancel} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 font-semibold text-slate-700 disabled:opacity-50">
          내 수정 취소하고 최신 값 사용
        </button>
        <button type="button" disabled={busy || !canApply} onClick={() => void onApply(mergeScheduleConflict(base, mine, latest, choices))} className="min-h-11 rounded-lg bg-blue-600 px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? '저장 중…' : '선택한 값으로 병합 저장'}
        </button>
      </div>
    </section>
  );
}
