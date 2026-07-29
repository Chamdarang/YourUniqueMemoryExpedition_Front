import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

// API
import { deleteSpot, getMySpots, getSpotDuplicateCandidates, mergeSpots, updateSpot } from "../api/spotApi";
import { deletePurchase, updatePurchase, getAllPurchases, createPurchase } from "../api/purchaseApi";

// Types
import type { SpotDuplicateCandidate, SpotResponse } from "../types/spot";
import type { SpotPurchaseResponse, SpotPurchaseSaveRequest, PurchaseSearchParams } from "../types/purchase";
import type { SpotInUseError, UsedScheduleResponse } from "../types/error";

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
    const [duplicateCandidates, setDuplicateCandidates] = useState<SpotDuplicateCandidate[] | null>(null);
    const [mergingSpots, setMergingSpots] = useState(false);

    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formPurchase, setFormPurchase] = useState<SpotPurchaseSaveRequest & { spotUserId: number }>({
        itemName: '', kind: 'SOUVENIR', category: '', price: 0, currency: 'JPY',
        status: 'WANT', quantity: 1, acquiredDate: new Date().toISOString().split('T')[0],
        note: '', spotUserId: 0
    });

    const fetchPurchasesData = useCallback(async (pageNum = 0) => {
        try {
            setLoading(true); // ✅ 로딩 시작
            const data = await getAllPurchases({ page: pageNum, size: 20, ...activePFilter });
            setPurchases(data.content);
            setTotalPages(data.totalPages);
            setTotalElements(data.totalElements);
            setPage(data.number);
        } finally { setLoading(false); } // ✅ 로딩 종료
    }, [activePFilter]);

    const fetchSpotsData = useCallback(async (pageNum = 0, currentFilter = spotFilter) => {
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
    }, [spotFilter, viewMode]);

    useEffect(() => {
        if (viewMode === 'PURCHASE') {
            fetchPurchasesData(0);
            fetchSpotsData(0);
        }
        else if (viewMode === 'SPOT') {
            fetchSpotsData(0, spotFilter);
        }
    }, [viewMode, activePFilter, spotFilter, fetchPurchasesData, fetchSpotsData]);

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
        } catch (error) {
            const err = error as Partial<SpotInUseError> & Error;
            const errorCode = err.code;
            const errorData = err.data;
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
                spotType: spot.spotType,
                isVisit: !spot.isVisit
            });
            fetchSpotsData(page);
        } catch { alert("업데이트 실패"); }
    };

    const handleSavePurchase = async () => {
        if (!formPurchase.itemName) return alert("아이템 이름을 입력해 주세요.");
        if (formPurchase.spotUserId === 0) return alert("장소를 선택해 주세요.");
        try {
            const { spotUserId, ...requestBody } = formPurchase;
            if (editingId) {
                await updatePurchase(editingId, { ...requestBody, spotUserId });
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

    const openDuplicateCandidates = async () => {
        try {
            setLoading(true);
            setDuplicateCandidates(await getSpotDuplicateCandidates());
        } catch (error) {
            alert(error instanceof Error ? error.message : "중복 장소를 확인하지 못했습니다.");
        } finally {
            setLoading(false);
        }
    };

    const handleMergeSpots = async (
        target: SpotResponse,
        source: SpotResponse,
    ) => {
        const targetName = target.displayName || target.spotName;
        const sourceName = source.displayName || source.spotName;
        if (!confirm(`'${targetName}'을(를) 남기고 '${sourceName}'을(를) 병합할까요?\n일정·기념품·방문 기록은 남길 장소로 이동됩니다.`)) return;

        try {
            setMergingSpots(true);
            await mergeSpots(target.id, source.id);
            const refreshed = await getSpotDuplicateCandidates();
            setDuplicateCandidates(refreshed);
            await fetchSpotsData(page, spotFilter);
        } catch (error) {
            alert(error instanceof Error ? error.message : "장소를 병합하지 못했습니다.");
        } finally {
            setMergingSpots(false);
        }
    };

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
                    <div className="mb-4 flex justify-end">
                        <button
                            type="button"
                            onClick={openDuplicateCandidates}
                            className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-black text-orange-700 transition hover:bg-orange-100"
                        >
                            🧹 중복 장소 확인
                        </button>
                    </div>
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
                        setEditingId={setEditingId}
                        formPurchase={formPurchase}
                        setFormPurchase={setFormPurchase}
                    />

                    <PurchaseList
                        purchases={purchases}
                        onEdit={handleEditStart}
                        onToggleStatus={(p) => updatePurchase(p.id, { ...p, status: p.status === 'ACQUIRED' ? 'WANT' : 'ACQUIRED' }).then(() => fetchPurchasesData(page))}
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

            {duplicateCandidates !== null && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                    <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl md:p-8">
                        <div className="mb-6 flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-xl font-black text-gray-900">🧹 중복 장소 정리</h3>
                                <p className="mt-1 text-xs text-gray-500">이름과 좌표가 모두 가까운 장소만 후보로 표시합니다.</p>
                            </div>
                            <button
                                type="button"
                                disabled={mergingSpots}
                                onClick={() => setDuplicateCandidates(null)}
                                className="text-xl text-gray-400 hover:text-gray-600 disabled:opacity-50"
                            >
                                ✕
                            </button>
                        </div>

                        {duplicateCandidates.length === 0 ? (
                            <div className="rounded-2xl border-2 border-dashed border-gray-200 py-12 text-center text-sm font-bold text-gray-400">
                                중복 가능성이 있는 장소가 없습니다.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {duplicateCandidates.map(candidate => {
                                    const firstName = candidate.first.displayName || candidate.first.spotName;
                                    const secondName = candidate.second.displayName || candidate.second.spotName;
                                    return (
                                        <div key={`${candidate.first.id}-${candidate.second.id}`} className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4">
                                            <div className="mb-3 flex items-center justify-between gap-3 text-xs">
                                                <span className="font-bold text-orange-700">{candidate.reason}</span>
                                                <span className="shrink-0 text-gray-400">{candidate.distanceMeters}m</span>
                                            </div>
                                            <div className="grid gap-3 md:grid-cols-2">
                                                <div className="rounded-xl border border-gray-200 bg-white p-3">
                                                    <div className="font-black text-gray-800">{firstName}</div>
                                                    <div className="mt-1 text-xs text-gray-400">{candidate.first.address}</div>
                                                    <button
                                                        type="button"
                                                        disabled={mergingSpots}
                                                        onClick={() => handleMergeSpots(candidate.first, candidate.second)}
                                                        className="mt-3 w-full rounded-lg bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                                                    >
                                                        이 장소를 남기기
                                                    </button>
                                                </div>
                                                <div className="rounded-xl border border-gray-200 bg-white p-3">
                                                    <div className="font-black text-gray-800">{secondName}</div>
                                                    <div className="mt-1 text-xs text-gray-400">{candidate.second.address}</div>
                                                    <button
                                                        type="button"
                                                        disabled={mergingSpots}
                                                        onClick={() => handleMergeSpots(candidate.second, candidate.first)}
                                                        className="mt-3 w-full rounded-lg bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                                                    >
                                                        이 장소를 남기기
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
