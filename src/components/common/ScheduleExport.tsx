import { useState } from "react";
import { toPng } from "html-to-image";
// ✅ 종료 시간 계산을 위해 addTime 유틸 임포트
import { addTime } from "../../utils/scheduleUtils";
import { getSpotTypeInfo } from "../../utils/spotUtils";
import type { DayScheduleResponse } from "../../types/schedule";
import type { SpotType } from "../../types/enums";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const TEMP_SPOT_PREFIX = " #tmp:";

// 🛠️ 파싱 및 유틸리티 함수들 (기존 유지)
export const decodeTempSpot = (memo: string) => {
    if (!memo) return null;
    const idx = memo.indexOf(TEMP_SPOT_PREFIX);
    if (idx === -1) return null;
    try {
        const jsonStr = memo.substring(idx + TEMP_SPOT_PREFIX.length);
        const data = JSON.parse(jsonStr);
        return { name: data.n, type: data.t as SpotType, lat: data.la, lng: data.lo };
    } catch { return null; }
};

const getInjuryTime = (memo: string, tag: string) => {
    const regex = new RegExp(`${tag}\\s*(\\d+)`);
    const match = memo?.match(regex);
    return match ? parseInt(match[1], 10) : 0;
};

const cleanMemoTags = (memo: string) => {
    if (!memo) return '';
    return memo.replace(/#si:\s*\d+/g, '').replace(/#mi:\s*\d+/g, '').replace(/#visited/g, '').split(TEMP_SPOT_PREFIX)[0].trim();
};

export const getStaticMapUrl = (schedules: DayScheduleResponse[]) => {
    const points = schedules
        .map((s, idx) => {
            const temp = decodeTempSpot(s.memo);
            const lat = temp ? temp.lat : (s.lat || s.spot?.lat);
            const lng = temp ? temp.lng : (s.lng || s.spot?.lng);
            return { lat, lng, index: idx + 1 };
        })
        .filter(p => p.lat && p.lng);

    if (points.length === 0) return null;
    const baseUrl = "https://maps.googleapis.com/maps/api/staticmap";
    const markers = points.map(p => `markers=color:blue%7Clabel:${p.index}%7C${p.lat},${p.lng}`).join("&");
    const path = `path=color:0x3B82F6ff|weight:5|${points.map(p => `${p.lat},${p.lng}`).join("|")}`;
    return `${baseUrl}?size=600x400&scale=2&maptype=roadmap&${markers}&${path}&key=${GOOGLE_MAPS_API_KEY}`;
};

export interface ExportOptions { header: boolean; map: boolean; schedule: boolean; }

// 🎨 [디자인 업데이트] 종료 시간이 포함된 Export 뷰
export const ScheduleExportView = ({ dayName, memo, schedules, options, mapUrl }: {
    dayName: string; memo: string; schedules: DayScheduleResponse[]; options: ExportOptions; mapUrl?: string | null;
}) => {
    return (
        <div className="w-[600px] bg-white flex flex-col font-sans text-gray-800 p-0 text-left border border-gray-100">
            <div className="h-2 bg-blue-600 w-full" />

            <div className="p-10 pb-6">
                {options.header && (
                    <div className="mb-8">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest">Day Schedule</span>
                        </div>
                        <h1 className="text-4xl font-black text-gray-900 leading-tight mb-4 break-keep">{dayName || "나의 일정"}</h1>
                        {memo && (
                            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Note.</span>
                                <p className="text-gray-600 text-sm font-medium leading-relaxed whitespace-pre-wrap">{memo}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ✅ 지도 렌더링 조건: map 옵션이 켜져있고 URL이 있을 때 */}
                {options.map && mapUrl && (
                    <div className="mb-10 rounded-3xl overflow-hidden shadow-2xl border border-white relative ring-1 ring-gray-100">
                        {/* crossOrigin="anonymous" 추가하여 외부 이미지 오염 방지 */}
                        <img src={mapUrl} alt="Map" className="w-full h-[350px] object-cover" crossOrigin="anonymous" />
                    </div>
                )}

                {/* ✅ 일정 렌더링 조건: schedule 옵션이 켜져있을 때 */}
                {options.schedule && (
                    <div className="space-y-0 relative">
                        {schedules.map((item, idx) => {
                            const temp = decodeTempSpot(item.memo);
                            const type = getSpotTypeInfo(item.spotType || temp?.type || 'OTHER');
                            const cleanMemo = cleanMemoTags(item.memo);
                            const transportIcons: Record<string, string> = { WALK: '🚶', BUS: '🚌', TRAIN: '🚃', TAXI: '🚕', SHIP: '🚢', AIRPLANE: '✈️' };

                            // ✅ 종료 시간 계산
                            const moveInjury = getInjuryTime(item.movingMemo, '#mi:');
                            const pureMovingDuration = Math.max(0, item.movingDuration - moveInjury);
                            const endTime = item.startTime ? addTime(item.startTime, item.duration) : null;

                            return (
                                <div key={idx} className="flex relative group">
                                    {idx !== schedules.length - 1 && (
                                        <div className="absolute left-[79px] top-10 bottom-0 w-[2px] border-l-2 border-dashed border-gray-100" />
                                    )}

                                    {/* 시간 영역 (시작 - 종료 시간 표시) */}
                                    <div className="w-[80px] pt-1.5 pr-6 text-right shrink-0 flex flex-col items-end">
                                        <span className="text-sm font-black text-blue-600 font-mono tracking-tighter leading-none">
                                            {item.startTime?.substring(0, 5)}
                                        </span>
                                        {endTime && (
                                            <span className="text-[10px] font-bold text-gray-300 font-mono mt-1 leading-none">
                                                {endTime.substring(0, 5)}
                                            </span>
                                        )}
                                    </div>

                                    <div className="relative z-10 w-4 flex justify-center pt-[10px] shrink-0">
                                        <div className="w-2.5 h-2.5 rounded-full bg-white border-2 border-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.1)]" />
                                    </div>

                                    <div className="flex-1 pl-6 pb-12">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                                {type.label}
                                            </span>
                                            {pureMovingDuration > 0 && (
                                                <span className="text-[9px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                                                    {transportIcons[item.transportation] || '➡️'} {pureMovingDuration}분 이동
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900 mb-1.5 break-all">
                                            {item.spotName || temp?.name || "장소 미지정"}
                                        </h3>
                                        {cleanMemo && (
                                            <p className="text-xs text-gray-500 leading-relaxed font-medium">
                                                {cleanMemo}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="px-10 py-8 mt-4 border-t border-gray-100 flex justify-between items-end bg-gray-50/50">
                <div>
                    <span className="text-[10px] font-black text-gray-400 tracking-[0.2em] uppercase block mb-1">Your Unique Memory Expedition</span>
                    <span className="text-[12px] font-black text-blue-600 tracking-widest uppercase">YUME • Travel log</span>
                </div>
                <div className="text-[10px] font-bold text-gray-300">PLAN YOUR TRIP</div>
            </div>
        </div>
    );
};

// 🛠️ 모달 컴포넌트 (유효성 검사 추가)
export const ImageExportModal = ({ isOpen, onClose, onConfirm, options, setOptions, mapUrl }: {
    isOpen: boolean; onClose: () => void; onConfirm: () => void; options: ExportOptions; setOptions: (o: ExportOptions) => void; mapUrl: string | null;
}) => {
    if (!isOpen) return null;

    // ✅ 유효성 검사: 지도 또는 일정 중 하나는 선택되어야 함
    const isValid = options.map || options.schedule;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 text-left">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in fade-in zoom-in duration-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4">📸 이미지 저장 옵션</h3>
                <div className="space-y-3 mb-6">
                    <label className="flex items-center justify-between p-3 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-50 transition shadow-sm">
                        <span className="text-sm font-bold text-gray-700">🏷️ 제목 및 메모</span>
                        <input type="checkbox" className="w-5 h-5 accent-blue-600 rounded cursor-pointer" checked={options.header} onChange={e => setOptions({...options, header: e.target.checked})} />
                    </label>
                    <label className="flex items-center justify-between p-3 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-50 transition shadow-sm">
                        <span className="text-sm font-bold text-gray-700">🗺️ 지도 경로 포함</span>
                        <input type="checkbox" className="w-5 h-5 accent-blue-600 rounded cursor-pointer" checked={options.map} onChange={e => setOptions({...options, map: e.target.checked})} />
                    </label>
                    <label className="flex items-center justify-between p-3 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-50 transition shadow-sm">
                        <span className="text-sm font-bold text-gray-700">⏱️ 상세 타임라인</span>
                        <input type="checkbox" className="w-5 h-5 accent-blue-600 rounded cursor-pointer" checked={options.schedule} onChange={e => setOptions({...options, schedule: e.target.checked})} />
                    </label>
                </div>

                {/* ⚠️ 경고 메시지 */}
                {!isValid && (
                    <p className="text-xs text-red-500 font-bold mb-4 text-center animate-pulse">
                        ⚠️ 지도 또는 일정 중 하나는 반드시 선택해야 합니다.
                    </p>
                )}

                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-gray-500 hover:bg-gray-200 transition">취소</button>
                    <button
                        onClick={onConfirm}
                        disabled={!isValid}
                        className={`flex-[2] py-3 text-white rounded-xl font-bold shadow-md transition ${isValid ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed'}`}
                    >
                        저장하기
                    </button>
                </div>
            </div>
        </div>
    );
};

export const useScheduleExport = () => {
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportOptions, setExportOptions] = useState<ExportOptions>({ header: true, map: true, schedule: true });
    const openExportModal = () => setIsExportModalOpen(true);
    const closeExportModal = () => setIsExportModalOpen(false);

    const handleSaveImage = async (filename: string, element: HTMLElement | null) => {
        if (!element) return;
        try {
            // ✅ [수정] skipFonts: true 옵션 추가로 CSSRules 에러 방지
            const dataUrl = await toPng(element, {
                backgroundColor: '#ffffff',
                cacheBust: true,
                pixelRatio: 2,
                skipFonts: true // 외부 폰트 로딩 시 CORS 에러 발생 방지
            });
            const link = document.createElement("a");
            link.download = `${filename}.png`;
            link.href = dataUrl;
            link.click();
            closeExportModal();
        } catch (err) {
            console.error("이미지 저장 실패:", err);
            alert("이미지 저장 중 오류가 발생했습니다. (외부 리소스 제한)");
        }
    };
    return { isExportModalOpen, openExportModal, closeExportModal, exportOptions, setExportOptions, handleSaveImage };
};