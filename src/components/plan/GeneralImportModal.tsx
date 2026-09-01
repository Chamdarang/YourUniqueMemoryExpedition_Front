import { useEffect, useMemo, useState } from 'react';
import { analyzePlanImportFile, importPlanData, previewGeneralPlanImport } from '../../api/planApi';
import type {
  GeneralImportConfig,
  ImportDayMode,
  ImportDurationUnit,
  ImportRowMode,
  PlanImportAnalysis,
  PlanImportPreview,
  PlanResponse,
} from '../../types/plan';
import type { Transportation } from '../../types/enums';
import { enforceFourDigitDateYear, limitDateYear } from '../../utils/timeUtils';

interface Props {
  file: File;
  onClose: () => void;
  onImported: (plan: PlanResponse, preview: PlanImportPreview) => void;
}

const fields = [
  ['place', '장소명', true],
  ['start', '시작시간', false],
  ['duration', '체류시간', false],
  ['end', '종료시간', false],
  ['day', '일차', false],
  ['date', '날짜', false],
  ['offset', '체류 OFFSET', false],
  ['movingDuration', '이동시간', false],
  ['movingOffset', '이동 OFFSET', false],
  ['transport', '교통수단', false],
  ['memo', '일정 메모', false],
  ['movingMemo', '이동 메모', false],
  ['dayMemo', '일차 메모', false],
  ['rowType', '행 유형', false],
] as const;

const aliases: Record<string, string[]> = {
  place: ['목적', '목적지', '장소명', '장소', '일정', 'spot', 'place'],
  start: ['시작', '시작시간', '도착', '시간', 'start'],
  duration: ['체류', '체류시간', '소요시간', 'duration'],
  end: ['종료', '종료시간', '출발', 'end'],
  day: ['일차', 'day'],
  date: ['날짜', '일자', 'date'],
  offset: ['시간offset', '체류offset', '인저리타임'],
  movingDuration: ['이동시간', '이동소요시간'],
  movingOffset: ['이동offset', '이동인저리타임'],
  transport: ['교통수단', '이동수단', 'transportation'],
  memo: ['메모', '비고', '일정메모'],
  movingMemo: ['이동메모', '경로', '노선'],
  dayMemo: ['종합', '플랜', '일차메모', '하루메모', 'daymemo', 'daysummary'],
  rowType: ['유형', '행유형', '구분', 'type'],
};

const transportDefaults: Record<Transportation, string> = {
  WALK: '도보,걷기',
  BUS: '버스,셔틀',
  TRAIN: 'JR,전철,지하철,열차,신칸센',
  TAXI: '택시',
  CAR: '자동차,렌터카,자가용,차량',
  BICYCLE: '자전거',
  MOTORCYCLE: '오토바이,바이크',
  SHIP: '배,페리,선박',
  AIRPLANE: '비행기,항공',
};

const normalize = (value: string) => value.toLowerCase().replace(/[\s_\-()[\]]/g, '');

function firstPlanBlockColumns(columns: PlanImportAnalysis['sheets'][number]['columns']) {
  const startColumns = columns
    .filter(column => ['시작', '시작시간', 'start'].some(alias => normalize(column.label) === normalize(alias)))
    .map(column => column.index);
  if (startColumns.length < 2) return columns;

  const blockWidth = startColumns[1] - startColumns[0];
  return columns.filter(column => column.index < blockWidth);
}

function autoColumns(analysis: PlanImportAnalysis): Record<string, number> {
  const columns = firstPlanBlockColumns(analysis.sheets[0]?.columns ?? []);
  const result: Record<string, number> = {};
  Object.entries(aliases).forEach(([field, names]) => {
    const found = names
      .map(name => columns.find(column => normalize(column.label) === normalize(name)))
      .find(Boolean)
      ?? names
        .map(name => columns.find(column => normalize(column.label).includes(normalize(name))))
        .find(Boolean);
    if (found) result[field] = found.index;
  });
  if (result.place == null && columns[0]) result.place = columns[0].index;
  return result;
}

function transportMap(values: Record<Transportation, string>): Record<string, Transportation> {
  const result: Record<string, Transportation> = {};
  (Object.entries(values) as Array<[Transportation, string]>).forEach(([transport, text]) => {
    text.split(',').map(value => value.trim()).filter(Boolean).forEach(value => { result[value] = transport; });
  });
  return result;
}

export default function GeneralImportModal({ file, onClose, onImported }: Props) {
  const [analysis, setAnalysis] = useState<PlanImportAnalysis | null>(null);
  const [preview, setPreview] = useState<PlanImportPreview | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  const [transportValues, setTransportValues] = useState(transportDefaults);
  const [config, setConfig] = useState<GeneralImportConfig>({
    planName: file.name.replace(/\.(xlsx|xls|csv)$/i, ''),
    startDate: null,
    sheetNames: [],
    headerRow: 1,
    dataStartRow: 2,
    dayMode: 'NONE',
    rowMode: 'ALL',
    columns: {},
    movementTypeValues: ['이동'],
    durationUnit: 'AUTO',
    movingDurationUnit: 'AUTO',
    defaultStartTime: '09:00',
    defaultDurationMinutes: 60,
    lastDurationMinutes: 60,
    firstLineAsPlaceName: true,
    inheritBlankDay: true,
    transportationMappings: {},
    csvCharset: 'AUTO',
    csvDelimiter: 'AUTO',
  });

  useEffect(() => {
    let active = true;
    setBusy(true);
    analyzePlanImportFile(file)
      .then(result => {
        if (!active) return;
        const first = result.sheets[0];
        const detectedColumns = autoColumns(result);
        const detectedDateColumn = first?.columns.find(column => column.index === detectedColumns.date);
        const looksLikeDayAndWeekday = detectedDateColumn?.samples.some(sample =>
          /^\d{1,2}[월화수목금토일]$/.test(sample.trim()),
        ) ?? false;
        if (looksLikeDayAndWeekday && detectedColumns.date != null) {
          detectedColumns.day = detectedColumns.date;
          delete detectedColumns.date;
        }
        const placeColumn = first?.columns.find(column => column.index === detectedColumns.place);
        const hasArrowRows = placeColumn?.samples.some(sample => sample.includes('->') || sample.includes('→')) ?? false;
        setAnalysis(result);
        const nonEmptySheets = result.sheets.filter(sheet => sheet.rowCount > sheet.suggestedHeaderRow);
        setConfig(current => ({
          ...current,
          sheetNames: (nonEmptySheets.length > 0 ? nonEmptySheets : result.sheets).map(sheet => sheet.name),
          headerRow: first?.suggestedHeaderRow ?? 1,
          dataStartRow: (first?.suggestedHeaderRow ?? 1) + 1,
          columns: detectedColumns,
          dayMode: detectedColumns.date != null
            ? 'DATE'
            : detectedColumns.day != null
              ? 'COLUMN'
              : nonEmptySheets.length > 1 ? 'SHEET' : 'NONE',
          rowMode: hasArrowRows ? 'ARROW' : 'ALL',
          csvCharset: result.detectedCharset ?? 'AUTO',
          csvDelimiter: result.detectedDelimiter ?? 'AUTO',
        }));
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : '파일을 분석하지 못했습니다.'))
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [file]);

  const selectedColumns = useMemo(() => {
    const selected = analysis?.sheets.find(sheet => config.sheetNames.includes(sheet.name));
    return firstPlanBlockColumns(selected?.columns ?? analysis?.sheets[0]?.columns ?? []);
  }, [analysis, config.sheetNames]);

  const update = <K extends keyof GeneralImportConfig>(key: K, value: GeneralImportConfig[K]) =>
    setConfig(current => ({ ...current, [key]: value }));

  const goNext = () => {
    if (step === 1) {
      if (!config.planName.trim()) {
        setError('여행 이름을 입력해 주세요.');
        return;
      }
      if (!config.startDate) {
        setError('네 자리 연도가 포함된 여행 시작일을 입력해 주세요.');
        return;
      }
      if (config.sheetNames.length === 0) {
        setError('가져올 시트를 하나 이상 선택해 주세요.');
        return;
      }
    }
    if (step === 2 && config.columns.place == null) {
      setError('장소명이 들어 있는 열을 지정해 주세요.');
      return;
    }
    setError('');
    setStep(current => current + 1);
  };

  const makePreview = async () => {
    if (!config.planName.trim()) return setError('여행 이름을 입력해 주세요.');
    if (!config.startDate) return setError('여행 시작일을 입력해 주세요.');
    if (config.columns.place == null) return setError('장소명 열을 선택해 주세요.');
    if (config.sheetNames.length === 0) return setError('가져올 시트를 하나 이상 선택해 주세요.');
    setBusy(true);
    setError('');
    try {
      const result = await previewGeneralPlanImport(file, {
        ...config,
        planName: config.planName.trim(),
        transportationMappings: transportMap(transportValues),
      });
      setPreview(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '미리보기를 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const importPreview = async () => {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      const imported = await importPlanData(preview.plan);
      onImported(imported, preview);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '계획을 등록하지 못했습니다.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-5 md:px-8">
          <div>
            <h3 className="text-xl font-extrabold text-gray-900">파일에서 계획 가져오기</h3>
            <p className="mt-1 text-xs text-gray-500">{file.name}</p>
          </div>
          <button type="button" disabled={busy} onClick={onClose} className="text-xl text-gray-400 hover:text-gray-700">✕</button>
        </div>

        {!preview && analysis && (
          <div className="shrink-0 border-b bg-gray-50 px-6 py-4 md:px-8">
            <div className="mx-auto flex max-w-3xl items-center">
              {['자동 분석', '열 수정', '시간 규칙', '미리보기'].map((label, index) => {
                const number = index + 1;
                const active = step === number;
                const completed = step > number;
                return (
                  <div key={label} className="flex min-w-0 flex-1 items-center last:flex-none">
                    <button
                      type="button"
                      onClick={() => number < 4 && setStep(number)}
                      className={`flex items-center gap-2 text-xs font-extrabold md:text-sm ${
                        active ? 'text-blue-700' : completed ? 'text-blue-500' : 'text-gray-400'
                      }`}
                    >
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        active ? 'bg-blue-600 text-white' : completed ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'
                      }`}>{completed ? '✓' : number}</span>
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                    {number < 4 && <div className={`mx-2 h-0.5 flex-1 ${completed ? 'bg-blue-300' : 'bg-gray-200'}`} />}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 md:px-8">
        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>}
        {busy && !analysis ? (
          <div className="py-20 text-center font-bold text-blue-600">파일 구조를 분석하는 중...</div>
        ) : !preview && analysis ? (
          <div className="space-y-5">
            {step === 1 && <>
            <section className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-bold text-gray-700">여행 이름
                <input value={config.planName} onChange={event => update('planName', event.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5" />
              </label>
              <label className="text-sm font-bold text-gray-700">여행 시작일
                <input
                  type="date"
                  min="1900-01-01"
                  max="2100-12-31"
                  onInput={enforceFourDigitDateYear}
                  value={config.startDate ?? ''}
                  onChange={event => {
                    const value = limitDateYear(event.target.value);
                    if (!value) {
                      update('startDate', null);
                      return;
                    }
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                      setError('연도는 네 자리로 입력해 주세요.');
                      update('startDate', null);
                      return;
                    }
                    const year = Number(value.slice(0, 4));
                    if (year < 1900 || year > 2100) {
                      setError('연도는 1900년부터 2100년 사이로 입력해 주세요.');
                      update('startDate', null);
                      return;
                    }
                    setError('');
                    update('startDate', value);
                  }}
                  className="mt-1.5 w-full rounded-xl border px-3 py-2.5"
                />
              </label>
            </section>

            <section className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-extrabold text-blue-900">자동 분석 완료</h4>
                  <p className="mt-1 text-xs leading-relaxed text-blue-700">
                    {analysis.fileType} · {config.sheetNames.length}개 시트 · 제목 {config.headerRow}행부터 구조를 찾았습니다.
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-600">
                  {Object.keys(config.columns).length}개 열 자동 연결
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(config.columns).map(([key, columnIndex]) => {
                  const field = fields.find(([fieldKey]) => fieldKey === key);
                  const column = selectedColumns.find(item => item.index === columnIndex);
                  if (!field || !column) return null;
                  return <span key={key} className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-blue-700">{column.label} → {field[1]}</span>;
                })}
              </div>
              <p className="mt-3 text-xs text-blue-600">
                연결이 맞으면 아래의 ‘자동 설정으로 미리보기’를 누르세요. 틀린 부분이 있을 때만 세부 설정을 사용하면 됩니다.
              </p>
            </section>

            <section className="rounded-2xl border p-4">
              <h4 className="mb-3 font-extrabold text-gray-800">1. 시트와 행 구조</h4>
              <div className="mb-4 flex flex-wrap gap-2">
                {analysis.sheets.map(sheet => (
                  <label key={sheet.name} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                    <input type="checkbox" checked={config.sheetNames.includes(sheet.name)} onChange={event => update('sheetNames', event.target.checked ? [...config.sheetNames, sheet.name] : config.sheetNames.filter(name => name !== sheet.name))} />
                    {sheet.name} <span className="text-xs text-gray-400">({sheet.rowCount}행)</span>
                  </label>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <label className="text-xs font-bold text-gray-600">제목 행
                  <input type="number" min={1} value={config.headerRow} onChange={event => update('headerRow', Number(event.target.value))} className="mt-1 w-full rounded-lg border px-2 py-2" />
                </label>
                <label className="text-xs font-bold text-gray-600">데이터 시작 행
                  <input type="number" min={1} value={config.dataStartRow} onChange={event => update('dataStartRow', Number(event.target.value))} className="mt-1 w-full rounded-lg border px-2 py-2" />
                </label>
                <label className="text-xs font-bold text-gray-600">날짜 구분
                  <select value={config.dayMode} onChange={event => update('dayMode', event.target.value as ImportDayMode)} className="mt-1 w-full rounded-lg border px-2 py-2">
                    <option value="NONE">한 날짜로</option><option value="SHEET">시트별 일차</option><option value="COLUMN">일차 열</option><option value="DATE">날짜 열</option>
                  </select>
                </label>
                <label className="text-xs font-bold text-gray-600">행 구조
                  <select value={config.rowMode} onChange={event => update('rowMode', event.target.value as ImportRowMode)} className="mt-1 w-full rounded-lg border px-2 py-2">
                    <option value="ALL">모든 행이 장소</option><option value="ARROW">화살표 행은 이동</option><option value="TYPE_COLUMN">유형 열로 구분</option>
                  </select>
                </label>
              </div>
              {config.rowMode === 'TYPE_COLUMN' && (
                <label className="mt-3 block text-xs font-bold text-gray-600">이동으로 볼 유형 값 (쉼표 구분)
                  <input value={config.movementTypeValues.join(',')} onChange={event => update('movementTypeValues', event.target.value.split(',').map(value => value.trim()).filter(Boolean))} className="mt-1 w-full rounded-lg border px-3 py-2" />
                </label>
              )}
            </section>
            </>}

            {step === 2 && (
              <section>
                <div className="mb-4">
                  <h4 className="font-extrabold text-gray-900">파일의 각 열이 무엇인지 지정해 주세요</h4>
                  <p className="mt-1 text-sm text-gray-500">
                    열 제목과 실제 값을 보면서 오른쪽에서 용도를 고르면 됩니다. 장소명만 필수입니다.
                  </p>
                </div>
                <div className="mb-4 flex flex-wrap gap-2">
                  {Object.entries(config.columns).map(([key, columnIndex]) => {
                    const field = fields.find(([fieldKey]) => fieldKey === key);
                    const column = selectedColumns.find(item => item.index === columnIndex);
                    if (!field || !column) return null;
                    return (
                      <span key={key} className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                        key === 'place' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {column.label} → {field[1]}
                      </span>
                    );
                  })}
                </div>
                <div className="overflow-hidden rounded-2xl border border-gray-200">
                  {selectedColumns.map((column, index) => {
                    const mappedField = Object.entries(config.columns)
                      .find(([, columnIndex]) => columnIndex === column.index)?.[0] ?? '';
                    return (
                      <div
                        key={column.index}
                        className={`grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_260px] md:items-center ${
                          index > 0 ? 'border-t border-gray-100' : ''
                        } ${mappedField ? 'bg-blue-50/40' : 'bg-white'}`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-gray-100 px-2 text-xs font-black text-gray-500">
                              {column.index + 1}
                            </span>
                            <strong className="truncate text-sm text-gray-900">{column.label}</strong>
                          </div>
                          <div className="mt-2 flex min-w-0 gap-2 overflow-hidden">
                            {column.samples.slice(0, 3).map((sample, sampleIndex) => (
                              <span key={sampleIndex} className="truncate rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-500">
                                {sample}
                              </span>
                            ))}
                            {column.samples.length === 0 && <span className="text-xs text-gray-400">값 샘플 없음</span>}
                          </div>
                        </div>
                        <select
                          aria-label={`${column.label} 열 용도`}
                          value={mappedField}
                          onChange={event => setConfig(current => {
                            const columns = { ...current.columns };
                            Object.entries(columns).forEach(([fieldKey, columnIndex]) => {
                              if (columnIndex === column.index) delete columns[fieldKey];
                            });
                            if (event.target.value) {
                              delete columns[event.target.value];
                              columns[event.target.value] = column.index;
                            }
                            return { ...current, columns };
                          })}
                          className={`w-full rounded-xl border px-3 py-2.5 text-sm font-bold outline-none focus:ring-4 focus:ring-blue-100 ${
                            mappedField ? 'border-blue-300 bg-white text-blue-700' : 'border-gray-200 bg-gray-50 text-gray-500'
                          }`}
                        >
                          <option value="">가져오지 않음</option>
                          {fields.filter(([key]) => {
                            if (key === 'day') return config.dayMode === 'COLUMN';
                            if (key === 'date') return config.dayMode === 'DATE';
                            if (key === 'rowType') return config.rowMode === 'TYPE_COLUMN';
                            return true;
                          }).map(([key, label, required]) => (
                            <option key={key} value={key}>{label}{required ? ' (필수)' : ''}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
                {config.columns.place == null && (
                  <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
                    장소명이 들어 있는 열을 하나 지정해 주세요.
                  </p>
                )}
              </section>
            )}

            {step === 3 && <>
            <section className="rounded-2xl border p-4">
              <h4 className="mb-3 font-extrabold text-gray-800">3. 시간 처리</h4>
              <div className="grid gap-3 md:grid-cols-5">
                <label className="text-xs font-bold text-gray-600">기본 시작
                  <input type="time" value={config.defaultStartTime} onChange={event => update('defaultStartTime', event.target.value)} className="mt-1 w-full rounded-lg border px-2 py-2" />
                </label>
                <label className="text-xs font-bold text-gray-600">기본 체류(분)
                  <input type="number" min={1} value={config.defaultDurationMinutes} onChange={event => update('defaultDurationMinutes', Number(event.target.value))} className="mt-1 w-full rounded-lg border px-2 py-2" />
                </label>
                <label className="text-xs font-bold text-gray-600">마지막 체류(분)
                  <input type="number" min={1} value={config.lastDurationMinutes} onChange={event => update('lastDurationMinutes', Number(event.target.value))} className="mt-1 w-full rounded-lg border px-2 py-2" />
                </label>
                <label className="text-xs font-bold text-gray-600">체류시간 단위
                  <select value={config.durationUnit} onChange={event => update('durationUnit', event.target.value as ImportDurationUnit)} className="mt-1 w-full rounded-lg border px-2 py-2"><option value="AUTO">자동</option><option value="MINUTES">분</option><option value="HOURS">시간</option><option value="EXCEL">Excel 시간값</option></select>
                </label>
                <label className="text-xs font-bold text-gray-600">이동시간 단위
                  <select value={config.movingDurationUnit} onChange={event => update('movingDurationUnit', event.target.value as ImportDurationUnit)} className="mt-1 w-full rounded-lg border px-2 py-2"><option value="AUTO">자동</option><option value="MINUTES">분</option><option value="HOURS">시간</option><option value="EXCEL">Excel 시간값</option></select>
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-5 text-xs font-bold text-gray-600">
                <label><input type="checkbox" checked={config.firstLineAsPlaceName} onChange={event => update('firstLineAsPlaceName', event.target.checked)} className="mr-2" />셀 첫 줄만 장소명, 나머지는 메모</label>
                <label><input type="checkbox" checked={config.inheritBlankDay} onChange={event => update('inheritBlankDay', event.target.checked)} className="mr-2" />빈 일차/날짜는 위 행 값 상속</label>
              </div>
            </section>

            <details className="rounded-2xl border p-4">
              <summary className="cursor-pointer font-extrabold text-gray-800">교통수단 값 매핑</summary>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {(Object.keys(transportValues) as Transportation[]).map(transport => (
                  <label key={transport} className="text-xs font-bold text-gray-600">{transport}
                    <input value={transportValues[transport]} onChange={event => setTransportValues(current => ({ ...current, [transport]: event.target.value }))} className="mt-1 w-full rounded-lg border px-2 py-2" />
                  </label>
                ))}
              </div>
            </details>
            </>}

            <div className="sticky bottom-0 mt-10 flex gap-3 rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur">
              {step === 1 ? (
                <>
                  <button type="button" disabled={busy} onClick={onClose} className="rounded-xl bg-gray-100 px-5 py-3 font-bold text-gray-600">취소</button>
                  <button type="button" disabled={busy} onClick={goNext} className="rounded-xl border border-blue-200 bg-white px-5 py-3 font-bold text-blue-700">세부 설정</button>
                  <button type="button" disabled={busy} onClick={makePreview} className="flex-1 rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? '분석 중...' : '자동 설정으로 미리보기'}</button>
                </>
              ) : (
                <>
                  <button type="button" disabled={busy} onClick={() => { setError(''); setStep(current => current - 1); }} className="flex-1 rounded-xl bg-gray-100 py-3 font-bold text-gray-600">이전</button>
                  {step < 3 ? (
                    <button type="button" disabled={busy} onClick={goNext} className="flex-[2] rounded-xl bg-blue-600 py-3 font-bold text-white disabled:opacity-50">다음</button>
                  ) : (
                    <button type="button" disabled={busy} onClick={makePreview} className="flex-[2] rounded-xl bg-blue-600 py-3 font-bold text-white disabled:opacity-50">{busy ? '분석 중...' : '미리보기 만들기'}</button>
                  )}
                </>
              )}
            </div>
          </div>
        ) : preview ? (
          <div>
            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[['일차', preview.summary.importedDays], ['일정', preview.summary.importedSchedules], ['고정 시작', preview.summary.fixedStartTimes], ['제외 행', preview.summary.skippedRows]].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-blue-50 p-3 text-center"><div className="text-xl font-black text-blue-700">{value}</div><div className="text-xs font-bold text-blue-400">{label}</div></div>
              ))}
            </div>
            <div className="mb-4 rounded-xl border border-orange-100 bg-orange-50 p-3 text-xs leading-relaxed text-orange-700">
              장소는 내 장소와 자동 연결하지 않고 일정 이름으로만 가져옵니다. 가져온 뒤 필요한 장소만 직접 연결할 수 있습니다.
            </div>
            {preview.issues.length > 0 && <div className="mb-4 max-h-40 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h4 className="mb-2 font-extrabold text-amber-800">확인할 행</h4>
              {preview.issues.map((issue, index) => <p key={`${issue.rowNumber}-${index}`} className="mb-1 text-xs text-amber-800">{issue.rowNumber}행 · {issue.message}{issue.value ? ` (${issue.value})` : ''}</p>)}
            </div>}
            <div className="max-h-[46vh] space-y-4 overflow-y-auto pr-1">
              {preview.plan.days.map(day => <div key={day.dayOrder} className="overflow-hidden rounded-2xl border border-gray-200">
                <div className="flex items-start justify-between gap-3 bg-gray-50 px-4 py-3">
                  <div>
                    <strong className="text-gray-900">{day.dayName}</strong>
                    {day.memo && <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-gray-500">{day.memo}</p>}
                  </div>
                  <span className="shrink-0 text-xs font-bold text-blue-600">{day.schedules.length}개 일정</span>
                </div>
                <div>
                  {day.schedules.map(schedule => (
                    <div key={schedule.scheduleOrder}>
                      {schedule.movingDuration > 0 && (
                        <div className="flex gap-3 border-t border-blue-100 bg-blue-50/60 px-4 py-2 text-xs text-blue-700">
                          <span className="w-24 shrink-0 font-black">이동 {schedule.movingDuration}분</span>
                          <span className="min-w-0">
                            {schedule.transportation ?? '수단 미지정'}
                            {schedule.movingMemo ? ` · ${schedule.movingMemo}` : ''}
                          </span>
                        </div>
                      )}
                      <div className="grid gap-2 border-t border-gray-100 px-4 py-3 md:grid-cols-[110px_minmax(0,1fr)_100px] md:items-start">
                        <div className="text-sm font-black text-gray-800">
                          {schedule.startTime?.slice(0, 5) || '시간 미정'}
                          <span className="mx-1 text-gray-300">–</span>
                          {schedule.endTime?.slice(0, 5) || '미정'}
                          {schedule.fixedStartTime && <div className="mt-1 text-[10px] text-green-600">시작시간 고정</div>}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-gray-900">{schedule.spotName || '장소명 없음'}</div>
                          {schedule.memo && <div className="mt-1 whitespace-pre-line text-xs leading-relaxed text-gray-500">{schedule.memo}</div>}
                        </div>
                        <div className="text-left text-xs font-bold text-gray-500 md:text-right">
                          체류 {schedule.duration}분
                          {schedule.extraDuration > 0 && <div className="mt-1 text-orange-600">OFFSET +{schedule.extraDuration}분</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>)}
            </div>
            <div className="mt-6 flex gap-3">
              <button type="button" disabled={busy} onClick={() => { setPreview(null); setStep(1); }} className="flex-1 rounded-xl bg-gray-100 py-3 font-bold text-gray-600">다시 설정</button>
              <button type="button" disabled={busy || preview.summary.importedSchedules === 0} onClick={importPreview} className="flex-[2] rounded-xl bg-blue-600 py-3 font-bold text-white disabled:opacity-50">{busy ? '등록 중...' : '이 계획으로 등록'}</button>
            </div>
          </div>
        ) : null}
        </div>
      </div>
    </div>
  );
}
