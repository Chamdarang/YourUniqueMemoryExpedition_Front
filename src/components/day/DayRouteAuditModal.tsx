import type { DayRouteAuditLeg, DayRouteAuditResponse, DayRouteAuditStatus } from '../../types/route';

interface Props {
  result: DayRouteAuditResponse;
  onClose: () => void;
  onApplyLeg: (leg: DayRouteAuditLeg) => void;
  onApplyAll: () => void;
  onRecalculate: () => void;
  applying: boolean;
  recalculating: boolean;
  checkedAt: number | null;
  stale: boolean;
}

const statusStyle: Record<DayRouteAuditStatus, string> = {
  OK: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  WARNING: 'border-amber-100 bg-amber-50 text-amber-700',
  ERROR: 'border-red-100 bg-red-50 text-red-700',
};

const statusLabel: Record<DayRouteAuditStatus, string> = {
  OK: '정상',
  WARNING: '확인 필요',
  ERROR: '계산 불가',
};

export default function DayRouteAuditModal({ result, onClose, onApplyLeg, onApplyAll, onRecalculate, applying, recalculating, checkedAt, stale }: Props) {
  return (
    <div className="fixed inset-0 z-[18000] flex items-end justify-center bg-black/45 p-0 md:items-center md:p-6" onClick={onClose}>
      <section className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-t-3xl bg-white shadow-2xl md:rounded-3xl" onClick={event => event.stopPropagation()}>
        <header className="flex items-start justify-between border-b border-gray-100 p-5 md:p-6">
          <div>
            <div className="text-xs font-black tracking-wider text-blue-500">DAY ROUTE AUDIT</div>
            <h2 className="mt-1 text-xl font-black text-gray-900">하루 전체 경로 점검</h2>
            <p className="mt-1 text-xs text-gray-500">결과를 확인한 뒤 원하는 이동시간만 일정에 적용할 수 있습니다.</p>
            {checkedAt && <p className="mt-1 text-[10px] font-bold text-gray-400">마지막 점검 {new Date(checkedAt).toLocaleString('ko-KR')}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-1 text-2xl text-gray-400 hover:bg-gray-100" aria-label="닫기">×</button>
        </header>

        <div className="max-h-[calc(90vh-112px)] overflow-y-auto p-5 md:p-6">
          {stale && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-700">
              일정이 변경되어 이 결과는 오래되었습니다. 이전 예상시간은 적용할 수 없으며 다시 점검해야 합니다.
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Summary label="전체 구간" value={`${result.totalLegs}개`} />
            <Summary label="계산 성공" value={`${result.calculatedLegs}개`} />
            <Summary label="확인 필요" value={`${result.issueCount}개`} warning={result.issueCount > 0} />
            <Summary label="예상 이동 합계" value={`${result.estimatedTotalMinutes}분`} />
          </div>

          {result.legs.length === 0 ? (
            <div className="mt-5 rounded-2xl border-2 border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
              점검할 이동 구간이 없습니다. 위치가 있는 일정을 두 개 이상 추가해 주세요.
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {result.legs.map((leg, index) => (
                <article key={`${leg.fromScheduleId}-${leg.toScheduleId}`} className="rounded-2xl border border-gray-100 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-black text-gray-400">구간 {index + 1}</div>
                      <div className="mt-1 truncate text-sm font-black text-gray-800">{leg.fromSpotName} → {leg.toSpotName}</div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black ${statusStyle[leg.status]}`}>
                      {statusLabel[leg.status]}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-gray-500">
                    <span className="rounded-lg bg-gray-50 px-2 py-1">{leg.transportation ?? '수단 미지정'}</span>
                    <span className="rounded-lg bg-blue-50 px-2 py-1 text-blue-600">입력 {leg.plannedDurationMinutes}분</span>
                    {leg.estimatedDurationMinutes != null && <span className="rounded-lg bg-violet-50 px-2 py-1 text-violet-600">예상 {leg.estimatedDurationMinutes}분</span>}
                    {leg.estimatedArrivalTime && <span className="rounded-lg bg-gray-50 px-2 py-1">예상 도착 {leg.estimatedArrivalTime.slice(0, 5)}</span>}
                  </div>
                  <p className={`mt-3 text-xs font-bold ${leg.status === 'OK' ? 'text-emerald-600' : leg.status === 'WARNING' ? 'text-amber-600' : 'text-red-600'}`}>
                    {leg.message}
                  </p>
                  {leg.estimatedDurationMinutes != null && !stale && (
                    <button
                      type="button"
                      disabled={applying}
                      onClick={() => onApplyLeg(leg)}
                      className="mt-3 w-full rounded-xl border border-blue-200 bg-blue-50 py-2 text-xs font-black text-blue-700 hover:bg-blue-100 disabled:cursor-wait disabled:opacity-50"
                    >
                      이 구간 예상시간 적용
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
          {result.calculatedLegs > 1 && !stale && (
            <button
              type="button"
              disabled={applying}
              onClick={onApplyAll}
              className="mt-5 w-full rounded-2xl bg-blue-600 py-3 text-sm font-black text-white shadow-lg hover:bg-blue-700 disabled:cursor-wait disabled:opacity-50"
            >
              {applying ? '적용 중…' : `계산된 ${result.calculatedLegs}개 구간 전체 적용`}
            </button>
          )}
          <button
            type="button"
            disabled={recalculating}
            onClick={onRecalculate}
            className="mt-3 w-full rounded-2xl border border-gray-200 bg-white py-3 text-sm font-black text-gray-600 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-50"
          >
            {recalculating ? '다시 점검 중…' : '경로 다시 점검'}
          </button>
        </div>
      </section>
    </div>
  );
}

function Summary({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 ${warning ? 'bg-amber-50' : 'bg-gray-50'}`}>
      <div className={`text-[10px] font-bold ${warning ? 'text-amber-500' : 'text-gray-400'}`}>{label}</div>
      <div className={`mt-1 text-lg font-black ${warning ? 'text-amber-700' : 'text-gray-800'}`}>{value}</div>
    </div>
  );
}
