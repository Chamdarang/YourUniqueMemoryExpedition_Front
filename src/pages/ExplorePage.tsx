import { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
    APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary
} from "@vis.gl/react-google-maps";
import { createSpot, getMySpots, deleteSpot, updateSpot } from "../api/spotApi";
import { addSpotToGroup, createGroup, getAllGroups } from "../api/groupApi";
import { mapGoogleTypeToSpotType } from "../utils/mapUtils";
import type { SpotResponse, SpotCreateRequest } from "../types/spot";
import type { SpotGroupResponse } from "../types/groups";
import type { SpotType } from "../types/enums";
import { getSpotDisplayName } from "../utils/spotUtils";
import { useFeedback } from '../components/common/useFeedback';
import { MAP_COLORS } from '../utils/mapStyles';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const DEFAULT_CENTER = { lat: 34.9858, lng: 135.7588 };
const DEFAULT_ZOOM = 14;

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
    primaryType?: string;
    websiteURI?: string; // 추가
    reviewsURI?: string;
    googleTypeLabel?: string;
}

function getGoogleMapsReviewsUri(place: google.maps.places.Place): string | undefined {
    return (place as google.maps.places.Place & { googleMapsLinks?: { reviewsURI?: string } }).googleMapsLinks?.reviewsURI;
}

function getGoogleTypeLabel(place: google.maps.places.Place): string | undefined {
    return place.primaryTypeDisplayName || undefined;
}

function getSavedSpotTags(userMetadata: Record<string, unknown> | undefined): string[] {
    const tags = userMetadata?.tags;
    return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [];
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

    const [mode, setMode] = useState<SearchMode>('GOOGLE');
    const [googleResults, setGoogleResults] = useState<GooglePlaceResult[]>([]);
    const [cameraTarget, setCameraTarget] = useState<{ center: { lat: number, lng: number }, zoom?: number } | null>(null);

    const [mySpots, setMySpots] = useState<SpotResponse[]>([]);
    const allMyPlaceIds = useMemo(
        () => new Set(mySpots.map(spot => spot.placeId).filter((id): id is string => !!id)),
        [mySpots]
    );

    const [selectedMySpot, setSelectedMySpot] = useState<SpotResponse | null>(null);
    const [selectedResult, setSelectedResult] = useState<GooglePlaceResult | null>(null);
    const [showList, setShowList] = useState(false);
    const [isSaveFormOpen, setIsSaveFormOpen] = useState(false);
    const [draftType, setDraftType] = useState<SpotType>('OTHER');
    const [draftName, setDraftName] = useState('');
    const [draftDescription, setDraftDescription] = useState('');
    const [availableGroups, setAvailableGroups] = useState<SpotGroupResponse[]>([]);
    const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
    const [newGroupName, setNewGroupName] = useState('');
    const [pendingGroupNames, setPendingGroupNames] = useState<string[]>([]);
    const [groupLoadError, setGroupLoadError] = useState(false);

    useEffect(() => {
        try { sessionStorage.removeItem('explore_map_state'); } catch { /* Ignore storage restrictions. */ }
    }, []);

    const placesLibrary = useMapsLibrary("places");
    const geocodingLibrary = useMapsLibrary("geocoding");
    const geocoder = useMemo(
        () => geocodingLibrary ? new geocodingLibrary.Geocoder() : null,
        [geocodingLibrary]
    );

    useEffect(() => {
        if (navigator.geolocation) {
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

    const handleBackToList = () => {
        setSelectedMySpot(null);
        setSelectedResult(null);
        setIsSaveFormOpen(false);
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
        setIsSaveFormOpen(false);
        setDraftType(mapGoogleTypeToSpotType(place.types, place.primaryType));
        setDraftName(place.name);
        setDraftDescription('');
        setSelectedGroupIds([]);
        setNewGroupName('');
        setPendingGroupNames([]);
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
                fields: ['displayName', 'formattedAddress', 'location', 'rating', 'userRatingCount', 'regularOpeningHours', 'types', 'primaryType', 'primaryTypeDisplayName', 'id', 'websiteURI', 'photos', 'googleMapsLinks']
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
                primaryType: detailPlace.primaryType || undefined,
                websiteURI: detailPlace.websiteURI || undefined,
                reviewsURI: getGoogleMapsReviewsUri(detailPlace),
                googleTypeLabel: getGoogleTypeLabel(detailPlace)
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
                rating: detailPlace.rating || undefined,
                user_ratings_total: detailPlace.userRatingCount || undefined,
                isOpen: isOpen ?? undefined,
                types: detailPlace.types || [],
                primaryType: detailPlace.primaryType || undefined,
                websiteURI: detailPlace.websiteURI || undefined,
                reviewsURI: getGoogleMapsReviewsUri(detailPlace),
                googleTypeLabel: getGoogleTypeLabel(detailPlace)
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
                        rating: detailPlace.rating || undefined,
                        user_ratings_total: detailPlace.userRatingCount || undefined,
                        isOpen: isOpen ?? undefined,
                        types: detailPlace.types || [],
                        primaryType: detailPlace.primaryType || undefined,
                        websiteURI: detailPlace.websiteURI || undefined,
                        reviewsURI: getGoogleMapsReviewsUri(detailPlace),
                        googleTypeLabel: getGoogleTypeLabel(detailPlace)
                    });
                }
            }
        });
    };

    const loadGroups = async () => {
        try {
            setAvailableGroups(await getAllGroups());
            setGroupLoadError(false);
        } catch {
            setGroupLoadError(true);
        }
    };

    const addPendingGroup = () => {
        const name = newGroupName.trim();
        if (!name) return;
        const existing = availableGroups.find(group => group.groupName.toLocaleLowerCase() === name.toLocaleLowerCase());
        if (existing) {
            setSelectedGroupIds(current => current.includes(existing.id) ? current : [...current, existing.id]);
        } else {
            setPendingGroupNames(current => current.some(group => group.toLocaleLowerCase() === name.toLocaleLowerCase()) ? current : [...current, name]);
        }
        setNewGroupName('');
    };

    // ✅ [수정] shortAddress 생성 로직 및 URL 형식 통일
    const handleRegisterSpot = async (placeId: string) => {
        const placeDetails = await fetchPlaceDetails(placeId);
        if (placeDetails) {
            const savedName = draftName.trim() || placeDetails.displayName || '';
            if (!await confirm({
                title: '내 장소 등록',
                message: `'${savedName}'을(를) [${SPOT_TYPE_LABELS[draftType]}]로 등록할까요?`,
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
                    customName: draftName.trim() || undefined,
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
                    description: draftDescription.trim(),
                    metadata: {
                        originalTypes: placeDetails.types, // ✅ 구글 원본 타입
                        originalPrimaryType: placeDetails.primaryType || null,
                        openingHours: openingHours,        // ✅ 요일별 영업시간
                        photoUrl: photoUrl                 // ✅ 첫 번째 사진 URL
                    },
                    userMetadata: {}
                };

                const newSpot = await createSpot(req);
                setMySpots(prev => [...prev, newSpot]);
                handleSelectSpot(newSpot);
                try {
                    const selectedGroups = availableGroups.filter(group => selectedGroupIds.includes(group.id));
                    for (const group of selectedGroups) await addSpotToGroup(group.id, newSpot.id);
                    for (const groupName of pendingGroupNames) {
                        const group = await createGroup({ groupName });
                        await addSpotToGroup(group.id, newSpot.id);
                        setAvailableGroups(current => [...current, group]);
                    }
                    showToast({ message: "내 장소와 그룹을 등록했습니다!", type: 'success' });
                } catch {
                    showToast({ message: "장소는 저장했지만 그룹을 적용하지 못했습니다. 장소 상세에서 그룹을 관리해 주세요.", type: 'error' });
                }
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
            <div className={`absolute bottom-0 left-0 right-0 z-20 flex h-[45vh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_-5px_20px_rgba(0,0,0,0.1)] transition-transform duration-300 ease-in-out ${showList ? 'translate-y-0' : 'translate-y-full'} md:top-0 md:bottom-auto md:left-0 md:h-full md:w-96 md:rounded-none md:translate-y-0 md:shadow-xl ${showList ? 'md:translate-x-0' : 'md:-translate-x-full'}`}>
                <div className="shrink-0 px-4 pt-2 md:hidden">
                    <button type="button" aria-label={showList ? '장소 목록 접기' : '장소 목록 펼치기'} onClick={() => setShowList(!showList)} className="flex min-h-8 w-full items-center justify-center">
                        <span className="h-1.5 w-12 rounded-full bg-gray-300 transition-colors hover:bg-gray-400" />
                    </button>
                </div>
                <div className="w-full h-full flex flex-col overflow-hidden">
                    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100/90 px-5 py-4">
                        { (selectedMySpot || selectedResult) ? (
                            <div className="flex min-w-0 items-center gap-3"><button type="button" aria-label="검색 결과 목록으로" onClick={handleBackToList} className="yume-icon-button shrink-0">←</button><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">장소 정보</p><span className="block truncate text-lg font-extrabold text-gray-900">상세 정보</span></div></div>
                        ) : (
                            <div className="min-w-0 px-1">
                                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">장소 찾기</p>
                                <div className="mt-0.5 flex items-center gap-2"><h3 className="truncate text-lg font-extrabold text-gray-900">{mode === 'GOOGLE' ? '검색 결과' : '내 장소'}</h3><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold tabular-nums text-gray-600">{mode === 'GOOGLE' ? googleResults.length : mySpots.length}</span></div>
                                <p className="mt-0.5 text-xs text-gray-500">지도에서 장소를 고르고 여행에 담아보세요.</p>
                            </div>
                        )}
                        <button type="button" aria-label="장소 목록 닫기" onClick={() => setShowList(false)} className="yume-icon-button shrink-0 md:hidden">✕</button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-0 scrollbar-hide">
                        {(selectedMySpot || selectedResult) ? (
                            <div className="space-y-5 bg-white p-5 pb-24 md:pb-5">
                                {selectedMySpot ? (
                                    <div className="space-y-5">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getSpotTypeInfo(selectedMySpot.spotType).color}`}>{getSpotTypeInfo(selectedMySpot.spotType).label}</span>
                                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${selectedMySpot.isVisit ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{selectedMySpot.isVisit ? '방문 완료' : '미방문'}</span>
                                            </div>
                                            <h2 className="mt-3 break-words text-2xl font-extrabold leading-tight tracking-tight text-gray-900">{getSpotDisplayName(selectedMySpot)}</h2>
                                        </div>
                                        <div className="flex items-start gap-3 border-t border-gray-100 pt-4">
                                            <span className="mt-0.5 text-base text-blue-600">📍</span>
                                            <div className="min-w-0"><p className="text-xs font-semibold text-gray-500">주소</p><p className="mt-1 break-words text-sm leading-relaxed text-gray-700">{selectedMySpot.address || '주소 정보 없음'}</p></div>
                                        </div>
                                        {selectedMySpot.description && <div className="border-t border-gray-100 pt-4"><p className="text-xs font-semibold text-gray-500">내 메모</p><p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{selectedMySpot.description}</p></div>}
                                        {getSavedSpotTags(selectedMySpot.userMetadata).length > 0 && <div className="border-t border-gray-100 pt-4"><p className="text-xs font-semibold text-gray-500">태그</p><div className="mt-2 flex flex-wrap gap-1.5">{getSavedSpotTags(selectedMySpot.userMetadata).map(tag => <span key={tag} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">#{tag}</span>)}</div></div>}
                                        <div className="space-y-2 border-t border-gray-100 pt-4">
                                            <button type="button" onClick={() => handleToggleVisit(selectedMySpot)} className={`yume-button w-full ${selectedMySpot.isVisit ? 'yume-button-success-outline' : 'yume-button-primary'}`}>{selectedMySpot.isVisit ? '✓ 방문 완료 · 취소하기' : '방문 완료로 표시'}</button>
                                            <div className="grid grid-cols-[1fr_auto] gap-2">
                                                <button type="button" onClick={() => navigate(`/spots/${selectedMySpot.id}`)} className="yume-button yume-button-secondary">장소 상세 보기 <span aria-hidden="true">↗</span></button>
                                                <button type="button" onClick={() => handleDeleteSpot(selectedMySpot.id)} className="min-h-11 rounded-xl px-4 text-sm font-bold text-red-600 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400">삭제</button>
                                            </div>
                                        </div>
                                    </div>
                                ) : selectedResult && (
                                    <div>
                                        <section className="space-y-5">
                                            <div className="flex flex-wrap items-center gap-2">
                                                {selectedResult.googleTypeLabel && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Google 유형 · {selectedResult.googleTypeLabel}</span>}
                                                {selectedResult.isOpen !== undefined && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${selectedResult.isOpen ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{selectedResult.isOpen ? '영업 중' : '영업 종료'}</span>}
                                            </div>
                                            <div>
                                                <h2 className="break-words text-2xl font-extrabold leading-tight tracking-tight text-gray-900">{selectedResult.name}</h2>
                                                {(selectedResult.rating !== undefined || selectedResult.user_ratings_total !== undefined) && <div className="mt-3 flex items-center gap-2 text-sm"><span className="text-amber-500">★</span>{selectedResult.rating !== undefined && <span className="font-extrabold text-gray-900">{selectedResult.rating.toFixed(1)}</span>}{selectedResult.user_ratings_total !== undefined && (selectedResult.reviewsURI ? <a href={selectedResult.reviewsURI} target="_blank" rel="noreferrer" className="font-medium text-blue-700 underline-offset-2 hover:underline">후기 {selectedResult.user_ratings_total.toLocaleString()}개 ↗</a> : <span className="text-gray-500">후기 {selectedResult.user_ratings_total.toLocaleString()}개</span>)}</div>}
                                            </div>
                                            <div className="flex items-start gap-3 border-t border-gray-100 pt-4">
                                                <span className="mt-0.5 text-base text-blue-600">📍</span>
                                                <div className="min-w-0"><p className="text-xs font-semibold text-gray-500">주소</p><p className="mt-1 break-words text-sm leading-relaxed text-gray-700">{selectedResult.address || '주소 정보 없음'}</p></div>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-5 border-t border-gray-100 pt-3">
                                                {selectedResult.websiteURI && <a href={selectedResult.websiteURI} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-bold text-blue-700 hover:text-blue-800">공식 웹사이트 방문 <span aria-hidden="true">↗</span></a>}
                                                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedResult.name)}&query_place_id=${selectedResult.place_id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-bold text-blue-700 hover:text-blue-800">지도 보기 <span aria-hidden="true">↗</span></a>
                                            </div>
                                        </section>
                                        {allMyPlaceIds.has(selectedResult.place_id) ? (
                                            <section className="mt-8 border-t border-gray-200 pt-6">
                                                <p className="mb-2 text-xs font-semibold text-blue-600">내 보관함</p>
                                                <span className="text-sm font-bold text-emerald-700">✓ 내 장소에 저장됨</span>
                                            </section>
                                        ) : (
                                            <section className="mt-8 border-t border-gray-200 pt-6">
                                                {!isSaveFormOpen ? (
                                                    <button
                                                        type="button"
                                                        aria-expanded="false"
                                                        aria-controls="explore-save-spot-form"
                                                        onClick={() => { setIsSaveFormOpen(true); void loadGroups(); }}
                                                        className="group flex min-h-16 w-full items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                                    >
                                                        <span className="flex min-w-0 items-center gap-3">
                                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-lg font-bold text-blue-600" aria-hidden="true">＋</span>
                                                            <span className="min-w-0"><span className="block text-sm font-extrabold text-gray-900">내 장소에 추가</span></span>
                                                        </span>
                                                        <span className="shrink-0 text-sm font-bold text-blue-700 transition-transform group-hover:translate-x-0.5">추가하기 <span aria-hidden="true">→</span></span>
                                                    </button>
                                                ) : (
                                                    <>
                                                        <div className="mb-5 flex items-start justify-between gap-3">
                                                            <div className="flex items-start gap-3">
                                                                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-lg font-bold text-blue-600" aria-hidden="true">＋</span>
                                                        <div><p className="text-xs font-semibold text-blue-600">내 보관함</p><h3 id="explore-save-spot-heading" className="mt-1 text-base font-extrabold text-gray-900">내 장소에 추가</h3><p className="mt-1 text-xs leading-relaxed text-gray-500">내 장소 이름과 분류를 정하고, 메모를 남기거나 그룹에 추가해 보관함에서 함께 관리하세요.</p></div>
                                                            </div>
                                                            <button type="button" aria-expanded="true" aria-controls="explore-save-spot-form" onClick={() => setIsSaveFormOpen(false)} className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">접기 <span aria-hidden="true">⌃</span></button>
                                                        </div>
                                                        <div id="explore-save-spot-form" role="region" aria-labelledby="explore-save-spot-heading" className="space-y-4">
                                                    <div>
                                                        <label htmlFor="explore-save-spot-name" className="mb-1.5 block text-xs font-bold text-gray-700">내 장소 이름</label>
                                                        <input id="explore-save-spot-name" type="text" maxLength={200} value={draftName} onChange={event => setDraftName(event.target.value)} className="yume-input bg-white" placeholder={selectedResult.name} />
                                                    </div>
                                                    <div>
                                                        <label htmlFor="explore-save-spot-type" className="mb-1.5 block text-xs font-bold text-gray-700">내 장소에 저장할 분류</label>
                                                        <select id="explore-save-spot-type" value={draftType} onChange={(e) => setDraftType(e.target.value as SpotType)} className="yume-input bg-white font-bold">{Object.keys(SPOT_TYPE_LABELS).map((key) => (<option key={key} value={key}>{SPOT_TYPE_LABELS[key as SpotType]}</option>))}</select>
                                                    </div>
                                                    <div>
                                                        <label htmlFor="explore-save-spot-description" className="mb-1.5 block text-xs font-bold text-gray-700">메모 <span className="font-normal text-gray-400">선택</span></label>
                                                        <textarea id="explore-save-spot-description" rows={3} maxLength={2000} value={draftDescription} onChange={event => setDraftDescription(event.target.value)} className="yume-input min-h-24 resize-y bg-white" placeholder="나중에 기억할 내용을 적어두세요." />
                                                    </div>
                                                    <fieldset className="space-y-2">
                                                        <legend className="mb-1.5 block text-xs font-bold text-gray-700">그룹 <span className="font-normal text-gray-400">선택</span></legend>
                                                        {groupLoadError ? <div className="flex items-center gap-2 text-xs text-red-600"><span>그룹 목록을 불러오지 못했습니다.</span><button type="button" onClick={() => void loadGroups()} className="font-bold underline">다시 시도</button></div> : availableGroups.length > 0 ? (
                                                            <div className="max-h-32 space-y-1 overflow-y-auto rounded-xl border border-gray-200 bg-white p-2">
                                                                {availableGroups.map(group => <label key={group.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-blue-50"><input type="checkbox" checked={selectedGroupIds.includes(group.id)} onChange={event => setSelectedGroupIds(current => event.target.checked ? [...current, group.id] : current.filter(id => id !== group.id))} />{group.groupName}</label>)}
                                                            </div>
                                                        ) : !groupLoadError && <p className="text-xs text-gray-400">아직 만든 그룹이 없습니다. 아래에서 새 그룹을 만들 수 있어요.</p>}
                                                        {pendingGroupNames.map(name => <div key={name} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{name}<button type="button" aria-label={`${name} 그룹 추가 취소`} onClick={() => setPendingGroupNames(current => current.filter(group => group !== name))} className="ml-1">×</button></div>)}
                                                        <div className="flex gap-2"><input aria-label="새 그룹 이름" type="text" maxLength={100} value={newGroupName} onChange={event => setNewGroupName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addPendingGroup(); } }} className="yume-input min-w-0 bg-white" placeholder="새 그룹 이름" /><button type="button" onClick={addPendingGroup} disabled={!newGroupName.trim()} className="yume-button yume-button-secondary shrink-0">그룹 추가</button></div>
                                                        <p className="text-xs text-gray-500">그룹은 장소를 묶어 보관함의 그룹 탭에서 함께 관리합니다.</p>
                                                    </fieldset>
                                                    <button type="button" onClick={() => handleRegisterSpot(selectedResult.place_id)} className="yume-button yume-button-primary w-full"><span>+ 내 장소에 저장</span></button>
                                                </div>
                                                    </>
                                                )}
                                            </section>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-2.5 bg-slate-50/70 p-3 pb-24 md:pb-4">
                                {mode === 'GOOGLE' ? (
                                    googleResults.length === 0 ? <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">검색 결과가 없습니다.<p className="mt-1 text-xs text-gray-400">다른 장소명이나 주소로 검색해 보세요.</p></div> :
                                        googleResults.map(place => {
                                            const isSaved = allMyPlaceIds.has(place.place_id);
                                            return (
                                                <button type="button" key={place.place_id} className="group w-full rounded-2xl border border-gray-200/80 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" onClick={() => { if (isSaved) { const spot = mySpots.find(s => s.placeId === place.place_id); if (spot) handleSelectSpot(spot); } else { handleSelectSearchResult(place); } }}>
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">{place.googleTypeLabel && <span className="mb-1.5 inline-flex rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{place.googleTypeLabel}</span>}<span className="block truncate text-sm font-extrabold text-gray-900 group-hover:text-blue-700">{place.name}</span></div>
                                                        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${isSaved ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{isSaved ? '저장됨' : '상세 보기'}{!isSaved && <span aria-hidden="true"> ↗</span>}</span>
                                                    </div>
                                                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-500">{place.address || '주소 정보 없음'}</p>
                                                    <div className="mt-3 flex items-center gap-3 border-t border-gray-100 pt-2.5 text-xs">
                                                        {place.rating !== undefined && <span className="font-bold text-amber-700">★ {place.rating.toFixed(1)}{place.user_ratings_total !== undefined && <span className="ml-1 font-medium text-gray-400">후기 {place.user_ratings_total.toLocaleString()}</span>}</span>}
                                                        <span className="ml-auto text-xs font-semibold text-blue-600">지도에서 보기 <span aria-hidden="true">→</span></span>
                                                    </div>
                                                </button>
                                            );
                                        })
                                ) : (
                                    mySpots.length === 0 ? <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">저장된 장소가 없습니다.<p className="mt-1 text-xs text-gray-400">구글 탭에서 장소를 찾아 보관함에 추가해 보세요.</p></div> :
                                        mySpots.map(spot => (
                                            <button type="button" key={spot.id} className="group w-full rounded-2xl border border-gray-200/80 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" onClick={() => handleSelectSpot(spot)}>
                                                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className={`mb-1.5 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getSpotTypeInfo(spot.spotType).color}`}>{getSpotTypeInfo(spot.spotType).label}</span><span className="block truncate text-sm font-extrabold text-gray-900 group-hover:text-emerald-700">{getSpotDisplayName(spot)}</span></div><span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${spot.isVisit ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{spot.isVisit ? '방문 완료' : '미방문'}</span></div>
                                                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-500">{spot.shortAddress || spot.address}</p>
                                                <div className="mt-3 border-t border-gray-100 pt-2.5 text-right text-xs font-semibold text-emerald-700">지도에서 보기 <span aria-hidden="true">→</span></div>
                                            </button>
                                        ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <button aria-label={showList ? '장소 목록 접기' : '장소 목록 펼치기'} onClick={() => setShowList(!showList)} className={`absolute top-1/2 z-30 hidden min-h-10 w-8 -translate-y-1/2 items-center justify-center rounded-r-lg border border-gray-300 bg-white px-1 text-gray-500 shadow-sm transition-all duration-300 hover:bg-gray-50 hover:text-blue-600 md:flex ${showList ? 'left-96' : 'left-0'}`}>{showList ? '◀' : '▶'}</button>
            <div data-guide-target="explore-map" className="absolute inset-0 w-full h-full z-0">
                <MapCameraHandler target={cameraTarget} />
                <Map defaultCenter={DEFAULT_CENTER} defaultZoom={DEFAULT_ZOOM} mapId="EXPLORE_MAP_ID" disableDefaultUI={true} className="w-full h-full" onClick={(e) => { if (e.detail.placeId) { e.stop(); handlePoiClick(e.detail.placeId); } else if (e.detail.latLng) { handleReverseGeocode(e.detail.latLng.lat, e.detail.latLng.lng); } }}>
                    <MapController mode={mode} onModeChange={handleModeChange} onSearchStart={handleBackToList} onSpotsFound={(spots) => { setMySpots(spots); if(spots.length > 0) setShowList(true); }} onGoogleFound={(results) => { setGoogleResults(results); if(results.length > 0) setShowList(true); }} showList={showList} />
                    {mode === 'MINE' && mySpots.map(spot => (<AdvancedMarker key={spot.id} position={{ lat: spot.lat, lng: spot.lng }} onClick={(e) => { e.domEvent.stopPropagation(); handleSelectSpot(spot); }} zIndex={10}><MarkerIcon color={MAP_COLORS.saved} borderColor={MAP_COLORS.savedBorder} /></AdvancedMarker>))}
                    {mode === 'GOOGLE' && googleResults.map(place => { const isSaved = allMyPlaceIds.has(place.place_id); const isSelected = selectedResult?.place_id === place.place_id; return (<AdvancedMarker key={place.place_id} position={place.location} onClick={(e) => { e.domEvent.stopPropagation(); if (isSaved) { const spot = mySpots.find(s => s.placeId === place.place_id); if (spot) handleSelectSpot(spot); } else { handleSelectSearchResult(place); } }} zIndex={isSelected ? 100 : (isSaved ? 50 : 20)}><MarkerIcon color={isSaved ? MAP_COLORS.saved : (isSelected ? MAP_COLORS.route : MAP_COLORS.searchResult)} borderColor={isSaved ? MAP_COLORS.savedBorder : (isSelected ? MAP_COLORS.selectedBorder : MAP_COLORS.searchResultBorder)} scale={isSelected || isSaved ? 1.2 : 1.0} /></AdvancedMarker>); })}
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
    const [activeSuggestion, setActiveSuggestion] = useState(-1);
    const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
    const placesLibrary = useMapsLibrary("places");
    const wrapperRef = useRef<HTMLDivElement>(null);
    const selectedKeyword = useRef<string | null>(null);
    const suggestionRequest = useRef(0);

    const dismissSuggestions = () => {
        selectedKeyword.current = keyword;
        suggestionRequest.current++;
        setSuggestions([]);
        setActiveSuggestion(-1);
    };

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                selectedKeyword.current = keyword;
                suggestionRequest.current++;
                setSuggestions([]);
                setActiveSuggestion(-1);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [keyword]);

    useEffect(() => {
        let active = true;
        const request = ++suggestionRequest.current;
        if (keyword === selectedKeyword.current) return;
        if (mode === 'GOOGLE' && keyword && placesLibrary) {
            const timer = setTimeout(async () => {
                if(keyword.length > 0) {
                    try {
                        const { suggestions } = await placesLibrary.AutocompleteSuggestion.fetchAutocompleteSuggestions({
                            input: keyword, locationBias: map?.getCenter(),
                        });
                        if (active && request === suggestionRequest.current && keyword !== selectedKeyword.current) { setSuggestions(suggestions.filter(s => s.placePrediction)); setActiveSuggestion(-1); }
                    } catch (e) { console.error("Autocomplete Error", e); if (active && request === suggestionRequest.current) setSuggestions([]); }
                }
            }, 300);
            return () => { active = false; clearTimeout(timer); };
        }
    }, [keyword, mode, placesLibrary, map]);

    const handleGoogleTextSearch = async () => {
        if (!placesLibrary || !keyword.trim()) return;
        dismissSuggestions(); onSearchStart();
        try {
            const { places } = await placesLibrary.Place.searchByText({
                textQuery: keyword,
                fields: ['id', 'displayName', 'formattedAddress', 'location', 'rating', 'userRatingCount', 'types', 'primaryType', 'primaryTypeDisplayName'],
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
                        googleTypeLabel: getGoogleTypeLabel(place),
                        isOpen: isOpen ?? undefined,
                        types: place.types || [],
                        primaryType: place.primaryType || undefined,
                    };
                }));
                onGoogleSearch(mappedResults);
            } else { onGoogleSearch([]); }
        } catch (error) { console.error("Text Search Error:", error); showToast({ message: "Google 장소 검색 중 오류가 발생했습니다.", type: 'error' }); }
    };

    const handleGoogleSelectSuggestion = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
        if (!placesLibrary || !suggestion.placePrediction) return;
        dismissSuggestions();
        onSearchStart();
        const placeId = suggestion.placePrediction.placeId;
        try {
            const place = new placesLibrary.Place({ id: placeId });
            await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'rating', 'userRatingCount', 'types', 'primaryType', 'primaryTypeDisplayName', 'websiteURI', 'googleMapsLinks'] });
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
                primaryType: place.primaryType || undefined,
                websiteURI: place.websiteURI || undefined,
                reviewsURI: getGoogleMapsReviewsUri(place),
                googleTypeLabel: getGoogleTypeLabel(place)
            };
            selectedKeyword.current = result.name;
            onGoogleSearch([result]); setSuggestions([]); setKeyword(result.name);
        } catch (error) { console.error("Place Detail Error:", error); }
    };

    const handleMySpotSearch = async () => {
        dismissSuggestions(); if (!keyword.trim()) return;
        onSearchStart();
        try {
            const res = await getMySpots({ keyword: keyword, page: 0, size: 50 });
            onMySpotSearch(res.content);
        } catch { showToast({ message: "내 장소를 검색하지 못했습니다.", type: 'error' }); }
    };

    return (
        <div data-guide-target="explore-search" ref={wrapperRef} className={`absolute top-4 right-4 z-10 flex flex-col gap-2 md:w-96 transition-all duration-300 ease-in-out left-4 ${showList ? 'md:left-[25rem]' : 'md:left-4'}`}>
            <div className="bg-white rounded-xl shadow-lg p-2 flex items-center gap-2">
                <button data-guide-target="explore-mode" onClick={() => { dismissSuggestions(); onModeChange(mode === 'GOOGLE' ? 'MINE' : 'GOOGLE'); setKeyword(""); }} className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-bold transition shrink-0 border ${mode === 'GOOGLE' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-green-50 text-green-600 border-green-100'}`}>
                    {mode === 'GOOGLE' ? (
                        <><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg><span>구글</span></>
                    ) : (
                        <><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg><span>내 장소</span></>
                    )}
                </button>
                <input aria-label="장소명 또는 주소 검색" role="combobox" aria-autocomplete="list" aria-expanded={mode === 'GOOGLE' && suggestions.length > 0} aria-controls="explore-suggestions" aria-activedescendant={suggestions[activeSuggestion] ? `explore-suggestion-${activeSuggestion}` : undefined} data-guide-target="explore-query" type="text" className="flex-1 outline-none text-sm font-medium text-gray-700 min-w-0" placeholder={mode === 'GOOGLE' ? "장소, 주소 검색 (엔터)" : "이름 검색 (엔터)"} value={keyword} onChange={e => {
                    suggestionRequest.current++;
                    selectedKeyword.current = null;
                    setKeyword(e.target.value);
                    setSuggestions([]); setActiveSuggestion(-1);
                }} onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    if (e.key === 'Escape') { dismissSuggestions(); return; }
                    if (suggestions.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                        e.preventDefault();
                        const next = e.key === 'ArrowDown' ? (activeSuggestion + 1) % suggestions.length : (activeSuggestion <= 0 ? suggestions.length - 1 : activeSuggestion - 1);
                        setActiveSuggestion(next);
                        document.getElementById(`explore-suggestion-${next}`)?.scrollIntoView({ block: 'nearest' });
                        return;
                    }
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (mode === 'GOOGLE' && suggestions[activeSuggestion]) { void handleGoogleSelectSuggestion(suggestions[activeSuggestion]); setSuggestions([]); return; }
                        if (mode === 'GOOGLE') void handleGoogleTextSearch();
                        else void handleMySpotSearch();
                    }
                }} />
                <button type="button" aria-label="장소 검색 실행" onClick={mode === 'GOOGLE' ? handleGoogleTextSearch : handleMySpotSearch} className="yume-icon-button yume-icon-button-primary">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                </button>
            </div>
            {mode === 'GOOGLE' && suggestions.length > 0 && (
                <div id="explore-suggestions" role="listbox" aria-label="장소 검색 추천" className="bg-white rounded-xl shadow-xl overflow-hidden animate-fade-in-down max-h-60 overflow-y-auto border border-gray-100">
                    {suggestions.map((suggestion, index) => {
                        const placePrediction = suggestion.placePrediction;
                        if (!placePrediction) return null;
                        return (
                            <button type="button" role="option" aria-selected={activeSuggestion === index} id={`explore-suggestion-${index}`} key={placePrediction.placeId} onClick={() => void handleGoogleSelectSuggestion(suggestion)} className={`w-full text-left p-3 border-b hover:bg-blue-50 flex flex-col gap-0.5 ${activeSuggestion === index ? 'bg-blue-50' : ''}`}>
                                <span className="text-sm font-bold text-gray-800">{placePrediction.mainText?.text || placePrediction.text.text || "이름 없음" }</span>
                                <span className="text-xs text-gray-500">{placePrediction.secondaryText?.text || ""}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
