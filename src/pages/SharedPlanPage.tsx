import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { APIProvider } from '@vis.gl/react-google-maps';
import { acceptPlanShareLink, getPublicPlanShare } from '../api/planShareApi';
import SharedPlanDayMap from '../components/plan/SharedPlanDayMap';
import type { PublicPlanShare } from '../types/planShare';

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
  const loggedIn = Boolean(localStorage.getItem('accessToken'));

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
    let active = true;
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
          <Link to="/" className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700">YUME 홈</Link>
        </section>
      </main>
    );
  }

  const sharedPlan = (
    <main className="h-dvh overflow-y-auto overscroll-y-contain bg-slate-50 px-4 py-8 text-slate-800 md:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 rounded-3xl bg-gradient-to-br from-blue-700 to-indigo-800 p-6 text-white shadow-lg md:p-9">
          <div className="text-xs font-black uppercase tracking-[0.25em] text-blue-100">YUME · Shared trip</div>
          <h1 className="mt-3 text-3xl font-black md:text-4xl">{plan.planName}</h1>
          {(plan.planStartDate || plan.planEndDate) && <p className="mt-3 text-sm font-semibold text-blue-100">{plan.planStartDate || '날짜 미정'} ~ {plan.planEndDate || '날짜 미정'}</p>}
          {plan.planMemo && <p className="mt-5 whitespace-pre-wrap rounded-2xl bg-white/10 p-4 text-sm leading-relaxed">{plan.planMemo}</p>}
          <p className="mt-5 text-xs text-blue-100">{plan.accessMode === 'EDIT' ? '편집 권한 링크 · 현재는 미리보기' : '보기 전용 링크'}</p>
          {plan.accessMode === 'EDIT' && <div className="mt-4 rounded-xl bg-white p-4 text-slate-800">
            <p className="text-sm font-semibold">함께 편집하려면 YUME 계정으로 참여해 주세요.</p>
            {acceptError && <p role="alert" className="mt-2 text-xs text-red-600">{acceptError}</p>}
            {loggedIn ? <button type="button" disabled={accepting} onClick={() => void acceptEditAccess()} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{accepting ? '참여 중…' : '편집자로 참여'}</button> : <button type="button" onClick={continueToLogin} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">로그인하고 참여</button>}
          </div>}
        </header>

        <div className="space-y-5">
          {plan.days.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-sm font-semibold text-slate-500">아직 공유할 날짜 일정이 없습니다.</p>}
          {plan.days.map(day => (
            <section key={`${day.dayOrder}-${day.dayName}`} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <header className="border-b border-slate-100 bg-white px-5 py-4 md:px-7">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-xl font-black text-slate-900">DAY {day.dayOrder} · {day.dayName}</h2>
                  <span className="text-xs font-bold text-slate-400">{dateForDay(plan.planStartDate, day.dayOrder)}</span>
                </div>
                {day.memo && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{day.memo}</p>}
              </header>
              <SharedPlanDayMap schedules={day.schedules} mapsEnabled={Boolean(GOOGLE_MAPS_API_KEY)} />
              <ol className="divide-y divide-slate-100">
                {day.schedules.map((schedule, index) => (
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
                {day.schedules.length === 0 && <li className="px-5 py-6 text-center text-sm text-slate-400 md:px-7">등록된 일정이 없습니다.</li>}
              </ol>
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
