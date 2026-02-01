import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useBlocker } from "react-router-dom";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove, sortableKeyboardCoordinates
} from "@dnd-kit/sortable";
import {
  APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary, Pin, InfoWindow
} from "@vis.gl/react-google-maps";

// API
import { getPlanDayDetail, updatePlanDay, swapPlanDay, detachPlanDay } from "../api/dayApi";
import { getSchedulesByDay, syncSchedules } from "../api/scheduleApi";
import { createSpot } from "../api/spotApi"; // ✅ 장소 생성 API 추가

// Components
import DayScheduleList from "../components/day/DayScheduleList";
import PlanDaySwapModal from "../components/day/PlanDaySwapModal";

// Types
import type { PlanDayDetailResponse } from "../types/planday";
import type { DayScheduleResponse, ScheduleItemRequest } from "../types/schedule";
import type { SwapMode } from "../types/enums";
import type { SpotCreateRequest } from "../types/spot"; // ✅ 타입 추가

// Utils
import { recalculateSchedules, addTime } from "../utils/scheduleUtils";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

const scrollbarHideStyle = `
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
`;

// 🛠️ [유틸] 임시 장소 디코딩/인코딩 (지도 픽용)
const TEMP_SPOT_PREFIX = " #tmp:";
const decodeTempSpot = (memo: string) => {
  if (!memo) return null;
  const idx = memo.indexOf(TEMP_SPOT_PREFIX);
  if (idx === -1) return null;
  try {
    const jsonStr = memo.substring(idx + TEMP_SPOT_PREFIX.length);
    const data = JSON.parse(jsonStr);
    return { name: data.n, type: data.t, lat: data.la, lng: data.lo };
  } catch { return null; }
};

const cleanMemoTags = (memo: string) => {
  if (!memo) return '';
  const text = memo.replace(/#si:\s*\d+/g, '').replace(/#mi:\s*\d+/g, '').replace(/#visited/g, '');
  return text.split(TEMP_SPOT_PREFIX)[0].trim();
};

const encodeTempSpot = (memo: string, spot: { name: string; type: string; lat: number; lng: number }) => {
  const clean = cleanMemoTags(memo);
  const data = JSON.stringify({ n: spot.name, t: spot.type, la: spot.lat, lo: spot.lng });
  return `${clean}${TEMP_SPOT_PREFIX}${data}`;
};

// 📍 지도 위 마커 컴포넌트
function NumberedMarker({ number, color = "#3B82F6", onClick }: { number: number, color?: string, onClick?: () => void }) {
  return (
      <div onClick={onClick} className="relative flex flex-col items-center justify-center filter drop-shadow-md cursor-pointer hover:-translate-y-1 transition-transform group">
        <svg width="30" height="40" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.16 0 0 7.16 0 16C0 24.8 16 42 16 42C16 42 32 24.8 32 16C32 7.16 24.8 0 16 0Z" fill={color} stroke="white" strokeWidth="2"/>
        </svg>
        <span className="absolute top-[6px] text-white font-bold text-sm">{number}</span>
      </div>
  );
}

// 🗺️ 지도 경로 그리기 컴포넌트
function MapDirections({ schedules, mapViewMode }: { schedules: DayScheduleResponse[], mapViewMode: 'ALL' | 'PINS' | 'NONE' }) {
  const map = useMap();
  const mapsLibrary = useMapsLibrary("maps");
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map || !mapsLibrary) return;
    if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }
    if (mapViewMode !== 'ALL') return;

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

    if (path.length > 0) {
      const newPolyline = new mapsLibrary.Polyline({
        path: path, geodesic: true, strokeColor: "#3B82F6", strokeOpacity: 0.8, strokeWeight: 5,
        icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW }, offset: '50%', repeat: '100px' }]
      });
      newPolyline.setMap(map);
      polylineRef.current = newPolyline;
      const bounds = new google.maps.LatLngBounds();
      path.forEach(pos => bounds.extend(pos));
      if (!bounds.isEmpty()) map.fitBounds(bounds, 50);
    }
    return () => { if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; } };
  }, [map, mapsLibrary, schedules, mapViewMode]);
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

  // 헤더 상태
  const [titleForm, setTitleForm] = useState("");
  const [memoForm, setMemoForm] = useState("");
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);

  // 뷰 상태
  const [mobileViewMode, setMobileViewMode] = useState<'LIST' | 'MAP'>('LIST');
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);
  const [mapViewMode, setMapViewMode] = useState<'ALL' | 'PINS' | 'NONE'>('ALL');
  const [showInjury, setShowInjury] = useState(false);

  // ✅ [신규] 지도 픽킹 관련 상태
  const [pickingTarget, setPickingTarget] = useState<{ dayId: number, scheduleId: number } | null>(null);
  const [tempSelectedSpot, setTempSelectedSpot] = useState<SpotCreateRequest | null>(null);

  // 구글 맵 라이브러리
  const geocodingLibrary = useMapsLibrary("geocoding");
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
  useEffect(() => { if (geocodingLibrary) setGeocoder(new geocodingLibrary.Geocoder()); }, [geocodingLibrary]);

  const sensors = useSensors(
      useSensor(PointerSensor),
      useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // 1. 데이터 로드
  const fetchData = async () => {
    if (!dayId) return;
    try {
      setLoading(true);
      const [dayData, schedulesData] = await Promise.all([getPlanDayDetail(dayId), getSchedulesByDay(dayId)]);
      setDay(dayData);
      setInitialDay(dayData);
      setTitleForm(dayData.dayName);
      setMemoForm(dayData.memo || "");
      const calculatedSchedules = recalculateSchedules(schedulesData);
      setSchedules(calculatedSchedules);
      setInitialSchedules(calculatedSchedules);
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

  // 2. 변경 감지 및 이탈 방지
  useEffect(() => {
    if (!initialDay || !day) return;
    const isTitleChanged = initialDay.dayName !== titleForm;
    const isMemoChanged = (initialDay.memo || "") !== memoForm;
    const isScheduleChanged = JSON.stringify(initialSchedules) !== JSON.stringify(schedules);
    setIsDirty(isTitleChanged || isMemoChanged || isScheduleChanged);
  }, [titleForm, memoForm, schedules, initialDay, initialSchedules]);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state === "blocked") {
      if (window.confirm("저장되지 않은 변경사항이 있습니다.\n정말 이동하시겠습니까?")) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);

  // 3. 핸들러들
  const handleUpdateDayInfo = async () => {
    if (!dayId || !titleForm.trim()) return;
    if (day && (day.dayName === titleForm && (day.memo || "") === memoForm)) return;
    try {
      await updatePlanDay(dayId, { dayName: titleForm, memo: memoForm });
      setDay(prev => prev ? { ...prev, dayName: titleForm, memo: memoForm } : null);
      setInitialDay(prev => prev ? { ...prev, dayName: titleForm, memo: memoForm } : null);
    } catch { alert("정보 수정 실패"); }
  };

  const handleReset = () => {
    if (isDirty && !confirm("초기화하시겠습니까?")) return;
    if (initialDay) { setDay(initialDay); setTitleForm(initialDay.dayName); setMemoForm(initialDay.memo || ""); }
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
      await handleUpdateDayInfo();
      alert("저장되었습니다! ✅");
      setIsDirty(false);
    } catch { alert("저장 실패"); }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSchedules((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return recalculateSchedules(arrayMove(items, oldIndex, newIndex));
      });
    }
  };

  const handleUpdateLocal = (id: number, updatedData: any) => {
    setSchedules(prev => {
      const index = prev.findIndex(item => item.id === id);
      if (index === -1) return prev;
      // ... 시간 검증 로직 생략 (기존과 동일)
      const currentList = prev.map((item, i) => {
        if (i === index) {
          const newItem = { ...item, ...updatedData };
          if (updatedData.isVisit !== undefined && newItem.spot) newItem.spot = { ...newItem.spot, isVisit: updatedData.isVisit };
          return newItem;
        }
        if (i > index) return { ...item, startTime: null };
        return item;
      });
      return recalculateSchedules(currentList);
    });
  };

  const handleDeleteLocal = (targetId: number) => {
    if (confirm("삭제하시겠습니까?")) {
      setSchedules(prev => recalculateSchedules(prev.filter(s => s.id !== targetId)));
    }
  };

  const handleInsertEmpty = (insertIndex: number) => {
    let defaultStartTime = "10:00";
    if (insertIndex > 0 && schedules[insertIndex - 1]) {
      const prev = schedules[insertIndex - 1];
      defaultStartTime = addTime(prev.endTime || prev.startTime, 0);
    }
    const newItem: DayScheduleResponse = {
      id: -Date.now(), dayId, scheduleOrder: 0, spotId: 0, spotName: "", spotType: "OTHER",
      startTime: defaultStartTime, duration: 60, movingDuration: 0, transportation: 'WALK', memo: '', movingMemo: ''
    };
    setSchedules(prev => {
      const newList = [...prev];
      newList.splice(insertIndex, 0, newItem);
      return recalculateSchedules(newList);
    });
  };

  // ✅ [신규] 지도 클릭 핸들러 (PlanDetailPage와 동일 로직)
  const handleMapClick = async (e: any) => {
    if (!pickingTarget || !geocoder) return;
    if (e.domEvent) e.domEvent.stopPropagation();

    const processSpotData = (spotReq: SpotCreateRequest) => { setTempSelectedSpot(spotReq); };

    if (e.detail.placeId) {
      // @ts-ignore
      const place = new google.maps.places.Place({ id: e.detail.placeId });
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'types', 'googleMapsURI', 'websiteURI'] });
      processSpotData({
        spotName: place.displayName || "선택된 장소", spotType: 'OTHER', address: place.formattedAddress || "",
        lat: place.location?.lat() || 0, lng: place.location?.lng() || 0, placeId: e.detail.placeId, isVisit: false, metadata: { originalTypes: place.types || [] }, googleMapUrl: place.googleMapsURI || "", shortAddress: "", website: place.websiteURI || "", description: ""
      });
    } else if (e.detail.latLng) {
      const { lat, lng } = e.detail.latLng;
      geocoder.geocode({ location: { lat, lng } }, (results: any, status: any) => {
        if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
          processSpotData({
            spotName: results[0].address_components[0]?.long_name || "지도 위치", spotType: 'OTHER', address: results[0].formatted_address,
            lat, lng, placeId: results[0].place_id, isVisit: false, metadata: {}, googleMapUrl: `http://googleusercontent.com/maps.google.com/?q=${lat},${lng}`, shortAddress: "", website: "", description: ""
          });
        } else {
          processSpotData({ spotName: "지도 임의 위치", spotType: 'OTHER', address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng, isVisit: false, metadata: {}, googleMapUrl: ``, shortAddress: "", website: "", description: "" });
        }
      });
    }
  };

  // ✅ [신규] 장소 등록 확인 핸들러
  const handleConfirmRegister = async () => {
    if (!tempSelectedSpot || !pickingTarget) return;
    try {
      const savedSpot = await createSpot(tempSelectedSpot);
      setSchedules(prev => {
        const updated = prev.map(s => s.id === pickingTarget.scheduleId ? {
          ...s, spotId: savedSpot.id, spotName: savedSpot.spotName, spotType: savedSpot.spotType,
          lat: savedSpot.lat, lng: savedSpot.lng, address: savedSpot.address, isVisit: savedSpot.isVisit, spot: savedSpot
        } : s);
        return recalculateSchedules(updated);
      });
      setTempSelectedSpot(null); setPickingTarget(null);
    } catch { alert("장소 등록 실패"); }
  };

  const handleConfirmScheduleOnly = () => {
    if (!tempSelectedSpot || !pickingTarget) return;
    setSchedules(prev => {
      const updated = prev.map(s => s.id === pickingTarget.scheduleId ? {
        ...s, spotId: 0, spotName: tempSelectedSpot.spotName, spotType: tempSelectedSpot.spotType,
        lat: tempSelectedSpot.lat, lng: tempSelectedSpot.lng, address: tempSelectedSpot.address,
        memo: encodeTempSpot(s.memo, { name: tempSelectedSpot.spotName, type: tempSelectedSpot.spotType || 'OTHER', lat: tempSelectedSpot.lat, lng: tempSelectedSpot.lng })
      } : s);
      return recalculateSchedules(updated);
    });
    setTempSelectedSpot(null); setPickingTarget(null);
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
    } catch { alert("오류가 발생했습니다."); }
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

  if (loading || !day) return <div className="p-10 text-center text-gray-400">로딩 중...</div>;

  return (
      <>
        <style>{scrollbarHideStyle}</style>
        <div className="flex flex-col h-full w-full relative overflow-hidden bg-white">
          <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['places', 'geocoding', 'marker', 'maps']} language="ko" region="KR" version="beta">
            <div className="flex w-full h-full relative">

              {/* [1] 지도 영역 */}
              <div className={`absolute inset-0 z-20 bg-gray-50 transition-transform duration-300 md:relative md:w-1/2 md:translate-x-0 md:z-auto ${mobileViewMode === 'MAP' ? 'translate-x-0' : '-translate-x-full'}`}>
                {/* 컨트롤 버튼들 */}
                <div className="absolute top-4 right-4 z-50 flex gap-2">
                  <button onClick={() => setShowInjury(!showInjury)} className={`px-4 py-2 rounded-full text-xs font-bold shadow-md transition border ${showInjury ? 'bg-orange-500 text-white border-orange-600' : 'bg-white text-gray-500 border-gray-200'}`}>{showInjury ? '⚽ 인저리타임 ON' : '⚽ 인저리타임 OFF'}</button>
                  <button onClick={toggleMapViewMode} className={`px-4 py-2 rounded-full text-xs font-bold shadow-md transition border bg-white text-blue-600 border-blue-200 hover:bg-blue-50`}>
                    {getMapViewModeLabel()}
                  </button>
                </div>

                {/* ✅ 지도 픽 안내 메시지 */}
                {pickingTarget && (
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-green-600 text-white px-5 py-2.5 rounded-full shadow-lg border-2 border-white cursor-pointer hover:bg-green-700 transition" onClick={() => { setPickingTarget(null); setTempSelectedSpot(null); }}>
                      <span className="font-bold text-sm">📍 지도에서 위치를 클릭하세요!</span><span className="bg-white/20 px-2 py-0.5 rounded text-xs">취소 X</span>
                    </div>
                )}

                <Map defaultCenter={{ lat: 34.9858, lng: 135.7588 }} defaultZoom={13} mapId="DEMO_MAP_ID" disableDefaultUI={true} className="w-full h-full" onClick={handleMapClick}>
                  <MapDirections schedules={schedules} mapViewMode={mapViewMode} />
                  {mapViewMode !== 'NONE' && schedules.map((schedule, index) => {
                    const temp = decodeTempSpot(schedule.memo);
                    // @ts-ignore
                    const lat = Number(schedule.lat || schedule.spot?.lat || temp?.lat);
                    // @ts-ignore
                    const lng = Number(schedule.lng || schedule.spot?.lng || temp?.lng);
                    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return null;
                    return <AdvancedMarker key={schedule.id} position={{ lat, lng }} onClick={() => setSelectedScheduleId(schedule.id)} zIndex={selectedScheduleId === schedule.id ? 100 : 10}><NumberedMarker number={index + 1} color={selectedScheduleId === schedule.id ? "#EF4444" : "#3B82F6"} /></AdvancedMarker>;
                  })}

                  {/* ✅ 임시 선택 마커 및 정보창 */}
                  {tempSelectedSpot && (
                      <>
                        <AdvancedMarker position={{ lat: tempSelectedSpot.lat, lng: tempSelectedSpot.lng }}><Pin background={'#22c55e'} borderColor={'#15803d'} glyphColor={'white'} /></AdvancedMarker>
                        <InfoWindow position={{ lat: tempSelectedSpot.lat, lng: tempSelectedSpot.lng }} onCloseClick={() => setTempSelectedSpot(null)} headerContent={<div className="font-bold text-sm">{tempSelectedSpot.spotName}</div>}>
                          <div className="p-1 min-w-[200px]"><p className="text-xs text-gray-500 mb-3">{tempSelectedSpot.address}</p>
                            <div className="flex gap-2"><button onClick={handleConfirmScheduleOnly} className="flex-1 bg-white border border-gray-300 text-gray-700 text-xs py-2 rounded-lg hover:bg-gray-50 font-bold">일정에만 추가</button><button onClick={handleConfirmRegister} className="flex-1 bg-green-600 text-white text-xs py-2 rounded-lg hover:bg-green-700 font-bold">내 장소 등록 & 추가</button></div>
                          </div>
                        </InfoWindow>
                      </>
                  )}
                </Map>
                <div className="md:hidden absolute top-4 left-4 z-50"><button onClick={() => setMobileViewMode('LIST')} className="bg-white/90 backdrop-blur px-5 py-3 rounded-full shadow-xl font-bold text-sm text-gray-800 border border-gray-200 flex items-center gap-2"><span>🔙</span> 목록으로</button></div>
              </div>

              {/* [2] 일정 리스트 영역 */}
              <div className={`flex flex-col w-full h-full bg-white md:w-1/2 relative z-10 transition-transform duration-300 ${mobileViewMode === 'MAP' ? 'translate-x-full md:translate-x-0' : 'translate-x-0'}`}>
                {/* 헤더 생략 (위와 동일) */}
                <div className="px-5 py-4 border-b border-gray-100 bg-white/95 backdrop-blur z-30 flex-shrink-0 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button onClick={() => navigate('/days')} className="text-gray-400 hover:text-gray-900 shrink-0 p-1"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg></button>
                      <div className="flex-1"><input type="text" className="w-full text-xl font-bold outline-none bg-transparent placeholder-gray-300" value={titleForm} onChange={(e) => setTitleForm(e.target.value)} onBlur={handleUpdateDayInfo} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} placeholder="일정 제목을 입력하세요" /></div>
                    </div>
                    <div className="flex gap-2 shrink-0">{isDirty && <button onClick={handleReset} className="p-2 text-gray-400 bg-gray-100 rounded-lg hover:bg-gray-200">↺</button>}<button onClick={handleSaveAll} disabled={!isDirty} className={`px-3 py-2 rounded-lg font-bold text-sm transition shadow-sm ${isDirty ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-gray-100 text-gray-400 cursor-default'}`}>{isDirty ? '저장' : '완료'}</button></div>
                  </div>
                  <div className="bg-orange-50/50 rounded-lg p-3 border border-orange-100 focus-within:ring-2 focus-within:ring-orange-200 transition-all"><textarea className="w-full bg-transparent outline-none text-sm text-gray-600 resize-none" placeholder="📝 이 날의 주요 메모를 남겨보세요... (예: 10시에 호텔 체크아웃, 우산 챙기기)" rows={2} value={memoForm} onChange={(e) => setMemoForm(e.target.value)} onBlur={handleUpdateDayInfo} /></div>
                  <button onClick={() => setIsSwapModalOpen(true)} className="w-full py-2 text-xs font-bold text-gray-500 bg-gray-50 border border-gray-100 rounded hover:bg-gray-100">📤 다른 계획으로 이동 / 보관함 보내기</button>
                </div>

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <DayScheduleList
                      variant="page"
                      schedules={schedules}
                      selectedScheduleId={selectedScheduleId}
                      showInjury={showInjury}
                      onSelect={setSelectedScheduleId}
                      onUpdate={handleUpdateLocal}
                      onDelete={handleDeleteLocal}
                      onInsert={handleInsertEmpty}
                      // ✅ 추가된 Props 전달
                      pickingTarget={pickingTarget}
                      setPickingTarget={setPickingTarget}
                      dayId={dayId}
                  />
                </DndContext>

                <div className="md:hidden absolute bottom-6 left-1/2 -translate-x-1/2 z-40 w-full px-6 pointer-events-none"><button onClick={() => setMobileViewMode('MAP')} className="pointer-events-auto mx-auto bg-gray-900 text-white px-6 py-3 rounded-full shadow-xl font-bold text-sm flex items-center gap-2">🗺️ 지도 보기</button></div>
              </div>
            </div>
            <PlanDaySwapModal isOpen={isSwapModalOpen} onClose={() => setIsSwapModalOpen(false)} onSubmit={handleSwapSubmit} currentDayName={day ? day.dayName : ""} />
          </APIProvider>
        </div>
      </>
  );
}