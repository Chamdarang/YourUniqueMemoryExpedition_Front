import type { PlanDayResponse, ScheduleMode } from "./planDay.ts";
import type { SpotType, Transportation } from "./enums";

export interface PlanResponse{
    id: number;
    planName: string;
    planStartDate: string;
    planEndDate: string;
    planDays: number;
    planMemo: string;
}

export interface PlanDetailResponse extends PlanResponse{
    days: PlanDayResponse[];
}

export interface PlanCreateRequest{
    planName: string;
    planStartDate: string;
    planEndDate: string;
    planDays: number;
    planMemo: string;
}

export interface PlanUpdateRequest {
    planName: string;
    planStartDate: string;
    planEndDate: string;
    planDays: number;
    planMemo: string;
}

export interface PlanTransferData {
    formatVersion: number;
    planName: string;
    planStartDate: string | null;
    planEndDate: string | null;
    planDays: number | null;
    planMemo: string | null;
    days: PlanTransferDay[];
}

export interface PlanTransferDay {
    dayName: string;
    dayOrder: number;
    memo: string | null;
    scheduleMode?: ScheduleMode;
    schedules: PlanTransferSchedule[];
}

export interface PlanTransferSchedule {
    scheduleOrder: number;
    spotUserId: number | null;
    spotName: string | null;
    spotType: SpotType | null;
    lat: number | null;
    lng: number | null;
    isChecked: boolean;
    isSkipped?: boolean;
    startTime: string | null;
    fixedStartTime: boolean;
    duration: number;
    endTime: string | null;
    movingDuration: number;
    extraDuration: number;
    extraMovingDuration: number;
    transportation: Transportation | null;
    memo: string | null;
    movingMemo: string | null;
}

export interface PlanImportPreview {
    plan: PlanTransferData;
    summary: {
        sourceRows: number;
        importedDays: number;
        importedSchedules: number;
        skippedRows: number;
        fixedStartTimes: number;
        newSpots: number;
    };
    issues: Array<{
        rowNumber: number;
        severity: 'WARNING' | 'ERROR';
        message: string;
        value: string | null;
    }>;
}

export interface PlanImportAnalysis {
    fileName: string;
    fileType: 'XLSX' | 'XLS' | 'CSV';
    detectedCharset: string | null;
    detectedDelimiter: string | null;
    sheets: Array<{
        name: string;
        rowCount: number;
        suggestedHeaderRow: number;
        columns: Array<{
            index: number;
            label: string;
            samples: string[];
        }>;
    }>;
}

export type ImportDayMode = 'NONE' | 'COLUMN' | 'DATE' | 'SHEET';
export type ImportRowMode = 'ALL' | 'ARROW' | 'TYPE_COLUMN';
export type ImportDurationUnit = 'AUTO' | 'MINUTES' | 'HOURS' | 'EXCEL';

export interface GeneralImportConfig {
    planName: string;
    startDate: string | null;
    sheetNames: string[];
    headerRow: number;
    dataStartRow: number;
    dayMode: ImportDayMode;
    rowMode: ImportRowMode;
    columns: Record<string, number>;
    movementTypeValues: string[];
    durationUnit: ImportDurationUnit;
    movingDurationUnit: ImportDurationUnit;
    defaultStartTime: string;
    defaultDurationMinutes: number;
    lastDurationMinutes: number;
    firstLineAsPlaceName: boolean;
    inheritBlankDay: boolean;
    transportationMappings: Record<string, Transportation>;
    csvCharset: string;
    csvDelimiter: string;
}
