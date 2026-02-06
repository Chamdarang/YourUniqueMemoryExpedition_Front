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

// 🛠️ [수정] 메모 파싱 로직 간소화 (장소 정보 제거됨, 인저리 태그만 제거)
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
  // ✅ [중요] ...item 복사하여 원본 필드(spotName 등) 유지
  const newItems = items.map(item => ({ ...item }));

  if (!newItems[0].startTime) newItems[0].startTime = "10:00";
  newItems[0].startTime = newItems[0].startTime.substring(0, 5);
  newItems[0].endTime = addTime(newItems[0].startTime, newItems[0].duration);

  for (let i = 1; i < newItems.length; i++) {
    const prevItem = newItems[i - 1];
    const currentItem = newItems[i];
    const minStartTime = timeToMinutes(prevItem.endTime) + (currentItem.movingDuration || 0);
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

// ✅ [수정] 맵 업데이트 (DTO 필드 직접 사용)
function MapUpdater({ schedules, activeId, activeMoveIndex }: { schedules: DayScheduleResponse[], activeId: number | undefined, activeMoveIndex: number }) {
  const map = useMap();

  useEffect(() => {
    if (!map || schedules.length === 0) return;

    // 1. 현재 활성화된(체류 중) 장소
    if (activeId) {
      const activeItem = schedules.find(s => s.id === activeId);
      if (activeItem) {
        const lat = Number(activeItem.lat);
        const lng = Number(activeItem.lng);
        if (!isNaN(lat) && !isNaN(lng) && lat !== 0) {
          map.panTo({ lat, lng });
          map.setZoom(16);
          return;
        }
      }
    }

    // 2. 이동 중인 경우
    if (activeMoveIndex > 0) {
      const targetItem = schedules[activeMoveIndex];
      const lat = Number(targetItem.lat);
      const lng = Number(targetItem.lng);
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0) {
        map.panTo({ lat, lng });
        map.setZoom(15);
        return;
      }
    }

    // 3. 전체 경로 핏
    const bounds = new google.maps.LatLngBounds();
    let hasPoint = false;
    schedules.forEach(s => {
      const lat = Number(s.lat);
      const lng = Number(s.lng);
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0) {
        bounds.extend({ lat, lng });
        hasPoint = true;
      }
    });

    if (hasPoint) map.fitBounds(bounds, 50);

  }, [map, schedules, activeId, activeMoveIndex]);

  return null;
}

// ✅ [수정] 경로 그리기 (DTO 필드 직접 사용)
function MapDirections({ schedules }: { schedules: DayScheduleResponse[] }) {
  const map = useMap();
  const mapsLibrary = useMapsLibrary("maps");
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map || !mapsLibrary) return;
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    const path = schedules
        .map(s => ({ lat: Number(s.lat), lng: Number(s.lng) }))
        .filter(pos => !isNaN(pos.lat) && !isNaN(pos.lng) && pos.lat !== 0 && pos.lng !== 0);

    if (path.length > 0) {
      const newPolyline = new mapsLibrary.Polyline({
        path: path, geodesic: true, strokeColor: "#3B82F6", strokeOpacity: 0.8, strokeWeight: 4,
        icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW }, offset: '50%', repeat: '50px' }]
      });
      newPolyline.setMap(map);
      polylineRef.current = newPolyline;
    }
    return () => { if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; } };
  }, [map, mapsLibrary, schedules]);
  return null;
}

function NumberedMarker({ number, color = "#3B82F6", active = false }: { number: number, color?: string, active?: boolean }) {
  return (
      <div className={`relative flex flex-col items-center justify-center filter drop-shadow-md transition-transform duration-300 group
        ${active ? 'scale-125 z-50' : 'scale-90 hover:scale-100 hover:-translate-y-1'}`}>
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

  const activeItemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => { setNowMinutes(getCurrentMinutes()); }, 60000);
    return () => clearInterval(interval);
  }, []);

  // ✅ [수정] 날짜 계산 로직: UTC가 아닌 로컬 타임존 기준으로 비교
  const calculateDaysDiff = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // 로컬 자정

    // dateStr (YYYY-MM-DD)을 로컬 날짜 객체로 변환
    const [year, month, day] = dateStr.split('-').map(Number);
    const target = new Date(year, month - 1, day); // 로컬 타임존 기준 생성

    const diffTime = target.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  useEffect(() => {
    const loadHomeData = async () => {
      try {
        const plan = await getUpcomingPlan();
        setUpcomingPlan(plan);
        if (plan) {
          const dDay = calculateDaysDiff(plan.planStartDate);
          const endDiff = calculateDaysDiff(plan.planEndDate);

          // 여행 중이거나 오늘 시작하는 경우
          if (dDay <= 0 && endDiff >= 0) {
            setScheduleLoading(true);
            const days = await getPlanDays(plan.id);
            const currentDayOrder = Math.abs(dDay) + 1;
            const targetDay = days.find(d => d.dayOrder === currentDayOrder);
            if (targetDay) {
              const schedules = await getSchedulesByDay(targetDay.id);
              setTodaySchedules(recalculateSchedules(schedules));
            }
            setScheduleLoading(false);
          }
        }
      } catch (err) { console.error("데이터 로드 실패:", err); }
      finally { setLoading(false); }
    };
    loadHomeData();
  }, []);

  useEffect(() => {
    if (activeItemRef.current) {
      setTimeout(() => {
        activeItemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 500);
    }
  }, [todaySchedules, scheduleLoading]);

  // ✅ [수정] 플랜 상태 판별 함수
  const getPlanStatus = (plan: PlanResponse) => {
    const dDay = calculateDaysDiff(plan.planStartDate);
    const endDiff = calculateDaysDiff(plan.planEndDate);

    if (dDay > 0) return 'UPCOMING';
    if (endDiff < 0) return 'PAST'; // 종료일이 지났으면 PAST
    return 'ONGOING'; // 시작일 지났고 종료일 안 지났으면 ONGOING
  };

  if (loading) return <div className="p-10 text-center text-gray-500">로딩 중... ⏳</div>;

  const status = upcomingPlan ? getPlanStatus(upcomingPlan) : null;
  const dDay = upcomingPlan ? calculateDaysDiff(upcomingPlan.planStartDate) : 0;
  const currentDayN = upcomingPlan ? Math.abs(dDay) + 1 : 1;

  const activeScheduleId = todaySchedules.find(item => {
    if (!item.startTime) return false;
    const start = timeToMinutes(item.startTime);
    const end = start + item.duration;
    return nowMinutes >= start && nowMinutes < end;
  })?.id;

  const activeMovingIndex = todaySchedules.findIndex((item, index) => {
    if (index === 0) return false;
    const prevItem = todaySchedules[index - 1];
    if (!prevItem.endTime || !item.movingDuration) return false;
    const moveStart = timeToMinutes(prevItem.endTime);
    const moveEnd = moveStart + item.movingDuration;
    return nowMinutes >= moveStart && nowMinutes < moveEnd;
  });

  return (
      <div className="max-w-3xl mx-auto space-y-6 pb-10 px-4 md:px-0">
        <section className="pt-4">
          <h1 className="text-2xl font-bold text-gray-900">안녕하세요, {username}님.</h1>
          <p className="text-gray-500 text-sm mt-1">{upcomingPlan ? '여행 일정과 현재 상황을 확인하세요.' : '새로운 여행을 떠나보세요!'}</p>
        </section>

        {!upcomingPlan ? (
            <div className="bg-white rounded-2xl p-8 border border-gray-200 text-center shadow-sm">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">☕</div>
              <h3 className="text-lg font-bold text-gray-800 mb-2">다음 여행을 준비해볼까요?</h3>
              <Link to="/plans/create" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition"><span>+</span> 새 여행 계획하기</Link>
            </div>
        ) : status === 'UPCOMING' ? (
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
              <div className="relative z-10">
                <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold border border-white/30 mb-4 inline-block">UPCOMING</span>
                <h2 className="text-4xl font-bold mb-2">D-{dDay}</h2>
                <h3 className="text-xl font-medium opacity-95">{upcomingPlan.planName}</h3>
                <p className="text-sm opacity-80 mt-1">{upcomingPlan.planStartDate} ~ {upcomingPlan.planEndDate}</p>
                <div className="mt-4 text-right"><Link to={`/plans/${upcomingPlan.id}`} className="text-sm font-bold hover:text-blue-100 transition">상세 일정 보기 &rarr;</Link></div>
              </div>
            </div>
        ) : status === 'PAST' ? (
            // ✅ [추가] 지난 여행일 경우 표시
            <div className="bg-gray-100 rounded-2xl p-6 text-gray-600 shadow-inner relative overflow-hidden">
              <div className="relative z-10">
                <span className="bg-gray-200 px-3 py-1 rounded-full text-xs font-bold border border-gray-300 mb-4 inline-block">DONE</span>
                <h3 className="text-xl font-bold opacity-95">{upcomingPlan.planName}</h3>
                <p className="text-sm mt-1">여행이 종료되었습니다. ({upcomingPlan.planEndDate} 까지)</p>
                <div className="mt-4 text-right"><Link to={`/plans/${upcomingPlan.id}`} className="text-sm font-bold hover:text-gray-800 transition">기록 보기 &rarr;</Link></div>
              </div>
            </div>
        ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-blue-100 overflow-hidden flex flex-col h-[75vh]">
              {/* 상단 헤더 */}
              <div className="bg-blue-50 p-4 border-b border-blue-100 flex justify-between items-center shrink-0">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="animate-pulse w-2 h-2 bg-green-500 rounded-full"></span>
                    <span className="text-xs font-bold text-blue-600 tracking-wide uppercase">ONGOING</span>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">{currentDayN}일차 여행 중 ✈️</h2>
                </div>
                <Link to={`/plans/${upcomingPlan.id}`} className="text-sm text-blue-600 font-bold hover:underline ml-2">전체 일정</Link>
              </div>

              {/* 🗺️ 지도 영역 */}
              {todaySchedules.length > 0 && (
                  <div className="h-64 md:h-72 w-full relative border-b border-gray-100 shrink-0">
                    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['maps', 'marker']}>
                      <Map defaultCenter={{ lat: 34.9858, lng: 135.7588 }} defaultZoom={13} mapId="HOME_MAP_ID" disableDefaultUI={true} className="w-full h-full">
                        <MapDirections schedules={todaySchedules} />
                        <MapUpdater schedules={todaySchedules} activeId={activeScheduleId} activeMoveIndex={activeMovingIndex} />
                        {todaySchedules.map((schedule, index) => {
                          // ✅ [수정] lat, lng, spotName 필드 직접 사용
                          const lat = Number(schedule.lat);
                          const lng = Number(schedule.lng);
                          if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return null;

                          let markerColor = "#3B82F6";
                          let isActive = false;
                          if (schedule.id === activeScheduleId) { markerColor = "#EF4444"; isActive = true; }
                          else if (index === activeMovingIndex) { markerColor = "#F97316"; isActive = true; }
                          else if (index === activeMovingIndex - 1) { markerColor = "#10B981"; isActive = true; }

                          return <AdvancedMarker key={schedule.id} position={{ lat, lng }} zIndex={isActive ? 100 : 1}><NumberedMarker number={index + 1} color={markerColor} active={isActive} /></AdvancedMarker>;
                        })}
                      </Map>
                    </APIProvider>
                  </div>
              )}

              {/* 📜 리스트 영역 */}
              <div className="flex-1 overflow-y-auto bg-gray-50 scrollbar-hide">
                <div className="p-5">
                  <h3 className="text-sm font-bold text-gray-500 mb-4 flex items-center justify-between sticky top-0 bg-gray-50 pb-2 z-10">
                    <span>오늘의 스케줄</span>
                    <span className="text-xs text-gray-400 font-normal">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} 기준</span>
                  </h3>

                  {scheduleLoading ? <div className="py-10 text-center text-gray-400">일정을 불러오는 중...</div> : todaySchedules.length > 0 ? (
                      <div className="space-y-0 pb-10">
                        {todaySchedules.map((item, index) => {
                          // ✅ [수정] 메모 파싱 제거, DTO 필드 사용
                          const displayName = item.spotName || "장소 선택";
                          const displayMemo = cleanMemoTags(item.memo);
                          const typeInfo = getSpotTypeInfo(item.spotType || 'OTHER');

                          const prevItem = index > 0 ? todaySchedules[index - 1] : null;
                          const moveInjury = parseInjuryFromMemo(item.movingMemo, '#mi:');
                          const pureMovingDuration = Math.max(0, item.movingDuration - moveInjury);
                          const movingStartTime = prevItem ? prevItem.endTime : "";
                          const isMovingActive = (index === activeMovingIndex);
                          const isActive = (item.id === activeScheduleId);

                          return (
                              <div key={item.id} ref={isActive || isMovingActive ? activeItemRef : null}>
                                {/* 이동 카드 */}
                                {index > 0 && item.movingDuration > 0 && (
                                    <div className="flex group h-12">
                                      <div className="w-14 shrink-0 text-right pt-3 pr-1"><span className="text-xs text-gray-400 font-mono block">{movingStartTime}</span></div>
                                      <div className="w-10 shrink-0 flex flex-col items-center relative"><div className="w-0.5 bg-gray-200 h-full absolute top-0 bottom-0"></div><div className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 border shadow-sm mt-3 transition-colors ${isMovingActive ? 'bg-blue-600 border-blue-600 text-white animate-pulse' : 'bg-white border-blue-200 text-blue-500'}`}>{getTransIcon(item.transportation)}</div></div>
                                      <div className="flex-1 min-w-0 py-1 pl-2">
                                        <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 border transition-all ${isMovingActive ? 'bg-blue-100 border-blue-300 ring-1 ring-blue-300 shadow-sm' : 'bg-white border-blue-50/50'}`}>
                                          <span className={`text-xs font-bold truncate ${isMovingActive ? 'text-blue-800' : 'text-blue-600'}`}>{cleanMemoTags(item.movingMemo) || `${getTransLabel(item.transportation)} 이동`}</span>
                                          <span className={`text-[10px] font-bold shrink-0 ${isMovingActive ? 'text-blue-700' : 'text-gray-500'}`}>{pureMovingDuration}분{moveInjury > 0 && <span className="text-orange-400 ml-1">(+{moveInjury})</span>}</span>
                                          {isMovingActive && <span className="text-[10px] bg-blue-600 text-white px-1.5 rounded ml-auto font-bold animate-pulse">NOW</span>}
                                        </div>
                                      </div>
                                    </div>
                                )}
                                {/* 장소 카드 */}
                                <div className="flex group min-h-[4rem]">
                                  <div className="w-14 shrink-0 text-right pt-2 pr-1"><span className={`text-sm font-bold block font-mono ${isActive ? 'text-orange-600' : 'text-gray-900'}`}>{item.startTime ? item.startTime.substring(0, 5) : '--:--'}</span></div>
                                  <div className="w-10 shrink-0 flex flex-col items-center relative">
                                    {index !== todaySchedules.length - 1 && <div className="w-0.5 bg-gray-200 absolute top-0 bottom-0 h-full"></div>}
                                    <div className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0 border shadow-sm transition-transform ${isActive ? 'bg-orange-500 border-orange-600 text-white scale-110' : 'bg-white border-gray-200 group-hover:scale-110'}`}>{typeInfo.icon}</div>
                                  </div>
                                  <div className="flex-1 min-w-0 pb-6 pl-2">
                                    <div className={`rounded-xl p-3 border shadow-sm transition relative overflow-hidden ${isActive ? 'bg-white border-orange-300 ring-2 ring-orange-100' : 'bg-white border-gray-200 hover:border-orange-200'}`}>
                                      {isActive && <div className="absolute top-0 right-0 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">NOW</div>}
                                      <div className="flex justify-between items-start gap-2">
                                        <h4 className={`text-sm font-bold truncate min-w-0 flex-1 ${item.spotName ? 'text-gray-900' : 'text-gray-400 italic'}`}>{displayName}</h4>
                                        <span className="text-[10px] text-gray-500 bg-gray-50 px-2 py-1 rounded-md border border-gray-100 shrink-0 whitespace-nowrap">체류 {item.duration}분</span>
                                      </div>
                                      {displayMemo && <p className="text-xs text-gray-500 mt-2 line-clamp-2 bg-gray-50 p-2 rounded-lg border border-gray-100">{displayMemo}</p>}
                                    </div>
                                  </div>
                                </div>
                              </div>
                          );
                        })}
                      </div>
                  ) : (
                      <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                        <p className="text-gray-500 text-sm">오늘 등록된 스케줄이 없습니다.</p>
                      </div>
                  )}
                </div>
              </div>
            </div>
        )}

        {upcomingPlan && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
              <Link to="/map" className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition"><div className="text-xl">🗺️</div><span className="text-sm font-bold text-gray-700">장소 탐색</span></Link>
              <Link to="/spots" className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition"><div className="text-xl">📍</div><span className="text-sm font-bold text-gray-700">내 장소</span></Link>
            </div>
        )}
      </div>
  );
}