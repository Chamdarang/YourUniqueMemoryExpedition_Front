import { useEffect, useMemo, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { createSpot, getMySpots } from '../../api/spotApi';
import { linkPlanSchedulesToSpot, type UnlinkedSpotGroup } from '../../api/scheduleApi';
import type { SpotCreateRequest, SpotResponse } from '../../types/spot';
import { getSpotDisplayName, mapGoogleTypeToSpotType } from '../../utils/spotUtils';
import { useFeedback } from '../common/useFeedback';

interface Props {
  planId: number;
  groups: UnlinkedSpotGroup[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}

export default function SpotLinkModal({ planId, groups, onClose, onChanged }: Props) {
  const placesLibrary = useMapsLibrary('places');
  const { showToast } = useFeedback();
  const [remaining, setRemaining] = useState(groups);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const current = remaining[selectedIndex] || remaining[0];
  const [mode, setMode] = useState<'MINE' | 'GOOGLE'>('MINE');
  const [query, setQuery] = useState(current?.spotName || '');
  const [results, setResults] = useState<SpotResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    setQuery(current?.spotName || '');
    setResults([]);
  }, [current?.spotName]);

  useEffect(() => {
    if (!current || !query.trim()) { setResults([]); return; }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        if (mode === 'MINE') {
          setResults((await getMySpots({ keyword: query.trim(), page: 0, size: 8 })).content);
        } else if (placesLibrary) {
          const { suggestions } = await placesLibrary.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: query.trim(), language: 'ko' });
          setResults(suggestions.flatMap((suggestion): SpotResponse[] => {
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
          }));
        }
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [current, mode, placesLibrary, query]);

  const progress = useMemo(() => groups.length - remaining.length, [groups.length, remaining.length]);

  const resolveSpot = async (spot: SpotResponse) => {
    if (spot.id) return spot;
    const place = new google.maps.places.Place({ id: spot.placeId });
    await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'types'] });
    if (!place.location) throw new Error('Google 장소의 위치를 확인하지 못했습니다.');
    const existing = (await getMySpots({ keyword: place.displayName || spot.spotName, page: 0, size: 50 })).content
      .find(item => item.placeId === spot.placeId);
    if (existing) return existing;
    const request: SpotCreateRequest = {
      placeId: spot.placeId,
      spotName: place.displayName || spot.spotName,
      address: place.formattedAddress || spot.address || '',
      spotType: mapGoogleTypeToSpotType(place.types || []),
      lat: place.location.lat(),
      lng: place.location.lng(),
      isVisit: false,
      metadata: {},
    };
    return createSpot(request);
  };

  const selectSpot = async (spot: SpotResponse) => {
    if (!current || linking) return;
    setLinking(true);
    try {
      const saved = await resolveSpot(spot);
      const count = await linkPlanSchedulesToSpot(planId, current.spotName, saved.id);
      const next = remaining.filter(group => group.spotName !== current.spotName);
      setRemaining(next);
      setSelectedIndex(0);
      showToast({ message: `${count}개 일정을 '${getSpotDisplayName(saved)}'에 연결했습니다.`, type: 'success' });
      await onChanged();
      if (next.length === 0) onClose();
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : '장소를 연결하지 못했습니다.', type: 'error' });
    } finally { setLinking(false); }
  };

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 p-5">
          <div>
            <div className="text-xs font-black text-blue-500">가져온 장소 연결 · {progress}/{groups.length}</div>
            <h2 className="mt-1 text-xl font-black text-gray-900">{current.spotName}</h2>
            <p className="mt-1 text-xs text-gray-400">같은 이름으로 가져온 {current.scheduleCount}개 일정에 한 번에 적용됩니다.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-xl text-gray-400 hover:bg-gray-100">×</button>
        </div>
        {remaining.length > 1 && (
          <div className="flex gap-1 overflow-x-auto border-b border-gray-100 px-4 py-2">
            {remaining.map((group, index) => <button key={group.spotName} type="button" onClick={() => setSelectedIndex(index)} className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold ${group.spotName === current.spotName ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{group.spotName}</button>)}
          </div>
        )}
        <div className="p-5">
          <div className="mb-3 grid grid-cols-2 rounded-xl bg-gray-100 p-1">
            <button type="button" onClick={() => setMode('MINE')} className={`rounded-lg py-2 text-xs font-bold ${mode === 'MINE' ? 'bg-white text-blue-700 shadow' : 'text-gray-500'}`}>내 장소</button>
            <button type="button" onClick={() => setMode('GOOGLE')} className={`rounded-lg py-2 text-xs font-bold ${mode === 'GOOGLE' ? 'bg-white text-blue-700 shadow' : 'text-gray-500'}`}>Google 검색</button>
          </div>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="연결할 장소 검색" className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-blue-400" autoFocus />
          <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-gray-100">
            {loading ? <p className="p-6 text-center text-sm text-gray-400">검색 중...</p> : results.length === 0 ? <p className="p-6 text-center text-sm text-gray-400">검색 결과가 없습니다. 검색어를 바꿔보세요.</p> : results.map((spot, index) => (
              <button key={`${spot.id}-${spot.placeId}-${index}`} type="button" disabled={linking} onClick={() => void selectSpot(spot)} className="block w-full border-b border-gray-100 px-4 py-3 text-left last:border-0 hover:bg-blue-50 disabled:opacity-50">
                <div className="text-sm font-bold text-gray-800">{getSpotDisplayName(spot)}</div>
                <div className="mt-0.5 truncate text-xs text-gray-400">{spot.address || (mode === 'GOOGLE' ? 'Google 장소' : '주소 없음')}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
