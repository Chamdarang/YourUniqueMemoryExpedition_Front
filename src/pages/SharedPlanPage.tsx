import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { APIProvider } from '@vis.gl/react-google-maps';
import { acceptPlanShareLink, getPublicPlanDaySchedules, getPublicPlanShare } from '../api/planShareApi';
import SharedPlanDayMap from '../components/plan/SharedPlanDayMap';
import type { PublicPlanShare, PublicPlanShareSchedule } from '../types/planShare';
import { usePlanLiveUpdates } from '../hooks/usePlanLiveUpdates';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

const transportationLabels: Record<string, string> = {
  WALK: '도보', BUS: '버스', TRAIN: '열차', SHIP: '배', AIRPLANE: '비행기',
  TAXI: '택시', CAR: '자동차', BICYCLE: '자전거', MOTORCYCLE: '오토바이',
};

function dateForDay(startDate: string | null, dayOrder: number) {
  if (!startDate) return null;
  const [year, month, day] = startDate.split('-').map(Number);
  const date = new Date(year, month - 1, day + dayOrder - 1);
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

export default function SharedPlanPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState(() => window.location.hash.slice(1));
  const [plan, setPlan] = useState<PublicPlanShare | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');
  const [expandedDays, setExpandedDays] = useState<Record<number, boolean>>({});
  const [daySchedules, setDaySchedules] = useState<Record<number, PublicPlanShareSchedule[]>>({});
  const [dayLoading, setDayLoading] = useState<Record<number, boolean>>({});
  const [dayErrors, setDayErrors] = useState<Record<number, string>>({});
  const refreshRequestId = useRef(0);
  const dayRequestIds = useRef<Record<number, number>>({});
  const tokenRef = useRef(token);
  const loggedIn = Boolean(localStorage.getItem('username'));

  const continueToLogin = () => {
    try { sessionStorage.setItem('yume:pending-edit-share-token', token); } catch { /* Link remains in this page if storage is unavailable. */ }
    navigate('/login');
  };

  const acceptEditAccess = async () => {
    if (!token || accepting) return;
    setAccepting(true); setAcceptError('');
    try {
      const planId = await acceptPlanShareLink(token);
      navigate(`/plans/${planId}`, { replace: true });
    } catch (reason) { setAcceptError(reason instanceof Error ? reason.message : '편집 권한을 받지 못했습니다.'); }
    finally { setAccepting(false); }
  };

  useEffect(() => {
    const readTokenFromHash = () => setToken(window.location.hash.slice(1));
    window.addEventListener('hashchange', readTokenFromHash);
    return () => window.removeEventListener('hashchange', readTokenFromHash);
  }, []);

  useEffect(() => {
    tokenRef.current = token;
    let active = true;
    refreshRequestId.current += 1;
    dayRequestIds.current = {};
    setExpandedDays({});
    setDaySchedules({});
    setDayLoading({});
    setDayErrors({});
    if (!token) {
      setError('공유 링크에 일정 접근 정보가 없습니다.');
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    setError('');
    setPlan(null);
    getPublicPlanShare(token)
      .then(value => { if (active) setPlan(value); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '공유 일정을 불러오지 못했습니다.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const loadDaySchedules = useCallback(async (dayOrder: number) => {
    if (!token) return;
    const requestId = (dayRequestIds.current[dayOrder] || 0) + 1;
    dayRequestIds.current[dayOrder] = requestId;
    setDayLoading(current => ({ ...current, [dayOrder]: true }));
    setDayErrors(current => ({ ...current, [dayOrder]: '' }));
    try {
      const schedules = await getPublicPlanDaySchedules(token, dayOrder);
      if (tokenRef.current !== token || dayRequestIds.current[dayOrder] !== requestId) return;
      setDaySchedules(current => ({ ...current, [dayOrder]: schedules }));
    } catch (reason) {
      if (tokenRef.current !== token || dayRequestIds.current[dayOrder] !== requestId) return;
      setDayErrors(current => ({ ...current, [dayOrder]: reason instanceof Error ? reason.message : '날짜 일정을 불러오지 못했습니다.' }));
    } finally {
      if (tokenRef.current === token && dayRequestIds.current[dayOrder] === requestId) {
        setDayLoading(current => ({ ...current, [dayOrder]: false }));
      }
    }
  }, [token]);

  const toggleDay = (dayOrder: number) => {
    const isExpanded = Boolean(expandedDays[dayOrder]);
    setExpandedDays(current => ({ ...current, [dayOrder]: !current[dayOrder] }));
    if (!isExpanded && !Object.prototype.hasOwnProperty.call(daySchedules, dayOrder)) {
      void loadDaySchedules(dayOrder);
    }
  };

  const refreshSharedPlan = useCallback(async () => {
    if (!token) return;
    const requestId = ++refreshRequestId.current;
    try {
      const latestPlan = await getPublicPlanShare(token);
      if (requestId !== refreshRequestId.current) return;
      setPlan(latestPlan);
      setError('');
      const expandedOrders = Object.entries(expandedDays)
        .filter(([, expanded]) => expanded)
        .map(([dayOrder]) => Number(dayOrder))
        .filter(dayOrder => latestPlan.days.some(day => day.dayOrder === dayOrder));
      await Promise.all(expandedOrders.map(loadDaySchedules));
    } catch (reason) {
      if (requestId !== refreshRequestId.current) return;
      setError(reason instanceof Error ? reason.message : '공유 일정을 새로 불러오지 못했습니다.');
    }
  }, [expandedDays, loadDaySchedules, token]);
  const handleLiveUpdateUnavailable = useCallback((status: number) => {
    if (status !== 404 && status !== 410) return;
    refreshRequestId.current += 1;
    setPlan(null);
    setError('공유 링크가 만료되었거나 더 이상 사용할 수 없습니다.');
  }, []);
  const liveConnectionState = usePlanLiveUpdates(
    plan?.planId,
    refreshSharedPlan,
    token || undefined,
    handleLiveUpdateUnavailable,
  );

  if (loading) {
    return <main className="flex h-dvh items-center justify-center overflow-y-auto overscroll-y-contain bg-slate-50 px-4 text-sm font-bold text-slate-500">공유 일정을 불러오는 중…</main>;
  }

  if (!plan) {
    return (
      <main className="flex h-dvh items-center justify-center overflow-y-auto overscroll-y-contain bg-slate-50 px-4">
        <section className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-sm">
          <div className="text-4xl">🔒</div>
          <h1 className="mt-4 text-xl font-black text-slate-900">공유 일정을 열 수 없습니다</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{error || '공유 링크가 만료되었거나 더 이상 사용할 수 없습니다.'}</p>
          <Link to="/" className="yume-button yume-button-primary mt-6">YUME 홈</Link>
        </section>
      </main>
    );
  }

  const sharedPlan = (
    <main className="h-dvh overflow-y-auto overscroll-y-contain bg-slate-50 px-4 py-8 text-slate-800 md:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 rounded-3xl bg-gradient-to-br from-blue-700 to-indigo-800 p-6 text-white shadow-lg md:p-9">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-black uppercase tracking-[0.25em] text-blue-100">
            <span>YUME · Shared trip</span>
            <span role="status" className="normal-case tracking-normal">
              {liveConnectionState === 'connected' ? '● 실시간 업데이트 중' : liveConnectionState === 'unavailable' ? '실시간 업데이트 연결 끊김' : liveConnectionState === 'paused' ? '탭이 숨겨져 있어 연결을 쉬는 중' : '실시간 연결 중…'}
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-black md:text-4xl">{plan.planName}</h1>
          {(plan.planStartDate || plan.planEndDate) && <p className="mt-3 text-sm font-semibold text-blue-100">{plan.planStartDate || '날짜 미정'} ~ {plan.planEndDate || '날짜 미정'}</p>}
          {plan.planMemo && <p className="mt-5 whitespace-pre-wrap rounded-2xl bg-white/10 p-4 text-sm leading-relaxed">{plan.planMemo}</p>}
          <p className="mt-5 text-xs text-blue-100">{plan.accessMode === 'EDIT' ? '편집 권한 링크 · 현재는 미리보기' : '보기 전용 링크'}</p>
          {plan.accessMode === 'EDIT' && <div className="mt-4 rounded-xl bg-white p-4 text-slate-800">
            <p className="text-sm font-semibold">함께 편집하려면 YUME 계정으로 참여해 주세요.</p>
            {acceptError && <p role="alert" className="mt-2 text-xs text-red-600">{acceptError}</p>}
            {loggedIn ? <button type="button" disabled={accepting} onClick={() => void acceptEditAccess()} className="yume-button yume-button-primary mt-3">{accepting ? '참여 중…' : '편집자로 참여'}</button> : <button type="button" onClick={continueToLogin} className="yume-button yume-button-primary mt-3">로그인하고 참여</button>}
          </div>}
        </header>

        {error && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>{error} 현재 화면에는 마지막으로 불러온 일정이 표시됩니다.</p>
          <button type="button" onClick={() => void refreshSharedPlan()} className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100">다시 불러오기</button>
        </div>}

        <div className="space-y-5">
          {plan.days.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-sm font-semibold text-slate-500">아직 공유할 날짜 일정이 없습니다.</p>}
          {plan.days.map(day => (
            <section key={`${day.dayOrder}-${day.dayName}`} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <button type="button" aria-expanded={Boolean(expandedDays[day.dayOrder])} onClick={() => toggleDay(day.dayOrder)} className="w-full border-b border-slate-100 bg-white px-5 py-4 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 md:px-7">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-xl font-black text-slate-900">DAY {day.dayOrder} · {day.dayName}</h2>
                  <span className="flex items-center gap-2 text-xs font-bold text-slate-400"><span>{dateForDay(plan.planStartDate, day.dayOrder)}</span><span aria-hidden="true">{expandedDays[day.dayOrder] ? '접기 ▲' : '일정 보기 ▼'}</span></span>
                </div>
                {day.memo && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{day.memo}</p>}
              </button>
              {expandedDays[day.dayOrder] && (dayLoading[day.dayOrder] ? (
                <p role="status" className="px-5 py-8 text-center text-sm font-semibold text-slate-500">이 날짜 일정을 불러오는 중…</p>
              ) : dayErrors[day.dayOrder] ? (
                <div className="px-5 py-6 text-center">
                  <p role="alert" className="text-sm text-red-700">{dayErrors[day.dayOrder]}</p>
                  <button type="button" onClick={() => void loadDaySchedules(day.dayOrder)} className="yume-button yume-button-primary mt-3">다시 시도</button>
                </div>
              ) : Object.prototype.hasOwnProperty.call(daySchedules, day.dayOrder) ? <>
                <SharedPlanDayMap schedules={daySchedules[day.dayOrder]} mapsEnabled={Boolean(GOOGLE_MAPS_API_KEY)} />
                <ol className="divide-y divide-slate-100">
                {daySchedules[day.dayOrder].map((schedule, index) => (
                  <li key={`${day.dayOrder}-${schedule.scheduleOrder}-${index}`} className="px-5 py-4 md:px-7">
                    {index > 0 && (schedule.movingDuration > 0 || schedule.movingMemo) && (
                      <div className="mb-3 rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">
                        {schedule.transportation ? transportationLabels[schedule.transportation] || '이동' : '이동'}
                        {schedule.movingDuration > 0 ? ` · ${schedule.movingDuration}분` : ''}
                        {schedule.movingMemo ? ` · ${schedule.movingMemo}` : ''}
                      </div>
                    )}
                    <div className="flex items-start gap-3">
                      <span className="w-12 shrink-0 pt-0.5 text-sm font-black tabular-nums text-blue-700">{schedule.startTime?.slice(0, 5) || '—'}</span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-black text-slate-900">{schedule.spotName || '장소 미정'}</h3>
                        <p className="mt-1 text-xs font-semibold text-slate-400">{schedule.duration}분 체류{schedule.endTime ? ` · ${schedule.endTime.slice(0, 5)} 종료` : ''}</p>
                        {schedule.memo && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{schedule.memo}</p>}
                      </div>
                      {schedule.lat != null && schedule.lng != null && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${schedule.lat},${schedule.lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
                        >지도</a>
                      )}
                    </div>
                  </li>
                ))}
                {daySchedules[day.dayOrder].length === 0 && <li className="px-5 py-6 text-center text-sm text-slate-400 md:px-7">등록된 일정이 없습니다.</li>}
                </ol>
              </> : null)}
            </section>
          ))}
        </div>
        <footer className="py-8 text-center text-xs font-semibold text-slate-400">{plan.accessMode === 'EDIT' ? '편집 권한은 YUME 로그인 후 참여를 수락하면 적용됩니다.' : '이 페이지는 일정 확인용 읽기 전용 공유입니다.'}</footer>
      </div>
    </main>
  );

  return GOOGLE_MAPS_API_KEY ? (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['maps', 'marker']} language="ko" region="KR">
      {sharedPlan}
    </APIProvider>
  ) : sharedPlan;
}
