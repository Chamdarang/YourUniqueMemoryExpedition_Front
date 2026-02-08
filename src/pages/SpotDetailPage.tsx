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

// Utils & Components
import { getSpotTypeInfo, SPOT_TYPE_INFO } from '../utils/spotUtils';
import PurchaseCard from '../components/purchase/PurchaseCard.tsx';
import SpotGroupModal from '../components/spot/SpotGroupModal';
import {AdvancedMarker, APIProvider, Map, Pin} from "@vis.gl/react-google-maps";

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

export default function SpotDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [spot, setSpot] = useState<SpotDetailResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);

    // 쇼핑 아이템 관련 상태
    const [isAddingPurchase, setIsAddingPurchase] = useState(false);
    const [editingPurchaseId, setEditingPurchaseId] = useState<number | null>(null);

    const initialPurchaseState: SpotPurchaseSaveRequest = {
        kind: 'SOUVENIR',
        category: '',
        itemName: '',
        price: 0,
        currency: 'JPY',
        status: 'WANT',
        quantity: 1,
        acquiredDate: new Date().toISOString().split('T')[0],
        note: ''
    };

    const [newPurchase, setNewPurchase] = useState<SpotPurchaseSaveRequest>(initialPurchaseState);
    const [editPurchaseForm, setEditPurchaseForm] = useState<SpotPurchaseSaveRequest>(initialPurchaseState);

    // 장소 수정 폼 상태
    const [editForm, setEditForm] = useState<SpotUpdateRequest>({
        spotName: '', spotType: 'OTHER', address: '', shortAddress: '',
        website: '', googleMapUrl: '', lat: 0, lng: 0,
        isVisit: false, description: '', metadata: {}
    });

    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

    const fetchDetail = async () => {
        if (!id) return;
        try {
            setLoading(true);
            const data = await getSpotDetail(Number(id));
            setSpot(data);
            setEditForm({
                spotName: data.spotName, spotType: data.spotType, address: data.address,
                shortAddress: data.shortAddress || '', website: data.website || '',
                googleMapUrl: data.googleMapUrl || '', lat: data.lat, lng: data.lng,
                isVisit: data.isVisit, description: data.description || '', metadata: data.metadata || {}
            });
        } catch (err) { navigate('/spots'); } finally { setLoading(false); }
    };

    useEffect(() => { fetchDetail(); }, [id]);

    const handleUpdateSpot = async () => {
        if (!id) return;
        try {
            await updateSpot(Number(id), editForm);
            setIsEditing(false);
            fetchDetail();
        } catch { alert("수정 실패"); }
    };

    const handleToggleVisit = async () => {
        if (!spot || !id) return;
        try {
            await updateSpot(Number(id), { ...editForm, isVisit: !spot.isVisit });
            fetchDetail();
        } catch { alert("방문 상태 변경 실패"); }
    };

    const handleAddPurchase = async () => {
        if (!id || !newPurchase.itemName.trim()) { alert("아이템 이름을 입력하세요."); return; }
        try {
            await createPurchase(Number(id), newPurchase);
            setIsAddingPurchase(false);
            setNewPurchase(initialPurchaseState);
            fetchDetail();
        } catch { alert("아이템 추가 실패"); }
    };

    const handleUpdatePurchase = async (purchaseId: number) => {
        try {
            await updatePurchase(purchaseId, editPurchaseForm);
            setEditingPurchaseId(null);
            fetchDetail();
        } catch { alert("아이템 수정 실패"); }
    };

    const handleDeletePurchase = async (purchaseId: number) => {
        if (!window.confirm("정말 삭제하시겠습니까?")) return;
        try {
            await deletePurchase(purchaseId);
            fetchDetail();
        } catch { alert("삭제 실패"); }
    };

    const handleSaveGroups = async (newTags: string[]) => {
        if (!id || !spot) return;
        try {
            const allGroups = await getAllGroups();
            const oldTags = spot.groupName;
            const toRemove = oldTags.filter(t => !newTags.includes(t));
            for (const name of toRemove) {
                const group = allGroups.find(g => g.groupName === name);
                if (group) await removeSpotFromGroup(group.id, Number(id));
            }
            const toAdd = newTags.filter(t => !oldTags.includes(t));
            for (const name of toAdd) {
                let group = allGroups.find(g => g.groupName === name);
                if (!group) group = await createGroup({ groupName: name });
                await addSpotToGroup(group.id, Number(id));
            }
            fetchDetail();
            setIsGroupModalOpen(false);
        } catch { alert("태그 저장 실패"); }
    };

    const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
    if (loading || !spot) return <div className="text-center p-20 text-gray-500 font-bold">로딩 중...</div>;

    const currentTypeInfo = getSpotTypeInfo(spot.spotType);
    const googleMapsUrl = spot.googleMapUrl || `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;

    return (
        <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['maps', 'marker']} language="ko">
            <div className="max-w-6xl mx-auto p-4 md:p-8 pb-32 space-y-6 bg-gray-50/30 min-h-screen">

                {/* 🏠 메인 정보 카드 */}
                <div className="bg-white rounded-[2rem] shadow-xl border border-white overflow-hidden flex flex-col lg:flex-row min-h-[450px]">
                    <div className="lg:w-2/3 p-6 md:p-10 space-y-6">
                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <button onClick={() => navigate('/spots')} className="text-blue-500 font-bold text-sm hover:underline transition-all">← 목록</button>
                                <button onClick={handleToggleVisit} className={`px-4 py-1.5 rounded-full text-[10px] font-black border transition-all ${spot.isVisit ? 'bg-green-500 text-white border-green-500 shadow-md' : 'bg-white text-orange-500 border-orange-200'}`}>
                                    {spot.isVisit ? '✓ 방문 완료' : '+ 방문 체크'}
                                </button>
                            </div>

                            {isEditing ? (
                                <div className="space-y-4 animate-in fade-in">
                                    <input className="w-full text-3xl md:text-5xl font-black p-2 border-b-4 border-blue-100 focus:border-blue-500 outline-none bg-transparent" value={editForm.spotName} onChange={e => setEditForm({...editForm, spotName: e.target.value})} autoFocus />
                                    <select className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm outline-none" value={editForm.spotType} onChange={e => setEditForm({...editForm, spotType: e.target.value as SpotType})}>
                                        {Object.entries(SPOT_TYPE_INFO).map(([key, info]) => (
                                            <option key={key} value={key}>{info.icon} {info.label}</option>
                                        ))}
                                    </select>
                                    <textarea className="w-full p-4 bg-gray-50 rounded-xl text-sm outline-none min-h-[100px] resize-none" value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} placeholder="설명을 입력하세요." />
                                    <div className="flex gap-2">
                                        <button onClick={handleUpdateSpot} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-200">저장</button>
                                        <button onClick={() => setIsEditing(false)} className="bg-gray-100 text-gray-500 px-6 py-2.5 rounded-xl font-bold text-sm">취소</button>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <h1 className="text-3xl md:text-5xl font-black text-gray-900 leading-tight break-keep tracking-tight">{spot.spotName}</h1>
                                    <div className="flex flex-wrap items-center gap-3 mt-4">
                                        <span className={`px-4 py-2 rounded-xl text-sm font-black shadow-sm flex items-center gap-2 ${currentTypeInfo.color}`}>
                                            {currentTypeInfo.icon} {currentTypeInfo.label}
                                        </span>
                                        <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="bg-white text-blue-600 border border-blue-50 px-4 py-2 rounded-xl font-bold text-sm hover:bg-blue-50 transition-colors flex items-center gap-2 shadow-sm">🗺️ 구글 지도</a>
                                        <button onClick={() => setIsEditing(true)} className="text-gray-400 font-bold text-xs hover:text-blue-500 px-2 transition-colors flex items-center gap-1">✏️ 정보 수정</button>
                                    </div>
                                    <p className="text-gray-500 text-base md:text-lg font-medium border-t border-gray-100 mt-6 pt-6 leading-relaxed italic">
                                        {spot.description || "등록된 설명이 없습니다."}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="w-full lg:w-1/3 h-[350px] md:h-auto border-b lg:border-b-0 lg:border-l border-gray-100 relative bg-gray-200 order-1 lg:order-2">
                        {GOOGLE_MAPS_API_KEY && spot && (
                            <Map defaultCenter={{ lat: spot.lat, lng: spot.lng }} defaultZoom={15} mapId="SPOT_HERO" disableDefaultUI={true} className="w-full h-full">
                                <AdvancedMarker position={{ lat: spot.lat, lng: spot.lng }}>
                                    <Pin background={currentTypeInfo.hex} glyphColor={'#fff'} borderColor={currentTypeInfo.hex} scale={1.2} />
                                </AdvancedMarker>
                            </Map>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-8 space-y-6">
                        {/* 🕒 방문 히스토리 */}
                        <div className="bg-white rounded-[2rem] p-6 md:p-8 border border-gray-100 shadow-sm">
                            <h3 className="text-xl md:text-2xl font-black text-gray-900 mb-8 flex items-center gap-3">
                                <span className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center text-lg">🗓</span> 방문 히스토리
                            </h3>
                            {spot.isVisit && spot.spotVisitHistory?.length > 0 ? (
                                <div className="relative border-l-2 border-blue-100 ml-4 pl-8 space-y-8">
                                    {spot.spotVisitHistory.map((h) => (
                                        <div key={h.id} className="relative group cursor-pointer" onClick={() => navigate(!h.planId ? `/days/${h.dayId}` : `/plans/${h.planId}`)}>
                                            <div className="absolute -left-[33px] top-1 w-4 h-4 rounded-full bg-blue-500 border-4 border-white shadow-sm" />
                                            <div className="bg-gray-50 p-4 md:p-5 rounded-2xl border border-gray-100 group-hover:bg-white group-hover:shadow-lg transition-all">
                                                <span className="text-[10px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full mb-2 inline-block uppercase tracking-widest">{h.visitedAt}</span>
                                                <h4 className="font-black text-gray-800 text-lg">{!h.planId ? `[개별 일정] ${h.dayName}` : h.planName}</h4>
                                                {h.planId && <p className="text-xs text-gray-400 font-bold mt-1 uppercase tracking-tighter">{h.dayName} 스케줄</p>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-16 text-center bg-gray-50 rounded-3xl border border-dashed border-gray-200 text-gray-400 font-bold italic">기록이 없습니다.</div>
                            )}
                        </div>

                        {/* 🛍️ 쇼핑 리스트 섹션 */}
                        <div className="bg-white rounded-[2rem] p-6 md:p-8 border border-gray-100 shadow-sm min-h-[400px]">
                            <div className="flex justify-between items-center mb-8 px-2">
                                <h3 className="text-xl md:text-2xl font-black text-gray-900 flex items-center gap-3">
                                    <span className="w-10 h-10 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center text-lg">🛍</span> 쇼핑 리스트
                                </h3>
                                <button onClick={() => setIsAddingPurchase(!isAddingPurchase)} className={`px-5 py-2 rounded-xl font-bold text-xs transition-all shadow-md active:scale-95 ${isAddingPurchase ? 'bg-gray-100 text-gray-500' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                                    {isAddingPurchase ? '닫기' : '+ 새 아이템'}
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-2">
                                {/* ✅ 분리된 카드 컴포넌트 적용: 새 아이템 추가 */}
                                {isAddingPurchase && (
                                    <PurchaseCard
                                        mode="add"
                                        form={newPurchase}
                                        onChange={(updates) => setNewPurchase(prev => ({ ...prev, ...updates }))}
                                        onSave={handleAddPurchase}
                                        onCancel={() => setIsAddingPurchase(false)}
                                        getStatusInfo={getStatusInfo}
                                    />
                                )}

                                {/* ✅ 분리된 카드 컴포넌트 적용: 리스트 조회 및 수정 */}
                                {spot.purchases.map((p: SpotPurchaseResponse) => (
                                    <PurchaseCard
                                        key={p.id}
                                        mode={editingPurchaseId === p.id ? 'edit' : 'view'}
                                        data={p}
                                        form={editPurchaseForm}
                                        onChange={(updates) => setEditPurchaseForm(prev => ({ ...prev, ...updates }))}
                                        onSave={() => handleUpdatePurchase(p.id)}
                                        onCancel={() => setEditingPurchaseId(null)}
                                        onDelete={handleDeletePurchase}
                                        onEditMode={(item) => {
                                            setEditingPurchaseId(item.id);
                                            setEditPurchaseForm(item);
                                        }}
                                        getStatusInfo={getStatusInfo}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-4 space-y-6">
                        {/* 📋 사이드바: 그룹 태그 */}
                        <div className="bg-white rounded-[2rem] p-6 border border-gray-100 shadow-sm">
                            <div className="flex justify-between items-center mb-6 px-1">
                                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">그룹 태그</h3>
                                <button onClick={() => setIsGroupModalOpen(true)} className="text-blue-500 font-black text-xs hover:underline transition-all">편집</button>
                            </div>
                            <div className="flex flex-wrap gap-2.5">
                                {spot.groupName.length > 0 ? spot.groupName.map((name, idx) => (
                                    <span key={idx} className="bg-blue-50/50 text-blue-600 px-4 py-2 rounded-2xl text-xs font-black border border-blue-100/50 shadow-sm">#{name.toUpperCase()}</span>
                                )) : <span className="text-gray-300 text-xs italic font-bold">지정된 그룹 없음</span>}
                            </div>
                        </div>

                        {/* 📋 사이드바: 장소 상세 정보 */}
                        <div className="bg-white rounded-[2rem] p-6 border border-gray-100 shadow-sm space-y-10">
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">장소 상세 정보</h3>
                            <div className="space-y-8 px-1">
                                <div className="space-y-2">
                                    <p className="text-[10px] font-black text-blue-500 uppercase mb-1 tracking-widest">기본 주소</p>
                                    <p className="text-gray-900 font-bold text-sm leading-relaxed break-keep">{spot.shortAddress || spot.address}</p>
                                    {spot.shortAddress && <p className="text-[11px] text-gray-400 font-medium leading-relaxed">{spot.address}</p>}
                                </div>
                                {spot.website && (
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black text-blue-500 uppercase mb-1 tracking-widest">홈페이지</p>
                                        <a href={spot.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-bold underline transition break-all text-xs">{spot.website}</a>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <SpotGroupModal isOpen={isGroupModalOpen} onClose={() => setIsGroupModalOpen(false)} currentGroups={spot.groupName} onSave={handleSaveGroups} />
            </div>
        </APIProvider>
    );
}
//todo: user metadata, spotUser metadata 구분