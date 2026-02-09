import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

// API
import { deleteSpot, getMySpots, updateSpot } from "../api/spotApi";
import { deletePurchase, updatePurchase, getAllPurchases, createPurchase } from "../api/purchaseApi";

// Types
import type { SpotResponse } from "../types/spot";
import type { SpotPurchaseResponse, SpotPurchaseSaveRequest, PurchaseSearchParams } from "../types/purchase";
import type { UsedScheduleResponse } from "../types/error";

// Components
import SpotFilter, { type SpotSearchParams } from "../components/spot/SpotFilter";
import SpotList from "../components/spot/SpotList";
import PurchaseFilter from "../components/purchase/PurchaseFilter.tsx"; // ✅ 분리된 컴포넌트
import PurchaseList from "../components/purchase/PurchaseList";
import SpotGroupList from "../components/spot/SpotGroupList";
import Pagination from "../components/common/Pagination";
import SpotInUseModal from "../components/spot/SpotInUseModal.tsx";

// ❌ PURCHASE_KIND_KEYS 등 기념품 유틸 임포트는 PurchaseFilter 내부로 이동했으므로 여기서 삭제했습니다.

type AdminMode = 'SPOT' | 'GROUP' | 'PURCHASE';

export default function SpotListPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const modeFromUrl = (searchParams.get('mode') as AdminMode) || 'SPOT';

    const [viewMode, setViewMode] = useState<AdminMode>(modeFromUrl);
    const [loading, setLoading] = useState(true); // ✅ 로딩 상태
    const [spots, setSpots] = useState<SpotResponse[]>([]);
    const [purchases, setPurchases] = useState<SpotPurchaseResponse[]>([]);

    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [totalElements, setTotalElements] = useState(0);

    const [activePFilter, setActivePFilter] = useState<PurchaseSearchParams>({});
    const [spotFilter, setSpotFilter] = useState<SpotSearchParams>({
        keyword: '',
        type: 'ALL',
        isVisit: 'ALL'
    });

    const [isInUseModalOpen, setIsInUseModalOpen] = useState(false);
    const [conflictUsage, setConflictUsage] = useState<UsedScheduleResponse[]>([]);
    const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formPurchase, setFormPurchase] = useState<SpotPurchaseSaveRequest & { spotUserId: number }>({
        itemName: '', kind: 'SOUVENIR', category: '', price: 0, currency: 'JPY',
        status: 'WANT', quantity: 1, acquiredDate: new Date().toISOString().split('T')[0],
        note: '', spotUserId: 0
    });

    const fetchPurchasesData = async (pageNum = 0) => {
        try {
            setLoading(true); // ✅ 로딩 시작
            const data = await getAllPurchases({ page: pageNum, size: 20, ...activePFilter });
            setPurchases(data.content);
            setTotalPages(data.totalPages);
            setTotalElements(data.totalElements);
            setPage(data.number);
        } finally { setLoading(false); } // ✅ 로딩 종료
    };

    const fetchSpotsData = async (pageNum = 0, currentFilter = spotFilter) => {
        try {
            setLoading(true); // ✅ 로딩 시작
            const data = await getMySpots({
                page: pageNum,
                size: 20,
                keyword: currentFilter.keyword,
                spotType: currentFilter.type === 'ALL' ? undefined : currentFilter.type,
                isVisit: currentFilter.isVisit === 'ALL' ? undefined : currentFilter.isVisit
            });
            setSpots(data.content);
            if (viewMode === 'SPOT') {
                setTotalPages(data.totalPages);
                setTotalElements(data.totalElements);
                setPage(data.number);
            }
        } finally { setLoading(false); } // ✅ 로딩 종료
    };

    useEffect(() => {
        if (viewMode === 'PURCHASE') {
            fetchPurchasesData(0);
            fetchSpotsData(0);
        }
        else if (viewMode === 'SPOT') {
            fetchSpotsData(0, spotFilter);
        }
    }, [viewMode, activePFilter, spotFilter]);

    const handleSpotSearch = (newParams: SpotSearchParams) => {
        setSpotFilter(newParams);
        setPage(0);
    };

    const handleDeleteSpot = async (id: number, force = false) => {
        if (!force && !confirm("이 장소를 삭제하시겠습니까?")) return;
        try {
            await deleteSpot(id);
            alert("삭제되었습니다.");
            setIsInUseModalOpen(false);
            fetchSpotsData(page);
        } catch (err: any) {
            const errorCode = err.code || err.response?.data?.code;
            const errorData = err.data || err.response?.data?.data;
            if (errorCode === 'SPOT_IN_USE') {
                setPendingDeleteId(id);
                setConflictUsage(errorData || []);
                setIsInUseModalOpen(true);
            } else {
                alert(err.message || "삭제 실패");
            }
        }
    };

    const handleToggleVisit = async (spot: SpotResponse) => {
        try {
            await updateSpot(spot.id, {
                spotName: spot.spotName,
                spotType: spot.spotType,
                isVisit: !spot.isVisit
            });
            fetchSpotsData(page);
        } catch (e) { alert("업데이트 실패"); }
    };

    const handleSavePurchase = async () => {
        if (!formPurchase.itemName) return alert("아이템 이름을 입력해 주세요.");
        if (formPurchase.spotUserId === 0) return alert("장소를 선택해 주세요.");
        try {
            const { spotUserId, ...requestBody } = formPurchase;
            if (editingId) {
                await updatePurchase(editingId, { ...requestBody, spotUserId } as any);
                alert("수정되었습니다! ✨");
            } else {
                await createPurchase(spotUserId, requestBody);
                alert("추가되었습니다! 🎁");
            }
            setIsAdding(false);
            setEditingId(null);
            setFormPurchase({
                itemName: '', kind: 'SOUVENIR', category: '', price: 0, currency: 'JPY',
                status: 'WANT', quantity: 1, acquiredDate: new Date().toISOString().split('T')[0],
                note: '', spotUserId: 0
            });
            fetchPurchasesData(0);
        } catch (error) {
            console.error(error);
            alert("처리에 실패했습니다.");
        }
    };

    const handleEditStart = (item: SpotPurchaseResponse) => {
        setEditingId(item.id);
        setFormPurchase({
            itemName: item.itemName, kind: item.kind, category: item.category,
            price: item.price, currency: item.currency, status: item.status,
            quantity: item.quantity, acquiredDate: item.acquiredDate,
            note: item.note, spotUserId: item.spotUserId
        });
        setIsAdding(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleModeChange = (newMode: AdminMode) => { setViewMode(newMode); setSearchParams({ mode: newMode }); };

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 pb-20 font-sans relative">

            {/* ✅ 전역 로딩 오버레이 추가 */}
            {loading && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
                    <div className="w-8 h-8 border-4 border-gray-900 border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}

            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 border-b border-gray-100 pb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-gray-900">{viewMode === 'PURCHASE' ? '기념품 장부' : '내 장소'}</h1>
                    <p className="text-gray-400 text-xs mt-1 font-bold">총 {totalElements}개의 항목 관리 중</p>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-2xl shadow-inner border border-gray-100">
                    <button onClick={() => handleModeChange('SPOT')} className={`px-5 py-2 rounded-xl text-sm font-black transition-all ${viewMode === 'SPOT' ? 'bg-white text-blue-600 shadow-sm scale-105' : 'text-gray-500'}`}>📍 스팟</button>
                    <button onClick={() => handleModeChange('GROUP')} className={`px-5 py-2 rounded-xl text-sm font-black transition-all ${viewMode === 'GROUP' ? 'bg-white text-orange-600 shadow-sm scale-105' : 'text-gray-500'}`}>📂 그룹</button>
                    <button onClick={() => handleModeChange('PURCHASE')} className={`px-5 py-2 rounded-xl text-sm font-black transition-all ${viewMode === 'PURCHASE' ? 'bg-white text-pink-600 shadow-sm scale-105' : 'text-gray-500'}`}>🎁 기념품</button>
                </div>
            </div>

            {viewMode === 'SPOT' && (
                <div className="animate-in fade-in duration-300">
                    <SpotFilter onSearch={handleSpotSearch} />
                    <SpotList spots={spots} onDelete={handleDeleteSpot} onToggleVisit={handleToggleVisit} />
                    <Pagination currentPage={page} totalPages={totalPages} onPageChange={(p) => fetchSpotsData(p, spotFilter)} />
                </div>
            )}

            {viewMode === 'GROUP' && <SpotGroupList />}

            {viewMode === 'PURCHASE' && (
                <div className="animate-in fade-in duration-300 space-y-6">
                    <PurchaseFilter
                        spots={spots}
                        onSearch={setActivePFilter}
                        onSave={handleSavePurchase}
                        isAdding={isAdding}
                        setIsAdding={setIsAdding}
                        editingId={editingId}
                        formPurchase={formPurchase}
                        setFormPurchase={setFormPurchase}
                    />

                    <PurchaseList
                        purchases={purchases}
                        onEdit={handleEditStart}
                        onToggleStatus={(p) => updatePurchase(p.id, { ...p, status: p.status === 'ACQUIRED' ? 'WANT' : 'ACQUIRED' } as any).then(() => fetchPurchasesData(page))}
                        onDelete={(id) => deletePurchase(id).then(() => fetchPurchasesData(page))}
                    />

                    <Pagination currentPage={page} totalPages={totalPages} onPageChange={fetchPurchasesData} />
                </div>
            )}

            <SpotInUseModal
                isOpen={isInUseModalOpen}
                onClose={() => setIsInUseModalOpen(false)}
                usageList={conflictUsage}
                onSpotDeleteRetry={() => pendingDeleteId && handleDeleteSpot(pendingDeleteId, true)}
            />
        </div>
    );
}