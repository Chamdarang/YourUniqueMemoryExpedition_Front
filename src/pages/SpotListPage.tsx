import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

// API
import { deleteSpot, getMySpots, updateSpot } from "../api/spotApi";

// Types
import type { SpotResponse, SpotUpdateRequest } from "../types/spot";

// Components
import SpotFilter, { type SpotSearchParams } from "../components/spot/SpotFilter";
import SpotList from "../components/spot/SpotList";
import SpotGroupList from "../components/spot/SpotGroupList";
import SpotInUseModal from "../components/spot/SpotInUseModal.tsx";
import type {UsedScheduleResponse} from "../types/error.ts";

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
    const [filter, setFilter] = useState<SpotSearchParams>({ keyword: '', type: 'ALL', isVisit: 'ALL' });
    const [targetSpotId, setTargetSpotId] = useState<number | null>(null);

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

    // 장소 삭제 핸들러
    const handleDelete = async (id: number) => {
        if (!window.confirm("삭제하시겠습니까?")) return;

        // 일단 "이 녀석을 지우려고 시도했다"라고 기억해둠
        setTargetSpotId(id);

        try {
            await deleteSpot(id);
            fetchSpots();
            setTargetSpotId(null); // 성공하면 기억 삭제
        } catch (error: any) {
            console.log(error);
            if (error.code === 'SPOT_IN_USE') {
                setConflictList(error.data);
                setIsConflictModalOpen(true);
                // ⚠️ 여기서 targetSpotId를 초기화하지 않음 (모달에서 써야 하니까)
            } else {
                alert("삭제 실패");
                setTargetSpotId(null);
            }
        }
    };

    // 3️⃣ [신규] 삭제 재시도 함수
    const handleForceDelete = async () => {
        if (!targetSpotId) return;
        if (!window.confirm("정말로 삭제하시겠습니까?")) {
            return;
        }
        try {
            await deleteSpot(targetSpotId); // API 수정 필요 시 확인 (force 파라미터 등)

            alert("삭제되었습니다.");
            setIsConflictModalOpen(false); // 모달 닫기
            setTargetSpotId(null);         // 타겟 초기화
            fetchSpots();                  // 목록 갱신
        } catch (error) {
            alert("실패했습니다.");
            console.error(error);
        }
    };

    return (
        // ✅ 수정됨: max-w-5xl -> max-w-7xl (화면을 더 넓게 써서 잘림 방지)
        <div className="max-w-7xl mx-auto p-4 md:p-6 pb-20">

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
                </div>
            </div>


            <SpotInUseModal
                isOpen={isConflictModalOpen}
                onClose={() => setIsConflictModalOpen(false)}
                usageList={conflictList}
                onSpotDeleteRetry={handleForceDelete}
            />

            {/* 뷰 모드에 따른 렌더링 */}
            {viewMode === 'LIST' ? (
                <>
                    <SpotFilter onSearch={setFilter} />
                    {loading ? <div className="text-center p-20">로딩 중...</div> :
                        // 만약 화면이 여전히 좁다면 가로 스크롤을 허용하는 래퍼 추가
                        <div className="overflow-x-auto">
                            <SpotList spots={visibleSpots} onDelete={handleDelete} onToggleVisit={handleToggleVisit} />
                        </div>
                    }
                </>
            ) : (
                <SpotGroupList initialGroupName={groupFromUrl || undefined} />
            )}

        </div>
    );
}