import { useState, useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMapsLibrary, useMap } from "@vis.gl/react-google-maps";

// API & Utils
import { createSpot, getMySpots } from "../../api/spotApi";
import { estimateRoute } from "../../api/routeApi";
import { getSpotDisplayName, getSpotTypeInfo, mapGoogleTypeToSpotType } from "../../utils/spotUtils";
import { decodeGooglePolyline } from "../../utils/polylineUtils";

// Types
import type { DayScheduleResponse, ScheduleUpdateRequest } from "../../types/schedule";
import type {SpotType, Transportation} from "../../types/enums";
import type { SpotResponse, SpotCreateRequest } from "../../types/spot";
import type { RouteEstimateResponse } from "../../types/route";

const GOOGLE_TYPE_LABELS: Record<string, string> = {
    restaurant: '음식점',
    cafe: '카페',
    coffee_shop: '카페',
    tourist_attraction: '관광명소',
    park: '공원',
    lodging: '숙소',
    hotel: '호텔',
    store: '상점',
    shopping_mall: '쇼핑몰',
    transit_station: '교통시설',
    train_station: '기차역',
    subway_station: '지하철역',
    bus_station: '버스정류장',
    museum: '박물관',
    university: '대학교',
    school: '학교',
    hospital: '병원',
    establishment: '시설',
    point_of_interest: '명소',
};

const getGoogleTypeLabel = (spot: SpotResponse) => {
    const types = Array.isArray(spot.metadata?.googleTypes)
        ? spot.metadata.googleTypes.filter((type): type is string => typeof type === 'string')
        : [];
    return types.map(type => GOOGLE_TYPE_LABELS[type]).find(Boolean) || getSpotTypeInfo(spot.spotType).label;
};

interface Props {
    schedule: DayScheduleResponse;
    previousSchedule?: DayScheduleResponse | null;
    routeDate?: string;
    index: number;
    showInjury: boolean;
    // 훅에서 전달받는 개별 작업 핸들러들
    onUpdate: (id: number, req: ScheduleUpdateRequest) => Promise<void>;
    onDelete: (id: number) => void;
    onInsert: (orderIndex: number) => void;
    onToggleVisit: (id: number) => void;
    onRequestMapPick: () => void;
    isPickingMap: boolean;
}

// 시간 포맷 유틸리티
const formatDurationWithInjury = (total: number, injury: number, showInjury: boolean) => {
    const base = Math.max(0, total - injury);
    const h = Math.floor(base / 60);
    const m = base % 60;
    const baseStr = m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
    if (base < 60) {
        return showInjury && injury > 0 ? `${base}분 (+${injury}분)` : `${base}분`;
    }
    return showInjury && injury > 0 ? `${baseStr} (+${injury}분)` : baseStr;
};

const formatSimple = (minutes: number) => {
    if(!minutes) return "0분";
    if(minutes < 60) return `${minutes}분`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
};

const addTimeStr = (startTime: string, duration: number) => {
    if (!startTime) return "";
    const [h, m] = startTime.split(':').map(Number);
    const total = h * 60 + m + duration;
    const endH = Math.floor(total / 60) % 24;
    const endM = total % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
};

const subTimeStr = (startTime: string, duration: number) => {
    if (!startTime) return "";
    const [h, m] = startTime.split(':').map(Number);
    const total = h * 60 + m - duration;
    const startH = Math.floor((total < 0 ? 0 : total) / 60) % 24;
    const startM = (total < 0 ? 0 : total) % 60;
    return `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
};

const INJURY_OPTIONS = [0, 5, 10, 15];

export default function ScheduleItem({
                                         schedule, previousSchedule, routeDate, index, showInjury, onUpdate, onDelete, onInsert, onToggleVisit, onRequestMapPick, isPickingMap
                                     }: Props) {
    // dnd-kit 설정
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: schedule.id });
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 999 : 'auto' };

    const map = useMap();
    const placesLibrary = useMapsLibrary("places");
    const [sessionToken, setSessionToken] = useState<google.maps.places.AutocompleteSessionToken | null>(null);

    // 상태 관리
    const [editMode, setEditMode] = useState<'NONE' | 'MAIN' | 'MOVE'>('NONE');
    const [searchTerm, setSearchTerm] = useState("");
    const [searchMode, setSearchMode] = useState<'MINE' | 'GOOGLE'>('MINE');
    const [searchResults, setSearchResults] = useState<SpotResponse[]>([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const routePolylineRef = useRef<google.maps.Polyline | null>(null);
    const autoMovingMemoRef = useRef("");
    const [routeEstimate, setRouteEstimate] = useState<RouteEstimateResponse | null>(null);
    const [routeLoading, setRouteLoading] = useState(false);
    const [routeError, setRouteError] = useState("");
    const [spotFeedback, setSpotFeedback] = useState<{ type: 'success' | 'info' | 'error', message: string } | null>(null);

    const [stayInjury, setStayInjury] = useState(0);
    const [moveInjury, setMoveInjury] = useState(0);
    const [baseStay, setBaseStay] = useState(0);
    const [baseMove, setBaseMove] = useState(0);

    const [form, setForm] = useState({
        spotUserId: schedule.spotUserId,
        startTime: schedule.startTime ? schedule.startTime.substring(0, 5) : '',
        fixedStartTime: schedule.fixedStartTime || false,
        duration: schedule.duration ?? 60,
        transportation: schedule.transportation || 'WALK',
        movingDuration: schedule.movingDuration || 0,
        movingMemo: schedule.movingMemo || '',
        memo: schedule.memo || '',
    });

    const [selectedSpotInfo, setSelectedSpotInfo] = useState<{name: string, type: SpotType, lat?: number, lng?: number} | null>(null);

    const supportsAutomaticRoute = (transportation: Transportation) =>
        transportation !== 'BUS'
        && transportation !== 'SHIP'
        && transportation !== 'AIRPLANE';

    const calculateRoute = async (
        destinationLat?: number,
        destinationLng?: number,
        transportation: Transportation = form.transportation,
    ) => {
        if (
            previousSchedule?.lat == null ||
            previousSchedule?.lng == null ||
            destinationLat == null ||
            destinationLng == null
        ) {
            setRouteError("이전 장소와 현재 장소의 위치 정보가 필요합니다.");
            return;
        }
        if (!supportsAutomaticRoute(transportation)) {
            setRouteEstimate(null);
            setRouteError("이 이동수단은 Google 지도에서 확인 후 소요시간을 직접 입력해 주세요.");
            return;
        }

        setRouteLoading(true);
        setRouteError("");
        try {
            const result = await estimateRoute({
                originLat: previousSchedule.lat,
                originLng: previousSchedule.lng,
                destinationLat,
                destinationLng,
                transportation,
                departureTime: routeDate && previousSchedule?.endTime
                    ? `${routeDate}T${previousSchedule.endTime.substring(0, 8)}`
                    : undefined,
            });
            setRouteEstimate(result);
            setBaseMove(result.durationMinutes);
            const generatedMemo = result.movingMemo?.trim();
            if (generatedMemo) {
                const previousGeneratedMemo = autoMovingMemoRef.current;
                setForm(current => {
                    if (current.movingMemo.trim() && current.movingMemo !== previousGeneratedMemo) {
                        return current;
                    }
                    return { ...current, movingMemo: generatedMemo };
                });
                autoMovingMemoRef.current = generatedMemo;
            }
        } catch (error) {
            setRouteEstimate(null);
            setRouteError(error instanceof Error ? error.message : "경로를 계산하지 못했습니다.");
        } finally {
            setRouteLoading(false);
        }
    };

    const calculateCurrentRoute = (transportation: Transportation = form.transportation) => {
        const destination = selectedSpotInfo || (
            schedule.lat != null && schedule.lng != null
                ? { lat: schedule.lat, lng: schedule.lng }
                : null
        );
        void calculateRoute(destination?.lat, destination?.lng, transportation);
    };

    const handleTransportationChange = (transportation: Transportation) => {
        setForm(current => ({ ...current, transportation }));
        setRouteEstimate(null);
        setRouteError("");
    };

    useEffect(() => {
        routePolylineRef.current?.setMap(null);
        routePolylineRef.current = null;

        if (!map || !routeEstimate?.encodedPolyline) return;

        try {
            const path = decodeGooglePolyline(routeEstimate.encodedPolyline);
            if (path.length === 0) return;

            const polyline = new google.maps.Polyline({
                map,
                path,
                strokeColor: "#2563EB",
                strokeOpacity: 0.9,
                strokeWeight: 5,
                zIndex: 50,
            });
            routePolylineRef.current = polyline;

            const bounds = new google.maps.LatLngBounds();
            path.forEach(point => bounds.extend(point));
            map.fitBounds(bounds, 64);
        } catch (error) {
            console.warn("Google 경로선을 지도에 표시하지 못했습니다.", error);
        }

        return () => {
            routePolylineRef.current?.setMap(null);
            routePolylineRef.current = null;
        };
    }, [map, routeEstimate]);

    // 데이터 초기화 및 동기화
    useEffect(() => {
        if (!schedule) return;

        // 백엔드 필드에서 인저리 타임 직접 로드
        const sInjury = schedule.extraDuration || 0;
        const mInjury = schedule.extraMovingDuration || 0;

        setStayInjury(sInjury);
        setMoveInjury(mInjury);
        setBaseStay(Math.max(0, (schedule.duration ?? 60) - sInjury));
        setBaseMove(Math.max(0, (schedule.movingDuration || 0) - mInjury));

        setForm({
            spotUserId: schedule.spotUserId,
            startTime: schedule.startTime ? schedule.startTime.substring(0, 5) : '',
            fixedStartTime: schedule.fixedStartTime || false,
            duration: schedule.duration ?? 60,
            transportation: schedule.transportation || 'WALK',
            movingDuration: schedule.movingDuration || 0,
            movingMemo: schedule.movingMemo || '',
            memo: schedule.memo || '',
        });

        if (schedule.spotName) {
            setSearchTerm(schedule.spotName);
            setSelectedSpotInfo({
                name: schedule.spotName,
                type: schedule.spotType || 'OTHER',
                lat: schedule.lat,
                lng: schedule.lng
            });
        }
    }, [schedule]);

    // 장소 검색 로직 (세션 토큰 생성)
    useEffect(() => {
        if (placesLibrary && !sessionToken) setSessionToken(new placesLibrary.AutocompleteSessionToken());
    }, [placesLibrary, sessionToken]);

    // 구글/내 장소 검색 실행
    useEffect(() => {
        const safeSearchTerm = searchTerm || "";
        if (editMode === 'NONE' || safeSearchTerm.trim() === "") {
            setSearchResults([]); return;
        }
        const timer = setTimeout(async () => {
            try {
                if (searchMode === 'MINE') {
                    const res = await getMySpots({ keyword: safeSearchTerm, page: 0, size: 20 });
                    setSearchResults(res.content);
                    setIsDropdownOpen(true);
                } else {
                    if (!placesLibrary || !sessionToken) return;
                    const request = { input: safeSearchTerm, sessionToken, language: 'ko' };
                    const { suggestions } = await placesLibrary.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
                    const mappedResults = suggestions.flatMap((suggestion): SpotResponse[] => {
                        const prediction = suggestion.placePrediction;
                        if (!prediction) return [];
                        return [{
                            id: 0,
                            placeId: prediction.placeId,
                            spotName: prediction.mainText?.text || prediction.text.text.split(',')[0],
                            address: prediction.secondaryText?.text || prediction.text.text,
                            spotType: mapGoogleTypeToSpotType(prediction.types || []),
                            lat: 0,
                            lng: 0,
                            isVisit: false,
                            metadata: { googleTypes: prediction.types || [] },
                            userMetadata: {},
                        }];
                    });
                    setSearchResults(mappedResults);
                    setIsDropdownOpen(true);
                }
            } catch { setSearchResults([]); }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm, editMode, searchMode, placesLibrary, selectedSpotInfo, sessionToken]);

    // 외부 클릭 시 드롭다운 닫기
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsDropdownOpen(false);
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // 장소 선택 핸들러
    const handleSpotSelect = async (spot: SpotResponse) => {
        if (!spot.id || spot.id === 0) {
            setIsRegistering(true);
            setSpotFeedback(null);
            try {
                const place = new google.maps.places.Place({ id: spot.placeId });
                await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'types'] });
                if (place.location) {
                    const createReq: SpotCreateRequest = {
                        placeId: spot.placeId!,
                        spotName: place.displayName || spot.spotName,
                        spotType: mapGoogleTypeToSpotType(place.types),
                        address: place.formattedAddress || spot.address || '',
                        lat: place.location.lat(),
                        lng: place.location.lng(),
                        isVisit: false,
                        metadata: {}
                    };
                    const mySpots = await getMySpots({ keyword: createReq.spotName, page: 0, size: 50 });
                    const existingSpot = mySpots.content.find(item => item.placeId === createReq.placeId);
                    if (existingSpot) {
                        updateFormWithSpot(existingSpot.id, existingSpot);
                        setSearchMode('MINE');
                        setSpotFeedback({ type: 'info', message: '이미 내 장소에 등록되어 있어 기존 장소를 선택했습니다.' });
                        return;
                    }

                    const savedSpot = await createSpot(createReq);
                    updateFormWithSpot(savedSpot.id, savedSpot);
                    setSearchMode('MINE');
                    setSpotFeedback({ type: 'success', message: '내 장소에 등록하고 일정에 선택했습니다.' });
                }
            } catch (error) {
                setSpotFeedback({
                    type: 'error',
                    message: error instanceof Error ? error.message : '장소 등록에 실패했습니다.'
                });
            } finally { setIsRegistering(false); }
        } else {
            updateFormWithSpot(spot.id, spot);
            setSpotFeedback({ type: 'info', message: '내 장소에서 선택했습니다.' });
        }
    };

    const updateFormWithSpot = (id: number, spot: SpotResponse) => {
        setForm(current => ({ ...current, spotUserId: id }));
        const displayName = getSpotDisplayName(spot);
        setSearchTerm(displayName);
        setSelectedSpotInfo({ name: displayName, type: spot.spotType, lat: spot.lat, lng: spot.lng });
        setIsDropdownOpen(false);
        setRouteEstimate(null);
        setRouteError("");
    };

    // 완료 버튼 클릭 시 개별 업데이트 요청
    const handleDone = async () => {
        const finalName = (searchTerm || "").trim();
        if (!finalName) return alert("장소 이름을 입력해주세요.");

        const finalSpotInfo = selectedSpotInfo || (schedule.spotName ? { name: schedule.spotName, type: schedule.spotType, lat: schedule.lat, lng: schedule.lng } : null);
        if (!finalSpotInfo?.lat) return alert("장소 정보가 없습니다.");

        const updatePayload: ScheduleUpdateRequest = {
            spotUserId: form.spotUserId,
            spotName: finalName,
            lat: finalSpotInfo.lat,
            lng: finalSpotInfo.lng,
            spotType: finalSpotInfo.type,
            startTime: form.startTime,
            fixedStartTime: form.fixedStartTime,
            duration: baseStay + stayInjury,
            movingDuration: baseMove + moveInjury,
            extraDuration: stayInjury,
            extraMovingDuration: moveInjury,
            transportation: form.transportation,
            memo: form.memo,
            movingMemo: form.movingMemo
        };

        try {
            await onUpdate(schedule.id, updatePayload);
            setEditMode('NONE');
        } catch (error) {
            alert(error instanceof Error ? error.message : "스케줄 수정에 실패했습니다.");
        }
    };

    const handleCancel = () => {
        if (!schedule.spotUserId && !schedule.spotName) onDelete(schedule.id);
        else { setEditMode('NONE'); setSearchTerm(schedule.spotName || ""); }
    };

    const typeInfo = getSpotTypeInfo(schedule.spotType || 'OTHER');
    const spotEndTime = addTimeStr(form.startTime, form.duration);
    const moveStartTime = subTimeStr(form.startTime, form.movingDuration);

    const getTransIcon = (type: Transportation) => {
        const icons: Record<string, string> = { WALK: '🚶', BUS: '🚌', TRAIN: '🚃', TAXI: '🚕', CAR: '🚗', SHIP: '🚢', AIRPLANE: '✈️' };
        return icons[type] || '➡️';
    };
    const getTransLabel = (type: Transportation) => {
        const labels: Record<string, string> = { WALK: '도보', BUS: '버스', TRAIN: '열차', TAXI: '택시', CAR: '자동차', SHIP: '배', AIRPLANE: '비행기' };
        return labels[type] || '이동';
    };

    const routeDestination = selectedSpotInfo || (
        schedule.lat != null && schedule.lng != null
            ? { lat: schedule.lat, lng: schedule.lng }
            : null
    );
    const googleMapsDirectionsUrl = previousSchedule?.lat != null
        && previousSchedule?.lng != null
        && routeDestination?.lat != null
        && routeDestination?.lng != null
        ? `https://www.google.com/maps/dir/?api=1&origin=${previousSchedule.lat},${previousSchedule.lng}&destination=${routeDestination.lat},${routeDestination.lng}&travelmode=transit`
        : null;

    const routeEstimator = index > 0 ? (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/70 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <div className="text-xs font-black text-blue-800">
                        {form.transportation === 'TRAIN' ? 'NAVITIME 열차 소요시간' : 'Google Maps 이동시간'}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-blue-500">
                        {previousSchedule?.spotName || "이전 장소"} → {selectedSpotInfo?.name || schedule.spotName || "현재 장소"}
                    </div>
                </div>
                <button
                    type="button"
                    disabled={routeLoading || isRegistering || !supportsAutomaticRoute(form.transportation)}
                    onClick={() => calculateCurrentRoute()}
                    className="shrink-0 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 shadow-sm hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isRegistering ? "장소 등록 중…" : routeLoading ? "검색 중…" : routeEstimate ? "다시 검색" : "소요시간 검색"}
                </button>
            </div>
            <select
                className="mb-2 w-full rounded-lg border border-blue-200 bg-white p-2 text-sm font-bold text-blue-900 outline-none focus:ring-2 focus:ring-blue-300"
                value={form.transportation}
                onChange={event => handleTransportationChange(event.target.value as Transportation)}
            >
                <option value="WALK">🚶 도보</option>
                <option value="BUS">🚌 버스·대중교통</option>
                <option value="TRAIN">🚆 전철·대중교통</option>
                <option value="TAXI">🚕 택시</option>
                <option value="CAR">🚗 자동차</option>
                <option value="BICYCLE">🚲 자전거</option>
                <option value="MOTORCYCLE">🏍️ 오토바이</option>
                <option value="SHIP">⛴️ 배 (수동 입력)</option>
                <option value="AIRPLANE">✈️ 항공 (수동 입력)</option>
            </select>
            {(form.transportation === 'BUS' || form.transportation === 'TRAIN') && googleMapsDirectionsUrl && (
                <a
                    href={googleMapsDirectionsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mb-2 block rounded-lg border border-blue-200 bg-white px-3 py-2 text-center text-xs font-bold text-blue-700 shadow-sm hover:bg-blue-100"
                >
                    Google 지도에서 경로 확인
                </a>
            )}
            {routeEstimate && (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                    <span className="shrink-0 font-bold text-blue-900">
                        약 {routeEstimate.durationMinutes}분
                    </span>
                    <span className="truncate text-xs text-gray-500">
                        {(routeEstimate.distanceMeters / 1000).toFixed(1)}km · 일정에 자동 반영
                    </span>
                </div>
            )}
            {routeError && (
                <div className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-orange-600">
                    {routeError}
                </div>
            )}
        </div>
    ) : null;

    const timeDisplay = schedule.startTime ? `${schedule.startTime.substring(0, 5)} - ${spotEndTime}` : "시간 미정";
    const durationDisplay = `체류 ${formatDurationWithInjury(schedule.duration, stayInjury, showInjury)}`;

    return (
        <div ref={setNodeRef} style={style} className="relative group mb-3">
            <div className="flex items-stretch gap-3">
                {/* 1. 드래그 핸들 */}
                <div className="flex flex-col items-center pt-4 w-8 shrink-0">
                    <div {...attributes} {...listeners} className="cursor-grab text-gray-300 hover:text-orange-500 mb-1 text-xl">⠿</div>
                    <div className="w-0.5 bg-gray-200 grow"></div>
                </div>

                <div className="flex-1 min-w-0 pb-2">
                    {/* 2. 이동 경로 섹션 */}
                    {(schedule.movingDuration > 0 || editMode === 'MOVE') && (
                        <div className="mb-3 relative">
                            <div className={`rounded-xl border transition cursor-pointer relative z-10 ${editMode === 'MOVE' ? 'bg-white border-blue-400 ring-2 ring-blue-100 p-4' : 'bg-blue-50 border-blue-100 hover:border-blue-300 p-3 flex items-center justify-between'}`} onClick={() => editMode === 'NONE' && setEditMode('MOVE')}>
                                {editMode !== 'MOVE' ? (
                                    <>
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="w-8 h-8 rounded-full bg-white border border-blue-200 flex items-center justify-center text-sm shadow-sm shrink-0 text-blue-600">
                                                {getTransIcon(schedule.transportation)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-bold text-blue-800 truncate">{schedule.movingMemo || `${getTransLabel(schedule.transportation)} 이동`}</div>
                                                {schedule.startTime && schedule.movingDuration > 0 && <div className="text-xs text-blue-400 font-mono mt-0.5">{moveStartTime} - {schedule.startTime.substring(0, 5)}</div>}
                                            </div>
                                        </div>
                                        <div className="text-sm font-bold text-blue-600 bg-white px-3 py-1 rounded-lg border border-blue-200 whitespace-nowrap ml-3 shadow-sm shrink-0">
                                            {formatDurationWithInjury(schedule.movingDuration, moveInjury, showInjury)}
                                        </div>
                                    </>
                                ) : (
                                    <div className="w-full" onClick={e => e.stopPropagation()}>
                                        <div className="flex justify-between items-center mb-3"><div className="font-bold text-blue-800 text-sm">이동 경로 설정</div></div>
                                        <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                                            <div className="flex justify-between items-center mb-2">
                                                <label className="text-xs text-blue-600 font-bold">기본 소요 시간</label>
                                                <div className="flex items-center gap-2">
                                                <input type="number" className="w-16 p-1 text-right border rounded font-bold text-blue-700" value={baseMove} onChange={e => setBaseMove(Math.max(0, Number(e.target.value)))} /><span className="text-xs">분</span>
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center border-t border-blue-100 pt-2">
                                                <label className="text-xs text-orange-500 font-bold">⚽ 인저리 타임</label>
                                                <div className="flex items-center gap-1">
                                                    {INJURY_OPTIONS.map(m => (
                                                        <button key={m} onClick={() => setMoveInjury(m)} className={`text-[10px] px-2 py-0.5 rounded border ${moveInjury === m ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-500 border-gray-200'}`}>{m === 0 ? '0' : `+${m}`}</button>
                                                    ))}
                                                    <input type="number" className="w-12 p-1 text-right border rounded font-bold text-orange-600" value={moveInjury} onChange={e => setMoveInjury(Math.max(0, Number(e.target.value)))} /><span className="text-xs">분</span>
                                                </div>
                                            </div>
                                            <div className="text-right mt-2 text-xs font-bold text-gray-500">총 {formatSimple(baseMove + moveInjury)}</div>
                                        </div>
                                        {routeEstimator}
                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                            <div><label className="text-xs text-blue-600 font-bold mb-1 block">수단</label><select className="w-full p-2 border border-blue-200 rounded-lg bg-white text-sm outline-none focus:ring-2 focus:ring-blue-300" value={form.transportation} onChange={e => handleTransportationChange(e.target.value as Transportation)}><option value="WALK">🚶 도보</option><option value="BUS">🚌 버스</option><option value="TRAIN">🚃 열차</option><option value="TAXI">🚕 택시</option><option value="CAR">🚗 자동차</option><option value="SHIP">🚢 배</option><option value="AIRPLANE">✈️ 비행기</option></select></div>
                                            <div><label className="text-xs text-blue-600 font-bold mb-1 block">이동 메모</label><input type="text" className="w-full p-2 border border-blue-200 rounded-lg bg-white text-sm outline-none focus:ring-2 focus:ring-blue-300" placeholder="예) 205번 버스" value={form.movingMemo} onChange={e => setForm({...form, movingMemo: e.target.value})} /></div>
                                        </div>
                                        <div className="flex gap-2"><button onClick={handleCancel} className="flex-1 bg-white border border-blue-200 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">취소</button><button onClick={handleDone} className="flex-1 bg-blue-500 text-white py-2 rounded-lg text-sm font-bold hover:bg-blue-600">확인</button></div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 이동 시간 추가 버튼 (index 활용) */}
                    {index !== 0 && schedule.movingDuration === 0 && editMode === 'NONE' && (
                        <div className="mb-2 flex justify-center group/add-move">
                            <button onClick={() => setEditMode('MOVE')} className="text-xs text-gray-400 font-bold bg-gray-50 px-3 py-1 rounded-full border border-gray-200 opacity-0 group-hover:opacity-100 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition opacity-0 group-hover:opacity-100 group-hover/add-move:opacity-100 flex items-center gap-1">
                                <span>➕</span> 이동 시간 추가
                            </button>
                        </div>
                    )}

                    {/* 3. 메인 일정 카드 */}
                    <div className={`rounded-2xl border transition relative z-10 overflow-hidden shadow-sm 
                      ${editMode === 'MAIN' ? 'border-orange-400 ring-2 ring-orange-100 bg-white' : 'bg-white border-gray-200 hover:border-orange-300 cursor-pointer'}
                      ${isPickingMap ? 'ring-4 ring-green-400 border-green-500' : ''}`}
                         onClick={() => editMode === 'NONE' && setEditMode('MAIN')}>
                        {editMode !== 'MAIN' ? (
                            <div className="p-3 md:p-4">
                                <div className="flex gap-3 md:gap-4 items-start">
                                    <div className="flex flex-col items-center gap-2 shrink-0 pt-1">
                                        <div onClick={(e) => { e.stopPropagation(); onToggleVisit(schedule.id); }} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition hover:scale-110 z-20 cursor-pointer ${schedule.isChecked ? 'bg-green-50 border-green-500 shadow-sm' : 'bg-white border-gray-300 hover:border-orange-400'}`}>
                                            {schedule.isChecked && <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                                        </div>
                                        <div className="text-3xl shrink-0 filter drop-shadow-sm">{typeInfo.icon}</div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-1">
                                            <h3 className="text-base md:text-lg font-bold truncate leading-tight text-gray-900">{schedule.spotName || "장소 선택"}</h3>
                                            <div className="hidden md:block text-right shrink-0">
                                                <div className="text-base font-bold font-mono tracking-tight text-gray-800 whitespace-nowrap">{schedule.startTime ? timeDisplay : <span className="text-xs text-orange-400">"시간 미정"</span>}</div>
                                                <div className="text-xs text-gray-400 mt-1 whitespace-nowrap">{durationDisplay}</div>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 mt-1.5 md:mt-1">
                                            <span className="text-xs px-2 py-0.5 rounded border bg-gray-100 text-gray-500 border-gray-200 whitespace-nowrap">{typeInfo.label}</span>
                                            <div className="flex md:hidden items-center gap-2 text-xs text-gray-600 font-medium">
                                                <span className="font-mono whitespace-nowrap">{schedule.startTime ? timeDisplay : "시간 미정"}</span>
                                                <span className="text-gray-300">|</span>
                                                <span className="whitespace-nowrap">{durationDisplay}</span>
                                            </div>
                                            {schedule.movingDuration > 0 && <span className="text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded flex items-center gap-1 font-medium whitespace-nowrap">⏱ {schedule.movingDuration}분 이동</span>}
                                            {schedule.fixedStartTime && <span className="text-xs text-violet-600 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded font-bold whitespace-nowrap">📌 시작 고정</span>}
                                        </div>
                                    </div>
                                </div>
                                {schedule.memo && <div className="mt-3 text-sm p-2.5 rounded-lg border-l-4 bg-gray-50 text-gray-600 border-gray-200">{schedule.memo}</div>}
                                {isPickingMap && <div className="mt-2 text-center text-xs font-bold text-green-600 animate-pulse bg-green-50 py-1 rounded border border-green-200">🗺️ 지도에서 장소를 클릭하세요!</div>}
                            </div>
                        ) : (
                            <div className="p-5 bg-white" onClick={e => e.stopPropagation()}>
                                <div className="flex justify-between mb-4 pb-2 border-b border-gray-100">
                                    <h3 className="font-bold text-base text-gray-800">일정 편집</h3>
                                    <button onClick={() => onDelete(schedule.id)} className="text-sm text-red-500 font-bold hover:underline">삭제</button>
                                </div>
                                <div className="mb-4 relative" ref={dropdownRef}>
                                    <div className="flex justify-between items-end mb-1">
                                        <label className="text-sm text-gray-500 font-bold">장소 이름</label>
                                        <button onClick={onRequestMapPick} className={`text-xs font-bold px-2 py-1 rounded border transition flex items-center gap-1 ${isPickingMap ? 'bg-green-500 text-white border-green-500' : 'bg-white text-green-600 border-green-200 hover:bg-green-50'}`}>{isPickingMap ? '📍 선택 중...' : '🗺️ 지도에서 찍기'}</button>
                                    </div>
                                    <div className="flex bg-gray-100 p-1 rounded-lg mb-2">
                                        <button onClick={() => setSearchMode('MINE')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${searchMode === 'MINE' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>내 장소</button>
                                        <button onClick={() => setSearchMode('GOOGLE')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${searchMode === 'GOOGLE' ? 'bg-white text-orange-500 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>구글 검색</button>
                                    </div>
                                    <input type="text" className={`w-full p-3 border rounded-xl font-bold outline-none transition ${searchMode === 'MINE' ? 'bg-blue-50/50 border-blue-100 focus:bg-white focus:ring-2 focus:ring-blue-300 text-blue-900 placeholder-blue-300' : 'bg-orange-50/50 border-orange-100 focus:bg-white focus:ring-2 focus:ring-orange-300 text-orange-900 placeholder-orange-300'}`} placeholder="장소 검색..." value={searchTerm} onFocus={() => { if(searchTerm.trim()) setIsDropdownOpen(true); }} onChange={(e) => { setSearchTerm(e.target.value); setIsDropdownOpen(e.target.value.trim() !== ""); }} />
                                    {spotFeedback && (
                                        <div className={`mt-2 rounded-lg border px-3 py-2 text-xs font-bold ${
                                            spotFeedback.type === 'error'
                                                ? 'border-red-200 bg-red-50 text-red-600'
                                                : spotFeedback.type === 'success'
                                                    ? 'border-green-200 bg-green-50 text-green-700'
                                                    : 'border-blue-200 bg-blue-50 text-blue-700'
                                        }`}>
                                            {spotFeedback.message}
                                        </div>
                                    )}
                                    {searchMode === 'GOOGLE' && (
                                        <p className="mt-2 ml-1 text-[11px] text-orange-400 font-bold animate-pulse">
                                            💡 주변에 무엇이 있는지 모를 땐 '탐색'에서 찾아보는 것을 권장합니다!
                                        </p>
                                    )}
                                    {isDropdownOpen && searchTerm.trim() !== "" && (
                                        <div className="absolute z-50 w-full mt-2 bg-white border border-gray-100 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                                            {searchResults.length === 0 ? (
                                                <div className="p-4 text-center text-xs text-gray-400">결과 없음</div>
                                            ) : (
                                                searchResults.map((spot, i) => {
                                                    const isGoogle = !!spot.placeId && (!spot.id || spot.id === 0);
                                                    return (
                                                        <div key={i}
                                                             className="px-4 py-3 hover:bg-orange-50 cursor-pointer border-b border-gray-50 flex flex-col gap-1"
                                                             onClick={() => handleSpotSelect(spot)}>
                                                            <div className="flex items-center gap-2">
                                                                <span
                                                                    className="font-bold text-gray-900 text-sm leading-tight">{getSpotDisplayName(spot)}</span>
                                                                {isGoogle && (
                                                                    <span
                                                                        className="text-[9px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded font-black border border-blue-100">GOOGLE</span>
                                                                )}
                                                            </div>
                                                            <span
                                                                className="text-[11px] text-gray-500 leading-normal">{spot.address || '주소 정보 없음'}</span>
                                                            {isGoogle && (
                                                                <span className="text-[10px] font-bold text-blue-500">
                                                                    유형: {getGoogleTypeLabel(spot)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                }
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {routeEstimator}

                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <div className="mb-1 flex items-center justify-between gap-2">
                                            <label className="text-sm text-gray-500 font-bold">시작 시간</label>
                                            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-violet-600" title="앞 일정 종료시간과 관계없이 입력한 시간부터 시작합니다.">
                                                <input
                                                    type="checkbox"
                                                    className="accent-violet-600"
                                                    checked={form.fixedStartTime}
                                                    onChange={e => setForm({...form, fixedStartTime: e.target.checked})}
                                                />
                                                시간 고정
                                            </label>
                                        </div>
                                        <input type="time" className={`w-full p-3 border rounded-xl text-sm font-bold outline-none ${form.fixedStartTime ? 'border-violet-300 bg-violet-50 text-violet-900' : 'border-gray-200 bg-gray-50'}`} value={form.startTime} onChange={e => setForm({...form, startTime: e.target.value})} />
                                        {form.fixedStartTime && <p className="mt-1 text-[10px] font-medium text-violet-500">앞 일정과 이어 계산하지 않습니다.</p>}
                                    </div>
                                    <div><label className="text-sm text-gray-500 font-bold block mb-1">기본 체류(분)</label><input type="number" className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 text-sm font-bold outline-none" value={baseStay} onChange={e => setBaseStay(Math.max(0, Number(e.target.value)))} /></div>
                                </div>

                                <div className="mb-4 p-3 bg-orange-50 rounded-xl border border-orange-100">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-xs text-orange-600 font-bold">⚽ 일정 인저리 타임 (여유 시간)</label>
                                        <div className="flex items-center gap-1">
                                            {INJURY_OPTIONS.map(m => (
                                                <button key={m} onClick={() => setStayInjury(m)} className={`text-[10px] px-2 py-0.5 rounded border transition font-bold ${stayInjury === m ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-500 border-gray-200'}`}>{m === 0 ? "0" : `+${m}`}</button>
                                            ))}
                                            <input type="number" className="w-12 p-1 text-right border rounded text-xs font-bold text-orange-600 outline-none" value={stayInjury} onChange={e => setStayInjury(Math.max(0, Number(e.target.value)))} />
                                            <span className="text-[10px] text-orange-400 font-bold">분</span>
                                        </div>
                                    </div>
                                    <div className="text-right text-[10px] font-bold text-orange-400">총 체류 예정: {formatSimple(baseStay + stayInjury)}</div>
                                </div>

                                <div className="mb-4"><label className="text-sm text-gray-500 font-bold block mb-1">메모</label><textarea className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 text-sm outline-none resize-none" rows={2} value={form.memo} onChange={e => setForm({...form, memo: e.target.value})} /></div>
                                <div className="flex gap-3 pt-2"><button onClick={handleCancel} className="flex-1 bg-white border border-gray-200 py-3 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">취소</button><button onClick={handleDone} className="flex-1 bg-orange-500 text-white py-3 rounded-xl text-sm font-bold hover:bg-orange-600 shadow-md">완료</button></div>
                            </div>
                        )}
                    </div>

                    {/* 일정 사이 추가 버튼 (onInsert 활용) */}
                    {!isDragging && (
                        <div className="absolute -bottom-2 left-0 w-full h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition z-50 cursor-pointer" onClick={(e) => { e.stopPropagation(); onInsert(index + 1); }}>
                            <div className="w-5 h-5 bg-orange-500 text-white text-xs flex items-center justify-center rounded-full shadow-md border-2 border-white">+</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
