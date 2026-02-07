import { useState, useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMapsLibrary, useMap } from "@vis.gl/react-google-maps";

// API
import { createSpot, getMySpots } from "../../api/spotApi";
import { getSpotTypeInfo } from "../../utils/spotUtils";

import type { DayScheduleResponse, ScheduleItemRequest } from "../../types/schedule";
import type { SpotType, Transportation } from "../../types/enums";
import type { SpotResponse, SpotCreateRequest } from "../../types/spot";
import {toggleScheduleVisit} from "../../api/scheduleApi.ts";

// 🛠️ [유틸] 메모에서 인저리 타임 태그만 처리
const cleanMemoTags = (memo: string) => {
    if (!memo) return '';
    return memo.replace(/#si:\s*\d+/g, '').replace(/#mi:\s*\d+/g, '').replace(/#visited/g, '').trim();
};

const mapGoogleTypeToSpotType = (types: string[] = []): SpotType => {
    if (types.includes('restaurant') || types.includes('food')) return 'FOOD';
    if (types.includes('cafe') || types.includes('coffee_shop')) return 'CAFE';
    if (types.includes('tourist_attraction')) return 'LANDMARK';
    if (types.includes('park')) return 'PARK';
    if (types.includes('lodging')) return 'ACCOMMODATION';
    if (types.includes('store') || types.includes('shopping_mall')) return 'SHOPPING';
    if (types.includes('transit_station') || types.includes('train_station')) return 'STATION';
    return 'OTHER';
};

interface Props {
    schedule: DayScheduleResponse;
    index: number;
    isLast: boolean;
    showInjury: boolean;
    onUpdate: (id: number, data: Partial<ScheduleItemRequest> & { spotName?: string, spotType?: SpotType, lat?: number, lng?: number, isVisit?: boolean }) => void;
    onDelete: (id: number) => void;
    onInsert: (orderIndex: number) => void;
    onRequestMapPick: () => void;
    isPickingMap: boolean;
}

const formatDurationWithInjury = (total: number, injury: number, showInjury: boolean) => {
    const base = Math.max(0, total - injury);
    if (base < 0) return "0분";
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

const parseInjuryFromMemo = (memo: string, tag: string) => {
    const regex = new RegExp(`${tag}\\s*(\\d+)`);
    const match = memo?.match(regex);
    return match ? parseInt(match[1]) : 0;
};

const INJURY_OPTIONS = [0, 5, 10, 15];

export default function ScheduleItem({ schedule, index, showInjury, onUpdate, onDelete, onInsert, onRequestMapPick, isPickingMap }: Props) {

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: schedule.id });
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 999 : 'auto' };

    const map = useMap();
    const placesLibrary = useMapsLibrary("places");
    const [sessionToken, setSessionToken] = useState<google.maps.places.AutocompleteSessionToken | null>(null);

    const [editMode, setEditMode] = useState<'NONE' | 'MAIN' | 'MOVE'>('NONE');
    const [searchTerm, setSearchTerm] = useState("");
    const [searchMode, setSearchMode] = useState<'MINE' | 'GOOGLE'>('MINE');

    const [searchResults, setSearchResults] = useState<SpotResponse[]>([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [stayInjury, setStayInjury] = useState(0);
    const [moveInjury, setMoveInjury] = useState(0);
    const [baseStay, setBaseStay] = useState(0);
    const [baseMove, setBaseMove] = useState(0);

    const [form, setForm] = useState({
        spotUserId: schedule.spotUserId,
        startTime: schedule.startTime ? schedule.startTime.substring(0, 5) : '',
        duration: schedule.duration ?? 60,
        transportation: schedule.transportation || 'WALK',
        movingDuration: schedule.movingDuration || 0,
        movingMemo: schedule.movingMemo || '',
        memo: schedule.memo || '',
    });

    const displaySpotName = schedule.spotName || "장소 선택";
    const displaySpotType = schedule.spotType || 'OTHER';

    const typeInfo = getSpotTypeInfo(displaySpotType);
    const displayMemo = cleanMemoTags(schedule.memo);

    const [selectedSpotInfo, setSelectedSpotInfo] = useState<{name: string, type: SpotType, lat?: number, lng?: number} | null>(null);
    const [isVisited, setIsVisited] = useState(schedule.isChecked || false);

    const savedMoveInjury = parseInjuryFromMemo(schedule.movingMemo, '#mi:');
    const pureMovingDuration = Math.max(0, schedule.movingDuration - savedMoveInjury);

    useEffect(() => {
        if (!schedule) return;
        setIsVisited(schedule.isChecked || false);
        const sInjury = parseInjuryFromMemo(schedule.memo, '#si:');
        const mInjury = parseInjuryFromMemo(schedule.movingMemo, '#mi:');
        setStayInjury(sInjury);
        setMoveInjury(mInjury);
        setBaseStay(Math.max(0, (schedule.duration ?? 60) - sInjury));
        setBaseMove(Math.max(0, (schedule.movingDuration || 0) - mInjury));

        setForm({
            spotUserId: schedule.spotUserId,
            startTime: schedule.startTime ? schedule.startTime.substring(0, 5) : '',
            duration: schedule.duration ?? 60,
            transportation: schedule.transportation || 'WALK',
            movingDuration: schedule.movingDuration || 0,
            movingMemo: cleanMemoTags(schedule.movingMemo || ''),
            memo: cleanMemoTags(schedule.memo || ''),
        });

        if (schedule.spotName) {
            setSearchTerm(schedule.spotName);
            setSelectedSpotInfo({
                name: schedule.spotName,
                type: schedule.spotType || 'OTHER',
                lat: schedule.lat,
                lng: schedule.lng
            });
        } else {
            setSearchTerm("");
            setSelectedSpotInfo(null);
        }
    }, [schedule]);

    useEffect(() => {
        if (placesLibrary && !sessionToken) setSessionToken(new placesLibrary.AutocompleteSessionToken());
    }, [placesLibrary]);

    useEffect(() => {
        if ((!schedule.spotUserId || schedule.spotUserId === 0) && !schedule.spotName && editMode === 'NONE') {
            setEditMode('MAIN');
        }
    }, []);

    useEffect(() => {
        const safeSearchTerm = searchTerm || "";
        if (!editMode || safeSearchTerm.trim() === "" || (selectedSpotInfo && safeSearchTerm === selectedSpotInfo.name)) {
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

                    const request = {
                        input: safeSearchTerm,
                        sessionToken: sessionToken,
                        language: 'ko',
                        // ✅ [추가] 지도 중심 기준(locationBias)을 설정합니다.
                        // 사용자가 지도를 이동시킨 곳 주변의 결과가 먼저 나옵니다.
                        locationBias: {},
                    };

                    const center = map?.getCenter();

                    if (center) {
                        request.locationBias= {
                            center: {lat: center.lat(), lng: center.lng()},
                            radius: 5000 // 👈 circle 감싸기 없이 바로 center와 radius를 넣는 버전
                        }
                    }


                    console.log(request);
                    try {
                        // @ts-ignore
                        const { suggestions } = await placesLibrary.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
                        const mappedResults: SpotResponse[] = suggestions.map((s: any) => {
                            const prediction = s.placePrediction;

                            // structuredFormat이 있으면 mainText(이름)와 secondaryText(주소)를 명확히 분리
                            // 없으면 text(전체 주소)에서 분리를 시도
                            const mainText = prediction.structuredFormat?.mainText?.text
                                || prediction.mainText?.text
                                || prediction.text?.text.split(',')[0] // 최후의 보루: 첫 번째 쉼표 앞이 보통 이름
                                || "";

                            const secondaryText = prediction.structuredFormat?.secondaryText?.text
                                || prediction.secondaryText?.text
                                || prediction.text?.text.replace(mainText, '').replace(/^,\s*/, '') // 이름을 제외한 나머지를 주소로
                                || "";

                            return {
                                id: 0,
                                placeId: prediction.placeId,
                                spotName: mainText.trim(),
                                address: secondaryText.trim(),
                                spotType: 'OTHER',
                                lat: 0,
                                lng: 0,
                                isVisit: false,
                                metadata: {}
                            };
                        });
                        setSearchResults(mappedResults);
                        setIsDropdownOpen(true);
                    } catch (apiErr) { console.error("Autocomplete Error", apiErr); setSearchResults([]); }
                }
            } catch (e) { console.error(e); setSearchResults([]); }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm, editMode, searchMode, placesLibrary, map, sessionToken]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsDropdownOpen(false);
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSpotSelect = async (spot: SpotResponse) => {
        try {
            if (!spot.id || spot.id === 0) {
                if (!spot.placeId) return;
                setIsRegistering(true);
                try {
                    // @ts-ignore
                    const place = new google.maps.places.Place({ id: spot.placeId });
                    await place.fetchFields({
                        // ✅ 영업시간, 사진, 원본 타입 필드 추가
                        fields: ['displayName', 'formattedAddress', 'location', 'types', 'googleMapsURI', 'websiteURI', 'regularOpeningHours', 'photos']
                    });

                    if (place.location) {
                        // 1. 데이터 가공
                        const addrParts = place.formattedAddress?.split(' ') || [];
                        const shortAddr = addrParts.length > 2 ? addrParts.slice(1).join(' ') : (place.formattedAddress || "");
                        const openingHours = place.regularOpeningHours?.weekdayDescriptions || [];
                        const photoUrl = place.photos && place.photos.length > 0
                            ? place.photos[0].getURI({ maxWidth: 800 })
                            : null;

                        const createReq: SpotCreateRequest = {
                            placeId: spot.placeId,
                            spotName: place.displayName || spot.spotName,
                            spotType: mapGoogleTypeToSpotType(place.types),
                            address: place.formattedAddress || spot.address || '',
                            lat: place.location.lat(),
                            lng: place.location.lng(),
                            isVisit: false,
                            googleMapUrl: place.googleMapsURI || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.displayName || '')}&query_place_id=${spot.placeId}`,
                            website: place.websiteURI || '',
                            shortAddress: shortAddr,
                            metadata: {
                                originalTypes: place.types || [],
                                openingHours: openingHours, // ✅ 영업시간 추가
                                photoUrl: photoUrl          // ✅ 사진 추가
                            }
                        };

                        const savedSpot = await createSpot(createReq);
                        updateFormWithSpot(savedSpot.id, savedSpot);
                        if (placesLibrary) setSessionToken(new placesLibrary.AutocompleteSessionToken());
                    }
                } catch (err) { console.error(err); alert("장소 등록 실패"); }
                finally { setIsRegistering(false); }
            } else {
                updateFormWithSpot(spot.id, spot);
            }
        } catch (error) { console.error(error); setIsRegistering(false); }
    };

    const updateFormWithSpot = (id: number, spot: SpotResponse) => {
        setForm({ ...form, spotUserId: id });
        setSearchTerm(spot.spotName || "");
        setSelectedSpotInfo({ name: spot.spotName, type: spot.spotType, lat: spot.lat, lng: spot.lng });
        setIsVisited(spot.isVisit);
        setIsDropdownOpen(false);
    };

    const spotEndTime = addTimeStr(form.startTime, form.duration);
    const moveStartTime = subTimeStr(form.startTime, form.movingDuration);

    const handleDone = () => {
        const finalName = (searchTerm || "").trim();
        if (!finalName) return alert("장소 이름을 입력해주세요.");

        let finalSpotInfo = selectedSpotInfo;
        if (!finalSpotInfo && schedule.spotName) {
            finalSpotInfo = {
                name: schedule.spotName,
                type: schedule.spotType || 'OTHER',
                lat: schedule.lat,
                lng: schedule.lng
            };
        }

        if (!finalSpotInfo || !finalSpotInfo.lat) return alert("장소 정보(좌표)가 없습니다. 목록에서 선택하거나 지도에서 찍어주세요.");

        const finalStay = baseStay + stayInjury;
        const finalMove = baseMove + moveInjury;

        let finalMemo = form.memo;
        if (stayInjury > 0) finalMemo += ` #si:${stayInjury}`;

        const finalMoveMemo = `${cleanMemoTags(form.movingMemo)} ${moveInjury > 0 ? `#mi:${moveInjury}` : ''}`.trim();

        const updatePayload: any = {
            ...form,
            duration: finalStay,
            movingDuration: finalMove,
            memo: finalMemo,
            movingMemo: finalMoveMemo,
            isVisit: isVisited,
            spotName: finalName,
            spotType: finalSpotInfo.type,
            lat: finalSpotInfo.lat,
            lng: finalSpotInfo.lng,
            spotUserId: form.spotUserId
        };

        onUpdate(schedule.id, updatePayload);
        setEditMode('NONE');
    };

    const handleCancel = () => {
        if ((!schedule.spotUserId || schedule.spotUserId === 0) && !schedule.spotName) onDelete(schedule.id);
        else { setEditMode('NONE'); setSearchTerm(displaySpotName || ""); }
    };

    const toggleVisit = async (e: React.MouseEvent) => {
        e.stopPropagation();

        const nextState = !isVisited;
        setIsVisited(nextState); // 1. UI 먼저 반영 (낙관적 업데이트)

        // 2. 부모 리스트의 상태도 업데이트 (저장 버튼 활성화 등을 위해)
        onUpdate(schedule.id, { isChecked: nextState } as any);

        // 3. 서버 통신 분기 처리
        // 🔴 아직 저장되지 않은 임시 스케줄(ID가 음수)인 경우 -> API 호출 안 함 (나중에 전체 저장 때 반영)
        if (schedule.id < 0) {
            return;
        }

        // 🟢 이미 DB에 저장된 스케줄인 경우 -> 즉시 방문 체크 API 호출
        try {
            await toggleScheduleVisit(schedule.id);
            // 성공 시, 백엔드에서 SpotVisitHistory 등을 저장하도록 처리되어 있을 것임
        } catch (error) {
            console.error("방문 체크 실패", error);
            // 실패 시 원상복구
            setIsVisited(!nextState);
            onUpdate(schedule.id, { isChecked: !nextState } as any);
            alert("방문 체크에 실패했습니다.");
        }
    };

    const getTransIcon = (type: Transportation) => {
        const icons: Record<string, string> = { WALK: '🚶', BUS: '🚌', TRAIN: '🚃', TAXI: '🚕', SHIP: '🚢', AIRPLANE: '✈️' };
        return icons[type] || '➡️';
    };
    const getTransLabel = (type: Transportation) => {
        const labels: Record<string, string> = { WALK: '도보', BUS: '버스', TRAIN: '열차', TAXI: '택시', SHIP: '배', AIRPLANE: '비행기' };
        return labels[type] || '이동';
    };
    const displayMoveLabel = () => cleanMemoTags(schedule.movingMemo) || `${getTransLabel(schedule.transportation)} 이동`;

    const displayName = displaySpotName;
    const timeDisplay = schedule.startTime ? `${schedule.startTime.substring(0, 5)} - ${spotEndTime}` : "시간 미정";
    const durationDisplay = `체류 ${formatDurationWithInjury(schedule.duration, stayInjury, showInjury)}`;

    return (
        <div ref={setNodeRef} style={style} className="relative group mb-3">
            <div className="flex items-stretch gap-3">
                <div className="flex flex-col items-center pt-4 w-8 shrink-0">
                    <div {...attributes} {...listeners} className="cursor-grab text-gray-300 hover:text-orange-500 mb-1 text-xl">⠿</div>
                    <div className="w-0.5 bg-gray-200 grow"></div>
                </div>

                <div className="flex-1 min-w-0 pb-2">
                    {(schedule.movingDuration > 0 || editMode === 'MOVE') && (
                        <div className="mb-3 relative">
                            <div className={`rounded-xl border transition cursor-pointer relative z-10 ${editMode === 'MOVE' ? 'bg-white border-blue-400 ring-2 ring-blue-100 p-4' : 'bg-blue-50 border-blue-100 hover:border-blue-300 p-3 flex items-center justify-between'}`} onClick={() => editMode === 'NONE' && setEditMode('MOVE')}>
                                {editMode !== 'MOVE' ? (
                                    <>
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="w-8 h-8 rounded-full bg-white border border-blue-200 flex items-center justify-center text-sm shadow-sm shrink-0 text-blue-600">{getTransIcon(schedule.transportation)}</div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-bold text-blue-800 truncate">{displayMoveLabel()}</div>
                                                {schedule.startTime && schedule.movingDuration > 0 && <div className="text-xs text-blue-400 font-mono mt-0.5">{moveStartTime} - {schedule.startTime}</div>}
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
                                            <div className="flex justify-between items-center mb-2"><label className="text-xs text-blue-600 font-bold">기본 소요 시간</label><div className="flex items-center gap-2"><input type="number" className="w-16 p-1 text-right border rounded font-bold text-blue-700" value={baseMove} onChange={e => setBaseMove(Math.max(0, Number(e.target.value)))} /><span className="text-xs">분</span></div></div>
                                            <div className="flex justify-between items-center border-t border-blue-100 pt-2"><label className="text-xs text-orange-500 font-bold">⚽ 인저리 타임</label><div className="flex items-center gap-1">{INJURY_OPTIONS.map(m => (<button key={m} onClick={() => setMoveInjury(m)} className={`text-[10px] px-2 py-0.5 rounded border ${moveInjury === m ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-500 border-gray-200'}`}>{m === 0 ? "0" : `+${m}`}</button>))}<input type="number" className="w-12 p-1 text-right border rounded font-bold text-orange-600" value={moveInjury} onChange={e => setMoveInjury(Math.max(0, Number(e.target.value)))} /><span className="text-xs">분</span></div></div>
                                            <div className="text-right mt-2 text-xs font-bold text-gray-500">총 {formatSimple(baseMove + moveInjury)}</div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                            <div><label className="text-xs text-blue-600 font-bold mb-1 block">수단</label><select className="w-full p-2 border border-blue-200 rounded-lg bg-white text-sm outline-none focus:ring-2 focus:ring-blue-300" value={form.transportation} onChange={e => setForm({...form, transportation: e.target.value as Transportation})}><option value="WALK">🚶 도보</option><option value="BUS">🚌 버스</option><option value="TRAIN">🚃 열차</option><option value="TAXI">🚕 택시</option><option value="SHIP">🚢 배</option><option value="AIRPLANE">✈️ 비행기</option></select></div>
                                            <div><label className="text-xs text-blue-600 font-bold mb-1 block">이동 메모</label><input type="text" className="w-full p-2 border border-blue-200 rounded-lg bg-white text-sm outline-none focus:ring-2 focus:ring-blue-300" placeholder="예) 205번 버스" value={form.movingMemo} onChange={e => setForm({...form, movingMemo: e.target.value})} /></div>
                                        </div>
                                        <div className="flex gap-2"><button onClick={handleCancel} className="flex-1 bg-white border border-blue-200 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">취소</button><button onClick={handleDone} className="flex-1 bg-blue-500 text-white py-2 rounded-lg text-sm font-bold hover:bg-blue-600">확인</button></div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {index !== 0 && schedule.movingDuration === 0 && editMode === 'NONE' && (
                        <div className="mb-2 flex justify-center group/add-move">
                            <button onClick={() => { setForm({ ...form, movingDuration: 30 }); setEditMode('MOVE'); }} className="text-xs text-gray-400 font-bold bg-gray-50 px-3 py-1 rounded-full border border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition opacity-0 group-hover:opacity-100 group-hover/add-move:opacity-100 flex items-center gap-1"><span>➕</span> 이동 시간 추가</button>
                        </div>
                    )}

                    <div className={`rounded-2xl border transition relative z-10 overflow-hidden shadow-sm 
                        ${editMode === 'MAIN' ? 'border-orange-400 ring-2 ring-orange-100 bg-white' : 'bg-white border-gray-200 hover:border-orange-300 cursor-pointer'}
                        ${isPickingMap ? 'ring-4 ring-green-400 border-green-500' : ''}`}
                         onClick={() => editMode === 'NONE' && setEditMode('MAIN')}
                    >
                        {editMode !== 'MAIN' ? (
                            <div className="p-3 md:p-4">
                                <div className="flex gap-3 md:gap-4 items-start">
                                    <div className="flex flex-col items-center gap-2 shrink-0 pt-1">
                                        <div onClick={toggleVisit} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition hover:scale-110 z-20 cursor-pointer ${isVisited ? 'bg-green-50 border-green-500 shadow-sm' : 'bg-white border-gray-300 hover:border-orange-400'}`}>
                                            {isVisited && <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                                        </div>
                                        <div className="text-3xl shrink-0 filter drop-shadow-sm">{typeInfo.icon}</div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-1">
                                            <h3 className="text-base md:text-lg font-bold truncate leading-tight text-gray-900">{displayName}</h3>
                                            <div className="hidden md:block text-right shrink-0">
                                                <div className="text-base font-bold font-mono tracking-tight text-gray-800 whitespace-nowrap">{schedule.startTime ? timeDisplay : <span className="text-xs text-orange-400">시간 미정</span>}</div>
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
                                            {schedule.movingDuration > 0 && <span className="text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded flex items-center gap-1 font-medium whitespace-nowrap">⏱ {pureMovingDuration}분 이동</span>}
                                        </div>
                                    </div>
                                </div>
                                {displayMemo && <div className="mt-3 text-sm p-2.5 rounded-lg border-l-4 bg-gray-50 text-gray-600 border-gray-200">{displayMemo}</div>}
                                {isPickingMap && <div className="mt-2 text-center text-xs font-bold text-green-600 animate-pulse bg-green-50 py-1 rounded border border-green-200">🗺️ 지도에서 장소를 클릭하세요!</div>}
                            </div>
                        ) : (
                            <div className="p-5 bg-white" onClick={e => e.stopPropagation()}>
                                <div className="flex justify-between mb-4 pb-2 border-b border-gray-100"><h3 className="font-bold text-base text-gray-800">일정 편집</h3><button onClick={() => onDelete(schedule.id)} className="text-sm text-red-500 font-bold hover:underline">삭제</button></div>

                                <div className="mb-4 relative" ref={dropdownRef}>
                                    <div className="flex justify-between items-end mb-1">
                                        <label className="text-sm text-gray-500 font-bold">장소 이름</label>
                                        <button onClick={(e) => { e.stopPropagation(); onRequestMapPick(); }} className={`text-xs font-bold px-2 py-1 rounded border transition flex items-center gap-1 ${isPickingMap ? 'bg-green-500 text-white border-green-500' : 'bg-white text-green-600 border-green-200 hover:bg-green-50'}`}>{isPickingMap ? '📍 선택 중...' : '🗺️ 지도에서 찍기'}</button>
                                    </div>
                                    <div className="flex bg-gray-100 p-1 rounded-lg mb-2"><button onClick={() => setSearchMode('MINE')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${searchMode === 'MINE' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>내 장소</button><button onClick={() => setSearchMode('GOOGLE')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${searchMode === 'GOOGLE' ? 'bg-white text-orange-500 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>구글 검색</button></div>
                                    <input type="text" className={`w-full p-3 border rounded-xl font-bold outline-none transition ${searchMode === 'MINE' ? 'bg-blue-50/50 border-blue-100 focus:bg-white focus:ring-2 focus:ring-blue-300 text-blue-900 placeholder-blue-300' : 'bg-orange-50/50 border-orange-100 focus:bg-white focus:ring-2 focus:ring-orange-300 text-orange-900 placeholder-orange-300'}`} placeholder="장소 검색..." value={searchTerm} onFocus={() => { if(searchTerm.trim()) setIsDropdownOpen(true); }} onChange={(e) => { setSearchTerm(e.target.value); setIsDropdownOpen(e.target.value.trim() !== ""); }} />
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
                                                    // ✅ [2] 구글 검색 결과인지 내 장소인지 구분
                                                    const isGoogle = !!spot.placeId && (!spot.id || spot.id === 0);
                                                    return (
                                                        <div
                                                            key={i}
                                                            className="px-4 py-3 hover:bg-orange-50 cursor-pointer border-b border-gray-50 flex flex-col gap-1"
                                                            onClick={() => handleSpotSelect(spot)}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                {/* 🏷️ 이름 표시 (굵게) */}
                                                                <span className="font-bold text-gray-900 text-sm leading-tight">
                                    {spot.spotName}
                                </span>
                                                                {isGoogle && (
                                                                    <span className="text-[9px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded font-black border border-blue-100">GOOGLE</span>
                                                                )}
                                                            </div>
                                                            {/* 📍 주소 표시 (작게) */}
                                                            <span className="text-[11px] text-gray-400 truncate leading-normal">
                                {spot.address}
                            </span>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div><label className="text-sm text-gray-500 font-bold block mb-1">시작 시간</label><input type="time" className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 text-sm font-bold outline-none" value={form.startTime} onChange={e => setForm({...form, startTime: e.target.value})} /></div>
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