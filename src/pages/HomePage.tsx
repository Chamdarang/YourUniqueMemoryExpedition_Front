import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import {
  APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary
} from "@vis.gl/react-google-maps";

// API
import { getUpcomingPlan } from "../api/planApi";
import { getPlanDays } from "../api/dayApi";
import { getSchedulesByDay } from "../api/scheduleApi";

// Utils
import { getSpotTypeInfo } from "../utils/spotUtils";

// Types
import type { PlanResponse } from "../types/plan";
import type { DayScheduleResponse } from "../types/schedule";
import type { Transportation } from "../types/enums";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// 🛠️ [유틸] 헬퍼 함수들
const cleanMemoTags = (memo: string) => {
  if (!memo) return '';
  return memo.replace(/#si:\s*\d+/g, '').replace(/#mi:\s*\d+/g, '').replace(/#visited/g, '').trim();
};

const parseInjuryFromMemo = (memo: string, tag: string) => {
  const regex = new RegExp(`${tag}\\s*(\\d+)`);
  const match = memo?.match(regex);
  return match ? parseInt(match[1]) : 0;
};

const timeToMinutes = (time: string) => {
  if (!time) return 0;
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const minutesToTime = (minutes: number) => {
  let h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h >= 24) h = h % 24;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const addTime = (baseTime: string, duration: number) => {
  const totalMinutes = timeToMinutes(baseTime) + duration;
  return minutesToTime(totalMinutes);
};

const getTransIcon = (type: Transportation) => {
  const icons: Record<string, string> = { WALK: '🚶', BUS: '🚌', TRAIN: '🚃', TAXI: '🚕', SHIP: '🚢', AIRPLANE: '✈️' };
  return icons[type] || '➡️';
};

const getTransLabel = (type: Transportation) => {
  const labels: Record<string, string> = { WALK: '도보', BUS: '버스', TRAIN: '열차', TAXI: '택시', SHIP: '배', AIRPLANE: '비행기' };
  return labels[type] || '이동';
};

const getCurrentMinutes = () => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};

const recalculateSchedules = (items: DayScheduleResponse[]): DayScheduleResponse[] => {
  if (items.length === 0) return [];
  const newItems = items.map(item => ({ ...item }));

  if (!newItems[0].startTime) newItems[0].startTime = "10:00";
  newItems[0].startTime = newItems[0].startTime.substring(0, 5);

  newItems[0].endTime = addTime(newItems[0].startTime, newItems[0].duration);

  for (let i = 1; i < newItems.length; i++) {
    const prevItem = newItems[i - 1];
    const currentItem = newItems[i];
    const minStartTime = timeToMinutes(prevItem.endTime) + currentItem.movingDuration;
    const currentStartTime = timeToMinutes(currentItem.startTime || "00:00");
    let finalStartTime = minStartTime;
    if (currentItem.startTime) {
      finalStartTime = Math.max(minStartTime, currentStartTime);
    }
    currentItem.startTime = minutesToTime(finalStartTime);
    currentItem.endTime = addTime(currentItem.startTime, currentItem.duration);
  }
  return newItems;
};

function MapUpdater({ schedules, activeId, activeMoveIndex }: { schedules: DayScheduleResponse[], activeId: number | undefined, activeMoveIndex: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map || schedules.length === 0) return;
    if (activeId) {
      const activeItem = schedules.find(s => s.id === activeId);
      if (activeItem && Number(activeItem.lat) !== 0) {
        map.panTo({ lat: Number(activeItem.lat), lng: Number(activeItem.lng) });
        map.setZoom(16);
        return;
      }
    }
    const bounds = new google.maps.LatLngBounds();
    let hasPoint = false;
    schedules.forEach(s => {
      if (Number(s.lat) !== 0) { bounds.extend({ lat: Number(s.lat), lng: Number(s.lng) }); hasPoint = true; }
    });
    if (hasPoint) map.fitBounds(bounds, 50);
  }, [map, schedules, activeId, activeMoveIndex]);
  return null;
}

function MapDirections({ schedules }: { schedules: DayScheduleResponse[] }) {
  const map = useMap();
  const mapsLibrary = useMapsLibrary("maps");
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  useEffect(() => {
    if (!map || !mapsLibrary) return;
    if (polylineRef.current) polylineRef.current.setMap(null);
    const path = schedules.map(s => ({ lat: Number(s.lat), lng: Number(s.lng) }))
        .filter(pos => !isNaN(pos.lat) && pos.lat !== 0);
    if (path.length > 0) {
      const newPolyline = new mapsLibrary.Polyline({
        path, geodesic: true, strokeColor: "#3B82F6", strokeOpacity: 0.8, strokeWeight: 4,
        icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW }, offset: '50%', repeat: '50px' }]
      });
      newPolyline.setMap(map);
      polylineRef.current = newPolyline;
    }
    return () => polylineRef.current?.setMap(null);
  }, [map, mapsLibrary, schedules]);
  return null;
}

function NumberedMarker({ number, color = "#3B82F6", active = false }: { number: number, color?: string, active?: boolean }) {
  return (
      <div className={`relative flex flex-col items-center justify-center filter drop-shadow-md transition-transform duration-300 ${active ? 'scale-125 z-50' : 'scale-90'}`}>
        <svg width="30" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.16 0 0 7.16 0 16C0 24.8 16 42 16 42C16 42 32 24.8 32 16C32 7.16 24.8 0 16 0Z" fill={color} stroke="white" strokeWidth="2"/>
        </svg>
        <span className="absolute top-[6px] text-white font-bold text-sm">{number}</span>
      </div>
  );
}

export default function HomePage() {
  const username = localStorage.getItem('username') || '여행자';
  const [upcomingPlan, setUpcomingPlan] = useState<PlanResponse | null>(null);
  const [todaySchedules, setTodaySchedules] = useState<DayScheduleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [nowMinutes, setNowMinutes] = useState(getCurrentMinutes());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLDivElement>(null);
  const [hasUserScrolled, setHasUserScrolled] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => { setNowMinutes(getCurrentMinutes()); }, 60000);
    return () => clearInterval(interval);
  }, []);

  const calculateDaysDiff = (dateStr: string) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [year, month, day] = dateStr.split('-').map(Number);
    const target = new Date(year, month - 1, day);
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  useEffect(() => {
    const loadHomeData = async () => {
      try {
        const plan = await getUpcomingPlan(); setUpcomingPlan(plan);
        if (plan) {
          const dDay = calculateDaysDiff(plan.planStartDate);
          const endDiff = calculateDaysDiff(plan.planEndDate);
          if (dDay <= 0 && endDiff >= 0) {
            setScheduleLoading(true);
            const days = await getPlanDays(plan.id);
            const targetDay = days.find(d => d.dayOrder === Math.abs(dDay) + 1);
            if (targetDay) {
              const res = await getSchedulesByDay(targetDay.id);
              setTodaySchedules(recalculateSchedules(res));
            }
            setScheduleLoading(false);
          }
        }
      } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    loadHomeData();
  }, []);

  useEffect(() => {
    if (!hasUserScrolled && activeItemRef.current && scrollContainerRef.current) {
      requestAnimationFrame(() => {
        const container = scrollContainerRef.current;
        const item = activeItemRef.current;
        if (!container || !item) return;
        const scrollTarget = item.offsetTop - (container.clientHeight / 2) + (item.clientHeight / 2);
        container.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
      });
    }
  }, [todaySchedules, scheduleLoading, hasUserScrolled, nowMinutes]);

  const handleManualScroll = () => { if (!hasUserScrolled) setHasUserScrolled(true); };

  if (loading) return <div className="p-10 text-center text-gray-500 font-bold">로딩 중... ⏳</div>;

  const status = upcomingPlan ? (calculateDaysDiff(upcomingPlan.planStartDate) > 0 ? 'UPCOMING' : (calculateDaysDiff(upcomingPlan.planEndDate) < 0 ? 'PAST' : 'ONGOING')) : null;
  const dDay = upcomingPlan ? calculateDaysDiff(upcomingPlan.planStartDate) : 0;
  const currentDayN = Math.abs(dDay) + 1;

  const activeSchedule = todaySchedules.find(item => {
    const start = timeToMinutes(item.startTime);
    return nowMinutes >= start && nowMinutes < (start + item.duration);
  });
  const activeScheduleId = activeSchedule?.id;

  const activeMovingIndex = todaySchedules.findIndex((item, index) => {
    if (index === 0 || !todaySchedules[index - 1].endTime) return false;
    const moveStart = timeToMinutes(todaySchedules[index - 1].endTime);
    return nowMinutes >= moveStart && nowMinutes < (moveStart + item.movingDuration);
  });

  const currentStatusText = activeSchedule
      ? `현재: ${activeSchedule.spotName}`
      : (activeMovingIndex !== -1
          ? `이동 중: ${getTransLabel(todaySchedules[activeMovingIndex].transportation)}`
          : null);

  return (
      <div className="flex flex-col h-screen max-w-3xl mx-auto bg-white overflow-hidden px-4 md:px-0 font-sans">
        <section className="pt-6 shrink-0 bg-white z-20">
          <h1 className="text-2xl font-bold text-gray-900">안녕하세요, {username}님.</h1>
          <p className="text-gray-500 text-sm mt-1">{upcomingPlan ? '여행 일정과 현재 상황을 확인하세요.' : '새로운 여행을 떠나보세요!'}</p>
        </section>

        <div className="flex-1 min-h-0 mt-3 overflow-hidden flex flex-col mb-4">
          {!upcomingPlan ? (
              <div className="bg-white rounded-2xl p-8 border border-gray-200 text-center shadow-sm">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">☕</div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">다음 여행을 준비해볼까요?</h3>
                <Link to="/plans/create" className="inline-flex bg-blue-600 text-white font-bold py-3 px-6 rounded-xl transition hover:bg-blue-700">새 여행 계획하기</Link>
              </div>
          ) : status === 'ONGOING' ? (
              <div className="bg-white rounded-2xl shadow-sm border border-blue-100 overflow-hidden flex flex-col flex-1 min-h-0">
                <div className="bg-blue-50 p-4 border-b border-blue-100 flex justify-between items-center shrink-0">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="animate-pulse w-2 h-2 bg-green-500 rounded-full"></span>
                      <span className="text-xs font-bold text-blue-600 tracking-wide uppercase">ONGOING</span>
                    </div>
                    <h2 className="text-lg font-bold text-gray-900">{currentDayN}일차 여행 중 ✈️</h2>
                  </div>
                  <Link to={`/plans/${upcomingPlan.id}`} className="text-sm text-blue-600 font-bold hover:underline">전체 일정</Link>
                </div>

                <div className="h-64 md:h-72 w-full relative border-b border-gray-100 shrink-0">
                  <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['maps', 'marker']}>
                    <Map defaultCenter={{ lat: 34.9858, lng: 135.7588 }} defaultZoom={13} mapId="HOME_MAP_ID" disableDefaultUI={true} className="w-full h-full">
                      <MapDirections schedules={todaySchedules} />
                      <MapUpdater schedules={todaySchedules} activeId={activeScheduleId} activeMoveIndex={activeMovingIndex} />
                      {todaySchedules.map((schedule, index) => {
                        const isActive = (schedule.id === activeScheduleId || index === activeMovingIndex);
                        return <AdvancedMarker key={schedule.id} position={{ lat: Number(schedule.lat), lng: Number(schedule.lng) }} zIndex={isActive ? 100 : 1}>
                          <NumberedMarker number={index + 1} color={isActive ? "#EF4444" : "#3B82F6"} active={isActive} />
                        </AdvancedMarker>;
                      })}
                    </Map>
                  </APIProvider>
                </div>

                <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-gray-50 scrollbar-hide relative" onWheel={handleManualScroll} onTouchStart={handleManualScroll}>
                  <div className="p-4">
                    {/* ✅ 헤더 영역: 공간을 침범하지 않으면서 최대한 많이 노출하도록 보정 */}
                    <div className="sticky top-0 bg-gray-50 z-30 border-b border-gray-100/50 flex flex-col py-1">
                      <div className="flex items-center justify-between gap-3">
                        {/* 타이틀: shrink-0으로 절대 밀려나지 않게 고정 */}
                        <span className="text-sm font-black text-gray-800 shrink-0">오늘의 스케줄</span>

                        {/* 💡 핵심 수정 부분: flex-1과 min-w-0으로 '남는 공간'을 계산하고 배지 배치 */}
                        <div className="flex-1 min-w-0 flex justify-center items-center overflow-hidden">
                          {currentStatusText && (
                              <div className="inline-flex items-center gap-1.5 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100 shadow-sm animate-in fade-in slide-in-from-right-1 w-auto max-w-full">
                                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse shrink-0"></span>
                                {/* 텍스트는 가용한 공간 안에서만 최대한 노출 후 말줄임표 */}
                                <span className="text-[10px] font-bold text-blue-700 truncate whitespace-nowrap">
                                {currentStatusText}
                              </span>
                              </div>
                          )}
                        </div>

                        {/* 시간 표시: 우측 고정 */}
                        <span className="text-[10px] text-gray-400 font-mono shrink-0">
                          {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                      <p className="text-[8px] text-orange-400 font-medium leading-none mt-0.5">※ 주황색 시간은 인저리 타임 포함</p>
                    </div>

                    <div className="space-y-0 mt-2 pb-10 relative z-10">
                      {todaySchedules.map((item, index) => {
                        const isActive = (item.id === activeScheduleId);
                        const isMovingActive = (index === activeMovingIndex);
                        const typeInfo = getSpotTypeInfo(item.spotType || 'OTHER');

                        const si = parseInjuryFromMemo(item.memo, "#si:");
                        const mi = parseInjuryFromMemo(item.movingMemo, "#mi:");

                        return (
                            <div key={item.id} ref={isActive || isMovingActive ? activeItemRef : null}>
                              {index > 0 && (item.movingDuration) > 0 && (
                                  <div className="flex h-12">
                                    <div className="w-14 shrink-0 text-right pt-3 pr-1"><span className="text-xs text-gray-400 font-mono">{todaySchedules[index - 1].endTime}</span></div>
                                    <div className="w-10 shrink-0 flex flex-col items-center relative"><div className="w-0.5 bg-gray-200 h-full absolute"></div><div className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-xs border shadow-sm mt-3 ${isMovingActive ? 'bg-blue-600 border-blue-600 text-white animate-pulse' : 'bg-white text-blue-500 border-blue-200'}`}>{getTransIcon(item.transportation)}</div></div>
                                    <div className="flex-1 min-w-0 py-1 pl-2">
                                      <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 border transition-all ${isMovingActive ? 'bg-blue-100 border-blue-300 ring-1 ring-blue-300' : 'bg-white border-blue-50/50'}`}>
                                        <span className={`text-xs font-bold truncate ${isMovingActive ? 'text-blue-800' : 'text-blue-600'}`}>{cleanMemoTags(item.movingMemo) || `${getTransLabel(item.transportation)} 이동`}</span>
                                        <span className="text-[10px] font-bold text-gray-500 whitespace-nowrap">
                                            {item.movingDuration - mi}{mi > 0 && <span className="text-orange-500 ml-0.5">+{mi}</span>}분
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                              )}
                              <div className="flex min-h-[4rem]">
                                <div className="w-14 shrink-0 text-right pt-2 pr-1">
                                  <span className={`text-sm font-bold font-mono ${isActive ? 'text-orange-600 underline decoration-2 underline-offset-4' : 'text-gray-900'}`}>
                                    {item.startTime?.substring(0, 5)}
                                  </span>
                                </div>
                                <div className="w-10 shrink-0 flex flex-col items-center relative"><div className="w-0.5 bg-gray-200 h-full absolute"></div><div className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center text-lg border shadow-sm ${isActive ? 'bg-orange-500 border-orange-600 text-white scale-110' : 'bg-white border-gray-200'}`}>{typeInfo.icon}</div></div>
                                <div className="flex-1 min-w-0 pb-6 pl-2">
                                  <div className={`rounded-xl p-3 border shadow-sm transition relative overflow-hidden ${isActive ? 'bg-white border-orange-300 ring-2 ring-orange-100' : 'bg-white border-gray-200'}`}>
                                    <div className="flex justify-between items-start gap-2">
                                      <h4 className={`text-sm font-bold truncate flex-1 ${isActive ? 'text-gray-900' : 'text-gray-600'}`}>{item.spotName || "장소 미정"}</h4>
                                      <span className="text-[10px] text-gray-400 whitespace-nowrap">
                                          {item.duration - si}{si > 0 && <span className="text-orange-500 ml-0.5">+{si}</span>}분
                                      </span>
                                    </div>
                                    {cleanMemoTags(item.memo) && <p className="text-xs text-gray-500 mt-1 line-clamp-1 italic opacity-80">{cleanMemoTags(item.memo)}</p>}
                                  </div>
                                </div>
                              </div>
                            </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
          ) : (
              <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg shrink-0">
                <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold border border-white/30 mb-4 inline-block">{status}</span>
                <h2 className="text-4xl font-bold mb-2">{status === 'UPCOMING' ? `D-${dDay}` : '여행 종료'}</h2>
                <h3 className="text-xl font-medium opacity-95">{upcomingPlan.planName}</h3>
                <div className="mt-4 text-right"><Link to={`/plans/${upcomingPlan.id}`} className="text-sm font-bold hover:underline">상세 보기 &rarr;</Link></div>
              </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 pb-4 shrink-0 border-t border-gray-100 pt-4 bg-white">
          <Link to="/map" className="flex items-center justify-center gap-3 p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition"><span className="text-xl">🗺️</span><span className="text-sm font-bold text-gray-700">장소 탐색</span></Link>
          <Link to="/spots" className="flex items-center justify-center gap-3 p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition"><span className="text-xl">📍</span><span className="text-sm font-bold text-gray-700">내 장소</span></Link>
        </div>
      </div>
  );
}