import {useState, useEffect, useCallback} from "react"; // useRef, useEffect 추가
import { toPng } from "html-to-image";
import { Map, useMap, AdvancedMarker, Pin } from "@vis.gl/react-google-maps"; // 지도 컴포넌트 추가
import { addTime } from "../../utils/scheduleUtils";
import { getSpotTypeInfo } from "../../utils/spotUtils";
import type { DayScheduleResponse } from "../../types/schedule";
import type { SpotType } from "../../types/enums";

const TEMP_SPOT_PREFIX = " #tmp:";

// ... (decodeTempSpot, getInjuryTime, cleanMemoTags 함수는 기존과 동일하게 유지) ...
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

// 🗺️ 정적 지도 쿼리 생성 함수 (center, zoom 옵션 추가)
export const getStaticMapQuery = (
    schedules: DayScheduleResponse[],
    customView?: { center: { lat: number, lng: number }, zoom: number }
) => {
    const points = schedules
        .map((s, idx) => {
            const temp = decodeTempSpot(s.memo);
            const lat = temp ? temp.lat : (s.lat || s.spot?.lat);
            const lng = temp ? temp.lng : (s.lng || s.spot?.lng);
            return { lat, lng, index: idx + 1 };
        })
        .filter(p => p.lat && p.lng);

    if (points.length === 0) return null;

    // 마커 생성 로직 (기존 동일)
    const limitedPoints = points.length > 20
        ? points.filter((_, i) => i === 0 || i === points.length - 1 || i % Math.ceil(points.length / 20) === 0)
        : points;

    const markers = limitedPoints
        .map(p => {
            let label = "";
            if (p.index < 10) label = p.index.toString();
            else if (p.index < 36) label = String.fromCharCode('A'.charCodeAt(0) + (p.index - 10));
            const labelParam = label ? `|label:${label}` : "";
            return `markers=color:blue${labelParam}|${p.lat},${p.lng}`;
        })
        .join("&");

    const pathStr = points.map(p => `${p.lat},${p.lng}`).join("|");
    const path = `path=color:0x3B82F6ff|weight:5|${pathStr}`;

    // ✅ [핵심] 사용자 지정 뷰가 있으면 해당 center/zoom 사용, 없으면 자동(fit)
    let viewParams = "";
    if (customView) {
        viewParams = `&center=${customView.center.lat},${customView.center.lng}&zoom=${customView.zoom}`;
    }

    // cacheBuster는 브라우저 캐싱 방지용
    const cacheBuster = `&_t=${Date.now()}`;

    return `size=600x400&scale=2&maptype=roadmap${viewParams}&${markers}&${path}${cacheBuster}`;
};

// ... (ExportSection 인터페이스, Export 뷰 컴포넌트들 기존과 동일하게 유지) ...
export interface ExportSection { id: number | string; title: string; memo: string; schedules: DayScheduleResponse[]; }
export interface ExportOptions { header: boolean; map: boolean; schedule: boolean; }

// (DayScheduleExportView, PlanScheduleExportView, ScheduleList, Footer 코드는 기존 유지 - 생략 가능하지만 파일 전체 적용 시 필요)
// ... [이전 답변의 뷰 컴포넌트 코드 그대로 사용] ...
// 🎨 [View 1] 단일 일정 저장용 (DayScheduleExportView)
export const DayScheduleExportView = ({ dayName, subTitle, memo, schedules, options, mapUrl }: {
    dayName: string;
    subTitle?: string; // 👈 추가됨 (선택적 prop)
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

                        {/* ✅ [추가] 서브 타이틀 (여행명 + N일차) */}
                        {subTitle && (
                            <h2 className="text-lg font-bold text-gray-400 mb-1 leading-none">
                                {subTitle}
                            </h2>
                        )}

                        {/* 메인 타이틀 (일정명) */}
                        <h1 className="text-4xl font-black text-gray-900 leading-tight mb-4 break-keep">
                            {dayName || "나의 일정"}
                        </h1>

                        {memo && (
                            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Note.</span>
                                <p className="text-gray-600 text-sm font-medium leading-relaxed whitespace-pre-wrap">{memo}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ... (지도 및 리스트 렌더링 기존 유지) */}
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

// 🎨 [View 2] 전체 일정 저장용 (PlanScheduleExportView)
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

const ScheduleList = ({ schedules }: { schedules: DayScheduleResponse[] }) => {
    return (
        <div className="space-y-0 relative">
            {schedules.map((item, idx) => {
                const temp = decodeTempSpot(item.memo);
                const type = getSpotTypeInfo(item.spotType || temp?.type || 'OTHER');
                const cleanMemo = cleanMemoTags(item.memo);
                // ... (이전 코드와 동일)
                const transportIcons: Record<string, string> = { WALK: '🚶', BUS: '🚌', TRAIN: '🚃', TAXI: '🚕', SHIP: '🚢', AIRPLANE: '✈️' };
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
                                <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded uppercase tracking-wider">{type.label}</span>
                                {pureMovingDuration > 0 && <span className="text-[9px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded flex items-center gap-1">{transportIcons[item.transportation] || '➡️'} {pureMovingDuration}분 이동</span>}
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-1.5 break-all">{item.spotName || temp?.name || "장소 미지정"}</h3>
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

// ✅ [신규] 모달 내부용 Interactive Map Controller
// 사용자가 지도를 움직일 때마다 center/zoom을 추적합니다.
const ModalMapController = ({ points, onStateChange }: {
    points: { lat: number, lng: number }[],
    onStateChange: (state: { center: { lat: number, lng: number }, zoom: number }) => void
}) => {
    const map = useMap();
    const bounds = new google.maps.LatLngBounds();

    // 초기 로딩 시 핀들에 맞게 핏 (한번만)
    useEffect(() => {
        if (!map || points.length === 0) return;
        points.forEach(p => bounds.extend(p));
        map.fitBounds(bounds);
    }, [map]); // points 의존성 제거하여 초기 1회만 동작하도록 유도 (원하는 대로 움직여야 하므로)

    // 지도 이동/줌 감지
    const handleCameraChanged = useCallback(() => {
        if (!map) return;
        const center = map.getCenter();
        const zoom = map.getZoom();
        if (center && zoom) {
            onStateChange({
                center: { lat: center.lat(), lng: center.lng() },
                zoom: zoom
            });
        }
    }, [map, onStateChange]);

    useEffect(() => {
        if (!map) return;
        const listener = map.addListener('idle', handleCameraChanged);
        return () => google.maps.event.removeListener(listener);
    }, [map, handleCameraChanged]);

    return null;
};

// 🛠️ 모달 컴포넌트 (Interactive Map 적용)
export const ImageExportModal = ({ isOpen, onClose, onConfirm, options, setOptions, schedules }: {
    isOpen: boolean; onClose: () => void;
    onConfirm: (mapState?: { center: { lat: number, lng: number }, zoom: number }) => void; // ✅ mapState 전달
    options: ExportOptions; setOptions: (o: ExportOptions) => void;
    schedules: DayScheduleResponse[]; // ✅ 지도에 핀 찍기 위해 필요
}) => {
    const [mapState, setMapState] = useState<{ center: { lat: number, lng: number }, zoom: number } | undefined>(undefined);

    if (!isOpen) return null;

    const isValid = options.map || options.schedule;

    // 핀 데이터 추출
    const points = schedules.map(s => {
        const temp = decodeTempSpot(s.memo);
        const lat = temp ? temp.lat : (s.lat || s.spot?.lat);
        const lng = temp ? temp.lng : (s.lng || s.spot?.lng);
        return { lat: Number(lat), lng: Number(lng) };
    }).filter(p => p.lat && p.lng);

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-left">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                <h3 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-2">
                    📸 이미지 저장 설정
                </h3>

                {/* ✅ 1. 지도 미리보기 및 조절 영역 */}
                {options.map && (
                    <div className="w-full h-[250px] bg-gray-100 rounded-xl overflow-hidden mb-6 relative border border-gray-200">
                        <Map
                            mapId="EXPORT_PREVIEW_MAP"
                            defaultCenter={{ lat: 35.6895, lng: 139.6917 }}
                            defaultZoom={10}
                            disableDefaultUI={true}
                            gestureHandling={'cooperative'} // 모달 내 스크롤 문제 방지
                            className="w-full h-full"
                        >
                            <ModalMapController points={points} onStateChange={setMapState} />
                            {points.map((p, i) => (
                                <AdvancedMarker key={i} position={p}>
                                    <Pin background={'#3B82F6'} glyphColor={'white'} borderColor={'#2563EB'} scale={0.8} />
                                </AdvancedMarker>
                            ))}
                        </Map>
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 text-white text-[10px] px-3 py-1 rounded-full pointer-events-none">
                            지도를 움직여 저장할 범위를 맞추세요
                        </div>
                    </div>
                )}

                <div className="space-y-3 mb-6 overflow-y-auto flex-1 px-1">
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

                {!isValid && (
                    <p className="text-xs text-red-500 font-bold mb-4 text-center animate-pulse">
                        ⚠️ 지도 또는 일정 중 하나는 반드시 선택해야 합니다.
                    </p>
                )}

                <div className="flex gap-2 shrink-0">
                    <button onClick={onClose} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-gray-500 hover:bg-gray-200 transition">취소</button>
                    {/* ✅ 저장 시 mapState 전달 */}
                    <button
                        onClick={() => onConfirm(mapState)}
                        disabled={!isValid}
                        className={`flex-[2] py-3 text-white rounded-xl font-bold shadow-md transition ${isValid ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed'}`}
                    >
                        이대로 저장하기
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
            const imgs = Array.from(element.querySelectorAll("img"));
            await Promise.all(imgs.map((img) => {
                if (img.complete && img.naturalWidth > 0) return Promise.resolve();
                return new Promise<void>((resolve) => { const done = () => resolve(); img.addEventListener("load", done, { once: true }); img.addEventListener("error", done, { once: true }); });
            }));
            await new Promise((r) => requestAnimationFrame(() => r(null)));
            const dataUrl = await toPng(element, { backgroundColor: "#ffffff", cacheBust: false, pixelRatio: 2, skipFonts: true });
            const link = document.createElement("a");
            link.download = `${filename}.png`;
            link.href = dataUrl;
            link.click();
            closeExportModal();
        } catch (err) { console.error(err); alert("이미지 저장 중 오류가 발생했습니다."); }
    };
    return { isExportModalOpen, openExportModal, closeExportModal, exportOptions, setExportOptions, handleSaveImage };
};