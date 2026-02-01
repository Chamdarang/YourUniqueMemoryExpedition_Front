import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

// API
import { createSpot, deleteSpot, getMySpots, updateSpot } from "../api/spotApi";

// Types
import type { SpotCreateRequest, SpotResponse, SpotUpdateRequest } from "../types/spot";
import type { SpotType } from "../types/enums";

// Components
import SpotFilter, { type SpotSearchParams } from "../components/spot/SpotFilter";
import SpotList from "../components/spot/SpotList";
import SpotGroupList from "../components/spot/SpotGroupList";
import SpotInUseModal from "../components/spot/SpotInUseModal.tsx";
import type {UsedScheduleResponse} from "../types/schedule.ts";

export default function SpotListPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const groupFromUrl = searchParams.get('group');

    const [conflictList, setConflictList] = useState<UsedScheduleResponse[]>([]);
    const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);

    // 1. 뷰 모드 관리 (URL 파라미터 연동)
    const [viewMode, setViewMode] = useState<'LIST' | 'GROUP'>(groupFromUrl ? 'GROUP' : 'LIST');

    useEffect(() => {
        if (groupFromUrl) {
            setViewMode('GROUP');
        }
    }, [groupFromUrl]);

    const switchToGroupMode = () => {
        setViewMode('GROUP');
    };

    const switchToListMode = () => {
        setViewMode('LIST');
        setSearchParams({}); // 리스트로 갈 때는 URL 파라미터 초기화
    };

    // 2. 데이터 상태 관리
    const [spots, setSpots] = useState<SpotResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [filter, setFilter] = useState<SpotSearchParams>({ keyword: '', type: 'ALL', isVisit: 'ALL' });

    // 폼 상태 (새 장소 추가용) - 새 필드들 초기화 포함
    const [form, setForm] = useState<SpotCreateRequest>({
        spotName: '',
        spotType: 'OTHER',
        address: '',
        shortAddress: '',
        website: '',
        googleMapUrl: '',
        description: '',
        lat: 0.0,
        lng: 0.0,
        isVisit: false,
        metadata: {}
    });

    // 장소 목록 로드
    const fetchSpots = async () => {
        try {
            setLoading(true);
            const data = await getMySpots();
            setSpots(data);
        } catch {
            console.error("장소 로딩 실패");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchSpots(); }, []);

    // 3. 목록에서 방문 여부 토글 (Optimistic Update)
    const handleToggleVisit = async (spot: SpotResponse) => {
        const newStatus = !spot.isVisit;
        setSpots(prev => prev.map(s => s.id === spot.id ? { ...s, isVisit: newStatus } : s));

        try {
            // 필수 필드 및 새 필드 모두 포함하여 업데이트 요청
            const updateReq: SpotUpdateRequest = {
                spotName: spot.spotName,
                spotType: spot.spotType,
                address: spot.address,
                shortAddress: spot.shortAddress,
                website: spot.website,
                googleMapUrl: spot.googleMapUrl,
                description: spot.description,
                lat: spot.lat,
                lng: spot.lng,
                isVisit: newStatus,
                metadata: spot.metadata
            };
            await updateSpot(spot.id, updateReq);
        } catch {
            // 실패 시 롤백
            setSpots(prev => prev.map(s => s.id === spot.id ? { ...s, isVisit: !newStatus } : s));
            alert("상태 변경 실패");
        }
    };

    // 4. 프론트엔드 필터링 로직
    const visibleSpots = useMemo(() => {
        return spots.filter(spot => {
            // 키워드 검색 (이름, 주소, 설명 등 포함)
            if (filter.keyword) {
                const k = filter.keyword.toLowerCase();
                const matchName = spot.spotName.toLowerCase().includes(k);
                const matchAddress = spot.address?.toLowerCase().includes(k);
                const matchShortAddress = spot.shortAddress?.toLowerCase().includes(k);
                const matchDesc = spot.description?.toLowerCase().includes(k);

                if (!matchName && !matchAddress && !matchShortAddress && !matchDesc) return false;
            }

            // 타입 필터
            if (filter.type !== 'ALL' && spot.spotType !== filter.type) return false;

            // 방문 여부 필터
            if (filter.isVisit === 'VISITED' && !spot.isVisit) return false;
            if (filter.isVisit === 'NOT_VISITED' && spot.isVisit) return false;

            return true;
        });
    }, [spots, filter]);

    // 5. 새 장소 저장 핸들러
    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.spotName.trim()) return;
        try {
            await createSpot(form);
            alert('추가되었습니다.');
            setIsCreating(false);
            // 폼 초기화
            setForm({
                spotName: '', spotType: 'OTHER', address: '',
                shortAddress: '', website: '', googleMapUrl: '', description: '',
                lat: 0.0, lng: 0.0, isVisit: false, metadata: {}
            });
            fetchSpots();
        } catch { alert('저장 실패'); }
    };

    // 장소 삭제 핸들러
    const handleDelete = async (id: number) => {
        if(!window.confirm("삭제하시겠습니까?")) return;
        try { await deleteSpot(id); fetchSpots(); }
        catch (error:any) {
            console.log(error);
            if (error.code === 'SPOT_IN_USE') {
                setConflictList(error.data);
                setIsConflictModalOpen(true)
            } else {
                alert("삭제 실패");
            }
        }
    };

    const spotTypes: SpotType[] = [
        'LANDMARK', 'HISTORICAL_SITE', 'RELIGIOUS_SITE', 'MUSEUM', 'PARK',
        'NATURE', 'SHOPPING', 'ACTIVITY', 'FOOD', 'CAFE', 'STATION', 'ACCOMMODATION', 'OTHER'
    ];

    return (
        <div className="max-w-5xl mx-auto p-4 md:p-6 pb-20">

            {/* 헤더 영역 */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">나의 장소 ⭐️</h1>
                    {viewMode === 'LIST' && <p className="text-gray-500 mt-2 text-sm">총 <span className="text-green-600 font-bold">{visibleSpots.length}</span>개의 장소</p>}
                </div>
                <div className="flex gap-2">
                    <div className="bg-gray-100 p-1 rounded-lg flex">
                        <button onClick={switchToListMode} className={`px-3 py-1.5 text-sm font-bold rounded-md transition ${viewMode === 'LIST' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>📋 전체</button>
                        <button onClick={switchToGroupMode} className={`px-3 py-1.5 text-sm font-bold rounded-md transition ${viewMode === 'GROUP' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>📂 그룹별</button>
                    </div>
                    <button onClick={() => setIsCreating(!isCreating)} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-lg shadow-green-200 transition text-sm">{isCreating ? '닫기' : '+ 장소 추가'}</button>
                </div>
            </div>

            {/* 장소 추가 폼 (토글) */}
            {isCreating && (
                <div className="mb-6 bg-gray-50 p-6 rounded-xl border border-gray-200 animate-fade-in-down">
                    <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <input className="px-4 py-2 border rounded-lg" placeholder="이름" value={form.spotName} onChange={e => setForm({...form, spotName: e.target.value})} required />
                        <select className="px-4 py-2 border rounded-lg bg-white" value={form.spotType} onChange={e => setForm({...form, spotType: e.target.value as SpotType})}>
                            {spotTypes.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <input className="px-4 py-2 border rounded-lg md:col-span-2" placeholder="주소" value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
                        <div className="flex items-center gap-2 md:col-span-4">
                            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                                <input type="checkbox" checked={form.isVisit} onChange={e => setForm({...form, isVisit: e.target.checked})} className="w-4 h-4 text-green-600 rounded" />
                                방문 완료
                            </label>
                            <button type="submit" className="ml-auto bg-green-600 text-white font-bold py-2 px-6 rounded-lg text-sm">저장</button>
                        </div>
                    </form>
                </div>
            )}
            <SpotInUseModal
                isOpen={isConflictModalOpen}
                onClose={() => setIsConflictModalOpen(false)}
                usageList={conflictList}
            />
            {/* 뷰 모드에 따른 렌더링 */}
            {viewMode === 'LIST' ? (
                <>
                    <SpotFilter onSearch={setFilter} />
                    {loading ? <div className="text-center p-20">로딩 중...</div> :
                        <SpotList spots={visibleSpots} onDelete={handleDelete} onToggleVisit={handleToggleVisit} />
                    }
                </>
            ) : (
                <SpotGroupList initialGroupName={groupFromUrl || undefined} />
            )}

        </div>
    );
}