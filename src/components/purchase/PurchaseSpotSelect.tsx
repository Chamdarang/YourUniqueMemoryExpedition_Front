import { useEffect, useRef, useState } from 'react';
import { getMySpots } from '../../api/spotApi';
import type { SpotResponse } from '../../types/spot';
import { getSpotDisplayName } from '../../utils/spotUtils';

interface Props {
    value: number;
    selectedName?: string;
    validationError?: string;
    onChange: (id: number) => void;
}

export default function PurchaseSpotSelect({ value, selectedName, validationError, onChange }: Props) {
    const [keyword, setKeyword] = useState('');
    const [spots, setSpots] = useState<SpotResponse[]>([]);
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retry, setRetry] = useState(0);
    const [chosen, setChosen] = useState<{ id: number; name: string } | null>(null);
    const generation = useRef(0);

    useEffect(() => {
        let active = true;
        generation.current += 1;
        const timer = window.setTimeout(() => {
            setLoading(true);
            void getMySpots({ keyword: keyword.trim(), page: 0, size: 20 }).then(data => {
                if (!active) return;
                setSpots(data.content);
                setPage(data.number);
                setTotalPages(data.totalPages);
                setError(null);
            }).catch(() => {
                if (active) setError('장소를 불러오지 못했습니다.');
            }).finally(() => { if (active) setLoading(false); });
        }, keyword.trim() ? 250 : 0);
        return () => { active = false; window.clearTimeout(timer); generation.current += 1; };
    }, [keyword, retry]);

    const loadMore = async () => {
        const requestGeneration = generation.current;
        setLoading(true);
        try {
            const data = await getMySpots({ keyword: keyword.trim(), page: page + 1, size: 20 });
            if (requestGeneration !== generation.current) return;
            setSpots(previous => [...previous, ...data.content.filter(spot => !previous.some(item => item.id === spot.id))]);
            setPage(data.number);
            setTotalPages(data.totalPages);
            setError(null);
        } catch {
            if (requestGeneration === generation.current) setError('장소를 더 불러오지 못했습니다.');
        } finally {
            if (requestGeneration === generation.current) setLoading(false);
        }
    };

    const valueInResults = spots.some(spot => spot.id === value);
    const selectedLabel = chosen?.id === value ? chosen.name : selectedName || '선택한 장소';

    return (
        <div className="space-y-2">
            <label htmlFor="purchase-spot-search" className="block text-xs font-semibold text-gray-700">장소 검색</label>
            <input id="purchase-spot-search" type="search" placeholder="보관함의 장소명·주소 검색" value={keyword} onChange={event => {
                generation.current += 1;
                setKeyword(event.target.value);
                setSpots([]);
                setPage(0);
                setTotalPages(0);
                setLoading(true);
                setError(null);
            }} className="min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm focus-visible:outline-pink-400" />
            <label className="block text-xs font-semibold text-gray-700" htmlFor="purchase-spot">장소 (필수)</label>
            <select id="purchase-spot" aria-required="true" aria-invalid={Boolean(validationError)} aria-describedby={validationError ? "purchase-spot-error" : undefined} disabled={loading} value={value} onChange={event => {
                const id = Number(event.target.value);
                const spot = spots.find(item => item.id === id);
                setChosen(spot ? { id, name: getSpotDisplayName(spot) } : null);
                onChange(id);
            }} className="min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold disabled:opacity-60">
                <option value="0">📍 장소를 선택하세요</option>
                {value !== 0 && !valueInResults && <option value={value}>{selectedLabel}</option>}
                {spots.map(spot => <option key={spot.id} value={spot.id}>{getSpotDisplayName(spot)}</option>)}
            </select>
            {validationError && <p id="purchase-spot-error" className="text-xs text-red-700">{validationError}</p>}
            {loading && <p role="status" className="text-xs text-gray-600">장소 검색 중…</p>}
            {!loading && !error && !spots.length && <p role="status" className="text-xs text-gray-600">{keyword.trim() ? '검색 결과가 없습니다. 다른 장소명으로 검색해 주세요.' : '저장한 장소가 없습니다. 탐색에서 장소를 먼저 등록해 주세요.'}</p>}
            {error && <div role="alert" className="text-xs text-red-700">
                <p>{error}</p>
                <button type="button" disabled={loading} onClick={() => spots.length ? void loadMore() : setRetry(count => count + 1)} className="mt-1 min-h-11 rounded-lg bg-red-50 px-3 font-semibold">장소 다시 불러오기</button>
            </div>}
            {!error && page + 1 < totalPages && <button type="button" disabled={loading} onClick={() => void loadMore()} className="min-h-11 w-full rounded-lg border border-pink-200 bg-white px-3 text-sm font-semibold text-pink-700 disabled:opacity-50">장소 더 불러오기</button>}
        </div>
    );
}
