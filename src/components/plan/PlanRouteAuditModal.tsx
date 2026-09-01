import type { DayRouteAuditLeg, PlanRouteAuditResponse } from '../../types/route';

interface Props {
  result: PlanRouteAuditResponse;
  loading: boolean;
  checkedAt: number | null;
  stale: boolean;
  progress: { completedLegs: number; totalLegs: number; completedDays: number; totalDays: number } | null;
  onCalculateRoutes: () => void;
  onCancelCalculation: () => void;
  onRefresh: () => void;
  onOpenDay: (dayId: number) => void;
  onOpenIssue: (dayId: number, scheduleId: number) => void;
  onAuditDay: (dayId: number) => void;
  onClose: () => void;
}

const localRouteMessages = new Set([
  '출발지 또는 도착지의 위치 정보가 없습니다.',
  '이동수단이 지정되지 않았습니다.',
]);

const routeIssues = (legs: DayRouteAuditLeg[]) => legs.filter(
  leg => leg.status !== 'OK' && !localRouteMessages.has(leg.message),
);

export default function PlanRouteAuditModal({ result, loading, checkedAt, stale, progress, onCalculateRoutes, onCancelCalculation, onRefresh, onOpenDay, onOpenIssue, onAuditDay, onClose }: Props) {
  const issueDays = result.days.filter(day => day.issueCount > 0);
  const cleanDays = result.days.filter(day => day.issueCount === 0);
  const routeCalculationAllowed = result.totalLegs <= result.maxRouteCalculationLegs;
  const calculatingRoutes = loading && progress != null;

  return (
    <div className="fixed inset-0 z-[18000] flex items-end justify-center bg-black/45 md:items-center md:p-6" onClick={onClose}>
      <section className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-t-3xl bg-white shadow-2xl md:rounded-3xl" onClick={event => event.stopPropagation()}>
        <header className="flex items-start justify-between border-b border-gray-100 p-5 md:p-6">
          <div>
            <div className="text-xs font-black tracking-wider text-blue-500">PLAN CHECK</div>
            <h2 className="mt-1 text-xl font-black text-gray-900">여행 전체 일정 점검</h2>
            <p className="mt-1 text-xs text-gray-500">문제 항목을 선택하면 해당 일정이 펼쳐지고 바로 수정할 수 있습니다.</p>
            {checkedAt && <p className="mt-1 text-[10px] font-bold text-gray-400">마지막 점검 {new Date(checkedAt).toLocaleString('ko-KR')}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-1 text-2xl text-gray-400 hover:bg-gray-100" aria-label="닫기">×</button>
        </header>

        <div className="max-h-[calc(92vh-112px)] overflow-y-auto p-5 md:p-6">
          {stale && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-700">
              일정이 변경되어 이전 점검 결과가 오래되었습니다. 기본 점검을 새로 실행해 주세요.
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Summary label="전체 날짜" value={`${result.totalDays}일`} />
            <Summary label="세부 일정" value={`${result.totalSchedules}개`} />
            <Summary label="이동 구간" value={`${result.totalLegs}개`} />
            <Summary label="발견 항목" value={`${result.issueCount}개`} warning={result.issueCount > 0} />
          </div>

          {!result.routesCalculated && result.totalLegs > 0 && !stale && (
            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-black text-blue-900">실제 이동시간도 확인할까요?</div>
                  <p className="mt-1 text-xs text-blue-600">
                    캐시에 없는 {result.totalLegs}개 구간은 외부 경로 API를 호출할 수 있습니다.
                  </p>
                  {!routeCalculationAllowed && (
                    <p className="mt-1 text-xs font-bold text-red-600">
                      전체 계산 한도는 {result.maxRouteCalculationLegs}개입니다. 날짜별 경로 점검을 이용해 주세요.
                    </p>
                  )}
                  {progress && (
                    <div className="mt-2">
                      <div className="mb-1 flex justify-between text-[10px] font-black text-blue-700">
                        <span>{progress.completedDays}/{progress.totalDays}일 점검</span>
                        <span>{progress.completedLegs}/{progress.totalLegs}구간</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-blue-100">
                        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress.totalLegs ? Math.round(progress.completedLegs / progress.totalLegs * 100) : 0}%` }} />
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={(loading && !calculatingRoutes) || (!loading && !routeCalculationAllowed)}
                  onClick={calculatingRoutes ? onCancelCalculation : onCalculateRoutes}
                  className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40 ${calculatingRoutes ? 'bg-gray-600 hover:bg-gray-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                  {calculatingRoutes ? '점검 취소' : loading ? '기본 점검 중…' : '경로까지 점검'}
                </button>
              </div>
            </div>
          )}

          {result.routesCalculated && (
            <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">
              실제 경로 계산을 포함한 결과입니다. 예상시간 적용은 각 날짜의 하루 경로 점검에서 할 수 있습니다.
            </div>
          )}

          <div className="mt-5 flex items-center justify-between">
            <h3 className="text-sm font-black text-gray-800">확인할 날짜</h3>
            {cleanDays.length > 0 && <span className="text-xs font-bold text-emerald-600">문제 없음 {cleanDays.length}일</span>}
          </div>

          {issueDays.length === 0 ? (
            <div className="mt-3 rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/50 p-8 text-center">
              <div className="text-3xl">✅</div>
              <p className="mt-2 text-sm font-black text-emerald-700">확인할 문제가 없습니다.</p>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {issueDays.map(day => {
                const calculatedIssues = day.routeAudit ? routeIssues(day.routeAudit.legs) : [];
                return (
                  <article key={`audit-day-${day.dayOrder}`} className="rounded-2xl border border-gray-100 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-black text-blue-500">DAY {day.dayOrder}</div>
                        <div className="mt-0.5 text-sm font-black text-gray-900">{day.dayName}</div>
                        <div className="mt-1 text-[11px] font-bold text-gray-400">일정 {day.scheduleCount}개 · 확인 {day.issueCount}개</div>
                      </div>
                      {day.dayId != null && (
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <button type="button" onClick={() => onOpenDay(day.dayId as number)} className="text-xs font-black text-blue-600 hover:text-blue-800">
                            일정 열기 →
                          </button>
                          {day.scheduleCount > 1 && (
                            <button type="button" onClick={() => onAuditDay(day.dayId as number)} className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[10px] font-black text-violet-700 hover:bg-violet-100">
                              🧭 경로 점검
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="mt-3 space-y-2 border-t border-gray-50 pt-3">
                      {day.scheduleIssues.map((issue, index) => (
                        <IssueLine
                          key={`${issue.code}-${issue.scheduleId}-${index}`}
                          severity={issue.severity}
                          label={issue.spotName}
                          message={issue.message}
                          onClick={day.dayId != null && issue.scheduleId != null ? () => onOpenIssue(day.dayId as number, issue.scheduleId as number) : undefined}
                        />
                      ))}
                      {calculatedIssues.map((leg, index) => (
                        <IssueLine
                          key={`route-${leg.fromScheduleId}-${leg.toScheduleId}-${index}`}
                          severity={leg.status === 'ERROR' ? 'ERROR' : 'WARNING'}
                          label={`${leg.fromSpotName} → ${leg.toSpotName}`}
                          message={leg.message}
                          onClick={day.dayId != null ? () => onOpenIssue(day.dayId as number, leg.toScheduleId) : undefined}
                        />
                      ))}
                      {day.routeAuditError && (
                        <IssueLine severity="ERROR" label="경로 점검" message={day.routeAuditError} />
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {cleanDays.length > 0 && (
            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
              <div className="flex items-center gap-2 text-xs font-black text-emerald-700">
                <span>✓</span>
                <span>문제 없는 날짜</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {cleanDays.map(day => (
                  <button
                    key={`clean-day-${day.dayOrder}`}
                    type="button"
                    disabled={day.dayId == null}
                    onClick={() => day.dayId != null && onOpenDay(day.dayId)}
                    className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-left text-xs font-bold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-default"
                  >
                    {day.dayOrder}일차 · {day.dayName}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={onRefresh}
            className="mt-4 w-full rounded-2xl border border-gray-200 bg-white py-3 text-sm font-black text-gray-600 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-50"
          >
            {loading ? '점검 중…' : '기본 점검 다시 실행'}
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

function IssueLine({ severity, label, message, onClick }: { severity: 'WARNING' | 'ERROR'; label: string; message: string; onClick?: () => void }) {
  const error = severity === 'ERROR';
  const className = `w-full rounded-xl px-3 py-2 text-left text-xs ${error ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'} ${onClick ? 'cursor-pointer transition hover:ring-2 hover:ring-blue-200' : ''}`;
  const content = <>
      <span className="font-black">{label}</span>
      <span className="ml-2 font-medium">{message}</span>
      {onClick && <span className="ml-2 font-black text-blue-600">수정 →</span>}
    </>;
  return onClick
    ? <button type="button" onClick={onClick} className={className}>{content}</button>
    : <div className={className}>{content}</div>;
}
