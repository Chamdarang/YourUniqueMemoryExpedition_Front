import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
    APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary
} from "@vis.gl/react-google-maps";
import { createSpot, searchSpots, getFilteredSpots, getMySpots, deleteSpot, updateSpot } from "../api/spotApi";
import { mapGoogleTypeToSpotType } from "../utils/mapUtils";
import type { SpotResponse, SpotCreateRequest } from "../types/spot";
import type { SpotType } from "../types/enums";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const DEFAULT_CENTER = { lat: 34.9858, lng: 135.7588 };
const DEFAULT_ZOOM = 14;
const STORAGE_KEY = "explore_map_state";

type SearchMode = 'GOOGLE' | 'MINE';

// SpotType 한글 라벨 매핑
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
}

// ------------------------------------------------------------------
// ✅ [수정] 커스텀 마커 아이콘 크기 축소 (32x42 -> 24x32)
// ------------------------------------------------------------------
function MarkerIcon({ color, borderColor, scale = 1.0, glyphColor = "white" }: { color: string, borderColor: string, scale?: number, glyphColor?: string }) {
    return (
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'bottom center', filter: 'drop-shadow(0px 2px 2px rgba(0,0,0,0.3))' }} className="relative flex flex-col items-center justify-center transition-transform duration-200">
            {/* viewBox는 유지하고 width/height를 줄여서 비율 유지하며 축소 */}
            <svg width="24" height="32" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 0C7.16344 0 0 7.16344 0 16C0 24.8366 16 42 16 42C16 42 32 24.8366 32 16C32 7.16344 24.8366 0 16 0Z" fill={color} stroke={borderColor} strokeWidth="1.5"/>
                <circle cx="16" cy="16" r="6" fill={glyphColor}/>
            </svg>
        </div>
    );
}

// ------------------------------------------------------------------
// 1. [껍데기 컴포넌트] APIProvider 제공 역할
// ------------------------------------------------------------------
export default function ExplorePage() {
    return (
        <div className="w-full h-full relative overflow-hidden">
            {/* ✅ version="beta" 추가: isOpen() 등 최신 Place 기능 사용을 위해 필수 */}
            <APIProvider
                apiKey={GOOGLE_MAPS_API_KEY}
                libraries={['places', 'geocoding', 'marker']}
                language="ko"
                region="KR"
                version="beta"
            >
                <ExploreMapContent />
            </APIProvider>
        </div>
    );
}

// ------------------------------------------------------------------
// 2. [알맹이 컴포넌트] 실제 지도 로직 수행
// ------------------------------------------------------------------
function ExploreMapContent() {
    const navigate = useNavigate();
    const map = useMap();

    // --- 초기 상태 로드 ---
    const [initialState] = useState(() => {
        try {
            const saved = sessionStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : {
                center: DEFAULT_CENTER,
                zoom: DEFAULT_ZOOM,
                mode: 'GOOGLE' as SearchMode,
                googleResults: []
            };
        } catch {
            return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, mode: 'GOOGLE', googleResults: [] };
        }
    });

    // --- 상태 관리 ---
    const [mode, setMode] = useState<SearchMode>(initialState.mode);
    const [googleResults, setGoogleResults] = useState<GooglePlaceResult[]>(initialState.googleResults);

    const [savedMapState, setSavedMapState] = useState<{ center: { lat: number, lng: number }, zoom: number }>({
        center: initialState.center,
        zoom: initialState.zoom
    });

    const [cameraTarget, setCameraTarget] = useState<{ center: { lat: number, lng: number }, zoom?: number } | null>(null);

    const [mySpots, setMySpots] = useState<SpotResponse[]>([]);
    const [allMyPlaceIds, setAllMyPlaceIds] = useState<Set<string>>(new Set());

    const [selectedMySpot, setSelectedMySpot] = useState<SpotResponse | null>(null);
    const [selectedResult, setSelectedResult] = useState<GooglePlaceResult | null>(null);
    const [showList, setShowList] = useState(false);

    // 사용자가 변경 가능한 임시 타입 상태
    const [draftType, setDraftType] = useState<SpotType>('OTHER');

    // 라이브러리 로드
    const placesLibrary = useMapsLibrary("places");
    const geocodingLibrary = useMapsLibrary("geocoding");
    const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);

    // --- Effects ---

    // 상태 저장
    useEffect(() => {
        const stateToSave = {
            center: savedMapState.center,
            zoom: savedMapState.zoom,
            mode,
            googleResults
        };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    }, [savedMapState, mode, googleResults]);

    // 초기 위치
    useEffect(() => {
        if (!sessionStorage.getItem(STORAGE_KEY) && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setCameraTarget({ center: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
                },
                () => console.warn("위치 권한 없음"),
                { enableHighAccuracy: true }
            );
        }
    }, []);

    // Geocoder 초기화
    useEffect(() => {
        if (geocodingLibrary) {
            setGeocoder(new geocodingLibrary.Geocoder());
        }
    }, [geocodingLibrary]);

    // 데이터 로드
    const fetchAllMySpots = async () => {
        try {
            const spots = await getMySpots();
            setMySpots(spots);
        } catch (err) { console.error(err); }
    };
    useEffect(() => { fetchAllMySpots(); }, []);

    useEffect(() => {
        const ids = new Set(mySpots.map(s => s.placeId).filter((id): id is string => !!id));
        setAllMyPlaceIds(ids);
    }, [mySpots]);

    // 구글 장소 선택 시 초기 타입 설정
    useEffect(() => {
        if (selectedResult) {
            const initialType = mapGoogleTypeToSpotType(selectedResult.types);
            setDraftType(initialType);
        }
    }, [selectedResult]);


    // --- 핸들러 ---

    const handleMapIdle = (map: google.maps.Map) => {
        const center = map.getCenter();
        const zoom = map.getZoom();
        if (center && zoom) {
            setSavedMapState({
                center: { lat: center.lat(), lng: center.lng() },
                zoom: zoom
            });
        }
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
        setSelectedMySpot(null);
        setCameraTarget({ center: place.location });
        setShowList(true);
    };

    // Place 클래스를 사용한 상세 정보 조회 (fetchFields)
    const fetchPlaceDetails = async (placeId: string, defaultName: string = "", defaultAddress: string = ""): Promise<GooglePlaceResult | null> => {
        if (!placesLibrary) return null;

        try {
            const place = new placesLibrary.Place({ id: placeId });

            await place.fetchFields({
                fields: [
                    'displayName',
                    'formattedAddress',
                    'location',
                    'rating',
                    'userRatingCount',
                    'regularOpeningHours',
                    'types'
                ],
            });

            // Beta 채널에서만 동작
            const isOpen = await place.isOpen();

            return {
                place_id: place.id,
                name: place.displayName || defaultName,
                address: place.formattedAddress || defaultAddress,
                location: {
                    lat: place.location?.lat() || 0,
                    lng: place.location?.lng() || 0
                },
                rating: place.rating || undefined,
                user_ratings_total: place.userRatingCount || undefined,
                isOpen: isOpen ?? undefined,
                types: place.types || []
            };
        } catch (error) {
            console.error("Place Details Fetch Error:", error);
            return {
                place_id: placeId,
                name: defaultName,
                address: defaultAddress,
                location: { lat: 0, lng: 0 },
                isOpen: undefined,
                types: []
            };
        }
    };

    // 검색 결과 클릭 핸들러
    const handleSelectSearchResult = async (place: GooglePlaceResult) => {
        const detailPlace = await fetchPlaceDetails(place.place_id, place.name, place.address);
        if (detailPlace) {
            handleSelectGooglePlace(detailPlace);
        } else {
            handleSelectGooglePlace(place);
        }
    };

    // POI(핀) 클릭 핸들러
    const handlePoiClick = async (placeId: string) => {
        if (allMyPlaceIds.has(placeId)) {
            const mySpot = mySpots.find(s => s.placeId === placeId);
            if (mySpot) {
                handleSelectSpot(mySpot);
                return;
            }
        }

        const detailPlace = await fetchPlaceDetails(placeId, "선택한 장소");
        if (detailPlace) {
            handleSelectGooglePlace(detailPlace);
        }
    };

    // 역/건물/도로 클릭 시 (Reverse Geocoding + Place Detail)
    const handleReverseGeocode = (lat: number, lng: number) => {
        if (!geocoder) return;

        geocoder.geocode({ location: { lat, lng } }, async (results, status) => {
            if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
                const place = results[0];

                if (allMyPlaceIds.has(place.place_id)) {
                    const mySpot = mySpots.find(s => s.placeId === place.place_id);
                    if (mySpot) {
                        handleSelectSpot(mySpot);
                        return;
                    }
                }

                // Place ID로 상세 정보 다시 조회
                const detailPlace = await fetchPlaceDetails(
                    place.place_id,
                    place.address_components[0]?.long_name || "알 수 없는 장소",
                    place.formatted_address
                );

                if (detailPlace) {
                    // 클릭한 정확한 좌표 유지
                    if(detailPlace.location.lat === 0 && detailPlace.location.lng === 0) {
                        detailPlace.location = { lat, lng };
                    }
                    handleSelectGooglePlace(detailPlace);
                }
            }
        });
    };

    const handleRegisterSpot = async (placeId: string) => {
        const placeDetails = await fetchPlaceDetails(placeId);

        if (placeDetails) {
            if (!confirm(`'${placeDetails.name}'을(를) [${SPOT_TYPE_LABELS[draftType]}]로 등록하시겠습니까?`)) return;

            const metadata = { originalTypes: placeDetails.types };

            try {
                const req: SpotCreateRequest = {
                    spotName: placeDetails.name,
                    address: placeDetails.address,
                    lat: placeDetails.location.lat,
                    lng: placeDetails.location.lng,
                    spotType: draftType,
                    isVisit: false,
                    placeId: placeDetails.place_id,
                    shortAddress: "",
                    website: "",
                    googleMapUrl: `http://googleusercontent.com/maps.google.com/?q=${encodeURIComponent(placeDetails.name)}&query_place_id=${placeDetails.place_id}`,
                    description: "",
                    metadata: metadata
                };

                const newSpot = await createSpot(req);
                setMySpots(prev => [...prev, newSpot]);
                handleSelectSpot(newSpot);

                alert("등록되었습니다! 🎉");
            } catch (err) { console.error(err); alert("장소 등록 실패"); }
        }
    };

    const handleDeleteSpot = async (id: number) => {
        if (!confirm("정말 이 장소를 삭제하시겠습니까?")) return;
        try {
            await deleteSpot(id);
            setMySpots(prev => prev.filter(s => s.id !== id));
            handleBackToList();
            alert("삭제되었습니다.");
        } catch (err) { console.error(err); alert("삭제 실패"); }
    };

    const handleToggleVisit = async (spot: SpotResponse) => {
        try {
            const updated = await updateSpot(spot.id, { isVisit: !spot.isVisit });
            setMySpots(prev => prev.map(s => s.id === spot.id ? updated : s));
            setSelectedMySpot(updated);
        } catch { alert("상태 변경 실패"); }
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
            {/* 1. 사이드 패널 (Overlay) */}
            <div
                className={`bg-white shadow-[0_-5px_20px_rgba(0,0,0,0.1)] flex flex-col transition-transform duration-300 ease-in-out z-20 
                absolute
                bottom-0 left-0 right-0 w-full h-[45vh] rounded-t-3xl
                ${showList ? 'translate-y-0' : 'translate-y-full'}
                
                md:top-0 md:bottom-auto md:left-0 md:h-full md:w-96 md:rounded-none md:translate-y-0 md:shadow-xl
                ${showList ? 'md:translate-x-0' : 'md:-translate-x-full'}
                `}
            >
                {/* 모바일용 그립 핸들 */}
                <div className="md:hidden w-full flex justify-center pt-3 pb-1 shrink-0" onClick={() => setShowList(!showList)}>
                    <div className="w-12 h-1.5 bg-gray-300 rounded-full cursor-pointer hover:bg-gray-400 transition-colors"></div>
                </div>

                <div className="w-full h-full flex flex-col overflow-hidden">

                    <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
                        { (selectedMySpot || selectedResult) ? (
                            <div className="flex items-center gap-2">
                                <button onClick={handleBackToList} className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition">←</button>
                                <span className="font-bold text-gray-800 text-lg">상세 정보</span>
                            </div>
                        ) : (
                            <h3 className="font-bold text-gray-800 text-lg px-1">
                                {mode === 'GOOGLE' ? `검색 결과 (${googleResults.length})` : `내 장소 (${mySpots.length})`}
                            </h3>
                        )}
                        <button onClick={() => setShowList(false)} className="text-gray-400 hover:text-gray-600 md:hidden p-2">✕</button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-0 scrollbar-hide">
                        {(selectedMySpot || selectedResult) ? (
                            <div className="p-5 pb-20 md:pb-5">
                                {selectedMySpot ? (
                                    <div className="space-y-4">
                                        <div>
                                            <div className="flex justify-between items-start">
                                                <h2 className="text-xl font-extrabold text-gray-900 leading-tight flex-1 mr-2">{selectedMySpot.spotName}</h2>
                                                <span className={`inline-block px-2 py-1 rounded text-[10px] font-bold shrink-0 ${getSpotTypeInfo(selectedMySpot.spotType).color}`}>
                                                    {getSpotTypeInfo(selectedMySpot.spotType).label}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-2 text-gray-500 text-sm">
                                                <span className="text-base">📍</span>
                                                <p className="line-clamp-2">{selectedMySpot.address}</p>
                                            </div>
                                        </div>

                                        {selectedMySpot.description && (
                                            <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-600 border border-gray-100">
                                                {selectedMySpot.description}
                                            </div>
                                        )}

                                        <div className="flex gap-2 pt-2">
                                            <button
                                                onClick={() => handleToggleVisit(selectedMySpot)}
                                                className={`flex-1 py-3 rounded-xl font-bold text-sm transition flex items-center justify-center gap-1.5 border shadow-sm
                                                ${selectedMySpot.isVisit
                                                    ? 'bg-green-50 text-green-700 border-green-200'
                                                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                            >
                                                {selectedMySpot.isVisit ? '✅ 방문 완료' : '⬜ 아직 안 가봄'}
                                            </button>

                                            <button
                                                onClick={() => navigate(`/spots/${selectedMySpot.id}`)}
                                                className="w-12 flex items-center justify-center bg-blue-50 text-blue-600 rounded-xl font-bold border border-blue-100 hover:bg-blue-100 transition shadow-sm"
                                                title="상세보기"
                                            >
                                                🔍
                                            </button>
                                            <button
                                                onClick={() => handleDeleteSpot(selectedMySpot.id)}
                                                className="w-12 flex items-center justify-center bg-red-50 text-red-500 rounded-xl font-bold border border-red-100 hover:bg-red-100 transition shadow-sm"
                                                title="삭제"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                ) : selectedResult && (
                                    <div className="space-y-4">
                                        <div>
                                            <h2 className="text-xl font-extrabold text-gray-900 leading-tight">{selectedResult.name}</h2>
                                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                                {selectedResult.rating && <span className="text-orange-500 font-bold text-sm">⭐ {selectedResult.rating}</span>}
                                                {selectedResult.isOpen !== undefined && (
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${selectedResult.isOpen ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                        {selectedResult.isOpen ? "영업 중" : "영업 종료"}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-start gap-1.5 mt-3 text-gray-500 text-sm">
                                                <span className="text-base mt-0.5">📍</span>
                                                <p className="line-clamp-2">{selectedResult.address}</p>
                                            </div>
                                        </div>

                                        {/* 타입 선택 드롭다운 */}
                                        {!allMyPlaceIds.has(selectedResult.place_id) && (
                                            <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-xl border border-gray-200">
                                                <span className="text-xs font-bold text-gray-500 pl-2 shrink-0">분류:</span>
                                                <select
                                                    value={draftType}
                                                    onChange={(e) => setDraftType(e.target.value as SpotType)}
                                                    className="flex-1 bg-transparent text-sm font-bold text-gray-800 outline-none py-1"
                                                >
                                                    {Object.keys(SPOT_TYPE_LABELS).map((key) => (
                                                        <option key={key} value={key}>{SPOT_TYPE_LABELS[key as SpotType]}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        <div className="flex gap-2 pt-2">
                                            {allMyPlaceIds.has(selectedResult.place_id) ? (
                                                <div className="flex-1 py-3 bg-gray-50 text-gray-500 font-bold text-sm text-center rounded-xl border border-gray-200">
                                                    이미 저장됨 🍀
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => handleRegisterSpot(selectedResult.place_id)}
                                                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-md hover:bg-blue-700 transition flex items-center justify-center gap-2"
                                                >
                                                    <span>+ 저장</span>
                                                </button>
                                            )}

                                            <a
                                                href={`http://googleusercontent.com/maps.google.com/?q=${encodeURIComponent(selectedResult.name)}&query_place_id=${selectedResult.place_id}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="px-4 py-3 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-50 transition flex items-center justify-center shadow-sm"
                                            >
                                                🗺️ 지도
                                            </a>
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
                                                <div
                                                    key={place.place_id}
                                                    className={`p-4 hover:bg-blue-50 cursor-pointer transition ${selectedResult?.place_id === place.place_id ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}
                                                    onClick={() => {
                                                        if (isSaved) {
                                                            const spot = mySpots.find(s => s.placeId === place.place_id);
                                                            if (spot) handleSelectSpot(spot);
                                                        } else {
                                                            handleSelectSearchResult(place);
                                                        }
                                                    }}
                                                >
                                                    <div className="flex justify-between items-start">
                                                        <div className="font-bold text-sm text-gray-800 line-clamp-1">{place.name}</div>
                                                        {isSaved && <span className="ml-2 px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded shrink-0">저장됨</span>}
                                                    </div>
                                                    <div className="text-xs text-gray-500 mt-1 line-clamp-1">{place.address}</div>
                                                    {place.rating && <div className="text-[10px] text-orange-500 mt-1">⭐ {place.rating}</div>}
                                                </div>
                                            );
                                        })
                                ) : (
                                    mySpots.length === 0 ? <div className="p-8 text-center text-gray-400 text-sm">저장된 장소가 없습니다.</div> :
                                        mySpots.map(spot => (
                                            <div key={spot.id} className="p-4 hover:bg-green-50 cursor-pointer transition" onClick={() => handleSelectSpot(spot)}>
                                                <div className="font-bold text-sm text-gray-800 line-clamp-1">{spot.spotName}</div>
                                                <div className="text-xs text-gray-500 mt-1 line-clamp-1">{spot.shortAddress || spot.address}</div>
                                                <div className="flex gap-1 mt-2">
                                                    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${getSpotTypeInfo(spot.spotType).color}`}>{getSpotTypeInfo(spot.spotType).label}</span>
                                                    {spot.isVisit && <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-bold rounded">방문함</span>}
                                                </div>
                                            </div>
                                        ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* PC용 메뉴 토글 버튼 */}
            <button
                onClick={() => setShowList(!showList)}
                className={`hidden md:flex absolute top-1/2 z-30 bg-white border border-gray-300 shadow-md rounded-r-lg py-4 px-1 items-center justify-center text-gray-500 hover:text-blue-600 hover:bg-gray-50 transition-all duration-300 ease-in-out
                ${showList ? 'left-96' : 'left-0'}`}
                style={{ transform: 'translateY(-50%)' }}
                title={showList ? "목록 닫기" : "목록 열기"}
            >
                {showList ? '◀' : '▶'}
            </button>

            {/* 2. 지도 영역 (항상 전체 화면) */}
            <div className="absolute inset-0 w-full h-full z-0">
                <MapCameraHandler target={cameraTarget} />

                <Map
                    defaultCenter={initialState.center}
                    defaultZoom={initialState.zoom}
                    mapId="DEMO_MAP_ID"
                    disableDefaultUI={true}
                    className="w-full h-full"
                    onIdle={(ev) => handleMapIdle(ev.map)}
                    onClick={(e) => {
                        // 클릭 이벤트 분기 처리
                        if (e.detail.placeId) {
                            e.stop();
                            handlePoiClick(e.detail.placeId);
                        } else if (e.detail.latLng) {
                            const lat = typeof e.detail.latLng.lat === 'function' ? e.detail.latLng.lat() : e.detail.latLng.lat;
                            const lng = typeof e.detail.latLng.lng === 'function' ? e.detail.latLng.lng() : e.detail.latLng.lng;
                            handleReverseGeocode(lat as number, lng as number);
                        }
                    }}
                >
                    <MapController
                        mode={mode}
                        onModeChange={handleModeChange}
                        onSearchStart={handleBackToList}
                        onSpotsFound={(spots) => { setMySpots(spots); if(spots.length > 0) setShowList(true); }}
                        onGoogleFound={(results) => { setGoogleResults(results); if(results.length > 0) setShowList(true); }}
                        showList={showList}
                    />

                    {mode === 'MINE' && mySpots.map(spot => (
                        <AdvancedMarker
                            key={spot.id}
                            position={{ lat: spot.lat, lng: spot.lng }}
                            onClick={(e) => { e.domEvent.stopPropagation(); handleSelectSpot(spot); }}
                            zIndex={10}
                        >
                            <MarkerIcon color="#10B981" borderColor="#059669" />
                        </AdvancedMarker>
                    ))}

                    {mode === 'GOOGLE' && googleResults.map(place => {
                        const isSaved = allMyPlaceIds.has(place.place_id);
                        const isSelected = selectedResult?.place_id === place.place_id;

                        return (
                            <AdvancedMarker
                                key={place.place_id}
                                position={place.location}
                                onClick={(e) => {
                                    e.domEvent.stopPropagation();
                                    if (isSaved) {
                                        const spot = mySpots.find(s => s.placeId === place.place_id);
                                        if (spot) handleSelectSpot(spot);
                                    } else {
                                        handleSelectSearchResult(place);
                                    }
                                }}
                                zIndex={isSelected ? 100 : (isSaved ? 50 : 20)}
                            >
                                <MarkerIcon
                                    color={isSaved ? "#10B981" : (isSelected ? "#3B82F6" : "#EF4444")}
                                    borderColor={isSaved ? "#059669" : (isSelected ? "#1D4ED8" : "#B91C1C")}
                                    scale={isSelected || isSaved ? 1.2 : 1.0}
                                />
                            </AdvancedMarker>
                        );
                    })}
                </Map>

                {/* 모바일용 목록 열기 버튼 */}
                {!showList && (googleResults.length > 0 || (mode === 'MINE' && mySpots.length > 0)) && (
                    <button
                        onClick={() => setShowList(true)}
                        className="md:hidden absolute bottom-24 left-1/2 -translate-x-1/2 bg-white text-gray-700 px-5 py-2.5 rounded-full shadow-lg font-bold text-sm z-10 flex items-center gap-2 hover:bg-gray-50 transition border border-gray-100"
                    >
                        목록 보기 ▲
                    </button>
                )}
            </div>
        </>
    );
}

// ------------------------------------------------------------------
// 3. 지도 컨트롤러 및 카메라 핸들러
// ------------------------------------------------------------------
function MapCameraHandler({ target }: { target: { center: { lat: number, lng: number }, zoom?: number } | null }) {
    const map = useMap();

    useEffect(() => {
        if (!map || !target) return;
        map.panTo(target.center);
        if (target.zoom) map.setZoom(target.zoom);
    }, [map, target]);

    return null;
}

interface MapControllerProps {
    mode: SearchMode;
    onModeChange: (mode: SearchMode) => void;
    onSearchStart: () => void;
    onSpotsFound: (spots: SpotResponse[]) => void;
    onGoogleFound: (results: GooglePlaceResult[]) => void;
    showList: boolean;
}

function MapController({ mode, onModeChange, onSearchStart, onSpotsFound, onGoogleFound, showList }: MapControllerProps) {
    const map = useMap();
    const [isSearching, setIsSearching] = useState(false);

    const calculateRadius = () => {
        if (!map) return 2000;
        const bounds = map.getBounds();
        const center = map.getCenter();
        if (!bounds || !center) return 2000;
        const ne = bounds.getNorthEast();
        const latDiff = (ne.lat() - center.lat()) * 111000;
        const lngDiff = (ne.lng() - center.lng()) * 111000 * Math.cos(center.lat() * (Math.PI / 180));
        return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
    };

    const handleSearchCurrentArea = async () => {
        if (!map) return;
        onSearchStart();
        setIsSearching(true);
        try {
            const center = map.getCenter();
            const radius = calculateRadius();
            if (center) {
                const data = await getFilteredSpots(center.lat(), center.lng(), radius);
                onSpotsFound(data);
                if (data.length === 0) alert("이 주변에 저장된 내 장소가 없습니다.");
            }
        } catch (e) { console.error(e); }
        finally { setIsSearching(false); }
    };

    return (
        <>
            <SearchBox
                mode={mode}
                onModeChange={onModeChange}
                onSearchStart={onSearchStart}
                map={map}
                onGoogleSearch={(results) => {
                    onGoogleFound(results);
                    if (results.length > 0 && map) {
                        if (results.length === 1) {
                            map.panTo(results[0].location);
                            map.setZoom(15);
                        } else {
                            const bounds = new google.maps.LatLngBounds();
                            results.forEach(r => bounds.extend(r.location));
                            map.fitBounds(bounds, 50);
                        }
                    }
                }}
                onMySpotSearch={(spots) => {
                    onSpotsFound(spots);
                    if (spots.length > 0 && map) {
                        if (spots.length === 1) {
                            map.panTo({ lat: spots[0].lat, lng: spots[0].lng });
                            map.setZoom(15);
                        } else {
                            const bounds = new google.maps.LatLngBounds();
                            spots.forEach(s => bounds.extend({ lat: s.lat, lng: s.lng }));
                            map.fitBounds(bounds, 50);
                        }
                    }
                }}
                onEmptySearch={handleSearchCurrentArea}
                showList={showList}
            />

            {mode === 'MINE' && (
                <div className={`absolute top-20 transition-all duration-300 z-10 -translate-x-1/2 
                    ${showList ? 'md:left-[calc(24rem+50%)]' : 'md:left-1/2'} left-1/2`}
                >
                    <button
                        onClick={handleSearchCurrentArea}
                        disabled={isSearching}
                        className="bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-md text-sm font-bold text-green-700 flex items-center gap-2 hover:bg-white transition active:scale-95 border border-green-100"
                    >
                        {isSearching ? '⏳ 불러오는 중...' : '🔄 이 지역에서 내 장소 찾기'}
                    </button>
                </div>
            )}
        </>
    );
}

interface SearchBoxProps {
    mode: SearchMode;
    onModeChange: (mode: SearchMode) => void;
    onSearchStart: () => void;
    map: google.maps.Map | null;
    onGoogleSearch: (results: GooglePlaceResult[]) => void;
    onMySpotSearch: (spots: SpotResponse[]) => void;
    onEmptySearch: () => void;
    showList: boolean;
}

function SearchBox({
                       mode, onModeChange, onSearchStart, map,
                       onGoogleSearch, onMySpotSearch, onEmptySearch, showList
                   }: SearchBoxProps) {

    const [keyword, setKeyword] = useState("");
    const [suggestions, setSuggestions] = useState<any[]>([]);

    // ✅ PlacesLibrary 로드
    const placesLibrary = useMapsLibrary("places");

    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setSuggestions([]);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // ✅ AutocompleteSuggestion 사용 (AutocompleteService 대체)
    useEffect(() => {
        if (mode === 'GOOGLE' && keyword && placesLibrary) {
            const timer = setTimeout(async () => {
                if(keyword.length > 0) {
                    try {
                        const { suggestions } = await placesLibrary.AutocompleteSuggestion.fetchAutocompleteSuggestions({
                            input: keyword,
                            locationBias: map?.getCenter(), // 지도 중심 기준
                        });
                        // 장소 예측 결과만 필터링
                        setSuggestions(suggestions.filter(s => s.placePrediction));
                    } catch (e) {
                        console.error("Autocomplete Error", e);
                        setSuggestions([]);
                    }
                }
            }, 300);
            return () => clearTimeout(timer);
        } else {
            setSuggestions([]);
        }
    }, [keyword, mode, placesLibrary, map]);

    // ✅ Place.searchByText 사용 (PlacesService.textSearch 대체)
    const handleGoogleTextSearch = async () => {
        if (!placesLibrary || !keyword.trim()) return;

        onSearchStart();
        setSuggestions([]);

        try {
            const { places } = await placesLibrary.Place.searchByText({
                textQuery: keyword,
                fields: [
                    'id',
                    'displayName',
                    'formattedAddress',
                    'location',
                    'rating',
                    'userRatingCount',
                    'businessStatus',
                    'types'
                ],
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
            } else {
                onGoogleSearch([]);
            }
        } catch (error) {
            console.error("Text Search Error:", error);
            alert("검색 중 오류가 발생했습니다.");
        }
    };

    // ✅ AutocompleteSuggestion 선택 시 상세 조회
    const handleGoogleSelectSuggestion = async (suggestion: any) => {
        if (!placesLibrary || !suggestion.placePrediction) return;

        onSearchStart();
        const placeId = suggestion.placePrediction.placeId;

        try {
            const place = new placesLibrary.Place({ id: placeId });
            await place.fetchFields({
                fields: ['displayName', 'formattedAddress', 'location', 'rating', 'userRatingCount', 'regularOpeningHours', 'types']
            });
            const isOpen = await place.isOpen();

            const result: GooglePlaceResult = {
                place_id: place.id,
                name: place.displayName || "",
                address: place.formattedAddress || "",
                location: { lat: place.location?.lat() || 0, lng: place.location?.lng() || 0 },
                rating: place.rating || undefined,
                user_ratings_total: place.userRatingCount || undefined,
                isOpen: isOpen ?? undefined,
                types: place.types || []
            };
            onGoogleSearch([result]);
            setSuggestions([]);
            setKeyword(result.name);
        } catch (error) {
            console.error("Place Detail Error:", error);
        }
    };

    const handleMySpotSearch = async () => {
        setSuggestions([]);
        if (!keyword.trim()) {
            onEmptySearch();
            return;
        }
        onSearchStart();
        try {
            const results = await searchSpots(keyword);
            onMySpotSearch(results);
        } catch { alert("검색 실패"); }
    };

    return (
        <div
            ref={wrapperRef}
            className={`absolute top-4 right-4 z-10 flex flex-col gap-2 md:w-96 transition-all duration-300 ease-in-out
            left-4 ${showList ? 'md:left-[25rem]' : 'md:left-4'}`}
        >
            <div className="bg-white rounded-xl shadow-lg p-2 flex items-center gap-2">
                <button
                    onClick={() => { onModeChange(mode === 'GOOGLE' ? 'MINE' : 'GOOGLE'); setKeyword(""); setSuggestions([]); }}
                    className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-bold transition shrink-0 border ${mode === 'GOOGLE' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-green-50 text-green-600 border-green-100'}`}
                >
                    {mode === 'GOOGLE' ? (
                        <>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                            <span>구글</span>
                        </>
                    ) : (
                        <>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                            <span>내 장소</span>
                        </>
                    )}
                </button>
                <input
                    type="text"
                    className="flex-1 outline-none text-sm font-medium text-gray-700 min-w-0"
                    placeholder={mode === 'GOOGLE' ? "장소, 주소 검색 (엔터)" : "이름 검색 (빈칸: 주변 검색)"}
                    value={keyword}
                    onChange={e => setKeyword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') mode === 'GOOGLE' ? handleGoogleTextSearch() : handleMySpotSearch(); }}
                />
                <button onClick={mode === 'GOOGLE' ? handleGoogleTextSearch : handleMySpotSearch} className="text-gray-400 hover:text-blue-600 p-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                </button>
            </div>

            {mode === 'GOOGLE' && suggestions.length > 0 && (
                <div className="bg-white rounded-xl shadow-xl overflow-hidden animate-fade-in-down max-h-60 overflow-y-auto border border-gray-100">
                    {suggestions.map((suggestion) => {
                        const placePrediction = suggestion.placePrediction;
                        if (!placePrediction) return null; // 장소가 아닌 경우 스킵

                        return (
                            <div
                                key={placePrediction.placeId} // Key는 placeId 사용
                                onClick={() => handleGoogleSelectSuggestion(suggestion)}
                                className="p-3 border-b hover:bg-blue-50 cursor-pointer flex flex-col gap-0.5"
                            >
                                {/* ✅ [수정] AutocompleteSuggestion의 텍스트 접근 방식 변경 */}
                                <span className="text-sm font-bold text-gray-800">{placePrediction.mainText.toString()}</span>
                                <span className="text-[10px] text-gray-400">{placePrediction.secondaryText.toString()}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}