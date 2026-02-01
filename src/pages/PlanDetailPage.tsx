declare let google: any;

import { useEffect, useState, useMemo, useCallback } from "react";
import {useParams, useNavigate, useBlocker} from "react-router-dom";
import {
    DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent
} from "@dnd-kit/core";
import {
    SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary, InfoWindow, Pin
} from "@vis.gl/react-google-maps";

// API
import { getPlanDetail } from "../api/planApi";
import { createDayInPlan, swapPlanDay, getIndependentDays } from "../api/dayApi";
import { getSchedulesByDay, syncSchedules } from "../api/scheduleApi";
import { createSpot } from "../api/spotApi";

// Components
import ScheduleItem from "../components/schedule/ScheduleItem";
import PlanHeader from "../components/plan/PlanHeader";

// Types
import type { PlanDetailResponse } from "../types/plan";
import type { PlanDayResponse } from "../types/planday";
import type { DayScheduleResponse } from "../types/schedule";
import type { SpotCreateRequest } from "../types/spot";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

const scrollbarHideStyle = `
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
`;

const DAY_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];
const getDayColor = (dayOrder: number) => DAY_COLORS[(dayOrder - 1) % DAY_COLORS.length];

// 🛠️ [유틸] 메모에서 임시 장소 파싱
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

// 🛠️ [유틸] 임시 장소 인코딩
const cleanMemoTags = (memo: string) => {
    if (!memo) return '';
    const text = memo.replace(/#si:\s*\d+/g, '').replace(/#mi:\s*\d+/g, '').replace(/#visited/g, '');
    const split = text.split(TEMP_SPOT_PREFIX);
    return split[0].trim();
};

const encodeTempSpot = (memo: string, spot: { name: string; type: string; lat: number; lng: number }) => {
    const clean = cleanMemoTags(memo);
    const data = JSON.stringify({ n: spot.name, t: spot.type, la: spot.lat, lo: spot.lng });
    return `${clean}${TEMP_SPOT_PREFIX}${data}`;
};

// 🕒 [유틸] 시간 계산 로직
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

// ✅ [수정] 재계산 로직: 물리적 최소 시간과 사용자 설정 시간 비교
const recalculateSchedules = (items: DayScheduleResponse[]): DayScheduleResponse[] => {
    if (!items || items.length === 0) return [];
    const validItems = items.filter(item => item !== undefined && item !== null);
    if (validItems.length === 0) return [];

    const newItems = validItems.map(item => ({ ...item }));

    if (!newItems[0].startTime) newItems[0].startTime = "10:00";
    newItems[0].startTime = newItems[0].startTime.substring(0, 5);
    newItems[0].endTime = addTime(newItems[0].startTime, newItems[0].duration);

    for (let i = 1; i < newItems.length; i++) {
        const prevItem = newItems[i - 1];
        const currentItem = newItems[i];

        const minStartTime = timeToMinutes(prevItem.endTime) + (currentItem.movingDuration || 0);
        const currentStartTime = timeToMinutes(currentItem.startTime || "00:00");

        let finalStartTime = minStartTime; // 기본값 (빈틈없이)

        if (currentItem.startTime) {
            finalStartTime = Math.max(minStartTime, currentStartTime);
        }

        currentItem.startTime = minutesToTime(finalStartTime);
        currentItem.endTime = addTime(currentItem.startTime, currentItem.duration);
    }
    return newItems;
};

function NumberedMarker({ number, color, onClick }: { number: number, color: string, onClick?: () => void }) {
    return (
        <div onClick={onClick} className="relative flex flex-col items-center justify-center filter drop-shadow-md cursor-pointer hover:-translate-y-1 transition-transform group">
            <svg width="30" height="40" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 0C7.16 0 0 7.16 0 16C0 24.8 16 42 16 42C16 42 32 24.8 32 16C32 7.16 24.8 0 16 0Z" fill={color} stroke="white" strokeWidth="2"/>
            </svg>
            <span className="absolute top-[6px] text-white font-bold text-sm">{number}</span>
        </div>
    );
}

// ✅ [수정] 지도 경로 표시 및 카메라 이동
function MapDirections({
                           daySchedulesMap,
                           dayOrderMap,
                           mapViewMode,
                           visibleDays
                       }: {
    daySchedulesMap: Record<number, DayScheduleResponse[]>,
    dayOrderMap: Record<number, number>,
    mapViewMode: 'ALL' | 'PINS' | 'NONE',
    visibleDays: Set<number>
}) {
    const map = useMap();
    const mapsLibrary = useMapsLibrary("maps");
    const [polylines, setPolylines] = useState<google.maps.Polyline[]>([]);

    useEffect(() => {
        if (!map || !mapsLibrary) return;

        polylines.forEach(p => p.setMap(null));
        setPolylines([]);

        if (mapViewMode !== 'ALL') return;

        const newPolylines: google.maps.Polyline[] = [];
        const bounds = new google.maps.LatLngBounds();
        let hasPoints = false;

        Object.entries(daySchedulesMap).forEach(([dayIdStr, schedules]) => {
            const dayId = Number(dayIdStr);
            if (!visibleDays.has(dayId)) return;
            if (!schedules) return;

            const dayOrder = dayOrderMap[dayId] || 1;
            const color = getDayColor(dayOrder);

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
                path.forEach(pos => bounds.extend(pos));
                hasPoints = true;
                const polyline = new mapsLibrary.Polyline({
                    path, geodesic: true, strokeColor: color, strokeOpacity: 0.8, strokeWeight: 5,
                    icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW }, offset: '50%', repeat: '100px' }]
                });
                polyline.setMap(map);
                newPolylines.push(polyline);
            }
        });
        setPolylines(newPolylines);

        // ✅ [추가] 경로가 있으면 지도 뷰포트를 경로에 맞춤
        if (hasPoints && !bounds.isEmpty()) {
            map.fitBounds(bounds);
        }

        return () => newPolylines.forEach(p => p.setMap(null));
    }, [map, mapsLibrary, daySchedulesMap, dayOrderMap, mapViewMode, visibleDays]);

    return null;
}

function EmptySlot({ dayOrder, onCreateNew, onImportSelect }: { dayOrder: number, onCreateNew: () => void, onImportSelect: (id: number) => void }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [mode, setMode] = useState<'MENU' | 'LIST'>('MENU');
    const [candidates, setCandidates] = useState<PlanDayResponse[]>([]);
    const [loading, setLoading] = useState(false);

    const handleLoadList = async () => {
        setMode('LIST'); setLoading(true);
        try { setCandidates(await getIndependentDays()); } catch { alert("로드 실패"); setMode('MENU'); } finally { setLoading(false); }
    };

    if (isExpanded) {
        return (
            <div className="bg-orange-50 rounded-2xl border-2 border-orange-200 p-4 animate-fade-in-down transition-all mb-4">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-orange-800 font-bold flex items-center gap-2">Day {dayOrder} 채우기</h3>
                    <button onClick={() => setIsExpanded(false)} className="text-orange-400 font-bold">✕ 닫기</button>
                </div>
                {mode === 'MENU' ? (
                    <div className="flex gap-3">
                        <button onClick={onCreateNew} className="flex-1 py-3 bg-white border border-orange-200 rounded-xl text-orange-600 font-bold shadow-sm">✨ 새로 만들기</button>
                        <button onClick={handleLoadList} className="flex-1 py-3 bg-white border border-gray-200 rounded-xl text-gray-600 font-bold shadow-sm">📥 가져오기</button>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-orange-100 overflow-hidden max-h-60 overflow-y-auto">
                        {loading ? <div className="p-4 text-center">로딩 중...</div> : candidates.map(day => (
                            <div key={day.id} onClick={() => onImportSelect(day.id)} className="p-3 hover:bg-blue-50 cursor-pointer flex justify-between border-b last:border-0 border-gray-50">
                                <span className="font-bold text-gray-700">{day.dayName}</span><span className="text-xs bg-gray-100 px-2 py-1 rounded">선택</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }
    return (
        <div onClick={() => setIsExpanded(true)} className="group flex items-center gap-3 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 p-4 hover:bg-white hover:border-blue-400 cursor-pointer mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gray-200 text-gray-400 group-hover:bg-blue-500 group-hover:text-white font-bold transition">+</div>
            <div className="text-gray-400 font-bold group-hover:text-blue-600">Day {dayOrder} 일정 추가하기</div>
        </div>
    );
}

function SortableDayItem({
                             id, dayOrder, data, schedules, showInjury, onRefresh, onCreateNew, onImportSelect,
                             onSchedulesChange, setDirty, onToggle, pickingTarget, setPickingTarget,
                             isVisibleOnMap, onToggleMapVisibility
                         }: any) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 999 : 'auto', opacity: isDragging ? 0.5 : 1 };

    const [isEditing, setIsEditing] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [editTitle, setEditTitle] = useState(data?.dayName || "");
    const [isDayDirty, setIsDayDirty] = useState(false);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

    useEffect(() => { if (data) setEditTitle(data.dayName); }, [data]);

    const handleToggle = () => {
        if (!isEditing && data) {
            const newExpanded = !isExpanded;
            setIsExpanded(newExpanded);
            onToggle(data.id, dayOrder, newExpanded);
        }
    };

    const updateLocalSchedules = (newSchedules: DayScheduleResponse[]) => {
        const recalculated = recalculateSchedules(newSchedules);
        onSchedulesChange(data.id, recalculated);
        setIsDayDirty(true);
        setDirty(`day-${data.id}`, true);
    };

    const handleItemUpdate = (itemId: number, updatedData: any) => {
        // @ts-ignore
        const index = schedules.findIndex(s => s && s.id === itemId);
        if (index === -1) return;

        if (updatedData.startTime && index > 0) {
            const prevItem = schedules[index - 1];
            if (prevItem) {
                const prevEndTimeMinutes = timeToMinutes(prevItem.endTime);
                const movingTime = schedules[index].movingDuration || 0;
                const newStartTimeMinutes = timeToMinutes(updatedData.startTime);

                const minPossibleTime = prevEndTimeMinutes + movingTime;

                if (newStartTimeMinutes < minPossibleTime) {
                    alert(`이전 일정 종료(${prevItem.endTime}) 및 이동시간(${movingTime}분)을 고려했을 때,\n${minutesToTime(minPossibleTime)} 이후로만 설정 가능합니다.`);
                    return;
                }
            }
        }

        const currentList = schedules.map((item: any, i: number) => {
            if (i === index) {
                const newItem = { ...item, ...updatedData };
                if (updatedData.isVisit !== undefined && newItem.spot) {
                    newItem.spot = { ...newItem.spot, isVisit: updatedData.isVisit };
                }
                return newItem;
            }
            // ✅ 수정된 아이템 뒤의 일정은 시간을 초기화하여 자동 재계산 유도
            if (i > index) {
                return { ...item, startTime: null };
            }
            return item;
        });

        const recalculated = recalculateSchedules(currentList);
        onSchedulesChange(data.id, recalculated);
        setIsDayDirty(true);
        setDirty(`day-${data.id}`, true);
    };

    const handleItemDelete = (itemId: number) => {
        if(!confirm("삭제하시겠습니까?")) return;
        const filtered = schedules.filter((s: any) => s && s.id !== itemId);
        updateLocalSchedules(filtered);
    };

    const handleItemInsert = (index: number) => {
        let startTime = "10:00";
        if(index > 0 && schedules[index-1]) startTime = schedules[index-1].endTime;

        const newItem: DayScheduleResponse = {
            endTime: "", isVisit: false, lat: 0, lng: 0,
            id: -Date.now(), dayId: data.id, scheduleOrder: index + 1, spotId: 0, spotName: "", spotType: "OTHER",
            startTime, duration: 60, movingDuration: 0, transportation: 'WALK', memo: '', movingMemo: ''
        };
        const newList = [...schedules];
        newList.splice(index, 0, newItem);
        updateLocalSchedules(newList);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            // @ts-ignore
            const oldIndex = schedules.findIndex(s => s && s.id === active.id);
            // @ts-ignore
            const newIndex = schedules.findIndex(s => s && s.id === over.id);
            if (oldIndex !== -1 && newIndex !== -1) {
                // @ts-ignore
                const newOrder = arrayMove(schedules, oldIndex, newIndex);
                updateLocalSchedules(newOrder);
            }
        }
    };

    const handleSaveDay = async (e: any) => {
        e.stopPropagation();

        if(schedules.some((s: any) => s.spotId === 0 && !decodeTempSpot(s.memo) && !s.spotName)) {
            return alert("장소를 선택해주세요.");
        }

        try {
            const syncReq = schedules.map((s: any, idx: number) => ({
                ...s,
                id: s.id < 0 ? null : s.id,
                scheduleOrder: idx + 1,
                spotId: s.spotId === 0 ? null : s.spotId
            }));
            await syncSchedules(data.id, { schedules: syncReq });
            setIsDayDirty(false);
            setDirty(`day-${data.id}`, false);
            alert("저장되었습니다.");
            onRefresh();
        } catch { alert("저장 실패"); }
    };

    const dayColor = getDayColor(dayOrder);
    const safeSchedules = (schedules || []).filter((s: any) => s !== undefined && s !== null);

    return (
        <div ref={setNodeRef} style={style} className="mb-4">
            {data ? (
                <div className={`bg-white rounded-2xl border transition overflow-hidden shadow-sm ${isExpanded ? `border-[${dayColor}]` : 'border-gray-200'}`} style={isExpanded ? { borderColor: dayColor } : {}}>
                    {/* Header */}
                    <div className="p-4 cursor-pointer relative z-10 flex flex-col justify-center min-h-[72px]" onClick={handleToggle}>
                        <div className="flex items-center gap-4 w-full">
                            <div {...attributes} {...listeners} onClick={e => e.stopPropagation()} className="cursor-grab text-gray-300 text-xl px-1 hover:text-orange-500">⠿</div>
                            <div className="w-12 h-12 rounded-xl flex flex-col items-center justify-center border shrink-0 text-white shadow-sm" style={{ backgroundColor: dayColor, borderColor: dayColor }}>
                                <span className="text-[10px] uppercase font-bold opacity-80">Day</span>
                                <span className="text-xl font-extrabold leading-none">{dayOrder}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-bold text-gray-900 truncate">{data.dayName}</h3>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={(e) => { e.stopPropagation(); onToggleMapVisibility(data.id); }}
                                    className={`w-9 h-9 flex items-center justify-center rounded-xl transition ${isVisibleOnMap ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-100' : 'bg-gray-50 text-gray-300 hover:bg-gray-100 hover:text-gray-500'}`}
                                    title={isVisibleOnMap ? "지도에서 숨기기" : "지도에 표시"}
                                >
                                    {isVisibleOnMap ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                                        </svg>
                                    )}
                                </button>

                                {isDayDirty && <button onClick={handleSaveDay} className="bg-orange-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-orange-600 shadow-sm transition">저장하기</button>}
                                <span className="text-gray-400 text-xs ml-1">{isExpanded ? '▲' : '▼'}</span>
                            </div>
                        </div>
                    </div>

                    {isExpanded && (
                        <div className="border-t border-gray-100 p-4 bg-gray-50/30">
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <SortableContext items={safeSchedules.map((s:any) => s.id)} strategy={verticalListSortingStrategy}>
                                    <div className="space-y-4">
                                        {/* ✅ [유지] 일정이 없을 때 클릭 영역 */}
                                        {safeSchedules.length === 0 && (
                                            <div className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 hover:text-blue-500 hover:border-blue-300 transition" onClick={() => handleItemInsert(0)}>
                                                <p className="text-lg font-bold mb-1">+ 일정 추가하기</p>
                                                <p className="text-xs">이 곳을 클릭하여 첫 일정을 만들어보세요!</p>
                                            </div>
                                        )}
                                        {safeSchedules.map((schedule: any, index: number) => (
                                            schedule ?(<ScheduleItem
                                                key={schedule.id}
                                                schedule={schedule}
                                                index={index}
                                                isLast={index === safeSchedules.length - 1}
                                                showInjury={showInjury}
                                                onUpdate={handleItemUpdate}
                                                onDelete={() => handleItemDelete(schedule.id)}
                                                onInsert={handleItemInsert}
                                                // pickingTarget={pickingTarget}
                                                // setPickingTarget={setPickingTarget}
                                                onRequestMapPick={() => {
                                                    if (pickingTarget?.scheduleId === schedule.id) setPickingTarget(null);
                                                    else setPickingTarget({ dayId: data.id, scheduleId: schedule.id });
                                                }}
                                                isPickingMap={pickingTarget?.scheduleId === schedule.id}
                                            />):null
                                        ))}
                                    </div>
                                </SortableContext>
                            </DndContext>

                            {/* ✅ [유지] 추가 버튼 항상 노출 */}
                            {safeSchedules.length > 0 && (
                                <button onClick={() => handleItemInsert(safeSchedules.length)} className="w-full py-3 mt-4 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 font-bold hover:border-orange-400 hover:text-orange-500 hover:bg-orange-50 transition text-sm">
                                    + 맨 아래에 장소 추가
                                </button>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <EmptySlot dayOrder={dayOrder} onCreateNew={() => onCreateNew(dayOrder)} onImportSelect={(src) => onImportSelect(dayOrder, src)} />
            )}
        </div>
    );
}

export default function PlanDetailPage() {
    return (
        <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['places', 'geocoding', 'marker', 'maps']} language="ko" region="KR" version="beta">
            <PlanDetailContent />
        </APIProvider>
    );
}

function PlanDetailContent() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const planId = Number(id);
    const [plan, setPlan] = useState<PlanDetailResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [mapSchedulesMap, setMapSchedulesMap] = useState<Record<number, DayScheduleResponse[]>>({});
    const [dayOrderMap, setDayOrderMap] = useState<Record<number, number>>({});

    const [mapViewMode, setMapViewMode] = useState<'ALL' | 'PINS' | 'NONE'>('ALL');
    const [showInjury, setShowInjury] = useState(false);

    const [visibleDays, setVisibleDays] = useState<Set<number>>(new Set());

    const [mobileViewMode, setMobileViewMode] = useState<'LIST' | 'MAP'>('LIST');
    const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);

    const [pickingTarget, setPickingTarget] = useState<{ dayId: number, scheduleId: number } | null>(null);
    const [tempSelectedSpot, setTempSelectedSpot] = useState<SpotCreateRequest | null>(null);

    const geocodingLibrary = useMapsLibrary("geocoding");
    const placesLibrary = useMapsLibrary("places");
    const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
    const [placesService, setPlacesService] = useState<google.maps.places.PlacesService | null>(null);

    useEffect(() => { if (geocodingLibrary) setGeocoder(new geocodingLibrary.Geocoder()); }, [geocodingLibrary]);
    useEffect(() => { if (placesLibrary) setPlacesService(new placesLibrary.PlacesService(document.createElement('div'))); }, [placesLibrary]);

    const [dirtyMap, setDirtyMap] = useState<Record<string | number, boolean>>({});
    const isAnyDirty = useMemo(() => Object.values(dirtyMap).some(Boolean), [dirtyMap]);

    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) => isAnyDirty && currentLocation.pathname !== nextLocation.pathname
    );

    useEffect(() => {
        if (blocker.state === "blocked") {
            const timer = setTimeout(() => {
                if (window.confirm("저장되지 않은 변경사항이 있습니다.\n정말 이동하시겠습니까?")) {
                    setDirtyMap({});
                    setTimeout(() => blocker.proceed(), 0);
                } else {
                    blocker.reset();
                }
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [blocker]);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isAnyDirty) { e.preventDefault(); e.returnValue = ""; }
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [isAnyDirty]);

    const handleSetDirty = useCallback((itemId: string | number, isDirty: boolean) => {
        setDirtyMap(prev => {
            if (prev[itemId] === isDirty) return prev;
            return { ...prev, [itemId]: isDirty };
        });
    }, []);

    const handleHeaderDirty = useCallback((isDirty: boolean) => {
        handleSetDirty('header', isDirty);
    }, [handleSetDirty]);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

    const fetchPlanDetail = () => {
        setLoading(true);
        getPlanDetail(planId).then(data => {
            setPlan(data);
            const map: Record<number, number> = {};
            data.days.forEach(d => { map[d.id] = d.dayOrder; });
            setDayOrderMap(map);
            setVisibleDays(new Set());
        }).finally(() => setLoading(false));
    };
    useEffect(() => { if (planId) fetchPlanDetail(); }, [planId]);

    const handleToggleMapVisibility = async (dayId: number) => {
        if (!mapSchedulesMap[dayId]) {
            try {
                const raw = await getSchedulesByDay(dayId);
                const calculated = recalculateSchedules(raw);
                setMapSchedulesMap(prev => ({ ...prev, [dayId]: calculated }));
            } catch (error) {
                console.error("일정 로드 실패:", error);
                alert("일정을 불러오지 못했습니다.");
                return;
            }
        }

        setVisibleDays(prev => {
            const next = new Set(prev);
            if (next.has(dayId)) next.delete(dayId);
            else next.add(dayId);
            return next;
        });
    };

    const handleDayToggle = async (dayId: number, dayOrder: number, isOpen: boolean) => {
        if (!isOpen) return;
        if (!mapSchedulesMap[dayId]) {
            try {
                const raw = await getSchedulesByDay(dayId);
                const calculated = recalculateSchedules(raw);
                setMapSchedulesMap(prev => ({ ...prev, [dayId]: calculated }));
                setDayOrderMap(prev => ({ ...prev, [dayId]: dayOrder }));
            } catch {}
        }
    };

    const handleSchedulesChange = useCallback((dayId: number, newSchedules: DayScheduleResponse[]) => {
        setMapSchedulesMap(prev => ({ ...prev, [dayId]: newSchedules }));
    }, []);

    const handleCreateNew = async (dayOrder: number) => { await createDayInPlan(planId, dayOrder, `${dayOrder}일차`); fetchPlanDetail(); };
    const handleImportSelect = async (target: number, source: number) => { await swapPlanDay({ sourceDayId: source, targetPlanId: planId, targetDayOrder: target, swapMode: 'REPLACE' }); fetchPlanDetail(); };
    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        try { /* swap logic... */ fetchPlanDetail(); } catch { alert("이동 실패"); }
    };

    const handleMapClick = useCallback(async (e: any) => {
        if (!pickingTarget) return;
        if (!geocoder) return;

        if (e.domEvent) e.domEvent.stopPropagation();

        const processSpotData = (spotReq: SpotCreateRequest) => {
            setTempSelectedSpot(spotReq);
        };

        if (e.detail.placeId) {
            try {
                // @ts-ignore
                const place = new google.maps.places.Place({ id: e.detail.placeId });
                await place.fetchFields({
                    fields: ['displayName', 'formattedAddress', 'location', 'types', 'googleMapsURI', 'websiteURI']
                });

                processSpotData({
                    spotName: place.displayName || "선택된 장소",
                    spotType: 'OTHER',
                    address: place.formattedAddress || "",
                    lat: place.location?.lat() || 0,
                    lng: place.location?.lng() || 0,
                    placeId: e.detail.placeId,
                    isVisit: false,
                    metadata: { originalTypes: place.types || [] },
                    googleMapUrl: place.googleMapsURI || "",
                    shortAddress: "", website: place.websiteURI || "", description: ""
                });
            } catch (err) {
                console.error("Place details fetch failed:", err);
                alert("장소 정보를 가져오는데 실패했습니다.");
            }
        }
        else if (e.detail.latLng) {
            const lat = e.detail.latLng.lat;
            const lng = e.detail.latLng.lng;
            geocoder.geocode({ location: { lat, lng } }, (results: any, status: any) => {
                if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
                    const place = results[0];
                    const name = place.address_components[0]?.long_name || "지도에서 선택한 위치";
                    processSpotData({
                        spotName: name,
                        spotType: 'OTHER',
                        address: place.formatted_address,
                        lat: lat,
                        lng: lng,
                        placeId: place.place_id,
                        isVisit: false,
                        metadata: {},
                        googleMapUrl: `http://googleusercontent.com/maps.google.com/?q=${lat},${lng}`,
                        shortAddress: "", website: "", description: ""
                    });
                } else {
                    processSpotData({
                        spotName: "지도 임의 위치",
                        spotType: 'OTHER',
                        address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
                        lat: lat,
                        lng: lng,
                        isVisit: false,
                        metadata: {},
                        googleMapUrl: `http://googleusercontent.com/maps.google.com/?q=${lat},${lng}`,
                        shortAddress: "", website: "", description: "", placeId: ""
                    });
                }
            });
        }
    }, [pickingTarget, geocoder]);

    const handleConfirmRegister = async () => {
        if (!tempSelectedSpot || !pickingTarget) return;
        const { dayId, scheduleId } = pickingTarget;

        try {
            const savedSpot = await createSpot(tempSelectedSpot);
            if (!savedSpot || typeof savedSpot.id === 'undefined') {
                throw new Error("장소 저장 실패: ID 없음");
            }

            setMapSchedulesMap(prev => {
                const currentList = prev[dayId] || [];
                const updatedList = currentList.map(s => {
                    if (s && s.id === scheduleId) {
                        return {
                            ...s,
                            spotId: savedSpot.id,
                            spotName: savedSpot.spotName,
                            spotType: savedSpot.spotType,
                            lat: savedSpot.lat,
                            lng: savedSpot.lng,
                            address: savedSpot.address,
                            // ✅ [수정] 장소 등록 시 방문 상태 동기화
                            isVisit: savedSpot.isVisit,
                            spot: savedSpot
                        };
                    }
                    return s;
                });
                return { ...prev, [dayId]: recalculateSchedules(updatedList) };
            });

            handleSetDirty(`day-${dayId}`, true);
            setTempSelectedSpot(null);
            setPickingTarget(null);
        } catch (err) {
            console.error(err);
            alert("장소 등록 중 오류가 발생했습니다.");
        }
    };

    const handleConfirmScheduleOnly = () => {
        if (!tempSelectedSpot || !pickingTarget) return;
        const { dayId, scheduleId } = pickingTarget;

        setMapSchedulesMap(prev => {
            const currentList = prev[dayId] || [];
            const updatedList = currentList.map(s => {
                if (s && s.id === scheduleId) {
                    const encodedMemo = encodeTempSpot(s.memo, {
                        name: tempSelectedSpot.spotName,
                        type: tempSelectedSpot.spotType || 'OTHER',
                        lat: tempSelectedSpot.lat,
                        lng: tempSelectedSpot.lng
                    });

                    return {
                        ...s,
                        spotId: 0,
                        spotName: tempSelectedSpot.spotName,
                        spotType: tempSelectedSpot.spotType,
                        lat: tempSelectedSpot.lat,
                        lng: tempSelectedSpot.lng,
                        address: tempSelectedSpot.address,
                        memo: encodedMemo
                    };
                }
                return s;
            });
            return { ...prev, [dayId]: recalculateSchedules(updatedList) };
        });

        handleSetDirty(`day-${dayId}`, true);
        setTempSelectedSpot(null);
        setPickingTarget(null);
    };

    const fullDays = useMemo(() => {
        if (!plan) return [];
        return Array.from({ length: plan.planDays }, (_, i) => {
            const dayOrder = i + 1;
            const existingDay = plan.days.find(d => d.dayOrder === dayOrder);
            return { id: existingDay ? existingDay.id : `empty-${dayOrder}`, dayOrder, data: existingDay };
        });
    }, [plan]);

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

    if (loading || !plan) return <div className="text-center py-20">로딩 중...</div>;

    return (
        <>
            <style>{scrollbarHideStyle}</style>
            <div className="flex flex-col h-full w-full relative overflow-hidden bg-white">
                <div className="flex w-full h-full relative">
                    <div className={`absolute inset-0 z-20 bg-gray-50 transition-transform duration-300 md:relative md:w-1/2 md:translate-x-0 md:z-auto ${mobileViewMode === 'MAP' ? 'translate-x-0' : '-translate-x-full'}`}>
                        <div className="absolute top-4 right-4 z-50 flex gap-2">
                            <button onClick={() => setShowInjury(!showInjury)} className={`px-4 py-2 rounded-full text-xs font-bold shadow-md transition border ${showInjury ? 'bg-orange-500 text-white border-orange-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                                {showInjury ? '⚽ 인저리타임 ON' : '⚽ 인저리타임 OFF'}
                            </button>
                            <button onClick={toggleMapViewMode} className={`px-4 py-2 rounded-full text-xs font-bold shadow-md transition border bg-white text-blue-600 border-blue-200 hover:bg-blue-50`}>
                                {getMapViewModeLabel()}
                            </button>
                        </div>

                        {pickingTarget && (
                            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-green-600 text-white px-5 py-2.5 rounded-full shadow-lg border-2 border-white cursor-pointer hover:bg-green-700 transition" onClick={() => { setPickingTarget(null); setTempSelectedSpot(null); }}>
                                <span className="font-bold text-sm">📍 지도에서 위치를 클릭하세요!</span>
                                <span className="bg-white/20 px-2 py-0.5 rounded text-xs">취소 X</span>
                            </div>
                        )}

                        <Map
                            defaultCenter={{ lat: 34.9858, lng: 135.7588 }}
                            defaultZoom={13}
                            mapId="DEMO_MAP_ID"
                            disableDefaultUI={true}
                            className="w-full h-full"
                            onClick={handleMapClick}
                            gestureHandling="auto"
                        >
                            <MapDirections
                                daySchedulesMap={mapSchedulesMap}
                                dayOrderMap={dayOrderMap}
                                mapViewMode={mapViewMode}
                                visibleDays={visibleDays}
                            />

                            {mapViewMode !== 'NONE' && Object.entries(mapSchedulesMap).flatMap(([dayIdStr, schedules]) => {
                                const dayId = Number(dayIdStr);
                                if (!visibleDays.has(dayId)) return [];

                                const color = getDayColor(dayOrderMap[dayId] || 1);
                                return (schedules || []).map((schedule, index) => {
                                    if (!schedule) return null;
                                    const temp = decodeTempSpot(schedule.memo);
                                    // @ts-ignore
                                    const lat = Number(schedule.lat || schedule.spot?.lat || temp?.lat);
                                    // @ts-ignore
                                    const lng = Number(schedule.lng || schedule.spot?.lng || temp?.lng);

                                    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return null;
                                    return <AdvancedMarker key={schedule.id} position={{ lat, lng }} onClick={() => setSelectedScheduleId(schedule.id)} zIndex={selectedScheduleId === schedule.id ? 100 : 10}><NumberedMarker number={index + 1} color={color} /></AdvancedMarker>;
                                });
                            })}

                            {tempSelectedSpot && (
                                <>
                                    <AdvancedMarker position={{ lat: tempSelectedSpot.lat, lng: tempSelectedSpot.lng }}>
                                        <Pin background={'#22c55e'} borderColor={'#15803d'} glyphColor={'white'} />
                                    </AdvancedMarker>

                                    <InfoWindow
                                        position={{ lat: tempSelectedSpot.lat, lng: tempSelectedSpot.lng }}
                                        onCloseClick={() => setTempSelectedSpot(null)}
                                        headerContent={<div className="font-bold text-sm">{tempSelectedSpot.spotName}</div>}
                                    >
                                        <div className="p-1 min-w-[200px]">
                                            <p className="text-xs text-gray-500 mb-3">{tempSelectedSpot.address}</p>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={handleConfirmScheduleOnly}
                                                    className="flex-1 bg-white border border-gray-300 text-gray-700 text-xs py-2 rounded-lg hover:bg-gray-50 font-bold"
                                                >
                                                    일정에만 추가
                                                </button>
                                                <button
                                                    onClick={handleConfirmRegister}
                                                    className="flex-1 bg-green-600 text-white text-xs py-2 rounded-lg hover:bg-green-700 font-bold"
                                                >
                                                    내 장소 등록 & 추가
                                                </button>
                                            </div>
                                        </div>
                                    </InfoWindow>
                                </>
                            )}
                        </Map>
                        <div className="md:hidden absolute bottom-4 left-1/2 -translate-x-1/2 z-50"><button onClick={() => setMobileViewMode('LIST')} className="bg-white px-4 py-2 rounded-full shadow-lg font-bold text-xs">🔙 목록</button></div>
                    </div>
                    <div className={`flex flex-col w-full h-full bg-white md:w-1/2 relative z-10 transition-transform duration-300 ${mobileViewMode === 'MAP' ? 'translate-x-full md:translate-x-0' : 'translate-x-0'}`}>
                        <div className="px-5 py-4 border-b border-gray-100 bg-white z-30 flex-shrink-0">
                            <button onClick={() => navigate('/plans')} className="text-gray-500 font-bold text-sm hover:text-gray-900 mb-2">← 목록으로</button>
                            <PlanHeader plan={plan} onRefresh={fetchPlanDetail} onDirtyChange={handleHeaderDirty} />
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 pb-24 bg-white scrollbar-hide">
                            <h2 className="text-xl font-bold text-gray-800 mb-4 px-1">상세 일정</h2>
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <SortableContext items={fullDays.map(d => d.id)} strategy={verticalListSortingStrategy}>
                                    <div className="space-y-4">
                                        {fullDays.map(item => (
                                            <SortableDayItem
                                                key={item.id} id={item.id} dayOrder={item.dayOrder} data={item.data}
                                                schedules={item.data?.id ? mapSchedulesMap[item.data.id] || [] : []}
                                                showInjury={showInjury}
                                                onSchedulesChange={handleSchedulesChange}
                                                onRefresh={fetchPlanDetail} onCreateNew={handleCreateNew} onImportSelect={handleImportSelect}
                                                setDirty={handleSetDirty} onToggle={handleDayToggle}
                                                pickingTarget={pickingTarget}
                                                setPickingTarget={setPickingTarget}

                                                isVisibleOnMap={item.data ? visibleDays.has(item.data.id) : false}
                                                onToggleMapVisibility={handleToggleMapVisibility}
                                            />
                                        ))}
                                    </div>
                                </SortableContext>
                            </DndContext>
                        </div>
                        <div className="md:hidden absolute bottom-6 left-1/2 -translate-x-1/2 z-40 w-full px-6 pointer-events-none"><button onClick={() => setMobileViewMode('MAP')} className="pointer-events-auto mx-auto bg-gray-900 text-white px-6 py-3 rounded-full shadow-xl font-bold text-sm">🗺️ 지도 보기</button></div>
                    </div>
                </div>
            </div>
        </>
    );
}