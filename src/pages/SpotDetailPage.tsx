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
import {AdvancedMarker, APIProvider, Map, Pin} from "@vis.gl/react-google-maps";

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
    const {id} = useParams<{ id: string }>();
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

    useEffect(() => {
        fetchDetail();
    }, [id]);

    // 2. 방문 여부 토글 (즉시 저장)
    const handleToggleVisit = async () => {
        if (!spot || !id) return;
        const newIsVisit = !spot.isVisit;

        try {
            const updateReq: SpotUpdateRequest = {...form, isVisit: newIsVisit};
            await updateSpot(Number(id), updateReq);

            // UI 즉시 업데이트
            setSpot({...spot, isVisit: newIsVisit});
            setForm({...form, isVisit: newIsVisit});
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
        } catch {
            alert("수정 실패");
        }
    };

    // 4. 구매 내역 저장/삭제
    const handleSavePurchase = async (req: SpotPurchaseSaveRequest) => {
        if (!id) return;
        try {
            if (selectedPurchase) {
                await updatePurchase(selectedPurchase.id, req);
            } else {
                await createPurchase(Number(id), req);
            }
            fetchDetail();
        } catch {
            alert("저장 실패");
        }
    };

    const handleDeletePurchase = async (pId: number) => {
        if (window.confirm("삭제하시겠습니까?")) {
            try {
                await deletePurchase(pId);
                fetchDetail();
            } catch {
                alert("삭제 실패");
            }
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
                if (!group) group = await createGroup({groupName: name});
                await addSpotToGroup(group.id, spotId);
            }
            fetchDetail();
            setIsGroupModalOpen(false);
        } catch {
            alert("태그 저장 실패");
        }
    };

    const openAddPurchaseModal = () => {
        setSelectedPurchase(null);
        setIsPurchaseModalOpen(true);
    };
    const openEditPurchaseModal = (p: SpotPurchaseResponse) => {
        setSelectedPurchase(p);
        setIsPurchaseModalOpen(true);
    };
    const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
    if (loading || !spot) return <div className="text-center p-20 text-gray-500">로딩 중... ⏳</div>;

    const googleMapsUrl = spot.googleMapUrl && spot.googleMapUrl.startsWith('http')
        ? spot.googleMapUrl
        : `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;

    return (
        <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['maps', 'marker']} language="ko" region="KR">
            <div className="max-w-6xl mx-auto p-4 md:p-8 pb-32 space-y-8 bg-gray-50/30 min-h-screen">

                {/* 🏠 1. 상단 매거진 헤더 (Management 통합형) */}
                <div className="bg-white rounded-[2rem] shadow-xl shadow-blue-900/5 overflow-hidden border border-white">
                    <div className="flex flex-col lg:flex-row h-full">
                        <div className="lg:w-2/3 p-8 md:p-12 space-y-6 relative">
                            <div className="flex justify-between items-start">
                                <div className="space-y-3">
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => navigate('/spots')} className="text-blue-500 hover:text-blue-700 font-black text-sm flex items-center gap-1 transition">
                                            <span className="text-lg">←</span> BACK
                                        </button>
                                        {/* 방문 상태 토글 버튼 */}
                                        <button
                                            onClick={handleToggleVisit}
                                            className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase border transition-all shadow-sm ${
                                                spot.isVisit ? 'bg-green-500 text-white border-green-500 hover:bg-green-600' : 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-500 hover:text-white'
                                            }`}
                                        >
                                            {spot.isVisit ? '✓ Visited' : '+ Mark Visit'}
                                        </button>
                                    </div>
                                    <h1 className="text-5xl md:text-6xl font-black text-gray-900 leading-none break-keep">
                                        {spot.spotName}
                                    </h1>
                                </div>
                                {/* 우측 상단 편집 아이콘 */}
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="p-3 bg-gray-50 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all shadow-sm group"
                                    title="Edit Information"
                                >
                                    <span className="text-xl group-hover:scale-110 transition-transform block">✏️</span>
                                </button>
                            </div>

                            <div className="flex flex-wrap gap-4 pt-4">
                                <div className="flex items-center gap-2 bg-gray-100 px-4 py-2 rounded-2xl">
                                    <span className="text-xl">{SPOT_TYPES.find(t => t.value === spot.spotType)?.label.split(' ')[0]}</span>
                                    <span className="text-sm font-bold text-gray-700">{SPOT_TYPES.find(t => t.value === spot.spotType)?.label.split(' ')[1]}</span>
                                </div>
                                {/* ✅ 보정된 구글맵 링크 사용 */}
                                <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-2xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200">
                                    🗺️ OPEN GOOGLE MAPS
                                </a>
                            </div>

                            <div className="pt-8 border-t border-gray-100">
                                <p className="text-gray-500 text-lg font-medium leading-relaxed italic">
                                    {spot.description }
                                </p>
                            </div>
                        </div>

                        {/* 헤더 오른쪽: 미니맵 */}
                        <div className="lg:w-1/3 min-h-[300px] lg:min-h-full border-l border-gray-100 relative group">
                            <Map
                                defaultCenter={{ lat: spot.lat, lng: spot.lng }}
                                defaultZoom={16}
                                disableDefaultUI={true}
                                mapId="SPOT_HERO_MAP"
                                className="w-full h-full"
                            >
                                <AdvancedMarker position={{ lat: spot.lat, lng: spot.lng }}>
                                    <div className="relative">
                                        <div className="absolute -top-12 -left-6 bg-white px-3 py-1 rounded-full shadow-xl border border-blue-500 font-black text-xs text-blue-600 whitespace-nowrap uppercase tracking-tighter">Current Location</div>
                                        <Pin background={'#3b82f6'} glyphColor={'#fff'} borderColor={'#1d4ed8'} scale={1.2} />
                                    </div>
                                </AdvancedMarker>
                            </Map>
                            <div className="absolute bottom-6 right-6 pointer-events-none">
                                <div className="bg-white/80 backdrop-blur-md px-5 py-2 rounded-2xl font-black text-[11px] shadow-lg border border-white/50 flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${spot.isVisit ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                                    <span className="text-gray-600 uppercase tracking-tighter">
                                        {spot.isVisit ? 'Destination Explored' : 'Planning to Visit'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Main Column */}
                    <div className="lg:col-span-8 space-y-8">
                        {/* VISIT LOG */}
                        <div className="bg-white rounded-[2rem] p-8 md:p-10 border border-gray-100 shadow-sm">
                            <h3 className="text-2xl font-black text-gray-900 mb-8 flex items-center gap-3">
                                🕒 <span className="underline decoration-blue-500 decoration-4 underline-offset-8">VISIT LOG</span>
                            </h3>

                            {!spot.isVisit ? (
                                <div className="text-center py-16">
                                    <span className="text-6xl mb-4 block">🎒</span>
                                    <p className="text-gray-400 font-bold">You haven't visited this place yet. Ready to go?</p>
                                </div>
                            ) : spot.spotVisitHistory && spot.spotVisitHistory.length > 0 ? (
                                <div className="relative pl-8 space-y-12 before:content-[''] before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-1 before:bg-gradient-to-b before:from-blue-500 before:to-gray-100 before:rounded-full">
                                    {spot.spotVisitHistory.map((history) => (
                                        <div key={history.id} className="relative group">
                                            <div className="absolute -left-[35px] top-1.5 w-6 h-6 rounded-full bg-white border-4 border-blue-500 z-10 group-hover:scale-125 transition-transform shadow-sm" />
                                            <div
                                                className="bg-gray-50 p-6 rounded-3xl border border-gray-100 hover:border-blue-200 hover:bg-white hover:shadow-xl hover:shadow-blue-900/5 transition-all cursor-pointer"
                                                onClick={() => navigate(`/plans/${history.planId}`)}
                                            >
                                                <div className="flex justify-between items-start mb-2">
                                                    <h4 className="text-xl font-black text-gray-800 group-hover:text-blue-600 transition-colors">{history.planName}</h4>
                                                    <span className="text-sm font-mono font-bold text-blue-500">{history.visitedAt}</span>
                                                </div>
                                                <div className="inline-block bg-blue-100 text-blue-600 text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-tighter">
                                                    {history.dayName}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-8 bg-orange-50 rounded-[1.5rem] border border-orange-100 flex items-center gap-4">
                                    <span className="text-4xl">📸</span>
                                    <div>
                                        <p className="text-orange-900 font-black">Memory confirmed, but date missing</p>
                                        <p className="text-orange-700/70 text-sm font-medium leading-relaxed">It's certain you've been here, but the specific timeline isn't recorded!</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* COLLECTIONS */}
                        <div className="bg-white rounded-[2rem] p-8 md:p-10 border border-gray-100 shadow-sm">
                            <div className="flex justify-between items-center mb-8">
                                <h3 className="text-2xl font-black text-gray-900">🛍️ <span className="underline decoration-green-500 decoration-4 underline-offset-8">COLLECTIONS</span></h3>
                                <button onClick={openAddPurchaseModal} className="bg-gray-900 text-white px-5 py-2.5 rounded-2xl font-black text-xs hover:bg-gray-700 transition shadow-lg shadow-gray-200">+ ADD NEW</button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {spot.purchases.length === 0 ? (
                                    <div className="col-span-full text-center py-10 text-gray-300 font-bold italic">No items collected in this spot.</div>
                                ) : (
                                    spot.purchases.map(p => (
                                        <div key={p.id} onClick={() => openEditPurchaseModal(p)} className="group p-5 bg-white border border-gray-100 rounded-3xl hover:shadow-xl hover:shadow-blue-900/5 transition cursor-pointer relative overflow-hidden">
                                            <div className={`absolute top-0 left-0 w-1.5 h-full ${getStatusInfo(p.status).color.split(' ')[0]}`} />
                                            <div className="flex justify-between items-start mb-3">
                                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${getStatusInfo(p.status).color}`}>
                                                    {getStatusInfo(p.status).label.split(' ')[1]}
                                                </span>
                                                <button onClick={(e) => { e.stopPropagation(); handleDeletePurchase(p.id); }} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition font-bold text-xs uppercase tracking-tighter">Remove</button>
                                            </div>
                                            <h5 className="text-lg font-black text-gray-800 mb-1">{p.itemName}</h5>
                                            <p className="text-sm font-mono font-bold text-gray-400">{p.price > 0 ? `${p.price.toLocaleString()} ${p.currency}` : 'Free'} • {p.quantity} qty</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Sidebar Column */}
                    <div className="lg:col-span-4 space-y-8">
                        {/* GROUPS */}
                        <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-sm">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-sm font-black text-gray-400 tracking-widest uppercase">Groups</h3>
                                <button onClick={() => setIsGroupModalOpen(true)} className="text-blue-500 font-black text-[10px] uppercase hover:underline">Edit Groups</button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {spot.groupName.map((g, i) => (
                                    <span key={i} onClick={() => navigate(`/spots?group=${encodeURIComponent(g)}`)}
                                          className="bg-blue-50 text-blue-600 px-4 py-2 rounded-2xl text-[11px] font-black hover:bg-blue-600 hover:text-white transition cursor-pointer shadow-sm shadow-blue-900/5">
                                        #{g.toUpperCase()}
                                    </span>
                                ))}
                                {spot.groupName.length === 0 && <span className="text-gray-300 text-xs font-bold italic">No groups assigned yet.</span>}
                            </div>
                        </div>

                        {/* INFORMATION */}
                        <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-sm space-y-8">
                            <h3 className="text-sm font-black text-gray-400 tracking-widest uppercase">Place Details</h3>
                            <div className="space-y-6">
                                <div>
                                    <p className="text-[10px] font-black text-blue-500 uppercase mb-2">Location Address</p>
                                    <p className="text-gray-900 font-bold leading-relaxed break-keep text-sm">{spot.shortAddress || spot.address}</p>
                                    {spot.shortAddress && <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">{spot.address}</p>}
                                </div>
                                {spot.website && (
                                    <div>
                                        <p className="text-[10px] font-black text-blue-500 uppercase mb-2">Official Website</p>
                                        <a href={spot.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-bold underline decoration-blue-200 hover:text-blue-800 transition break-all text-xs">
                                            {spot.website}
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Modals remain the same */}
                <SpotPurchaseModal isOpen={isPurchaseModalOpen} onClose={() => setIsPurchaseModalOpen(false)} onSave={handleSavePurchase} initialData={selectedPurchase} />
                <SpotGroupModal isOpen={isGroupModalOpen} onClose={() => setIsGroupModalOpen(false)} currentGroups={spot.groupName} onSave={handleSaveGroups} />
            </div>
        </APIProvider>
    );
}