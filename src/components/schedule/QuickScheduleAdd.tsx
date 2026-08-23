import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { createSpot, getMySpots } from "../../api/spotApi";
import type { ScheduleCreateRequest } from "../../types/schedule";
import type { SpotCreateRequest, SpotResponse } from "../../types/spot";
import { getSpotDisplayName, mapGoogleTypeToSpotType } from "../../utils/spotUtils";

interface Props {
    scheduleOrder: number;
    onSubmit: (request: ScheduleCreateRequest) => Promise<boolean>;
    onMapPickStart?: () => void;
}

type SearchMode = "MINE" | "GOOGLE";

export default function QuickScheduleAdd({ scheduleOrder, onSubmit, onMapPickStart }: Props) {
    const map = useMap();
    const placesLibrary = useMapsLibrary("places");
    const geocodingLibrary = useMapsLibrary("geocoding");
    const geocoder = useMemo(
        () => geocodingLibrary ? new geocodingLibrary.Geocoder() : null,
        [geocodingLibrary],
    );
    const [isOpen, setIsOpen] = useState(false);
    const [startTime, setStartTime] = useState("");
    const [spotName, setSpotName] = useState("");
    const [memo, setMemo] = useState("");
    const [searchMode, setSearchMode] = useState<SearchMode>("MINE");
    const [selectedSpot, setSelectedSpot] = useState<SpotResponse | null>(null);
    const [mapSelection, setMapSelection] = useState<{ lat: number; lng: number; spotType: SpotResponse["spotType"] } | null>(null);
    const [suggestions, setSuggestions] = useState<SpotResponse[]>([]);
    const [sessionToken, setSessionToken] = useState<google.maps.places.AutocompleteSessionToken | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isMapPicking, setIsMapPicking] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [feedback, setFeedback] = useState("");
    const spotInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (placesLibrary && !sessionToken) {
            setSessionToken(new placesLibrary.AutocompleteSessionToken());
        }
    }, [placesLibrary, sessionToken]);

    useEffect(() => {
        if (!isMapPicking || !map) return;

        const listener = map.addListener("click", async (event: google.maps.MapMouseEvent | google.maps.IconMouseEvent) => {
            const latLng = event.latLng;
            if (!latLng) return;
            const lat = latLng.lat();
            const lng = latLng.lng();

            try {
                const placeId = "placeId" in event ? event.placeId : undefined;
                if (placeId) {
                    const place = new google.maps.places.Place({ id: placeId });
                    await place.fetchFields({ fields: ["displayName", "formattedAddress", "location", "types"] });
                    setSpotName(place.displayName || place.formattedAddress || "지도에서 선택한 장소");
                    setMapSelection({
                        lat: place.location?.lat() ?? lat,
                        lng: place.location?.lng() ?? lng,
                        spotType: mapGoogleTypeToSpotType(place.types),
                    });
                } else {
                    const result = geocoder ? (await geocoder.geocode({ location: { lat, lng } })).results[0] : null;
                    setSpotName(result?.address_components?.[0]?.long_name || result?.formatted_address || "지도에서 선택한 위치");
                    setMapSelection({ lat, lng, spotType: "OTHER" });
                }
                setSelectedSpot(null);
                setSuggestions([]);
                setShowSuggestions(false);
                setFeedback("지도 위치를 일정에 연결했습니다.");
            } catch {
                setFeedback("선택한 지도 위치 정보를 불러오지 못했습니다.");
            } finally {
                setIsMapPicking(false);
            }
        });

        return () => listener.remove();
    }, [geocoder, isMapPicking, map]);

    useEffect(() => {
        if (!isOpen || selectedSpot || mapSelection || !spotName.trim()) {
            setSuggestions([]);
            setIsSearching(false);
            return;
        }

        let active = true;
        const timer = window.setTimeout(async () => {
            setIsSearching(true);
            try {
                if (searchMode === "MINE") {
                    const result = await getMySpots({ keyword: spotName.trim(), page: 0, size: 8 });
                    if (active) setSuggestions(result.content);
                    return;
                }

                if (!placesLibrary || !sessionToken) {
                    if (active) setSuggestions([]);
                    return;
                }

                const { suggestions: googleSuggestions } = await placesLibrary.AutocompleteSuggestion
                    .fetchAutocompleteSuggestions({
                        input: spotName.trim(),
                        sessionToken,
                        language: "ko",
                    });
                if (!active) return;

                setSuggestions(googleSuggestions.flatMap((suggestion): SpotResponse[] => {
                    const prediction = suggestion.placePrediction;
                    if (!prediction) return [];
                    return [{
                        id: 0,
                        placeId: prediction.placeId,
                        spotName: prediction.mainText?.text || prediction.text.text.split(",")[0],
                        address: prediction.secondaryText?.text || prediction.text.text,
                        spotType: mapGoogleTypeToSpotType(prediction.types || []),
                        lat: 0,
                        lng: 0,
                        isVisit: false,
                        metadata: { googleTypes: prediction.types || [] },
                        userMetadata: {},
                    }];
                }));
            } catch {
                if (active) setSuggestions([]);
            } finally {
                if (active) setIsSearching(false);
            }
        }, 300);

        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [isOpen, mapSelection, placesLibrary, searchMode, selectedSpot, sessionToken, spotName]);

    const selectMineSpot = (spot: SpotResponse, message = "내 장소와 연결했습니다.") => {
        setSelectedSpot(spot);
        setMapSelection(null);
        setIsMapPicking(false);
        setSpotName(getSpotDisplayName(spot));
        setSuggestions([]);
        setShowSuggestions(false);
        setFeedback(message);
    };

    const findExistingGoogleSpot = async (placeId: string, keyword?: string) => {
        if (keyword) {
            const matching = await getMySpots({ keyword, page: 0, size: 50 });
            const existing = matching.content.find((spot) => spot.placeId === placeId);
            return existing ?? null;
        }
        const allSpots = await getMySpots({ page: 0, size: 2000 });
        return allSpots.content.find((spot) => spot.placeId === placeId) ?? null;
    };

    const selectGoogleSpot = async (suggestion: SpotResponse) => {
        if (!suggestion.placeId || isRegistering) return;
        setIsRegistering(true);
        setFeedback("");
        try {
            const place = new google.maps.places.Place({ id: suggestion.placeId });
            await place.fetchFields({ fields: ["displayName", "formattedAddress", "location", "types"] });
            if (!place.location) throw new Error("장소의 지도 좌표를 가져올 수 없습니다.");

            const createRequest: SpotCreateRequest = {
                placeId: suggestion.placeId,
                spotName: place.displayName || suggestion.spotName,
                spotType: mapGoogleTypeToSpotType(place.types),
                address: place.formattedAddress || suggestion.address || "",
                lat: place.location.lat(),
                lng: place.location.lng(),
                isVisit: false,
                metadata: {},
            };

            const existing = await findExistingGoogleSpot(createRequest.placeId!, createRequest.spotName);
            if (existing) {
                selectMineSpot(existing, "이미 등록된 장소여서 내 장소와 연결했습니다.");
                setSearchMode("MINE");
                return;
            }

            try {
                const saved = await createSpot(createRequest);
                selectMineSpot(saved, "내 장소에 등록하고 일정에 연결했습니다.");
                setSearchMode("MINE");
            } catch (error) {
                const duplicate = await findExistingGoogleSpot(createRequest.placeId!);
                if (!duplicate) throw error;
                selectMineSpot(duplicate, "이미 등록된 장소여서 내 장소와 연결했습니다.");
                setSearchMode("MINE");
            }
        } catch (error) {
            setFeedback(error instanceof Error ? error.message : "Google 장소 등록에 실패했습니다.");
        } finally {
            if (placesLibrary) setSessionToken(new placesLibrary.AutocompleteSessionToken());
            setIsRegistering(false);
        }
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        const trimmedName = spotName.trim();
        if (!trimmedName || isSubmitting || isRegistering) {
            setFeedback("장소명을 입력해 주세요.");
            spotInputRef.current?.focus();
            return;
        }

        setIsSubmitting(true);
        try {
            const created = await onSubmit({
                scheduleOrder,
                spotUserId: selectedSpot?.id ?? null,
                spotName: selectedSpot ? getSpotDisplayName(selectedSpot) : trimmedName,
                lat: mapSelection?.lat,
                lng: mapSelection?.lng,
                spotType: mapSelection?.spotType,
                startTime: startTime || undefined,
                memo: memo.trim() || undefined,
            });
            if (created) {
                setStartTime("");
                setSpotName("");
                setMemo("");
                setSelectedSpot(null);
                setMapSelection(null);
                setIsMapPicking(false);
                setSuggestions([]);
                setFeedback("일정을 추가했습니다. 다음 장소를 검색할 수 있어요.");
                window.setTimeout(() => spotInputRef.current?.focus(), 0);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const changeSearchMode = (mode: SearchMode) => {
        setSearchMode(mode);
        setSelectedSpot(null);
        setMapSelection(null);
        setIsMapPicking(false);
        setSuggestions([]);
        setFeedback("");
        setShowSuggestions(Boolean(spotName.trim()));
    };

    return (
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
            <button
                type="button"
                onClick={() => setIsOpen((open) => !open)}
                className="flex w-full items-center justify-between text-left text-sm font-bold text-blue-700"
                aria-expanded={isOpen}
            >
                <span>+ 간편 일정 추가</span>
                <span className="text-xs text-blue-400">{isOpen ? "접기" : "장소 · 시간 · 메모"}</span>
            </button>

            {isOpen && (
                <form onSubmit={handleSubmit} className="mt-3 space-y-3 border-t border-blue-100 pt-3">
                    <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)]">
                        <label className="block">
                            <span className="mb-1 flex h-7 items-center text-xs font-bold text-gray-600">시작 시간 (선택)</span>
                            <input
                                type="time"
                                value={startTime}
                                onChange={(event) => setStartTime(event.target.value)}
                                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                        </label>

                        <div className="relative">
                            <div className="mb-1 flex h-7 items-center">
                                <span className="text-xs font-bold text-gray-600">장소</span>
                            </div>
                            <div className="flex gap-1.5">
                                <select
                                    aria-label="장소 검색 방식"
                                    value={searchMode}
                                    onChange={(event) => changeSearchMode(event.target.value as SearchMode)}
                                    className="w-24 shrink-0 rounded-lg border border-gray-200 bg-white px-2 text-xs font-bold text-gray-600 outline-none focus:border-blue-400"
                                >
                                    <option value="MINE">내 장소</option>
                                    <option value="GOOGLE">Google</option>
                                </select>
                            <input
                                ref={spotInputRef}
                                value={spotName}
                                maxLength={200}
                                required
                                autoComplete="off"
                                placeholder={searchMode === "MINE" ? "내 장소 검색" : "Google에서 장소·주소 검색"}
                                onFocus={() => setShowSuggestions(true)}
                                onBlur={() => window.setTimeout(() => setShowSuggestions(false), 150)}
                                onChange={(event) => {
                                    setSpotName(event.target.value);
                                    setSelectedSpot(null);
                                    setFeedback("");
                                    setShowSuggestions(true);
                                }}
                                className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!map) {
                                            setFeedback("지도를 불러온 뒤 다시 시도해 주세요.");
                                            return;
                                        }
                                        const next = !isMapPicking;
                                        setIsMapPicking(next);
                                        if (next) {
                                            onMapPickStart?.();
                                            setSelectedSpot(null);
                                            setMapSelection(null);
                                            setSuggestions([]);
                                            setShowSuggestions(false);
                                            setFeedback("지도에서 장소나 위치를 클릭해 주세요.");
                                        } else {
                                            setFeedback("");
                                        }
                                    }}
                                    className={`shrink-0 rounded-lg border px-2.5 text-xs font-bold transition ${isMapPicking ? "border-green-600 bg-green-600 text-white" : "border-gray-200 bg-white text-gray-500 hover:border-blue-300 hover:text-blue-600"}`}
                                >
                                    📍 지도
                                </button>
                            </div>
                            {(selectedSpot || mapSelection) && <span className="mt-1 block text-[11px] font-bold text-blue-600">✓ 지도 핀과 경로에 연결됨</span>}
                            {feedback && <span className={`mt-1 block text-[11px] font-medium ${selectedSpot || mapSelection || isMapPicking ? "text-blue-600" : "text-gray-500"}`}>{feedback}</span>}

                            {showSuggestions && !selectedSpot && !mapSelection && spotName.trim() && (
                                <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                                    {(isSearching || isRegistering) && <p className="px-3 py-2 text-xs text-gray-400">{isRegistering ? "장소 등록 중..." : "장소 검색 중..."}</p>}
                                    {!isSearching && !isRegistering && suggestions.map((spot, index) => (
                                        <button
                                            type="button"
                                            key={`${spot.placeId || spot.id}-${index}`}
                                            onMouseDown={(event) => event.preventDefault()}
                                            onClick={() => searchMode === "GOOGLE" ? void selectGoogleSpot(spot) : selectMineSpot(spot)}
                                            className="block w-full border-b border-gray-50 px-3 py-2 text-left last:border-0 hover:bg-blue-50"
                                        >
                                            <span className="flex items-center gap-2 text-sm font-bold text-gray-800">
                                                {getSpotDisplayName(spot)}
                                                {searchMode === "GOOGLE" && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] text-blue-600">GOOGLE</span>}
                                            </span>
                                            <span className="block truncate text-xs text-gray-400">{spot.address}</span>
                                        </button>
                                    ))}
                                    {!isSearching && !isRegistering && suggestions.length === 0 && (
                                        <p className="px-3 py-2 text-xs text-gray-500">검색 결과가 없습니다. 다른 장소명이나 주소로 검색해 주세요.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <label className="block">
                        <span className="mb-1 block text-xs font-bold text-gray-600">메모 (선택)</span>
                        <textarea
                            value={memo}
                            maxLength={500}
                            rows={2}
                            placeholder="예약 정보, 할 일 등을 입력"
                            onChange={(event) => setMemo(event.target.value)}
                            className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                    </label>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-[11px] text-gray-500">검색 결과나 지도 위치를 선택하면 핀·경로에 연결되고, 장소명만 입력해도 추가할 수 있습니다.</p>
                        <button
                            type="submit"
                            disabled={isSubmitting || isRegistering || !spotName.trim()}
                            className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                        >
                            {isSubmitting ? "추가 중..." : "일정 추가"}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
