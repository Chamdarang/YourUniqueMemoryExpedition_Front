import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

// API
import { deleteSpot, getMySpots, updateSpot } from "../api/spotApi";

// Types
import type { SpotResponse, SpotUpdateRequest } from "../types/spot";
import type { UsedScheduleResponse } from "../types/error";

// Components
import SpotFilter, { type SpotSearchParams } from "../components/spot/SpotFilter";
import SpotList from "../components/spot/SpotList";
import SpotGroupList from "../components/spot/SpotGroupList";
import SpotInUseModal from "../components/spot/SpotInUseModal";
import Pagination from "../components/common/Pagination"; // ✅ 페이지네이션 추가

export default function SpotListPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const groupFromUrl = searchParams.get('group');

    const [conflictList, setConflictList] = useState<UsedScheduleResponse[]>([]);
    const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);

    // 1. 뷰 모드 관리
    const [viewMode, setViewMode] = useState<'LIST' | 'GROUP'>(groupFromUrl ? 'GROUP' : 'LIST');

    useEffect(() => {
        if (groupFromUrl) setViewMode('GROUP');
    }, [groupFromUrl]);

    const switchToGroupMode = () => setViewMode('GROUP');
    const switchToListMode = () => {
        setViewMode('LIST');
        setSearchParams({});
    };

    // 2. 데이터 및 페이징 상태
    const [spots, setSpots] = useState<SpotResponse[]>([]);
    const [loading, setLoading] = useState(true);

    // ✅ 페이징 & 필터 상태
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [totalElements, setTotalElements] = useState(0);
    const [filter, setFilter] = useState<SpotSearchParams>({ keyword: '', type: 'ALL', isVisit: 'ALL' });

    const [targetSpotId, setTargetSpotId] = useState<number | null>(null);

    // ✅ 목록 로드 (API 필터링 + 페이징)
    const fetchSpots = async (pageNum = 0, currentFilter = filter) => {
        try {
            setLoading(true);
            const data = await getMySpots({
                page: pageNum,
                size: 10,
                keyword: currentFilter.keyword,
                spotType: currentFilter.type,
                isVisit: currentFilter.isVisit
            });

            setSpots(data.content);
            setTotalPages(data.totalPages);
            setTotalElements(data.totalElements);
            setPage(data.number);
        } catch {
            console.error("장소 로딩 실패");
        } finally {
            setLoading(false);
        }
    };

    // 초기 로드
    useEffect(() => { fetchSpots(); }, []);

    // ✅ 필터 변경 핸들러
    const handleSearch = (newFilter: SpotSearchParams) => {
        setFilter(newFilter);
        setPage(0); // 필터 변경 시 1페이지로
        fetchSpots(0, newFilter);
    };

    // 3. 방문 여부 토글
    const handleToggleVisit = async (spot: SpotResponse) => {
        const newStatus = !spot.isVisit;
        setSpots(prev => prev.map(s => s.id === spot.id ? { ...s, isVisit: newStatus } : s));

        try {
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
            setSpots(prev => prev.map(s => s.id === spot.id ? { ...s, isVisit: !newStatus } : s));
            alert("상태 변경 실패");
        }
    };

    // 4. 삭제 핸들러
    const handleDelete = async (id: number) => {
        if (!window.confirm("삭제하시겠습니까?")) return;
        setTargetSpotId(id);
        try {
            await deleteSpot(id);
            fetchSpots(page, filter); // 현재 페이지 갱신
            setTargetSpotId(null);
        } catch (error: any) {
            if (error.code === 'SPOT_IN_USE') {
                setConflictList(error.data);
                setIsConflictModalOpen(true);
            } else {
                alert("삭제 실패");
                setTargetSpotId(null);
            }
        }
    };

    const handleForceDelete = async () => {
        if (!targetSpotId) return;
        if (!window.confirm("정말로 삭제하시겠습니까?")) return;
        try {
            await deleteSpot(targetSpotId);
            alert("삭제되었습니다.");
            setIsConflictModalOpen(false);
            setTargetSpotId(null);
            fetchSpots(page, filter);
        } catch (error) {
            alert("실패했습니다.");
        }
    };



    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">나의 장소 ⭐️</h1>
                    {viewMode === 'LIST' && <p className="text-gray-500 mt-2 text-sm">총 <span className="text-green-600 font-bold">{totalElements}</span>개의 장소</p>}
                </div>
                <div className="flex gap-2">
                    <div className="bg-gray-100 p-1 rounded-lg flex">
                        <button onClick={switchToListMode} className={`px-3 py-1.5 text-sm font-bold rounded-md transition ${viewMode === 'LIST' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>📋 전체</button>
                        <button onClick={switchToGroupMode} className={`px-3 py-1.5 text-sm font-bold rounded-md transition ${viewMode === 'GROUP' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>📂 그룹별</button>
                    </div>
                </div>
            </div>

            <SpotInUseModal
                isOpen={isConflictModalOpen}
                onClose={() => setIsConflictModalOpen(false)}
                usageList={conflictList}
                onSpotDeleteRetry={handleForceDelete}
            />

            {viewMode === 'LIST' ? (
                <>
                    <SpotFilter onSearch={handleSearch} />
                    {loading ? <div className="text-center p-20">로딩 중...</div> :
                        <>
                            <div className="overflow-x-auto">
                                <SpotList spots={spots} onDelete={handleDelete} onToggleVisit={handleToggleVisit} />
                            </div>

                            {/* ✅ 페이지네이션 */}
                            <Pagination
                                currentPage={page}
                                totalPages={totalPages}
                                onPageChange={(p) => fetchSpots(p, filter)}
                            />
                        </>
                    }
                </>
            ) : (
                <SpotGroupList initialGroupName={groupFromUrl || undefined} />
            )}
        </div>
    );
}