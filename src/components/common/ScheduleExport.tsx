import { useState, useEffect, useCallback, useMemo } from "react";
import { Map, useMap, AdvancedMarker, Pin } from "@vis.gl/react-google-maps";
import { addTime } from "../../utils/scheduleUtils";
import { getSpotTypeInfo } from "../../utils/spotUtils";
import type { DayScheduleResponse } from "../../types/schedule";
import type { ExportOptions, ExportSection } from "./scheduleExportUtils";

// 🛠️ [유틸] 메모 파싱용 (인저리 타임 태그만 처리)
const getInjuryTime = (memo: string, tag: string) => {
    const regex = new RegExp(`${tag}\\s*(\\d+)`);
    const match = memo?.match(regex);
    return match ? parseInt(match[1], 10) : 0;
};

// #si: #mi: #visited 등 시스템 태그만 제거
const cleanMemoTags = (memo: string) => {
    if (!memo) return '';
    return memo.replace(/#si:\s*\d+/g, '').replace(/#mi:\s*\d+/g, '').replace(/#visited/g, '').trim();
};

// 🎨 [View 1] 단일 일정 저장용
export const DayScheduleExportView = ({ dayName, subTitle, memo, schedules, options, mapUrl }: {
    dayName: string;
    subTitle?: string;
    memo: string;
    schedules: DayScheduleResponse[];
    options: ExportOptions;
    mapUrl?: string | null;
}) => {
    return (
        <div className="w-[600px] bg-white flex flex-col font-sans text-gray-800 p-0 text-left border border-gray-100">
            <div className="h-2 bg-blue-600 w-full" />
            <div className="p-10 pb-6">
                {options.header && (
                    <div className="mb-8">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest">Day Schedule</span>
                        </div>
                        {subTitle && <h2 className="text-lg font-bold text-gray-400 mb-1 leading-none">{subTitle}</h2>}
                        <h1 className="text-4xl font-black text-gray-900 leading-tight mb-4 break-keep">{dayName || "나의 일정"}</h1>
                        {memo && (
                            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Note.</span>
                                <p className="text-gray-600 text-sm font-medium leading-relaxed whitespace-pre-wrap">{memo}</p>
                            </div>
                        )}
                    </div>
                )}
                {options.map && mapUrl && (
                    <div className="mb-10 rounded-3xl overflow-hidden shadow-2xl border border-white relative ring-1 ring-gray-100">
                        <img key={mapUrl} src={mapUrl} alt="Map" className="w-full h-[350px] object-cover" crossOrigin="anonymous" />
                    </div>
                )}
                {options.schedule && <ScheduleList schedules={schedules} />}
            </div>
            <Footer />
        </div>
    );
};

// 🎨 [View 2] 전체 일정 저장용
export const PlanScheduleExportView = ({ planTitle, planMemo, sections, options, mapUrl }: {
    planTitle: string; planMemo: string; sections: ExportSection[]; options: ExportOptions; mapUrl?: string | null;
}) => {
    return (
        <div className="w-[600px] bg-white flex flex-col font-sans text-gray-800 p-0 text-left border border-gray-100">
            <div className="h-3 bg-blue-600 w-full" />
            <div className="p-10 pb-6">
                {options.header && (
                    <div className="mb-8">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="bg-blue-100 text-blue-600 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">Travel Log</span>
                        </div>
                        <h1 className="text-4xl font-black text-gray-900 leading-tight mb-4 break-keep">{planTitle || "나의 여행"}</h1>
                        {planMemo && (
                            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 mb-6">
                                <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Trip Note.</span>
                                <p className="text-gray-600 text-sm font-medium leading-relaxed whitespace-pre-wrap">{planMemo}</p>
                            </div>
                        )}
                    </div>
                )}
                {options.map && mapUrl && (
                    <div className="mb-12 rounded-3xl overflow-hidden shadow-xl border border-white relative ring-1 ring-gray-100">
                        <img key={mapUrl} src={mapUrl} alt="Map" className="w-full h-[350px] object-cover" crossOrigin="anonymous" />
                    </div>
                )}
                {options.schedule && sections.map((section) => (
                    <div key={section.id} className="mb-10 last:mb-0">
                        <div className="flex items-center gap-3 mb-6 pb-2 border-b-2 border-gray-100">
                            <span className="text-2xl font-black text-blue-600">{section.title}</span>
                            {section.memo && <span className="text-sm font-medium text-gray-400 truncate max-w-[400px]">{section.memo}</span>}
                        </div>
                        <ScheduleList schedules={section.schedules} />
                        {section.schedules.length === 0 && <div className="text-center py-4 text-xs text-gray-300 italic">일정이 없습니다.</div>}
                    </div>
                ))}
            </div>
            <Footer />
        </div>
    );
};

// ♻️ 스케줄 리스트 (DTO 필드 직접 사용)
const ScheduleList = ({ schedules }: { schedules: DayScheduleResponse[] }) => {
    return (
        <div className="space-y-0 relative">
            {schedules.map((item, idx) => {
                // ✅ [변경] spotName, spotType 필드 직접 사용
                const displaySpotName = item.spotName || "장소 미지정";
                const typeInfo = getSpotTypeInfo(item.spotType || 'OTHER');

                const cleanMemo = cleanMemoTags(item.memo);
                const transportIcons: Record<string, string> = { WALK: '🚶', BUS: '🚌', TRAIN: '🚃', TAXI: '🚕', CAR: '🚗', SHIP: '🚢', AIRPLANE: '✈️' };

                const moveInjury = getInjuryTime(item.movingMemo, '#mi:');
                const pureMovingDuration = Math.max(0, item.movingDuration - moveInjury);
                const endTime = item.startTime ? addTime(item.startTime, item.duration) : null;

                return (
                    <div key={idx} className="flex relative group">
                        {idx !== schedules.length - 1 && <div className="absolute left-[79px] top-10 bottom-0 w-[2px] border-l-2 border-dashed border-gray-100" />}
                        <div className="w-[80px] pt-1.5 pr-6 text-right shrink-0 flex flex-col items-end">
                            <span className="text-sm font-black text-blue-600 font-mono tracking-tighter leading-none">{item.startTime?.substring(0, 5)}</span>
                            {endTime && <span className="text-[10px] font-bold text-gray-300 font-mono mt-1 leading-none">{endTime.substring(0, 5)}</span>}
                        </div>
                        <div className="relative z-10 w-4 flex justify-center pt-[10px] shrink-0">
                            <div className="w-2.5 h-2.5 rounded-full bg-white border-2 border-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.1)]" />
                        </div>
                        <div className="flex-1 pl-6 pb-12">
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded uppercase tracking-wider">{typeInfo.label}</span>
                                {pureMovingDuration > 0 && <span className="text-[9px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded flex items-center gap-1">{transportIcons[item.transportation] || '➡️'} {pureMovingDuration}분 이동</span>}
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-1.5 break-all">{displaySpotName}</h3>
                            {cleanMemo && <p className="text-xs text-gray-500 leading-relaxed font-medium bg-gray-50/50 p-2 rounded-lg">{cleanMemo}</p>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const Footer = () => (
    <div className="px-10 py-8 mt-4 border-t border-gray-100 flex justify-between items-end bg-gray-50/50">
        <div>
            <span className="text-[10px] font-black text-gray-400 tracking-[0.2em] uppercase block mb-1">Your Unique Memory Expedition</span>
            <span className="text-[12px] font-black text-blue-600 tracking-widest uppercase">YUME • Travel log</span>
        </div>
        <div className="text-[10px] font-bold text-gray-300">PLAN YOUR TRIP</div>
    </div>
);

// ✅ 모달 내부용 Interactive Map Controller (DTO 필드 직접 사용)
const ModalMapController = ({ points, onStateChange }: {
    points: { lat: number, lng: number }[],
    onStateChange: (state: { center: { lat: number, lng: number }, zoom: number }) => void
}) => {
    const map = useMap();
    useEffect(() => {
        if (!map || points.length === 0) return;
        const bounds = new google.maps.LatLngBounds();
        points.forEach(p => bounds.extend(p));
        map.fitBounds(bounds);
    }, [map, points]);

    const handleCameraChanged = useCallback(() => {
        if (!map) return;
        const center = map.getCenter();
        const zoom = map.getZoom();
        if (center && zoom) {
            onStateChange({ center: { lat: center.lat(), lng: center.lng() }, zoom: zoom });
        }
    }, [map, onStateChange]);

    useEffect(() => {
        if (!map) return;
        const listener = map.addListener('idle', handleCameraChanged);
        return () => google.maps.event.removeListener(listener);
    }, [map, handleCameraChanged]);

    return null;
};

// 🛠️ 모달 컴포넌트
export const ImageExportModal = ({ isOpen, onClose, onConfirm, options, setOptions, schedules }: {
    isOpen: boolean; onClose: () => void;
    onConfirm: (mapState?: { center: { lat: number, lng: number }, zoom: number }) => void;
    options: ExportOptions; setOptions: (o: ExportOptions) => void;
    schedules: DayScheduleResponse[];
}) => {
    const [mapState, setMapState] = useState<{ center: { lat: number, lng: number }, zoom: number } | undefined>(undefined);
    const points = useMemo(
        () => schedules
            .map(schedule => ({ lat: schedule.lat, lng: schedule.lng }))
            .filter(point =>
                point.lat !== 0
                && point.lng !== 0
                && point.lat != null
                && point.lng != null
            ),
        [schedules]
    );

    if (!isOpen) return null;

    const isValid = options.map || options.schedule;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-left">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                <h3 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-2">📸 이미지 저장 설정</h3>

                {options.map && (
                    <div className="w-full h-[250px] bg-gray-100 rounded-xl overflow-hidden mb-6 relative border border-gray-200">
                        <Map
                            mapId="EXPORT_PREVIEW_MAP"
                            defaultCenter={{ lat: 35.6895, lng: 139.6917 }}
                            defaultZoom={10}
                            disableDefaultUI={true}
                            gestureHandling={'cooperative'}
                            className="w-full h-full"
                        >
                            <ModalMapController points={points} onStateChange={setMapState} />
                            {points.map((p, i) => (
                                <AdvancedMarker key={i} position={p}>
                                    <Pin background={'#3B82F6'} glyphColor={'white'} borderColor={'#2563EB'} scale={0.8} />
                                </AdvancedMarker>
                            ))}
                        </Map>
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 text-white text-[10px] px-3 py-1 rounded-full pointer-events-none">지도를 움직여 저장할 범위를 맞추세요</div>
                    </div>
                )}

                <div className="space-y-3 mb-6 overflow-y-auto flex-1 px-1">
                    <label className="flex items-center justify-between p-3 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-50 transition shadow-sm"><span className="text-sm font-bold text-gray-700">🏷️ 제목 및 메모</span><input type="checkbox" className="w-5 h-5 accent-blue-600 rounded cursor-pointer" checked={options.header} onChange={e => setOptions({...options, header: e.target.checked})} /></label>
                    <label className="flex items-center justify-between p-3 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-50 transition shadow-sm"><span className="text-sm font-bold text-gray-700">🗺️ 지도 경로 포함</span><input type="checkbox" className="w-5 h-5 accent-blue-600 rounded cursor-pointer" checked={options.map} onChange={e => setOptions({...options, map: e.target.checked})} /></label>
                    <label className="flex items-center justify-between p-3 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-50 transition shadow-sm"><span className="text-sm font-bold text-gray-700">⏱️ 상세 타임라인</span><input type="checkbox" className="w-5 h-5 accent-blue-600 rounded cursor-pointer" checked={options.schedule} onChange={e => setOptions({...options, schedule: e.target.checked})} /></label>
                </div>

                {!isValid && <p className="text-xs text-red-500 font-bold mb-4 text-center animate-pulse">⚠️ 지도 또는 일정 중 하나는 반드시 선택해야 합니다.</p>}

                <div className="flex gap-2 shrink-0">
                    <button onClick={onClose} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-gray-500 hover:bg-gray-200 transition">취소</button>
                    <button onClick={() => onConfirm(mapState)} disabled={!isValid} className={`flex-[2] py-3 text-white rounded-xl font-bold shadow-md transition ${isValid ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed'}`}>이대로 저장하기</button>
                </div>
            </div>
        </div>
    );
};
