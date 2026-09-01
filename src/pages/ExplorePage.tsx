import { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
    APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary
} from "@vis.gl/react-google-maps";
import { createSpot, getMySpots, deleteSpot, updateSpot } from "../api/spotApi";
import { mapGoogleTypeToSpotType } from "../utils/mapUtils";
import type { SpotResponse, SpotCreateRequest } from "../types/spot";
import type { SpotType } from "../types/enums";
import { getSpotDisplayName } from "../utils/spotUtils";
import { useFeedback } from '../components/common/useFeedback';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const DEFAULT_CENTER = { lat: 34.9858, lng: 135.7588 };
const DEFAULT_ZOOM = 14;
const STORAGE_KEY = "explore_map_state";

type SearchMode = 'GOOGLE' | 'MINE';

const SPOT_TYPE_LABELS: Record<SpotType, string> = {
    LANDMARK: '🗼 명소',
    HISTORICAL_SITE: '🏯 유적지',
    RELIGIOUS_SITE: '⛩️ 종교시설',
    PARK: '🌳 공원',
    NATURE: '⛰️ 자연',
    MUSEUM: '🏛️ 박물관',
    SHOPPING: '🛍️ 쇼핑',
    ACTIVITY: '🎢 액티비티',
    FOOD: '🍚 음식점',
    CAFE: '☕ 카페',
    STATION: '🚉 교통',
    ACCOMMODATION: '🏨 숙소',
    OTHER: '📍 기타',
};

interface GooglePlaceResult {
    place_id: string;
    name: string;
    address: string;
    location: { lat: number; lng: number };
    rating?: number;
    user_ratings_total?: number;
    isOpen?: boolean;
    types?: string[];
    websiteURI?: string; // 추가
}

function MarkerIcon({ color, borderColor, scale = 1.0, glyphColor = "white" }: { color: string, borderColor: string, scale?: number, glyphColor?: string }) {
    return (
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'bottom center', filter: 'drop-shadow(0px 2px 2px rgba(0,0,0,0.3))' }} className="relative flex flex-col items-center justify-center transition-transform duration-200">
            <svg width="24" height="32" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 0C7.16344 0 0 7.16344 0 16C0 24.8366 16 42 16 42C16 42 32 24.8366 32 16C32 7.16344 24.8366 0 16 0Z" fill={color} stroke={borderColor} strokeWidth="1.5"/>
                <circle cx="16" cy="16" r="6" fill={glyphColor}/>
            </svg>
        </div>
    );
}

export default function ExplorePage() {
    return (
        <div className="w-full h-full relative overflow-hidden">
            <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['places', 'geocoding', 'marker']} language="ko" region="KR" version="beta">
                <ExploreMapContent />
            </APIProvider>
        </div>
    );
}

function ExploreMapContent() {
    const { confirm, showToast } = useFeedback();
    const navigate = useNavigate();
    const map = useMap();

    const [initialState] = useState(() => {
        try {
            const saved = sessionStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, mode: 'GOOGLE' as SearchMode, googleResults: [] };
        } catch { return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, mode: 'GOOGLE', googleResults: [] }; }
    });

    const [mode, setMode] = useState<SearchMode>(initialState.mode);
    const [googleResults, setGoogleResults] = useState<GooglePlaceResult[]>(initialState.googleResults);
    const [savedMapState, setSavedMapState] = useState({ center: initialState.center, zoom: initialState.zoom });
    const [cameraTarget, setCameraTarget] = useState<{ center: { lat: number, lng: number }, zoom?: number } | null>(null);

    const [mySpots, setMySpots] = useState<SpotResponse[]>([]);
    const allMyPlaceIds = useMemo(
        () => new Set(mySpots.map(spot => spot.placeId).filter((id): id is string => !!id)),
        [mySpots]
    );

    const [selectedMySpot, setSelectedMySpot] = useState<SpotResponse | null>(null);
    const [selectedResult, setSelectedResult] = useState<GooglePlaceResult | null>(null);
    const [showList, setShowList] = useState(false);
    const [draftType, setDraftType] = useState<SpotType>('OTHER');

    const placesLibrary = useMapsLibrary("places");
    const geocodingLibrary = useMapsLibrary("geocoding");
    const geocoder = useMemo(
        () => geocodingLibrary ? new geocodingLibrary.Geocoder() : null,
        [geocodingLibrary]
    );

    useEffect(() => {
        const stateToSave = { center: savedMapState.center, zoom: savedMapState.zoom, mode, googleResults };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    }, [savedMapState, mode, googleResults]);

    useEffect(() => {
        if (!sessionStorage.getItem(STORAGE_KEY) && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => { setCameraTarget({ center: { lat: pos.coords.latitude, lng: pos.coords.longitude } }); },
                () => console.warn("위치 권한 없음"), { enableHighAccuracy: true }
            );
        }
    }, []);

    useEffect(() => {
        getMySpots({ page: 0, size: 2000 })
            .then(response => setMySpots(response.content))
            .catch(console.error);
    }, []);

    const handleMapIdle = (map: google.maps.Map) => {
        const center = map.getCenter();
        const zoom = map.getZoom();
        if (center && zoom) setSavedMapState({ center: { lat: center.lat(), lng: center.lng() }, zoom: zoom });
    };

    const handleBackToList = () => {
        setSelectedMySpot(null);
        setSelectedResult(null);
    };

    const handleModeChange = (newMode: SearchMode) => {
        setMode(newMode);
        handleBackToList();
    };

    const handleSelectSpot = (spot: SpotResponse) => {
        setSelectedMySpot(spot);
        setSelectedResult(null);
        setCameraTarget({ center: { lat: spot.lat, lng: spot.lng } });
        setShowList(true);
    };

    const handleSelectGooglePlace = (place: GooglePlaceResult) => {
        setSelectedResult(place);
        setDraftType(mapGoogleTypeToSpotType(place.types));
        setSelectedMySpot(null);
        setCameraTarget({ center: place.location });
        setShowList(true);
    };

    // ✅ [수정] 필드 추가 및 반환 타입 일관성 유지
    const fetchPlaceDetails = async (placeId: string) => {
        if (!placesLibrary || !map) return null;
        try {
            const place = new placesLibrary.Place({ id: placeId });
            await place.fetchFields({
                fields: ['displayName', 'formattedAddress', 'location', 'rating', 'userRatingCount', 'regularOpeningHours', 'types', 'id', 'websiteURI','photos','regularOpeningHours']
            });
            return place;
        } catch (err) {
            console.error("Error fetching place details:", err);
            return null;
        }
    };

    const handleSelectSearchResult = async (place: GooglePlaceResult) => {
        const detailPlace = await fetchPlaceDetails(place.place_id);
        if (detailPlace) {
            const isOpen = await detailPlace.isOpen();
            const result: GooglePlaceResult = {
                place_id: detailPlace.id,
                name: detailPlace.displayName || place.name,
                address: detailPlace.formattedAddress || place.address,
                location: { lat: detailPlace.location?.lat() || 0, lng: detailPlace.location?.lng() || 0 },
                rating: detailPlace.rating || undefined,
                user_ratings_total: detailPlace.userRatingCount || undefined,
                isOpen: isOpen ?? undefined,
                types: detailPlace.types || [],
                websiteURI: detailPlace.websiteURI || undefined
            };
            handleSelectGooglePlace(result);
        } else {
            handleSelectGooglePlace(place);
        }
    };

    const handlePoiClick = async (placeId: string) => {
        if (allMyPlaceIds.has(placeId)) {
            const mySpot = mySpots.find(s => s.placeId === placeId);
            if (mySpot) { handleSelectSpot(mySpot); return; }
        }
        const detailPlace = await fetchPlaceDetails(placeId);
        if (detailPlace) {
            const isOpen = await detailPlace.isOpen();
            handleSelectGooglePlace({
                place_id: detailPlace.id,
                name: detailPlace.displayName || "",
                address: detailPlace.formattedAddress || "",
                location: { lat: detailPlace.location?.lat() || 0, lng: detailPlace.location?.lng() || 0 },
                isOpen: isOpen ?? undefined,
                types: detailPlace.types || [],
                websiteURI: detailPlace.websiteURI || undefined
            });
        }
    };

    const handleReverseGeocode = (lat: number, lng: number) => {
        if (!geocoder) return;
        geocoder.geocode({ location: { lat, lng } }, async (results, status) => {
            if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
                const place = results[0];
                if (allMyPlaceIds.has(place.place_id)) {
                    const mySpot = mySpots.find(s => s.placeId === place.place_id);
                    if (mySpot) { handleSelectSpot(mySpot); return; }
                }
                const detailPlace = await fetchPlaceDetails(place.place_id);
                if (detailPlace) {
                    const isOpen = await detailPlace.isOpen();
                    handleSelectGooglePlace({
                        place_id: detailPlace.id,
                        name: detailPlace.displayName || "",
                        address: detailPlace.formattedAddress || "",
                        location: { lat: detailPlace.location?.lat() || lat, lng: detailPlace.location?.lng() || lng },
                        isOpen: isOpen ?? undefined,
                        types: detailPlace.types || [],
                        websiteURI: detailPlace.websiteURI || undefined
                    });
                }
            }
        });
    };

    // ✅ [수정] shortAddress 생성 로직 및 URL 형식 통일
    const handleRegisterSpot = async (placeId: string) => {
        const placeDetails = await fetchPlaceDetails(placeId);
        if (placeDetails) {
            if (!await confirm({
                title: '내 장소 등록',
                message: `'${placeDetails.displayName}'을(를) [${SPOT_TYPE_LABELS[draftType]}]로 등록할까요?`,
                confirmLabel: '등록',
            })) return;
            try {
                // 1. shortAddress 생성 (국가명 제외)
                const addrParts = placeDetails.formattedAddress?.split(' ') || [];
                const shortAddr = addrParts.length > 2 ? addrParts.slice(1).join(' ') : (placeDetails.formattedAddress || "");

                // 2. 영업 시간 가공 (요일별 텍스트 리스트로 변환)
                const openingHours = placeDetails.regularOpeningHours?.weekdayDescriptions || [];

                // 3. 첫 번째 사진 URL 추출 (maxWidth 설정)
                const photoUrl = placeDetails.photos && placeDetails.photos.length > 0
                    ? placeDetails.photos[0].getURI({ maxWidth: 800 })
                    : null;

                const req: SpotCreateRequest = {
                    spotName: placeDetails.displayName || '',
                    address: placeDetails.formattedAddress || '',
                    lat: placeDetails.location?.lat() || 0,
                    lng: placeDetails.location?.lng() || 0,
                    spotType: draftType,
                    isVisit: false,
                    placeId: placeDetails.id,
                    shortAddress: shortAddr,
                    website: placeDetails.websiteURI || '',
                    // 표준 검색 API URL 형식 적용
                    googleMapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeDetails.displayName || '')}&query_place_id=${placeDetails.id}`,
                    description: "",
                    metadata: {
                        originalTypes: placeDetails.types, // ✅ 구글 원본 타입
                        openingHours: openingHours,        // ✅ 요일별 영업시간
                        photoUrl: photoUrl                 // ✅ 첫 번째 사진 URL
                    }
                };

                const newSpot = await createSpot(req);
                setMySpots(prev => [...prev, newSpot]);
                handleSelectSpot(newSpot);
                showToast({ message: "내 장소에 등록했습니다! 🎉", type: 'success' });
            } catch (err) {
                console.error(err);
                showToast({ message: "장소를 등록하지 못했습니다.", type: 'error' });
            }
        }
    };

    const handleDeleteSpot = async (id: number) => {
        const target = mySpots.find(spot => spot.id === id);
        if (!await confirm({ title: '장소 삭제', message: `'${target ? getSpotDisplayName(target) : '이 장소'}'을 삭제할까요?`, confirmLabel: '삭제', danger: true })) return;
        try {
            await deleteSpot(id);
            setMySpots(prev => prev.filter(s => s.id !== id));
            handleBackToList();
            showToast({ message: "장소를 삭제했습니다.", type: 'success' });
        } catch (err) { console.error(err); showToast({ message: "장소를 삭제하지 못했습니다.", type: 'error' }); }
    };

    const handleToggleVisit = async (spot: SpotResponse) => {
        try {
            const updated = await updateSpot(spot.id, { isVisit: !spot.isVisit });
            setMySpots(prev => prev.map(s => s.id === spot.id ? updated : s));
            setSelectedMySpot(updated);
        } catch { showToast({ message: "방문 상태를 바꾸지 못했습니다.", type: 'error' }); }
    };

    const getSpotTypeInfo = (type: SpotType) => {
        switch (type) {
            case 'FOOD': return { label: '🍚 음식점', color: 'text-red-600 bg-red-50' };
            case 'CAFE': return { label: '☕ 카페', color: 'text-amber-700 bg-amber-50' };
            case 'LANDMARK': return { label: '🗼 명소', color: 'text-purple-600 bg-purple-50' };
            case 'HISTORICAL_SITE': return { label: '🏯 유적지', color: 'text-stone-600 bg-stone-50' };
            case 'SHOPPING': return { label: '🛍️ 쇼핑', color: 'text-pink-600 bg-pink-50' };
            case 'ACCOMMODATION': return { label: '🏨 숙소', color: 'text-indigo-600 bg-indigo-50' };
            default: return { label: '📍 장소', color: 'text-blue-600 bg-blue-50' };
        }
    };

    return (
        <>
            <div className={`bg-white shadow-[0_-5px_20px_rgba(0,0,0,0.1)] flex flex-col transition-transform duration-300 ease-in-out z-20 absolute bottom-0 left-0 right-0 w-full h-[45vh] rounded-t-3xl ${showList ? 'translate-y-0' : 'translate-y-full'} md:top-0 md:bottom-auto md:left-0 md:h-full md:w-96 md:rounded-none md:translate-y-0 md:shadow-xl ${showList ? 'md:translate-x-0' : 'md:-translate-x-full'}`}>
                <div className="md:hidden w-full flex justify-center pt-3 pb-1 shrink-0" onClick={() => setShowList(!showList)}><div className="w-12 h-1.5 bg-gray-300 rounded-full cursor-pointer hover:bg-gray-400 transition-colors"></div></div>
                <div className="w-full h-full flex flex-col overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
                        { (selectedMySpot || selectedResult) ? (
                            <div className="flex items-center gap-2"><button onClick={handleBackToList} className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition">←</button><span className="font-bold text-gray-800 text-lg">상세 정보</span></div>
                        ) : (<h3 className="font-bold text-gray-800 text-lg px-1">{mode === 'GOOGLE' ? `검색 결과 (${googleResults.length})` : `내 장소 (${mySpots.length})`}</h3>)}
                        <button onClick={() => setShowList(false)} className="text-gray-400 hover:text-gray-600 md:hidden p-2">✕</button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-0 scrollbar-hide">
                        {(selectedMySpot || selectedResult) ? (
                            <div className="p-5 pb-20 md:pb-5">
                                {selectedMySpot ? (
                                    <div className="space-y-4">
                                        <div>
                                            <div className="flex justify-between items-start"><h2 className="text-xl font-extrabold text-gray-900 leading-tight flex-1 mr-2">{getSpotDisplayName(selectedMySpot)}</h2><span className={`inline-block px-2 py-1 rounded text-[10px] font-bold shrink-0 ${getSpotTypeInfo(selectedMySpot.spotType).color}`}>{getSpotTypeInfo(selectedMySpot.spotType).label}</span></div>
                                            <div className="flex items-center gap-1.5 mt-2 text-gray-500 text-sm"><span className="text-base">📍</span><p className="line-clamp-2">{selectedMySpot.address}</p></div>
                                        </div>
                                        {selectedMySpot.description && <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-600 border border-gray-100">{selectedMySpot.description}</div>}
                                        <div className="flex gap-2 pt-2">
                                            <button onClick={() => handleToggleVisit(selectedMySpot)} className={`flex-1 py-3 rounded-xl font-bold text-sm transition flex items-center justify-center gap-1.5 border shadow-sm ${selectedMySpot.isVisit ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{selectedMySpot.isVisit ? '✅ 방문 완료' : '⬜ 아직 안 가봄'}</button>
                                            <button onClick={() => navigate(`/spots/${selectedMySpot.id}`)} className="w-12 flex items-center justify-center bg-blue-50 text-blue-600 rounded-xl font-bold border border-blue-100 hover:bg-blue-100 transition shadow-sm" title="상세보기">🔍</button>
                                            <button onClick={() => handleDeleteSpot(selectedMySpot.id)} className="w-12 flex items-center justify-center bg-red-50 text-red-500 rounded-xl font-bold border border-red-100 hover:bg-red-100 transition shadow-sm" title="삭제">🗑️</button>
                                        </div>
                                    </div>
                                ) : selectedResult && (
                                    <div className="space-y-4">
                                        <div>
                                            <h2 className="text-xl font-extrabold text-gray-900 leading-tight">{selectedResult.name}</h2>
                                            <div className="flex flex-wrap items-center gap-2 mt-2">{selectedResult.rating && <span className="text-orange-500 font-bold text-sm">⭐ {selectedResult.rating}</span>}{selectedResult.isOpen !== undefined && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${selectedResult.isOpen ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{selectedResult.isOpen ? "영업 중" : "영업 종료"}</span>}</div>
                                            <div className="flex items-start gap-1.5 mt-3 text-gray-500 text-sm"><span className="text-base mt-0.5">📍</span><p className="line-clamp-2">{selectedResult.address}</p></div>
                                        </div>
                                        {!allMyPlaceIds.has(selectedResult.place_id) && (
                                            <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-xl border border-gray-200"><span className="text-xs font-bold text-gray-500 pl-2 shrink-0">분류:</span><select value={draftType} onChange={(e) => setDraftType(e.target.value as SpotType)} className="flex-1 bg-transparent text-sm font-bold text-gray-800 outline-none py-1">{Object.keys(SPOT_TYPE_LABELS).map((key) => (<option key={key} value={key}>{SPOT_TYPE_LABELS[key as SpotType]}</option>))}</select></div>
                                        )}
                                        <div className="flex gap-2 pt-2">
                                            {allMyPlaceIds.has(selectedResult.place_id) ? (<div className="flex-1 py-3 bg-gray-50 text-gray-500 font-bold text-sm text-center rounded-xl border border-gray-200">이미 저장됨 🍀</div>) : (<button onClick={() => handleRegisterSpot(selectedResult.place_id)} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-md hover:bg-blue-700 transition flex items-center justify-center gap-2"><span>+ 저장</span></button>)}
                                            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedResult.name)}&query_place_id=${selectedResult.place_id}`} target="_blank" rel="noreferrer" className="px-4 py-3 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-50 transition flex items-center justify-center shadow-sm">🗺️ 지도</a>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100 pb-20 md:pb-0">
                                {mode === 'GOOGLE' ? (
                                    googleResults.length === 0 ? <div className="p-8 text-center text-gray-400 text-sm">검색 결과가 없습니다.</div> :
                                        googleResults.map(place => {
                                            const isSaved = allMyPlaceIds.has(place.place_id);
                                            return (
                                                <div key={place.place_id} className="p-4 hover:bg-blue-50 cursor-pointer transition" onClick={() => { if (isSaved) { const spot = mySpots.find(s => s.placeId === place.place_id); if (spot) handleSelectSpot(spot); } else { handleSelectSearchResult(place); } }}>
                                                    <div className="flex justify-between items-start"><div className="font-bold text-sm text-gray-800 line-clamp-1">{place.name}</div>{isSaved && <span className="ml-2 px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded shrink-0">저장됨</span>}</div>
                                                    <div className="text-xs text-gray-500 mt-1 line-clamp-1">{place.address}</div>
                                                    {place.rating && <div className="text-[10px] text-orange-500 mt-1">⭐ {place.rating}</div>}
                                                </div>
                                            );
                                        })
                                ) : (
                                    mySpots.length === 0 ? <div className="p-8 text-center text-gray-400 text-sm">저장된 장소가 없습니다.</div> :
                                        mySpots.map(spot => (
                                            <div key={spot.id} className="p-4 hover:bg-green-50 cursor-pointer transition" onClick={() => handleSelectSpot(spot)}>
                                                <div className="font-bold text-sm text-gray-800 line-clamp-1">{getSpotDisplayName(spot)}</div>
                                                <div className="text-xs text-gray-500 mt-1 line-clamp-1">{spot.shortAddress || spot.address}</div>
                                                <div className="flex gap-1 mt-2"><span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${getSpotTypeInfo(spot.spotType).color}`}>{getSpotTypeInfo(spot.spotType).label}</span>{spot.isVisit && <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-bold rounded">방문함</span>}</div>
                                            </div>
                                        ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <button onClick={() => setShowList(!showList)} className={`hidden md:flex absolute top-1/2 z-30 bg-white border border-gray-300 shadow-md rounded-r-lg py-4 px-1 items-center justify-center text-gray-500 hover:text-blue-600 hover:bg-gray-50 transition-all duration-300 ease-in-out ${showList ? 'left-96' : 'left-0'}`} style={{ transform: 'translateY(-50%)' }}>{showList ? '◀' : '▶'}</button>
            <div className="absolute inset-0 w-full h-full z-0">
                <MapCameraHandler target={cameraTarget} />
                <Map defaultCenter={initialState.center} defaultZoom={initialState.zoom} mapId="EXPLORE_MAP_ID" disableDefaultUI={true} className="w-full h-full" onIdle={(ev) => handleMapIdle(ev.map)} onClick={(e) => { if (e.detail.placeId) { e.stop(); handlePoiClick(e.detail.placeId); } else if (e.detail.latLng) { handleReverseGeocode(e.detail.latLng.lat, e.detail.latLng.lng); } }}>
                    <MapController mode={mode} onModeChange={handleModeChange} onSearchStart={handleBackToList} onSpotsFound={(spots) => { setMySpots(spots); if(spots.length > 0) setShowList(true); }} onGoogleFound={(results) => { setGoogleResults(results); if(results.length > 0) setShowList(true); }} showList={showList} />
                    {mode === 'MINE' && mySpots.map(spot => (<AdvancedMarker key={spot.id} position={{ lat: spot.lat, lng: spot.lng }} onClick={(e) => { e.domEvent.stopPropagation(); handleSelectSpot(spot); }} zIndex={10}><MarkerIcon color="#10B981" borderColor="#059669" /></AdvancedMarker>))}
                    {mode === 'GOOGLE' && googleResults.map(place => { const isSaved = allMyPlaceIds.has(place.place_id); const isSelected = selectedResult?.place_id === place.place_id; return (<AdvancedMarker key={place.place_id} position={place.location} onClick={(e) => { e.domEvent.stopPropagation(); if (isSaved) { const spot = mySpots.find(s => s.placeId === place.place_id); if (spot) handleSelectSpot(spot); } else { handleSelectSearchResult(place); } }} zIndex={isSelected ? 100 : (isSaved ? 50 : 20)}><MarkerIcon color={isSaved ? "#10B981" : (isSelected ? "#3B82F6" : "#EF4444")} borderColor={isSaved ? "#059669" : (isSelected ? "#1D4ED8" : "#B91C1C")} scale={isSelected || isSaved ? 1.2 : 1.0} /></AdvancedMarker>); })}
                </Map>
            </div>
        </>
    );
}

function MapCameraHandler({ target }: { target: { center: { lat: number, lng: number }, zoom?: number } | null }) {
    const map = useMap();
    useEffect(() => { if (!map || !target) return; map.panTo(target.center); if (target.zoom) map.setZoom(target.zoom); }, [map, target]);
    return null;
}

interface MapControllerProps { mode: SearchMode; onModeChange: (mode: SearchMode) => void; onSearchStart: () => void; onSpotsFound: (spots: SpotResponse[]) => void; onGoogleFound: (results: GooglePlaceResult[]) => void; showList: boolean; }
function MapController({ mode, onModeChange, onSearchStart, onSpotsFound, onGoogleFound, showList }: MapControllerProps) {
    const map = useMap();
    return (
        <SearchBox mode={mode} onModeChange={onModeChange} onSearchStart={onSearchStart} map={map} onGoogleSearch={(results) => { onGoogleFound(results); if (results.length > 0 && map) { if (results.length === 1) { map.panTo(results[0].location); map.setZoom(15); } else { const bounds = new google.maps.LatLngBounds(); results.forEach(r => bounds.extend(r.location)); map.fitBounds(bounds, 50); } } }} onMySpotSearch={(spots) => { onSpotsFound(spots); if (spots.length > 0 && map) { if (spots.length === 1) { map.panTo({ lat: spots[0].lat, lng: spots[0].lng }); map.setZoom(15); } else { const bounds = new google.maps.LatLngBounds(); spots.forEach(s => bounds.extend({ lat: s.lat, lng: s.lng })); map.fitBounds(bounds, 50); } } }} showList={showList} />
    );
}

interface SearchBoxProps { mode: SearchMode; onModeChange: (mode: SearchMode) => void; onSearchStart: () => void; map: google.maps.Map | null; onGoogleSearch: (results: GooglePlaceResult[]) => void; onMySpotSearch: (spots: SpotResponse[]) => void; showList: boolean; }
function SearchBox({ mode, onModeChange, onSearchStart, map, onGoogleSearch, onMySpotSearch, showList }: SearchBoxProps) {
    const { showToast } = useFeedback();
    const [keyword, setKeyword] = useState("");
    const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
    const placesLibrary = useMapsLibrary("places");
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) { setSuggestions([]); }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (mode === 'GOOGLE' && keyword && placesLibrary) {
            const timer = setTimeout(async () => {
                if(keyword.length > 0) {
                    try {
                        const { suggestions } = await placesLibrary.AutocompleteSuggestion.fetchAutocompleteSuggestions({
                            input: keyword, locationBias: map?.getCenter(),
                        });
                        setSuggestions(suggestions.filter(s => s.placePrediction));
                    } catch (e) { console.error("Autocomplete Error", e); setSuggestions([]); }
                }
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [keyword, mode, placesLibrary, map]);

    const handleGoogleTextSearch = async () => {
        if (!placesLibrary || !keyword.trim()) return;
        onSearchStart(); setSuggestions([]);
        try {
            const { places } = await placesLibrary.Place.searchByText({
                textQuery: keyword,
                fields: ['id', 'displayName', 'formattedAddress', 'location', 'rating', 'userRatingCount', 'types'],
                locationBias: map?.getCenter(),
            });
            if (places && places.length > 0) {
                const mappedResults: GooglePlaceResult[] = await Promise.all(places.map(async (place) => {
                    const isOpen = await place.isOpen();
                    return {
                        place_id: place.id,
                        name: place.displayName || "이름 없음",
                        address: place.formattedAddress || "",
                        location: { lat: place.location?.lat() || 0, lng: place.location?.lng() || 0 },
                        rating: place.rating || undefined,
                        user_ratings_total: place.userRatingCount || undefined,
                        isOpen: isOpen ?? undefined,
                        types: place.types || []
                    };
                }));
                onGoogleSearch(mappedResults);
            } else { onGoogleSearch([]); }
        } catch (error) { console.error("Text Search Error:", error); showToast({ message: "Google 장소 검색 중 오류가 발생했습니다.", type: 'error' }); }
    };

    const handleGoogleSelectSuggestion = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
        if (!placesLibrary || !suggestion.placePrediction) return;
        onSearchStart();
        const placeId = suggestion.placePrediction.placeId;
        try {
            const place = new placesLibrary.Place({ id: placeId });
            await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'rating', 'userRatingCount', 'types', 'websiteURI'] });
            const isOpen = await place.isOpen();
            const result: GooglePlaceResult = {
                place_id: place.id,
                name: place.displayName || "",
                address: place.formattedAddress || "",
                location: { lat: place.location?.lat() || 0, lng: place.location?.lng() || 0 },
                rating: place.rating || undefined,
                user_ratings_total: place.userRatingCount || undefined,
                isOpen: isOpen ?? undefined,
                types: place.types || [],
                websiteURI: place.websiteURI || undefined
            };
            onGoogleSearch([result]); setSuggestions([]); setKeyword(result.name);
        } catch (error) { console.error("Place Detail Error:", error); }
    };

    const handleMySpotSearch = async () => {
        setSuggestions([]); if (!keyword.trim()) return;
        onSearchStart();
        try {
            const res = await getMySpots({ keyword: keyword, page: 0, size: 50 });
            onMySpotSearch(res.content);
        } catch { showToast({ message: "내 장소를 검색하지 못했습니다.", type: 'error' }); }
    };

    return (
        <div ref={wrapperRef} className={`absolute top-4 right-4 z-10 flex flex-col gap-2 md:w-96 transition-all duration-300 ease-in-out left-4 ${showList ? 'md:left-[25rem]' : 'md:left-4'}`}>
            <div className="bg-white rounded-xl shadow-lg p-2 flex items-center gap-2">
                <button onClick={() => { onModeChange(mode === 'GOOGLE' ? 'MINE' : 'GOOGLE'); setKeyword(""); setSuggestions([]); }} className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-bold transition shrink-0 border ${mode === 'GOOGLE' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-green-50 text-green-600 border-green-100'}`}>
                    {mode === 'GOOGLE' ? (
                        <><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg><span>구글</span></>
                    ) : (
                        <><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg><span>내 장소</span></>
                    )}
                </button>
                <input type="text" className="flex-1 outline-none text-sm font-medium text-gray-700 min-w-0" placeholder={mode === 'GOOGLE' ? "장소, 주소 검색 (엔터)" : "이름 검색 (엔터)"} value={keyword} onChange={e => {
                    setKeyword(e.target.value);
                    if (!e.target.value) setSuggestions([]);
                }} onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        if (mode === 'GOOGLE') void handleGoogleTextSearch();
                        else void handleMySpotSearch();
                    }
                }} />
                <button onClick={mode === 'GOOGLE' ? handleGoogleTextSearch : handleMySpotSearch} className="text-gray-400 hover:text-blue-600 p-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                </button>
            </div>
            {mode === 'GOOGLE' && suggestions.length > 0 && (
                <div className="bg-white rounded-xl shadow-xl overflow-hidden animate-fade-in-down max-h-60 overflow-y-auto border border-gray-100">
                    {suggestions.map((suggestion) => {
                        const placePrediction = suggestion.placePrediction;
                        if (!placePrediction) return null;
                        return (
                            <div key={placePrediction.placeId} onClick={() => handleGoogleSelectSuggestion(suggestion)} className="p-3 border-b hover:bg-blue-50 cursor-pointer flex flex-col gap-0.5">
                                <span className="text-sm font-bold text-gray-800">{placePrediction.mainText?.text || placePrediction.text.text || "이름 없음" }</span>
                                <span className="text-[10px] text-gray-400">{placePrediction.secondaryText?.text || ""}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
