import { useCallback, useEffect, useRef, useState } from 'react';
import { auditDayRoute, auditPlanRoutes } from '../api/routeApi';
import type { FeedbackContextValue } from '../components/common/feedbackContext';
import type { PlanRouteAuditResponse } from '../types/route';

type PlanAuditProgress = {
  completedLegs: number;
  totalLegs: number;
  completedDays: number;
  totalDays: number;
};

const duplicatedLocalRouteMessages = new Set([
  '출발지 또는 도착지의 위치 정보가 없습니다.',
  '이동수단이 지정되지 않았습니다.',
]);

const countAdditionalRouteIssues = (routeAudit: NonNullable<PlanRouteAuditResponse['days'][number]['routeAudit']>) =>
  routeAudit.legs.filter(leg => leg.status !== 'OK' && !duplicatedLocalRouteMessages.has(leg.message)).length;

export function usePlanRouteAudit(planId: number, feedback: Pick<FeedbackContextValue, 'confirm' | 'showToast'>) {
  const [result, setResult] = useState<PlanRouteAuditResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const [progress, setProgress] = useState<PlanAuditProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultRef = useRef<PlanRouteAuditResponse | null>(null);

  useEffect(() => {
    setResult(null);
    resultRef.current = null;
    setOpen(false);
    setLoading(false);
    setCheckedAt(null);
    setStale(false);
    setProgress(null);
    abortRef.current?.abort();
    abortRef.current = null;
  }, [planId]);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const markStale = useCallback(() => {
    if (resultRef.current) setStale(true);
  }, []);

  const getAuditedScheduleCount = useCallback((dayId: number) =>
    resultRef.current?.days.find(day => day.dayId === dayId)?.scheduleCount,
  []);

  const runAudit = useCallback(async (force = false) => {
    if (result && !force) {
      setOpen(true);
      return;
    }
    if (loading) return;
    setProgress(null);
    setLoading(true);
    try {
      const nextResult = await auditPlanRoutes(planId);
      resultRef.current = nextResult;
      setResult(nextResult);
      setOpen(true);
      setCheckedAt(Date.now());
      setStale(false);
      setProgress(null);
    } catch (error) {
      feedback.showToast({
        message: error instanceof Error ? error.message : '여행 전체 일정을 점검하지 못했습니다.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [feedback, loading, planId, result]);

  const calculateRoutes = useCallback(async () => {
    if (!result || loading || stale) return;
    if (!await feedback.confirm({
      title: '여행 전체 경로 점검',
      message: `캐시에 없는 최대 ${result.totalLegs}개 구간은 외부 경로 API를 호출합니다. 완료된 날짜부터 결과를 표시합니다.`,
      confirmLabel: '경로까지 점검',
    })) return;

    const targets = result.days
      .filter(day => day.dayId != null && day.scheduleCount > 1)
      .map(day => ({ dayId: day.dayId as number, legs: day.scheduleCount - 1 }));
    const totalLegs = targets.reduce((sum, target) => sum + target.legs, 0);
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setProgress({ completedLegs: 0, totalLegs, completedDays: 0, totalDays: targets.length });
    let cursor = 0;
    try {
      const worker = async () => {
        while (!controller.signal.aborted) {
          const targetIndex = cursor++;
          if (targetIndex >= targets.length) return;
          const target = targets[targetIndex];
          let routeAudit = null;
          let routeAuditError: string | null = null;
          try {
            routeAudit = await auditDayRoute(target.dayId, controller.signal);
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            routeAuditError = error instanceof Error ? error.message : '이 날짜의 경로를 점검하지 못했습니다.';
          }
          setResult(previous => {
            if (!previous) return previous;
            const days = previous.days.map(day => {
              if (day.dayId !== target.dayId) return day;
              const routeIssueCount = routeAudit ? countAdditionalRouteIssues(routeAudit) : 1;
              return {
                ...day,
                routeAudit,
                routeAuditError,
                issueCount: day.scheduleIssues.length + routeIssueCount,
              };
            });
            return { ...previous, days, issueCount: days.reduce((sum, day) => sum + day.issueCount, 0) };
          });
          setProgress(previous => previous && ({
            ...previous,
            completedLegs: previous.completedLegs + target.legs,
            completedDays: previous.completedDays + 1,
          }));
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, targets.length) }, () => worker()));
      if (!controller.signal.aborted) {
        setResult(previous => previous && ({ ...previous, routesCalculated: true }));
        setCheckedAt(Date.now());
      } else {
        feedback.showToast({ message: '경로 점검을 취소했습니다. 완료된 결과는 유지됩니다.', type: 'info' });
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }, [feedback, loading, result, stale]);

  const cancelCalculation = useCallback(() => abortRef.current?.abort(), []);

  return {
    result,
    open,
    loading,
    checkedAt,
    stale,
    progress,
    setOpen,
    runAudit,
    calculateRoutes,
    cancelCalculation,
    markStale,
    getAuditedScheduleCount,
  };
}
