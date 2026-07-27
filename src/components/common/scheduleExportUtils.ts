import type { DayScheduleResponse } from "../../types/schedule";

export interface ExportSection {
    id: number | string;
    title: string;
    memo: string;
    schedules: DayScheduleResponse[];
}

export interface ExportOptions {
    header: boolean;
    map: boolean;
    schedule: boolean;
}

export const getStaticMapQuery = (
    schedules: DayScheduleResponse[],
    customView?: { center: { lat: number; lng: number }; zoom: number }
) => {
    const points = schedules
        .map((schedule, index) => ({
            lat: schedule.lat,
            lng: schedule.lng,
            index: index + 1
        }))
        .filter(point => point.lat !== 0 && point.lng !== 0 && point.lat != null && point.lng != null);

    if (points.length === 0) return null;

    const limitedPoints = points.length > 20
        ? points.filter((_, index) =>
            index === 0
            || index === points.length - 1
            || index % Math.ceil(points.length / 20) === 0
        )
        : points;

    const markers = limitedPoints
        .map(point => {
            let label = "";
            if (point.index < 10) label = point.index.toString();
            else if (point.index < 36) {
                label = String.fromCharCode('A'.charCodeAt(0) + point.index - 10);
            }
            const labelParam = label ? `|label:${label}` : "";
            return `markers=color:blue${labelParam}|${point.lat},${point.lng}`;
        })
        .join("&");

    const pathCoordinates = points.map(point => `${point.lat},${point.lng}`).join("|");
    const path = `path=color:0x3B82F6ff|weight:5|${pathCoordinates}`;
    const viewParams = customView
        ? `&center=${customView.center.lat},${customView.center.lng}&zoom=${customView.zoom}`
        : "";

    return `size=600x400&scale=2&maptype=roadmap${viewParams}&${markers}&${path}&_t=${Date.now()}`;
};
