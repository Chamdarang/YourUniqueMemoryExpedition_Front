import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useBlocker } from "react-router-dom";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy
} from "@dnd-kit/sortable";
import {
  APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary
} from "@vis.gl/react-google-maps";

// API
import { getPlanDayDetail, updatePlanDay, swapPlanDay, detachPlanDay } from "../api/dayApi";
import { getSchedulesByDay, syncSchedules } from "../api/scheduleApi";

// Components
import ScheduleItem from "../components/schedule/ScheduleItem";
import PlanDaySwapModal from "../components/day/PlanDaySwapModal";

// Types
import type { PlanDayDetailResponse } from "../types/planday";
import type { DayScheduleResponse, ScheduleItemRequest } from "../types/schedule";
import type { SwapMode } from "../types/enums";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

const scrollbarHideStyle = `
  .scrollbar-hide::-webkit-scrollbar {
      display: none;
  }
  .scrollbar-hide {
      -ms-overflow-style: none;
      scrollbar-width: none;
  }
`;

// ------------------------------------------------------------------
// 🛠️ [유틸] 메모에서 임시 장소 파싱 (지도 경로용)
// ------------------------------------------------------------------
const TEMP_SPOT_PREFIX = " #tmp:";
const decodeTempSpot = (memo: string) => {
  if (!memo) return null;
  const idx = memo.indexOf(TEMP_SPOT_PREFIX);
  if (idx === -1) return null;
  try {
    const jsonStr = memo.substring(idx + TEMP_SPOT_PREFIX.length);
    const data = JSON.parse(jsonStr);
    return { name: data.n, type: data.t, lat: data.la, lng: data.lo };
  } catch {
    return null;
  }
};

// ------------------------------------------------------------------
// 🕒 [유틸] 시간 계산 로직
// ------------------------------------------------------------------
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

// ------------------------------------------------------------------
// 🔄 [핵심] 전체 일정 시간 재계산 로직 (빈틈없이 당기기 + 미루기 허용)
// ------------------------------------------------------------------
const recalculateSchedules = (items: DayScheduleResponse[]): DayScheduleResponse[] => {
  if (items.length === 0) return [];

  const newItems = items.map(item => ({ ...item }));

  if (!newItems[0].startTime) newItems[0].startTime = "10:00";
  newItems[0].startTime = newItems[0].startTime.substring(0, 5);
  newItems[0].endTime = addTime(newItems[0].startTime, newItems[0].duration);

  for (let i = 1; i < newItems.length; i++) {
    const prevItem = newItems[i - 1];
    const currentItem = newItems[i];

    const minStartTime = timeToMinutes(prevItem.endTime) + (currentItem.movingDuration || 0);
    const currentStartTime = timeToMinutes(currentItem.startTime || "00:00");

    // startTime이 있으면(사용자 설정), minStart와 비교해서 더 늦은 시간 선택 (미루기 허용)
    // startTime이 없거나(null), minStart보다 빠르면 minStart 사용 (당기기 허용)
    let finalStartTime = minStartTime;

    if (currentItem.startTime) {
      finalStartTime = Math.max(minStartTime, currentStartTime);
    }

    currentItem.startTime = minutesToTime(finalStartTime);
    currentItem.endTime = addTime(currentItem.startTime, currentItem.duration);
  }

  return newItems;
};

// ------------------------------------------------------------------
// 🎨 커스텀 마커
// ------------------------------------------------------------------
function NumberedMarker({ number, color = "#3B82F6", onClick }: { number: number, color?: string, onClick?: () => void }) {
  return (
      <div
          onClick={onClick}
          className="relative flex flex-col items-center justify-center filter drop-shadow-md cursor-pointer hover:-translate-y-1 transition-transform group"
      >
        <svg width="30" height="40" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.16 0 0 7.16 0 16C0 24.8 16 42 16 42C16 42 32 24.8 32 16C32 7.16 24.8 0 16 0Z" fill={color} stroke="white" strokeWidth="2"/>
        </svg>
        <span className="absolute top-[6px] text-white font-bold text-sm">{number}</span>
      </div>
  );
}

// ------------------------------------------------------------------
// 🗺️ 지도 경로(Polyline) 및 자동 줌 - ✅ useRef로 중복 생성 방지 수정
// ------------------------------------------------------------------
function MapDirections({
                         schedules,
                         mapViewMode
                       }: {
  schedules: DayScheduleResponse[],
  mapViewMode: 'ALL' | 'PINS' | 'NONE'
}) {
  const map = useMap();
  const mapsLibrary = useMapsLibrary("maps");

  // ✅ useState 대신 useRef를 사용하여 지도 객체를 직접 관리
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map || !mapsLibrary) return;

    // 1. 기존 경로가 있다면 지도에서 확실히 제거
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    // 2. 모드가 'ALL'이 아니면 그리지 않고 종료 (삭제만 수행됨)
    if (mapViewMode !== 'ALL') return;

    // 3. 좌표 추출
    const path = schedules
        .map(s => {
          const temp = decodeTempSpot(s.memo);
          // @ts-ignore
          const lat = Number(s.lat || s.spot?.lat || temp?.lat);
          // @ts-ignore
          const lng = Number(s.lng || s.spot?.lng || temp?.lng);
          return { lat, lng };
        })
        .filter(pos => !isNaN(pos.lat) && !isNaN(pos.lng) && pos.lat !== 0 && pos.lng !== 0);

    // 4. 경로 그리기
    if (path.length > 0) {
      const newPolyline = new mapsLibrary.Polyline({
        path: path,
        geodesic: true,
        strokeColor: "#3B82F6",
        strokeOpacity: 0.8,
        strokeWeight: 5,
        icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW }, offset: '50%', repeat: '100px' }]
      });

      newPolyline.setMap(map);
      polylineRef.current = newPolyline; // Ref에 저장

      // 경로가 있으면 지도 뷰포트를 경로에 맞춤
      const bounds = new google.maps.LatLngBounds();
      path.forEach(pos => bounds.extend(pos));
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, 50);
      }
    }

    // 5. 컴포넌트 언마운트 시 정리
    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    };
  }, [map, mapsLibrary, schedules, mapViewMode]); // 의존성 변경 시 재실행

  return null;
}

export default function DayDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dayId = Number(id);

  const [day, setDay] = useState<PlanDayDetailResponse | null>(null);
  const [schedules, setSchedules] = useState<DayScheduleResponse[]>([]);

  const [initialDay, setInitialDay] = useState<PlanDayDetailResponse | null>(null);
  const [initialSchedules, setInitialSchedules] = useState<DayScheduleResponse[]>([]);

  const [loading, setLoading] = useState(true);
  const [isDirty, setIsDirty] = useState(false);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleForm, setTitleForm] = useState("");
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);

  const [mobileViewMode, setMobileViewMode] = useState<'LIST' | 'MAP'>('LIST');
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);

  const [mapViewMode, setMapViewMode] = useState<'ALL' | 'PINS' | 'NONE'>('ALL');
  const [showInjury, setShowInjury] = useState(false);

  const sensors = useSensors(
      useSensor(PointerSensor),
      useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // 1. 데이터 로드
  const fetchData = async () => {
    if (!dayId) return;
    try {
      setLoading(true);
      const [dayData, schedulesData] = await Promise.all([
        getPlanDayDetail(dayId),
        getSchedulesByDay(dayId)
      ]);

      setDay(dayData);

      const calculatedSchedules = recalculateSchedules(schedulesData);
      setSchedules(calculatedSchedules);

      setInitialDay(dayData);
      setInitialSchedules(calculatedSchedules);
      setTitleForm(dayData.dayName);
      setIsDirty(false);
    } catch (err) {
      console.error(err);
      alert("일정을 불러오지 못했습니다.");
      navigate('/days');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [dayId]);

  // 2. 변경 감지
  useEffect(() => {
    if (!initialDay || !day) return;
    const isTitleChanged = initialDay.dayName !== day.dayName;
    const isScheduleChanged = JSON.stringify(initialSchedules) !== JSON.stringify(schedules);
    setIsDirty(isTitleChanged || isScheduleChanged);
  }, [day, schedules, initialDay, initialSchedules]);

  // 이탈 방지
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const blocker = useBlocker(
      ({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (blocker.state === "blocked") {
      if (window.confirm("저장되지 않은 변경사항이 있습니다.\n정말 이동하시겠습니까?")) {
        blocker.proceed();
      } else {
        blocker.reset();
      }
    }
  }, [blocker]);

  // 핸들러들...
  const handleUpdateTitle = async () => {
    if (!dayId || !titleForm.trim()) return;
    try {
      await updatePlanDay(dayId, { dayName: titleForm });
      setDay(prev => prev ? { ...prev, dayName: titleForm } : null);
      setInitialDay(prev => prev ? { ...prev, dayName: titleForm } : null);
      setIsEditingTitle(false);
    } catch { alert("이름 수정 실패"); }
  };

  const handleReset = () => {
    if (isDirty && !confirm("초기화하시겠습니까?")) return;
    if (initialDay) { setDay(initialDay); setTitleForm(initialDay.dayName); }
    setSchedules(JSON.parse(JSON.stringify(initialSchedules)));
  };

  const handleSaveAll = async () => {
    try {
      if (schedules.some(s => s.spotId === 0 && !decodeTempSpot(s.memo) && !s.spotName)) {
        alert("장소가 선택되지 않은 일정이 있습니다."); return;
      }

      const finalSchedules = recalculateSchedules(schedules);

      const syncReqItems: ScheduleItemRequest[] = finalSchedules.map((item, index) => ({
        id: item.id < 0 ? null : item.id,
        spotId: item.spotId,
        scheduleOrder: index + 1,
        startTime: item.startTime,
        duration: item.duration,
        endTime: item.endTime,
        movingDuration: item.movingDuration,
        transportation: item.transportation,
        memo: item.memo,
        movingMemo: item.movingMemo
      }));

      const newSchedules = await syncSchedules(dayId, { schedules: syncReqItems });

      const recalculatedNew = recalculateSchedules(newSchedules);
      setSchedules(recalculatedNew);
      setInitialSchedules(recalculatedNew);

      alert("일정이 저장되었습니다! ✅");
      setIsDirty(false);
    } catch { alert("저장 실패"); }
  };

  const handleSwapSubmit = async (targetPlanId: number, targetDayOrder: number, swapMode: SwapMode) => {
    try {
      if (swapMode === 'INDEPENDENT') {
        await detachPlanDay(dayId);
        alert("보관함으로 이동했습니다.");
      } else {
        await swapPlanDay({ sourceDayId: dayId, targetPlanId, targetDayOrder, swapMode });
        alert("이동되었습니다.");
      }
      setIsSwapModalOpen(false);
    } catch (err) { console.error(err); alert("오류가 발생했습니다."); }
  };

  const toggleMapViewMode = () => {
    if (mapViewMode === 'ALL') setMapViewMode('PINS');
    else if (mapViewMode === 'PINS') setMapViewMode('NONE');
    else setMapViewMode('ALL');
  };

  const getMapViewModeLabel = () => {
    switch(mapViewMode) {
      case 'ALL': return '🗺️ 핀+경로';
      case 'PINS': return '📍 핀만 보기';
      case 'NONE': return '🙈 지도 숨김';
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSchedules((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const newOrder = arrayMove(items, oldIndex, newIndex);
        return recalculateSchedules(newOrder);
      });
    }
  };

  const handleUpdateLocal = (id: number, updatedData: any) => {
    setSchedules(prev => {
      const index = prev.findIndex(item => item.id === id);
      if (index === -1) return prev;

      if (updatedData.startTime && index > 0) {
        const prevItem = prev[index - 1];
        if (prevItem) {
          const prevEndTimeMinutes = timeToMinutes(prevItem.endTime);
          const movingTime = prev[index].movingDuration || 0;
          const newStartTimeMinutes = timeToMinutes(updatedData.startTime);
          const minPossibleTime = prevEndTimeMinutes + movingTime;

          if (newStartTimeMinutes < minPossibleTime) {
            alert(`이전 일정 종료(${prevItem.endTime}) 및 이동시간(${movingTime}분)을 고려했을 때,\n${minutesToTime(minPossibleTime)} 이후로만 설정 가능합니다.`);
            return prev;
          }
        }
      }

      const currentList = prev.map((item, i) => {
        if (i === index) {
          const newItem = { ...item, ...updatedData };
          if (updatedData.isVisit !== undefined && newItem.spot) {
            newItem.spot = { ...newItem.spot, isVisit: updatedData.isVisit };
          }
          return newItem;
        }

        if (i > index) {
          return { ...item, startTime: null };
        }
        return item;
      });

      return recalculateSchedules(currentList);
    });
  };

  const handleDeleteLocal = (targetId: number) => {
    if (confirm("삭제하시겠습니까?")) {
      setSchedules(prev => {
        const filtered = prev.filter(s => s.id !== targetId);
        return recalculateSchedules(filtered);
      });
    }
  };

  const handleInsertEmpty = (insertIndex: number) => {
    let defaultStartTime = "10:00";
    if (insertIndex > 0 && schedules[insertIndex - 1]) {
      const prev = schedules[insertIndex - 1];
      defaultStartTime = addTime(prev.endTime || prev.startTime, 0);
    }

    const newItem: DayScheduleResponse = {
      id: -Date.now(),
      dayId,
      scheduleOrder: 0,
      spotId: 0,
      spotName: "",
      spotType: "OTHER",
      startTime: defaultStartTime,
      duration: 60,
      movingDuration: 0,
      transportation: 'WALK',
      memo: '',
      movingMemo: ''
    };

    setSchedules(prev => {
      const newList = [...prev];
      newList.splice(insertIndex, 0, newItem);
      return recalculateSchedules(newList);
    });
  };

  if (loading || !day) return <div className="p-10 text-center text-gray-400">로딩 중...</div>;

  return (
      <>
        <style>{scrollbarHideStyle}</style>

        <div className="flex flex-col h-full w-full relative overflow-hidden bg-white">
          <APIProvider
              apiKey={GOOGLE_MAPS_API_KEY}
              libraries={['places', 'geocoding', 'marker', 'maps']}
              language="ko"
              region="KR"
              version="beta"
          >
            <div className="flex w-full h-full relative">

              {/* [1] 지도 영역 */}
              <div className={`
                  absolute inset-0 z-20 bg-gray-50 transition-transform duration-300
                  md:relative md:w-1/2 md:translate-x-0 md:z-auto
                  ${mobileViewMode === 'MAP' ? 'translate-x-0' : '-translate-x-full'}
              `}>
                <div className="absolute top-4 right-4 z-50 flex gap-2">
                  <button onClick={() => setShowInjury(!showInjury)} className={`px-4 py-2 rounded-full text-xs font-bold shadow-md transition border ${showInjury ? 'bg-orange-500 text-white border-orange-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                    {showInjury ? '⚽ 인저리타임 ON' : '⚽ 인저리타임 OFF'}
                  </button>
                  <button onClick={toggleMapViewMode} className={`px-4 py-2 rounded-full text-xs font-bold shadow-md transition border bg-white text-blue-600 border-blue-200 hover:bg-blue-50`}>
                    {getMapViewModeLabel()}
                  </button>
                </div>

                <Map
                    defaultCenter={{ lat: 34.9858, lng: 135.7588 }}
                    defaultZoom={13}
                    mapId="DEMO_MAP_ID"
                    disableDefaultUI={true}
                    className="w-full h-full"
                >
                  <MapDirections schedules={schedules} mapViewMode={mapViewMode} />

                  {/* ✅ 핀 보기 모드가 아닐 때는 마커 숨김 */}
                  {mapViewMode !== 'NONE' && schedules.map((schedule, index) => {
                    const temp = decodeTempSpot(schedule.memo);
                    // @ts-ignore
                    const lat = Number(schedule.lat || schedule.spot?.lat || temp?.lat);
                    // @ts-ignore
                    const lng = Number(schedule.lng || schedule.spot?.lng || temp?.lng);

                    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return null;

                    return (
                        <AdvancedMarker
                            key={schedule.id}
                            position={{ lat, lng }}
                            onClick={() => setSelectedScheduleId(schedule.id)}
                            zIndex={selectedScheduleId === schedule.id ? 100 : 10}
                        >
                          <NumberedMarker
                              number={index + 1}
                              color={selectedScheduleId === schedule.id ? "#EF4444" : "#3B82F6"}
                          />
                        </AdvancedMarker>
                    );
                  })}
                </Map>

                <div className="md:hidden absolute top-4 left-4 z-50">
                  <button
                      onClick={() => setMobileViewMode('LIST')}
                      className="bg-white/90 backdrop-blur px-5 py-3 rounded-full shadow-xl font-bold text-sm text-gray-800 border border-gray-200 flex items-center gap-2 active:scale-95 transition"
                  >
                    <span>🔙</span> 목록으로
                  </button>
                </div>
              </div>

              {/* [2] 일정 리스트 영역 */}
              <div className={`
                  flex flex-col w-full h-full bg-white md:w-1/2 relative z-10 transition-transform duration-300
                  ${mobileViewMode === 'MAP' ? 'translate-x-full md:translate-x-0' : 'translate-x-0'}
              `}>
                {/* 상단 헤더 */}
                <div className="px-5 py-4 border-b border-gray-100 bg-white/95 backdrop-blur z-30 flex-shrink-0">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <button onClick={() => navigate('/days')} className="text-gray-400 hover:text-gray-900 shrink-0 p-1">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                        </button>
                        {isEditingTitle ? (
                            <div className="flex items-center gap-2 flex-1">
                              <input
                                  type="text"
                                  className="w-full border-b-2 border-orange-400 text-lg font-bold outline-none bg-transparent"
                                  value={titleForm}
                                  onChange={(e) => setTitleForm(e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && handleUpdateTitle()}
                                  autoFocus
                              />
                              <button onClick={handleUpdateTitle} className="bg-orange-500 text-white text-xs px-2 py-1 rounded shrink-0">V</button>
                            </div>
                        ) : (
                            <h1 onClick={() => setIsEditingTitle(true)} className="text-xl font-bold text-gray-900 truncate cursor-pointer hover:text-orange-500 flex items-center gap-1">
                              {day.dayName} <span className="text-gray-300 text-sm">✎</span>
                            </h1>
                        )}
                      </div>

                      <div className="flex gap-2 shrink-0">
                        {isDirty && (
                            <button onClick={handleReset} className="p-2 text-gray-400 bg-gray-100 rounded-lg hover:bg-gray-200">↺</button>
                        )}
                        <button
                            onClick={handleSaveAll}
                            disabled={!isDirty}
                            className={`px-3 py-2 rounded-lg font-bold text-sm transition shadow-sm
                                      ${isDirty ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-gray-100 text-gray-400 cursor-default'}`}
                        >
                          {isDirty ? '저장' : '완료'}
                        </button>
                      </div>
                    </div>

                    <button onClick={() => setIsSwapModalOpen(true)} className="w-full py-2 text-xs font-bold text-gray-500 bg-gray-50 border border-gray-100 rounded hover:bg-gray-100">
                      📤 다른 계획으로 이동 / 보관함 보내기
                    </button>
                  </div>
                </div>

                {/* 리스트 스크롤 영역 */}
                <div className="flex-1 overflow-y-auto p-4 pb-24 bg-white scrollbar-hide">
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={schedules.map(s => s.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-4">
                        {schedules.map((schedule, index) => (
                            <div
                                key={schedule.id}
                                className={`transition-all duration-200 ${selectedScheduleId === schedule.id ? 'ring-2 ring-blue-500 ring-offset-2 rounded-xl bg-blue-50/50' : ''}`}
                                onClick={() => setSelectedScheduleId(schedule.id)}
                            >
                              <ScheduleItem
                                  schedule={schedule}
                                  index={index}
                                  isLast={index === schedules.length - 1}
                                  showInjury={showInjury}
                                  onUpdate={handleUpdateLocal}
                                  onDelete={() => handleDeleteLocal(schedule.id)}
                                  onInsert={handleInsertEmpty}
                                  pickingTarget={null}
                                  setPickingTarget={() => {}}
                                  onRequestMapPick={() => {}}
                                  isPickingMap={false}
                              />
                            </div>
                        ))}

                        {schedules.length === 0 && (
                            <div className="text-center py-20 text-gray-300 cursor-pointer hover:text-orange-500 transition" onClick={() => handleInsertEmpty(0)}>
                              <div className="text-4xl mb-2 grayscale opacity-50">🗺️</div>
                              <p className="font-bold">일정을 추가해보세요!</p>
                            </div>
                        )}

                        {schedules.length > 0 && (
                            <button
                                onClick={() => handleInsertEmpty(schedules.length)}
                                className="w-full py-4 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 font-bold hover:border-orange-400 hover:text-orange-500 hover:bg-orange-50 transition"
                            >
                              + 일정 추가
                            </button>
                        )}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>

                <div className="md:hidden absolute bottom-6 left-1/2 -translate-x-1/2 z-40 w-full px-6 pointer-events-none">
                  <button
                      onClick={() => setMobileViewMode('MAP')}
                      className="pointer-events-auto mx-auto bg-gray-900 text-white px-6 py-3 rounded-full shadow-xl font-bold text-sm flex items-center gap-2 hover:scale-105 transition transform active:scale-95"
                  >
                    🗺️ 지도 보기
                  </button>
                </div>
              </div>
            </div>

            <PlanDaySwapModal
                isOpen={isSwapModalOpen}
                onClose={() => setIsSwapModalOpen(false)}
                onSubmit={handleSwapSubmit}
                currentDayName={day ? day.dayName : ""}
            />
          </APIProvider>
        </div>
      </>
  );
}