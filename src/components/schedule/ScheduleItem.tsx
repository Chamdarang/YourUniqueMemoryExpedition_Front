import { useState, useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMapsLibrary, useMap } from "@vis.gl/react-google-maps";

// ✅ updateSpot 추가
import { searchSpots, createSpot, updateSpot } from "../../api/spotApi";
import { getSpotTypeInfo } from "../../utils/spotUtils";

import type { DayScheduleResponse, ScheduleItemRequest } from "../../types/schedule";
import type { SpotType, Transportation } from "../../types/enums";
import type { SpotResponse, SpotCreateRequest } from "../../types/spot";

// 🛠️ [유틸] 메모 파싱/직렬화 함수
const TEMP_SPOT_PREFIX = " #tmp:";

// ✅ [수정] 정규식 강화: 공백(\s*) 포함하여 태그 제거
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

const decodeTempSpot = (memo: string) => {
    if (!memo) return null;
    const idx = memo.indexOf(TEMP_SPOT_PREFIX);
    if (idx === -1) return null;
    try {
        const jsonStr = memo.substring(idx + TEMP_SPOT_PREFIX.length);
        const data = JSON.parse(jsonStr);
        return { name: data.n, type: data.t as SpotType, lat: data.la, lng: data.lo };
    } catch {
        return null;
    }
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
        spotId: schedule.spotId,
        startTime: schedule.startTime ? schedule.startTime.substring(0, 5) : '',
        duration: schedule.duration ?? 60,
        transportation: schedule.transportation || 'WALK',
        movingDuration: schedule.movingDuration || 0,
        movingMemo: schedule.movingMemo || '',
        memo: schedule.memo || '',
    });

    const tempSpotData = decodeTempSpot(schedule.memo);
    const finalSpotName = schedule.spotName || tempSpotData?.name;
    const finalSpotType = schedule.spotType || tempSpotData?.type || 'OTHER';

    const typeInfo = getSpotTypeInfo(finalSpotType || schedule.spotType);
    const displayMemo = cleanMemoTags(schedule.memo);

    const [selectedSpotInfo, setSelectedSpotInfo] = useState<{name: string, type: SpotType, lat?: number, lng?: number} | null>(null);

    // 방문 여부 상태
    const [isVisited, setIsVisited] = useState(schedule.isVisit || false);

    // ✅ [계산] 순수 이동 시간 (총 이동 시간 - 이동 인저리 타임)
    // schedule.movingDuration은 총 시간이므로, 여기서 인저리 타임을 빼서 순수 시간을 구함
    const savedMoveInjury = parseInjuryFromMemo(schedule.movingMemo, '#mi:');
    const pureMovingDuration = Math.max(0, schedule.movingDuration - savedMoveInjury);

    // ✅ 데이터 동기화
    useEffect(() => {
        if (!schedule) return;

        setIsVisited(schedule.isVisit || false);

        const sInjury = parseInjuryFromMemo(schedule.memo, '#si:');
        const mInjury = parseInjuryFromMemo(schedule.movingMemo, '#mi:');

        setStayInjury(sInjury);
        setMoveInjury(mInjury);
        setBaseStay(Math.max(0, (schedule.duration ?? 60) - sInjury));
        setBaseMove(Math.max(0, (schedule.movingDuration || 0) - mInjury));

        setForm({
            spotId: schedule.spotId,
            startTime: schedule.startTime ? schedule.startTime.substring(0, 5) : '',
            duration: schedule.duration ?? 60,
            transportation: schedule.transportation || 'WALK',
            movingDuration: schedule.movingDuration || 0,
            movingMemo: cleanMemoTags(schedule.movingMemo || ''),
            memo: cleanMemoTags(schedule.memo || ''),
        });

        const savedTemp = decodeTempSpot(schedule.memo);

        if (schedule.spotId !== 0) {
            setSearchTerm(schedule.spotName || "");
        } else if (savedTemp) {
            setSearchTerm(savedTemp.name || "");
            setSelectedSpotInfo({
                name: savedTemp.name,
                type: savedTemp.type,
                lat: savedTemp.lat,
                lng: savedTemp.lng
            });
        } else if (schedule.spotName) {
            setSearchTerm(schedule.spotName || "");
            setSelectedSpotInfo({
                name: schedule.spotName,
                type: schedule.spotType || 'OTHER',
                // @ts-ignore
                lat: schedule.lat || schedule.spot?.lat,
                // @ts-ignore
                lng: schedule.lng || schedule.spot?.lng
            });
        } else {
            setSearchTerm("");
        }
    }, [schedule]);

    useEffect(() => {
        if (placesLibrary && !sessionToken) {
            setSessionToken(new placesLibrary.AutocompleteSessionToken());
        }
    }, [placesLibrary]);

    useEffect(() => {
        if (schedule.spotId === 0 && !schedule.spotName && !decodeTempSpot(schedule.memo) && editMode === 'NONE') setEditMode('MAIN');
    }, []);

    // 3. 통합 검색 로직
    useEffect(() => {
        const safeSearchTerm = searchTerm || "";

        if (!editMode || safeSearchTerm.trim() === "" || (selectedSpotInfo && safeSearchTerm === selectedSpotInfo.name)) {
            setSearchResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                if (searchMode === 'MINE') {
                    const res = await searchSpots(safeSearchTerm);
                    setSearchResults(res);
                    setIsDropdownOpen(true);
                } else {
                    if (!placesLibrary) return;

                    const request = {
                        input: safeSearchTerm,
                        sessionToken: sessionToken,
                    };

                    try {
                        // @ts-ignore
                        const { suggestions } = await placesLibrary.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);

                        const mappedResults: SpotResponse[] = suggestions.map((s: any) => {
                            const prediction = s.placePrediction;
                            const mainText = prediction.structuredFormat?.mainText?.text || prediction.text?.text || "";
                            const secondaryText = prediction.structuredFormat?.secondaryText?.text || "";

                            return {
                                id: 0,
                                placeId: prediction.placeId,
                                spotName: mainText,
                                address: secondaryText,
                                spotType: 'OTHER',
                                lat: 0, lng: 0, isVisit: false, metadata: {}
                            };
                        });

                        setSearchResults(mappedResults);
                        setIsDropdownOpen(true);
                    } catch (apiErr) {
                        console.error("Autocomplete API Error:", apiErr);
                        setSearchResults([]);
                    }
                }
            } catch (e) {
                console.error(e);
                setSearchResults([]);
            }
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
            let finalId = spot.id;
            let finalSpot = spot;

            if (!spot.id || spot.id === 0) {
                if (!spot.placeId) return;
                setIsRegistering(true);

                try {
                    // @ts-ignore
                    const place = new google.maps.places.Place({ id: spot.placeId });
                    await place.fetchFields({
                        fields: ['displayName', 'formattedAddress', 'location', 'types', 'googleMapsURI', 'websiteURI']
                    });

                    if (place.location) {
                        const createReq: SpotCreateRequest = {
                            spotName: place.displayName || spot.spotName,
                            spotType: mapGoogleTypeToSpotType(place.types),
                            address: place.formattedAddress || spot.address || '',
                            lat: place.location.lat(),
                            lng: place.location.lng(),
                            placeId: spot.placeId,
                            isVisit: false,
                            metadata: { originalTypes: place.types || [] },
                            shortAddress: '',
                            googleMapUrl: place.googleMapsURI || '',
                            website: place.websiteURI || '',
                            description: ''
                        };

                        const savedSpot = await createSpot(createReq);
                        finalId = savedSpot.id;
                        finalSpot = savedSpot;
                        updateFormWithSpot(finalId, finalSpot);

                        if (placesLibrary) setSessionToken(new placesLibrary.AutocompleteSessionToken());
                    } else {
                        alert("장소 정보를 가져올 수 없습니다.");
                    }
                } catch (err) {
                    console.error("Place API error:", err);
                    alert("장소 정보 조회 실패");
                } finally {
                    setIsRegistering(false);
                }
            } else {
                updateFormWithSpot(finalId, finalSpot);
            }
        } catch (error) {
            console.error("장소 선택 에러:", error);
            setIsRegistering(false);
        }
    };

    const updateFormWithSpot = (id: number, spot: SpotResponse) => {
        setForm({ ...form, spotId: id });
        setSearchTerm(spot.spotName || "");
        setSelectedSpotInfo({
            name: spot.spotName,
            type: spot.spotType,
            lat: spot.lat,
            lng: spot.lng
        });
        // 장소 선택 시 방문 여부도 동기화
        setIsVisited(spot.isVisit);
        setIsDropdownOpen(false);
    };

    const spotEndTime = addTimeStr(form.startTime, form.duration);
    const moveStartTime = subTimeStr(form.startTime, form.movingDuration);

    // ✅ 완료 핸들러
    const handleDone = () => {
        let currentSpotInfo = selectedSpotInfo;

        if (form.spotId === 0 && (!currentSpotInfo || !currentSpotInfo.name)) {
            const decoded = decodeTempSpot(schedule.memo);
            if (decoded) {
                currentSpotInfo = { name: decoded.name, type: decoded.type, lat: decoded.lat, lng: decoded.lng };
            } else if (schedule.spotName) {
                // @ts-ignore
                currentSpotInfo = { name: schedule.spotName, type: schedule.spotType || 'OTHER', lat: schedule.lat || schedule.spot?.lat, lng: schedule.lng || schedule.spot?.lng };
            }
        }

        const finalName = (searchTerm || "").trim();
        if (!finalName) {
            alert("장소 이름을 입력해주세요.");
            return;
        }

        const hasValidInfo = currentSpotInfo && (currentSpotInfo.lat !== undefined || form.spotId !== 0);
        if (form.spotId === 0 && !hasValidInfo) {
            alert("장소 정보를 찾을 수 없습니다.");
            return;
        }

        const finalStay = baseStay + stayInjury;
        const finalMove = baseMove + moveInjury;

        let finalMemo = form.memo;
        if (stayInjury > 0) finalMemo += ` #si:${stayInjury}`;

        if (form.spotId === 0 && currentSpotInfo) {
            finalMemo = encodeTempSpot(finalMemo, {
                name: finalName,
                type: currentSpotInfo.type,
                lat: currentSpotInfo.lat!,
                lng: currentSpotInfo.lng!
            });
        }

        const finalMoveMemo = `${cleanMemoTags(form.movingMemo)} ${moveInjury > 0 ? `#mi:${moveInjury}` : ''}`.trim();

        const updatePayload: any = {
            ...form,
            duration: finalStay,
            movingDuration: finalMove,
            memo: finalMemo,
            movingMemo: finalMoveMemo,
            isVisit: isVisited
        };

        if (currentSpotInfo) {
            Object.assign(updatePayload, {
                spotName: finalName,
                spotType: currentSpotInfo.type,
                lat: currentSpotInfo.lat,
                lng: currentSpotInfo.lng
            });
        }
        onUpdate(schedule.id, updatePayload);
        setEditMode('NONE');
    };

    const handleCancel = () => {
        if (schedule.spotId === 0 && !schedule.spotName && !decodeTempSpot(schedule.memo)) onDelete(schedule.id);
        else {
            setEditMode('NONE');
            setSearchTerm(finalSpotName || "");
        }
    };

    // ✅ 방문 토글 핸들러
    const toggleVisit = async (e: React.MouseEvent) => {
        e.stopPropagation();

        if (!schedule.spotId || schedule.spotId === 0) {
            alert("내 장소로 등록된 곳만 방문 체크가 가능합니다.\n장소를 먼저 등록해주세요!");
            return;
        }

        const nextState = !isVisited;
        setIsVisited(nextState); // 낙관적 업데이트

        try {
            await updateSpot(schedule.spotId, { isVisit: nextState } as any);
            onUpdate(schedule.id, { isVisit: nextState } as any);
        } catch (err) {
            console.error("방문 상태 변경 실패:", err);
            setIsVisited(!nextState);
            alert("방문 상태를 변경하지 못했습니다.");
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

    const displayMoveLabel = () => {
        const cleanText = cleanMemoTags(schedule.movingMemo);
        return cleanText ? cleanText : `${getTransLabel(schedule.transportation)} 이동`;
    };

    const displayName = finalSpotName || "장소 선택";

    return (
        <div ref={setNodeRef} style={style} className="relative group mb-3">

            <div className="flex items-stretch gap-3">
                <div className="flex flex-col items-center pt-4 w-8 shrink-0">
                    <div {...attributes} {...listeners} className="cursor-grab text-gray-300 hover:text-orange-500 mb-1 text-xl">⠿</div>
                    <div className="w-0.5 bg-gray-200 grow"></div>
                </div>

                <div className="flex-1 min-w-0 pb-2">

                    {/* A. 이동 카드 */}
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
                                        <div className="text-sm font-bold text-blue-600 bg-white px-3 py-1 rounded-lg border border-blue-200 whitespace-nowrap ml-3 shadow-sm">
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
                                                    <input type="number" className="w-16 p-1 text-right border rounded font-bold text-blue-700" value={baseMove} onChange={e => setBaseMove(Math.max(0, Number(e.target.value)))} />
                                                    <span className="text-xs">분</span>
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center border-t border-blue-100 pt-2">
                                                <label className="text-xs text-orange-500 font-bold">⚽ 인저리 타임 (여유)</label>
                                                <div className="flex items-center gap-1">
                                                    {INJURY_OPTIONS.map(m => (
                                                        <button key={m} onClick={() => setMoveInjury(m)} className={`text-[10px] px-2 py-0.5 rounded border ${moveInjury === m ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                                                            {m === 0 ? "0" : `+${m}`}
                                                        </button>
                                                    ))}
                                                    <input type="number" className="w-12 p-1 text-right border rounded font-bold text-orange-600" value={moveInjury} onChange={e => setMoveInjury(Math.max(0, Number(e.target.value)))} />
                                                    <span className="text-xs">분</span>
                                                </div>
                                            </div>
                                            <div className="text-right mt-2 text-xs font-bold text-gray-500">
                                                총 {formatSimple(baseMove + moveInjury)}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                            <div><label className="text-xs text-blue-600 font-bold mb-1 block">수단</label>
                                                <select className="w-full p-2 border border-blue-200 rounded-lg bg-white text-sm outline-none focus:ring-2 focus:ring-blue-300" value={form.transportation} onChange={e => setForm({...form, transportation: e.target.value as Transportation})}>
                                                    <option value="WALK">🚶 도보</option><option value="BUS">🚌 버스</option><option value="TRAIN">🚃 열차</option><option value="TAXI">🚕 택시</option><option value="SHIP">🚢 배</option><option value="AIRPLANE">✈️ 비행기</option>
                                                </select>
                                            </div>
                                            <div><label className="text-xs text-blue-600 font-bold mb-1 block">이동 메모</label>
                                                <input type="text" className="w-full p-2 border border-blue-200 rounded-lg bg-white text-sm outline-none focus:ring-2 focus:ring-blue-300" placeholder="예) 205번 버스" value={form.movingMemo} onChange={e => setForm({...form, movingMemo: e.target.value})} />
                                            </div>
                                        </div>

                                        <div className="flex gap-2">
                                            <button onClick={handleCancel} className="flex-1 bg-white border border-blue-200 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">취소</button>
                                            <button onClick={handleDone} className="flex-1 bg-blue-500 text-white py-2 rounded-lg text-sm font-bold hover:bg-blue-600">확인</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* B. 이동 추가 버튼 */}
                    {index !== 0 && schedule.movingDuration === 0 && editMode === 'NONE' && (
                        <div className="mb-2 flex justify-center group/add-move">
                            <button onClick={() => { setForm({ ...form, movingDuration: 30 }); setEditMode('MOVE'); }} className="text-xs text-gray-400 font-bold bg-gray-50 px-3 py-1 rounded-full border border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition opacity-0 group-hover:opacity-100 group-hover/add-move:opacity-100 flex items-center gap-1"><span>➕</span> 이동 시간 추가</button>
                        </div>
                    )}

                    {/* C. 메인 장소 카드 */}
                    <div className={`rounded-2xl border transition relative z-10 overflow-hidden shadow-sm 
                ${editMode === 'MAIN' ? 'border-orange-400 ring-2 ring-orange-100 bg-white' : 'bg-white border-gray-200 hover:border-orange-300 cursor-pointer'}
                ${isPickingMap ? 'ring-4 ring-green-400 border-green-500' : ''}`}
                         onClick={() => editMode === 'NONE' && setEditMode('MAIN')}
                    >
                        {editMode !== 'MAIN' ? (
                            <div className="p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-3 overflow-hidden">

                                        {/* ✅ 방문 체크박스 UI */}
                                        <div
                                            onClick={toggleVisit}
                                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition hover:scale-110 z-20 cursor-pointer
                                ${isVisited ? 'bg-green-500 border-green-500 shadow-sm' : 'bg-white border-gray-300 hover:border-orange-400'}`}
                                        >
                                            {isVisited && (
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-white" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                </svg>
                                            )}
                                        </div>

                                        {/* 아이콘 */}
                                        <div className="text-3xl shrink-0 filter drop-shadow-sm">
                                            {typeInfo.icon}
                                        </div>

                                        <div className="flex flex-col min-w-0">
                                            {/* 텍스트 */}
                                            <h3 className="text-lg font-bold truncate leading-tight text-gray-900">
                                                {displayName}
                                            </h3>
                                            <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs px-2 py-0.5 rounded border bg-gray-100 text-gray-500 border-gray-200">
                                {typeInfo.label}
                            </span>
                                                {/* ✅ [수정] 이동 시간 표시: pureMovingDuration 사용 */}
                                                {schedule.movingDuration > 0 && <span className="text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded flex items-center gap-1 font-medium">⏱ {pureMovingDuration}분 이동</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0 pl-2">
                                        {schedule.startTime ? (
                                            <div className="text-base font-bold font-mono tracking-tight text-gray-800">
                                                {schedule.startTime.substring(0, 5)} - {spotEndTime}
                                            </div>
                                        ) : <span className="text-xs font-bold text-orange-400 bg-orange-50 px-2 py-1 rounded">시간 미정</span>}
                                        <div className="text-xs text-gray-400 mt-1">
                                            체류 {formatDurationWithInjury(schedule.duration, stayInjury, showInjury)}
                                        </div>
                                    </div>
                                </div>
                                {displayMemo && <div className="mt-3 text-sm p-2.5 rounded-lg border-l-4 bg-gray-50 text-gray-600 border-gray-200">{displayMemo}</div>}

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
                                        <label className="text-sm text-gray-500 font-bold">장소 이름 (수정 가능)</label>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onRequestMapPick(); }}
                                            className={`text-xs font-bold px-2 py-1 rounded border transition flex items-center gap-1
                                ${isPickingMap ? 'bg-green-500 text-white border-green-500' : 'bg-white text-green-600 border-green-200 hover:bg-green-50'}`}
                                        >
                                            {isPickingMap ? '📍 선택 중...' : '🗺️ 지도에서 찍기'}
                                        </button>
                                    </div>

                                    <div className="flex bg-gray-100 p-1 rounded-lg mb-2">
                                        <button
                                            onClick={() => setSearchMode('MINE')}
                                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${searchMode === 'MINE' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            내 장소
                                        </button>
                                        <button
                                            onClick={() => setSearchMode('GOOGLE')}
                                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${searchMode === 'GOOGLE' ? 'bg-white text-orange-500 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            구글 검색
                                        </button>
                                    </div>

                                    <input type="text"
                                           className={`w-full p-3 border rounded-xl font-bold outline-none transition
                                ${searchMode === 'MINE'
                                               ? 'bg-blue-50/50 border-blue-100 focus:bg-white focus:ring-2 focus:ring-blue-300 text-blue-900 placeholder-blue-300'
                                               : 'bg-orange-50/50 border-orange-100 focus:bg-white focus:ring-2 focus:ring-orange-300 text-orange-900 placeholder-orange-300'
                                           }`}
                                           placeholder={searchMode === 'MINE' ? "저장된 내 장소 검색..." : "구글 지도에서 검색..."}
                                           value={searchTerm}
                                           onFocus={() => { if(searchTerm.trim()) setIsDropdownOpen(true); }}
                                           onChange={(e) => { setSearchTerm(e.target.value); setIsDropdownOpen(e.target.value.trim() !== ""); }}
                                    />

                                    {isDropdownOpen && searchTerm.trim() !== "" && (
                                        <div className="absolute z-50 w-full mt-2 bg-white border border-gray-100 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                                            {searchResults.length === 0 ? (
                                                <div className="p-4 text-center text-xs text-gray-400">검색 결과가 없습니다.</div>
                                            ) : (
                                                searchResults.map((spot, i) => {
                                                    const isNew = !spot.id || spot.id === 0;
                                                    return (
                                                        <div
                                                            key={`${spot.id || 'new'}-${i}`}
                                                            className="px-4 py-3 hover:bg-orange-50 cursor-pointer border-b border-gray-50 flex justify-between items-center last:border-0"
                                                            onClick={() => handleSpotSelect(spot)}
                                                        >
                                                            <div className="flex items-center gap-2 overflow-hidden">
                                                                {isNew && <span className="shrink-0 text-[10px] text-orange-500 border border-orange-200 px-1 rounded bg-orange-50 font-bold">NEW</span>}
                                                                <div className="flex flex-col min-w-0">
                                                                    <span className="font-bold text-gray-800 text-sm truncate">{spot.spotName}</span>
                                                                    <span className="text-xs text-gray-400 truncate">{spot.address || spot.shortAddress}</span>
                                                                </div>
                                                            </div>
                                                            <span className="shrink-0 text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded ml-2">{spot.spotType}</span>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}
                                    {isRegistering && <div className="absolute right-3 top-[100px] text-xs text-orange-500 font-bold bg-white/90 px-2 py-1 rounded">등록 중...</div>}
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div><label className="text-sm text-gray-500 font-bold block mb-1">시작 시간</label><input type="time" className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-orange-400" value={form.startTime} onChange={e => setForm({...form, startTime: e.target.value})} /></div>

                                    <div className="bg-gray-50 p-2 rounded-xl border border-gray-200">
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-xs text-gray-500 font-bold">기본 체류</label>
                                            <div className="flex items-center gap-1">
                                                <input type="number" className="w-14 p-1 text-right border rounded font-bold" value={baseStay} onChange={e => setBaseStay(Math.max(0, Number(e.target.value)))} />
                                                <span className="text-xs">분</span>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center border-t border-gray-200 pt-2">
                                            <label className="text-xs text-orange-500 font-bold">⚽ 인저리</label>
                                            <div className="flex items-center gap-1">
                                                {INJURY_OPTIONS.map(m => (
                                                    <button key={m} onClick={() => setStayInjury(m)} className={`text-[10px] px-2 py-0.5 rounded border ${stayInjury === m ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                                                        {m === 0 ? "0" : `+${m}`}
                                                    </button>
                                                ))}
                                                <input type="number" className="w-12 p-1 text-right border rounded font-bold text-orange-600" value={stayInjury} onChange={e => setStayInjury(Math.max(0, Number(e.target.value)))} />
                                                <span className="text-xs">분</span>
                                            </div>
                                        </div>
                                        <div className="text-right mt-1 text-xs font-bold text-gray-400">
                                            총 {formatSimple(baseStay + stayInjury)}
                                        </div>
                                    </div>
                                </div>

                                <div className="mb-4"><label className="text-sm text-gray-500 font-bold block mb-1">메모</label><textarea className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-orange-400 resize-none" rows={2} placeholder="필요한 메모를 입력하세요" value={form.memo} onChange={e => setForm({...form, memo: e.target.value})} /></div>

                                <div className="flex gap-3 pt-2">
                                    <button onClick={handleCancel} className="flex-1 bg-white border border-gray-200 py-3 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition">취소</button>
                                    <button onClick={handleDone} className="flex-1 bg-orange-500 text-white py-3 rounded-xl text-sm font-bold hover:bg-orange-600 shadow-md shadow-orange-200 transition">완료</button>
                                </div>
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