import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

// API
import { getSpotDetail, updateSpot } from '../api/spotApi';
import { createPurchase, updatePurchase, deletePurchase } from '../api/purchaseApi';
import { getAllGroups, createGroup, addSpotToGroup, removeSpotFromGroup } from '../api/groupApi';

// Types
import type { SpotDetailResponse, SpotUpdateRequest } from '../types/spot';
import type { SpotPurchaseSaveRequest, SpotPurchaseResponse } from '../types/purchase';
import type { SpotType, PurchaseStatus } from '../types/enums';

// Modals (Updated Path)
import SpotPurchaseModal from '../components/spot/SpotPurchaseModal';
import SpotGroupModal from '../components/spot/SpotGroupModal';

// ----------------------------------------------------------------
// 📝 상수 및 헬퍼
// ----------------------------------------------------------------

const SPOT_TYPES: { value: SpotType; label: string }[] = [
    { value: 'LANDMARK', label: '🗼 명소' },
    { value: 'HISTORICAL_SITE', label: '🏯 유적지' },
    { value: 'RELIGIOUS_SITE', label: '🙏 종교시설' },
    { value: 'MUSEUM', label: '🖼 박물관' },
    { value: 'PARK', label: '🌳 공원' },
    { value: 'NATURE', label: '🌲 자연' },
    { value: 'SHOPPING', label: '🛍️ 쇼핑' },
    { value: 'ACTIVITY', label: '🎢 액티비티' },
    { value: 'FOOD', label: '🍚 음식점' },
    { value: 'CAFE', label: '☕ 카페' },
    { value: 'STATION', label: '🚉 교통' },
    { value: 'ACCOMMODATION', label: '🏨 숙소' },
    { value: 'OTHER', label: '📍 기타' },
];

const getStatusInfo = (status: PurchaseStatus) => {
    switch (status) {
        case 'WANT': return { label: '🥺 사고 싶음', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' };
        case 'AVAILABLE': return { label: '🏷️ 판매 중', color: 'bg-blue-100 text-blue-800 border-blue-200' };
        case 'ACQUIRED': return { label: '🎁 구매 완료', color: 'bg-green-100 text-green-800 border-green-200' };
        case 'SKIPPED': return { label: '❌ 패스함', color: 'bg-gray-100 text-gray-500 border-gray-200' };
        case 'UNAVAILABLE': return { label: '🚫 품절/없음', color: 'bg-red-100 text-red-800 border-red-200' };
        default: return { label: '❓ 상태 미상', color: 'bg-gray-50 text-gray-400 border-gray-100' };
    }
};

// ----------------------------------------------------------------
// 🚀 컴포넌트 시작
// ----------------------------------------------------------------

export default function SpotDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    // 데이터 상태
    const [spot, setSpot] = useState<SpotDetailResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);

    // 폼 상태 (수정용)
    const [form, setForm] = useState<SpotUpdateRequest>({
        spotName: '',
        spotType: 'OTHER',
        address: '',
        shortAddress: '',
        website: '',
        googleMapUrl: '',
        description: '',
        lat: 0,
        lng: 0,
        isVisit: false,
        metadata: {}
    });

    // 모달 상태
    const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
    const [selectedPurchase, setSelectedPurchase] = useState<SpotPurchaseResponse | null>(null);
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

    // 1. 상세 정보 불러오기
    const fetchDetail = async () => {
        if (!id) return;
        try {
            setLoading(true);
            const data = await getSpotDetail(Number(id));
            setSpot(data);

            // 수정 폼 초기화 (새 필드 포함)
            setForm({
                spotName: data.spotName,
                spotType: data.spotType,
                address: data.address,
                shortAddress: data.shortAddress || '',
                website: data.website || '',
                googleMapUrl: data.googleMapUrl || '',
                description: data.description || '',
                lat: data.lat,
                lng: data.lng,
                isVisit: data.isVisit,
                metadata: data.metadata || {}
            });
        } catch (err) {
            console.error(err);
            navigate('/spots');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchDetail(); }, [id]);

    // 2. 방문 여부 토글 (즉시 저장)
    const handleToggleVisit = async () => {
        if (!spot || !id) return;
        const newIsVisit = !spot.isVisit;

        try {
            const updateReq: SpotUpdateRequest = { ...form, isVisit: newIsVisit };
            await updateSpot(Number(id), updateReq);

            // UI 즉시 업데이트
            setSpot({ ...spot, isVisit: newIsVisit });
            setForm({ ...form, isVisit: newIsVisit });
        } catch {
            alert("상태 변경에 실패했습니다.");
        }
    };

    // 3. 장소 정보 수정 저장
    const handleUpdateSpot = async () => {
        if (!id) return;
        try {
            await updateSpot(Number(id), form);
            alert("수정되었습니다.");
            setIsEditing(false);
            fetchDetail();
        } catch { alert("수정 실패"); }
    };

    // 4. 구매 내역 저장/삭제
    const handleSavePurchase = async (req: SpotPurchaseSaveRequest) => {
        if (!id) return;
        try {
            if (selectedPurchase) { await updatePurchase(selectedPurchase.id, req); }
            else { await createPurchase(Number(id), req); }
            fetchDetail();
        } catch { alert("저장 실패"); }
    };

    const handleDeletePurchase = async (pId: number) => {
        if (window.confirm("삭제하시겠습니까?")) {
            try { await deletePurchase(pId); fetchDetail(); } catch { alert("삭제 실패"); }
        }
    };

    // 5. 그룹 태그 저장
    const handleSaveGroups = async (newTags: string[]) => {
        if (!id || !spot) return;
        const spotId = Number(id);
        try {
            const allGroups = await getAllGroups();
            const oldTags = spot.groupName;

            // 삭제할 태그
            const toRemove = oldTags.filter(t => !newTags.includes(t));
            for (const name of toRemove) {
                const group = allGroups.find(g => g.groupName === name);
                if (group) await removeSpotFromGroup(group.id, spotId);
            }

            // 추가할 태그
            const toAdd = newTags.filter(t => !oldTags.includes(t));
            for (const name of toAdd) {
                let group = allGroups.find(g => g.groupName === name);
                if (!group) group = await createGroup({ groupName: name });
                await addSpotToGroup(group.id, spotId);
            }
            fetchDetail();
            setIsGroupModalOpen(false);
        } catch { alert("태그 저장 실패"); }
    };

    const openAddPurchaseModal = () => { setSelectedPurchase(null); setIsPurchaseModalOpen(true); };
    const openEditPurchaseModal = (p: SpotPurchaseResponse) => { setSelectedPurchase(p); setIsPurchaseModalOpen(true); };

    if (loading || !spot) return <div className="text-center p-20 text-gray-500">로딩 중... ⏳</div>;

    return (
        <div className="max-w-5xl mx-auto p-4 md:p-6 pb-20">

            {/* 🔙 상단 네비게이션 */}
            <div className="flex items-center gap-4 mb-6">
                <button onClick={() => navigate('/spots')} className="text-gray-500 hover:text-gray-900 font-bold flex items-center gap-1">
                    <span>←</span> 목록으로
                </button>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900 truncate">
                    {spot.spotName}
                </h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* LEFT COLUMN: 상세 정보 & 구매 목록 */}
                <div className="lg:col-span-2 space-y-6">

                    {/* 📍 1. 기본 정보 */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                📍 기본 정보
                                {isEditing && <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded border border-green-200">수정 모드</span>}
                            </h2>
                            {isEditing ? (
                                <div className="flex gap-2">
                                    <button onClick={handleUpdateSpot} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold">저장</button>
                                    <button onClick={() => setIsEditing(false)} className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg text-sm font-bold">취소</button>
                                </div>
                            ) : (
                                <button onClick={() => setIsEditing(true)} className="text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-sm font-bold transition">
                                    ✏️ 수정
                                </button>
                            )}
                        </div>

                        {isEditing ? (
                            // ✏️ [수정 모드]
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">장소 이름</label>
                                        <input className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white"
                                               value={form.spotName} onChange={e => setForm({...form, spotName: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">간략 주소</label>
                                        <input className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white"
                                               value={form.shortAddress || ''} onChange={e => setForm({...form, shortAddress: e.target.value})} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">유형</label>
                                        <select className="w-full p-2.5 border rounded-lg bg-white outline-none"
                                                value={form.spotType} onChange={e => setForm({...form, spotType: e.target.value as SpotType})}>
                                            {SPOT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">방문 여부</label>
                                        <select className="w-full p-2.5 border rounded-lg bg-white outline-none"
                                                value={form.isVisit ? "true" : "false"} onChange={e => setForm({...form, isVisit: e.target.value === 'true'})}>
                                            <option value="false">⬜ 미방문</option>
                                            <option value="true">✅ 방문 완료</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">한 줄 설명</label>
                                    <textarea className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white h-20 resize-none"
                                              value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">웹사이트 URL</label>
                                        <input className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white"
                                               value={form.website || ''} onChange={e => setForm({...form, website: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">구글맵 URL</label>
                                        <input className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white"
                                               value={form.googleMapUrl || ''} onChange={e => setForm({...form, googleMapUrl: e.target.value})} />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">전체 주소</label>
                                    <input className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white text-gray-500 text-sm"
                                           value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
                                </div>
                            </div>
                        ) : (
                            // 📖 [조회 모드]
                            <div className="space-y-4">
                                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1 bg-gray-100 px-3 py-1.5 rounded-lg text-sm font-bold text-gray-700">
                    {SPOT_TYPES.find(t => t.value === spot.spotType)?.label || spot.spotType}
                  </span>

                                    <button
                                        onClick={handleToggleVisit}
                                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold border transition
                      ${spot.isVisit
                                            ? 'bg-green-50 text-green-700 border-green-100 hover:bg-green-100'
                                            : 'bg-gray-50 text-gray-400 border-gray-100 hover:bg-gray-100 hover:text-gray-600'
                                        }`}
                                    >
                                        {spot.isVisit ? '✅ 방문 완료' : '⬜ 미방문'}
                                    </button>

                                    {/* 외부 링크 버튼 */}
                                    {spot.googleMapUrl && (
                                        <a href={spot.googleMapUrl} target="_blank" rel="noopener noreferrer"
                                           className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold border border-blue-100 bg-blue-50 text-blue-600 hover:bg-blue-100 transition">
                                            🗺️ 구글맵 보기
                                        </a>
                                    )}
                                    {spot.website && (
                                        <a href={spot.website} target="_blank" rel="noopener noreferrer"
                                           className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition">
                                            🌐 웹사이트
                                        </a>
                                    )}
                                </div>

                                {/* 설명 */}
                                {spot.description && (
                                    <div className="bg-gray-50 p-3 rounded-lg text-gray-700 text-sm leading-relaxed border border-gray-100">
                                        {spot.description}
                                    </div>
                                )}

                                {/* 주소 표시 */}
                                <div>
                                    <div className="text-xs font-bold text-gray-400 mb-1">주소</div>
                                    <div className="text-gray-700 break-keep">
                                        {spot.shortAddress ? (
                                            <>
                                                <span className="font-bold">{spot.shortAddress}</span>
                                                <br/>
                                                <span className="text-xs text-gray-400">{spot.address}</span>
                                            </>
                                        ) : (
                                            spot.address || '-'
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 🛍️ 2. 구매 목록 */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold text-gray-800">🛍️ 구매 목록 <span className="text-gray-400 text-sm font-normal">({spot.purchases.length})</span></h2>
                            <button onClick={openAddPurchaseModal} className="text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition">
                                + 추가
                            </button>
                        </div>

                        {spot.purchases.length === 0 ? (
                            <div className="text-center py-8 border-2 border-dashed border-gray-100 rounded-xl">
                                <p className="text-gray-400 text-sm">등록된 구매/기념품 내역이 없습니다.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left min-w-75">
                                    <thead className="text-xs text-gray-500 uppercase bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-2 rounded-l-lg">물품명</th>
                                        <th className="px-3 py-2 whitespace-nowrap">가격/수량</th>
                                        <th className="px-3 py-2 rounded-r-lg text-right">관리</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {spot.purchases.map(p => {
                                        const statusInfo = getStatusInfo(p.status);
                                        return (
                                            <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50 group transition">
                                                <td className="px-3 py-3" onClick={() => openEditPurchaseModal(p)}>
                                                    <div className="font-bold text-gray-800 cursor-pointer hover:text-blue-600 mb-1">
                                                        {p.itemName}
                                                    </div>
                                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${statusInfo.color}`}>
                                {statusInfo.label}
                              </span>
                                                </td>
                                                <td className="px-3 py-3 text-gray-600 align-top whitespace-nowrap">
                                                    <div className="font-mono text-xs">{p.price > 0 ? `${p.price.toLocaleString()} ${p.currency}` : '-'}</div>
                                                    <div className="text-[10px] text-gray-400">{p.quantity}개</div>
                                                </td>
                                                <td className="px-3 py-3 text-right align-top">
                                                    <div className="flex flex-col items-end gap-1">
                                                        <button onClick={(e) => { e.stopPropagation(); openEditPurchaseModal(p); }}
                                                                className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded text-xs font-bold">수정</button>
                                                        <button onClick={(e) => { e.stopPropagation(); handleDeletePurchase(p.id); }}
                                                                className="text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded text-xs">삭제</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT COLUMN: 태그 그룹 */}
                <div className="space-y-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold text-gray-800">🏷️ 그룹 / 태그</h2>
                            <button onClick={() => setIsGroupModalOpen(true)} className="text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition">
                                편집
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {spot.groupName.length > 0 ? (
                                spot.groupName.map((g, i) => (
                                    <span
                                        key={i}
                                        onClick={() => navigate(`/spots?group=${encodeURIComponent(g)}`)}
                                        className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm font-bold border border-gray-200 cursor-pointer hover:bg-blue-100 hover:text-blue-600 hover:border-blue-200 transition"
                                    >
                      #{g}
                    </span>
                                ))
                            ) : (
                                <span className="text-gray-400 text-sm">지정된 그룹이 없습니다.</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <SpotPurchaseModal
                isOpen={isPurchaseModalOpen}
                onClose={() => setIsPurchaseModalOpen(false)}
                onSave={handleSavePurchase}
                initialData={selectedPurchase}
            />

            <SpotGroupModal
                isOpen={isGroupModalOpen}
                onClose={() => setIsGroupModalOpen(false)}
                currentGroups={spot.groupName}
                onSave={handleSaveGroups}
            />
        </div>
    );
}