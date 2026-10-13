import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPlanReservation, deletePlanReservation, getPlanReservations, updatePlanReservation } from '../../api/planReservationApi';
import type { PlanReservation, PlanReservationSaveRequest, PlanReservationStatus, PlanReservationType } from '../../types/planReservation';
import type { PlanDayResponse } from '../../types/planDay';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { usePlanLiveUpdates } from '../../hooks/usePlanLiveUpdates';
import { useFeedback } from '../common/useFeedback';

const typeLabels: Record<PlanReservationType, string> = {
  FLIGHT: '항공', ACCOMMODATION: '숙소', TRANSPORT: '교통', TICKET: '티켓·체험', RESTAURANT: '식당', OTHER: '기타',
};
const statusLabels: Record<PlanReservationStatus, string> = {
  NEEDS_BOOKING: '예약 필요', RESERVED: '예약 완료', CANCELLED: '취소',
};
const emptyForm: PlanReservationSaveRequest = {
  type: 'OTHER', title: '', status: 'RESERVED', provider: '', confirmationCode: '',
  startDate: '', endDate: '', startTime: '', endTime: '', bookingUrl: '', address: '', memo: '', dayId: null,
};
const inputClass = 'yume-input yume-input-soft w-full';
const nullable = (value: string | null | undefined) => value || '';
const formatPeriod = (item: PlanReservation) => {
  const date = item.startDate && item.endDate && item.startDate !== item.endDate
    ? `${item.startDate} – ${item.endDate}` : item.startDate || item.endDate || '';
  const time = item.startTime && item.endTime ? `${item.startTime.slice(0, 5)} – ${item.endTime.slice(0, 5)}` : item.startTime?.slice(0, 5) || '';
  return [date, time].filter(Boolean).join(' · ');
};

export default function PlanReservationsModal({ planId, days, onClose }: { planId: number; days: PlanDayResponse[]; onClose: () => void }) {
  const { confirm, showToast } = useFeedback();
  const dialogRef = useDialogFocus(true, onClose);
  const [reservations, setReservations] = useState<PlanReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<PlanReservation | null>(null);
  const [form, setForm] = useState<PlanReservationSaveRequest>(emptyForm);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try { setReservations(await getPlanReservations(planId)); }
    catch (error) { setLoadError(error instanceof Error ? error.message : '예약 정보를 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }, [planId]);
  useEffect(() => { void refresh(); }, [refresh]);
  usePlanLiveUpdates(planId, () => { void refresh(); });

  const startForm = (item?: PlanReservation) => {
    if (saving) return;
    setEditing(item ?? null);
    setForm(item ? {
      type: item.type, title: item.title, status: item.status, provider: nullable(item.provider),
      confirmationCode: nullable(item.confirmationCode), startDate: nullable(item.startDate), endDate: nullable(item.endDate),
      startTime: nullable(item.startTime).slice(0, 5), endTime: nullable(item.endTime).slice(0, 5), bookingUrl: nullable(item.bookingUrl),
      address: nullable(item.address), memo: nullable(item.memo), dayId: item.dayId,
    } : { ...emptyForm });
  };
  const setField = <K extends keyof PlanReservationSaveRequest>(key: K, value: PlanReservationSaveRequest[K]) =>
    setForm(current => ({ ...current, [key]: value }));
  const normalizedForm = useMemo(() => ({
    ...form,
    provider: form.provider?.trim() || null,
    confirmationCode: form.confirmationCode?.trim() || null,
    startDate: form.startDate || null,
    endDate: form.endDate || null,
    startTime: form.startTime || null,
    endTime: form.endTime || null,
    bookingUrl: form.bookingUrl?.trim() || null,
    address: form.address?.trim() || null,
    memo: form.memo?.trim() || null,
  }), [form]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!form.title.trim()) return showToast({ message: '예약 이름을 입력해 주세요.', type: 'info' });
    setSaving(true);
    try {
      const saved = editing
        ? await updatePlanReservation(planId, editing.id, normalizedForm)
        : await createPlanReservation(planId, normalizedForm);
      setReservations(current => [...current.filter(item => item.id !== saved.id), saved]
        .sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999') || (a.startTime || '').localeCompare(b.startTime || '')));
      setEditing(null);
      setForm({ ...emptyForm });
      showToast({ message: editing ? '예약 정보를 수정했습니다.' : '예약 정보를 추가했습니다.', type: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : '예약 정보를 저장하지 못했습니다.', type: 'error' });
    } finally { setSaving(false); }
  };

  const remove = async (item: PlanReservation) => {
    if (saving) return;
    if (!await confirm({ title: '예약 정보 삭제', message: `‘${item.title}’ 예약 정보를 삭제할까요?`, confirmLabel: '삭제', danger: true })) return;
    try {
      await deletePlanReservation(planId, item.id);
      setReservations(current => current.filter(row => row.id !== item.id));
      if (editing?.id === item.id) startForm();
      showToast({ message: '예약 정보를 삭제했습니다.', type: 'success' });
    } catch (error) { showToast({ message: error instanceof Error ? error.message : '예약 정보를 삭제하지 못했습니다.', type: 'error' }); }
  };

  const copyCode = async (code: string) => {
    try { await navigator.clipboard.writeText(code); showToast({ message: '예약번호를 복사했습니다.', type: 'success' }); }
    catch { showToast({ message: '예약번호를 복사하지 못했습니다.', type: 'error' }); }
  };

  return <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm" onClick={onClose}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="plan-reservations-title" tabIndex={-1}
      className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={event => event.stopPropagation()}>
      <header className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 sm:px-7">
        <div><h2 id="plan-reservations-title" className="text-xl font-bold text-gray-900">예약 정보</h2><p className="mt-1 text-sm text-gray-500">이 계획의 예약을 모아보고 예약번호를 복사할 수 있어요.</p></div>
        <button type="button" onClick={onClose} className="yume-icon-button" aria-label="예약 정보 닫기">✕</button>
      </header>
      <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-[minmax(0,1fr)_minmax(300px,0.85fr)]">
        <section className="space-y-3 border-b border-gray-100 p-4 sm:p-6 md:border-b-0 md:border-r" aria-label="저장된 예약 목록">
          <div className="flex items-center justify-between"><h3 className="font-bold text-gray-800">저장된 예약 <span className="text-gray-400">{reservations.length}</span></h3><button type="button" disabled={saving} onClick={() => startForm()} className="yume-button yume-button-primary">+ 예약 추가</button></div>
          {loading ? <p role="status" className="py-8 text-center text-sm text-gray-500">예약 정보를 불러오는 중…</p>
            : loadError ? <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700"><p>{loadError}</p><button type="button" onClick={() => void refresh()} className="mt-2 font-bold underline">다시 시도</button></div>
              : reservations.length === 0 ? <div className="rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center"><p className="font-bold text-gray-700">아직 등록한 예약이 없어요.</p><p className="mt-1 text-sm text-gray-500">항공편, 숙소, 티켓 예약을 한곳에 정리해 보세요.</p></div>
                : reservations.map(item => <article key={item.id} className={`rounded-xl border p-4 ${editing?.id === item.id ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200 bg-white'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{typeLabels[item.type]}</span><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === 'RESERVED' ? 'bg-green-50 text-green-700' : item.status === 'CANCELLED' ? 'bg-gray-100 text-gray-500' : 'bg-amber-50 text-amber-700'}`}>{statusLabels[item.status]}</span>{item.dayOrder && <span className="text-xs font-semibold text-gray-500">{item.dayOrder}일차</span>}</div><h4 className="mt-2 font-bold text-gray-900">{item.title}</h4></div><div className="flex gap-1"><button type="button" disabled={saving} onClick={() => startForm(item)} className="yume-button yume-button-ghost text-xs">수정</button><button type="button" disabled={saving} onClick={() => void remove(item)} className="yume-button yume-button-danger-outline text-xs">삭제</button></div></div>
                  {formatPeriod(item) && <p className="mt-2 text-sm font-semibold text-gray-700">{formatPeriod(item)}</p>}
                  {item.provider && <p className="mt-1 text-sm text-gray-600">{item.provider}</p>}
                  {item.confirmationCode && <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2"><span className="min-w-0 break-all font-mono text-sm font-bold text-gray-800">{item.confirmationCode}</span><button type="button" onClick={() => void copyCode(item.confirmationCode!)} className="yume-button yume-button-secondary shrink-0 text-xs">번호 복사</button></div>}
                  {item.address && <p className="mt-2 break-words text-sm text-gray-600">📍 {item.address}</p>}
                  {item.bookingUrl && <a href={item.bookingUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block break-all text-sm font-semibold text-blue-700 underline">예약 링크 열기 ↗</a>}
                  {item.memo && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{item.memo}</p>}
                </article>)}
        </section>
        <form onSubmit={save} className="p-4 sm:p-6" aria-busy={saving}>
          <fieldset disabled={saving} className="space-y-3 disabled:opacity-60">
          <div className="flex items-center justify-between"><h3 className="font-bold text-gray-800">{editing ? '예약 수정' : '예약 추가'}</h3>{editing && <button type="button" disabled={saving} onClick={() => startForm()} className="text-xs font-bold text-gray-500 underline">새 예약 입력</button>}</div>
          <label className="block text-xs font-bold text-gray-600">예약 이름 *<input autoComplete="off" maxLength={200} className={`${inputClass} mt-1`} value={form.title} onChange={event => setField('title', event.target.value)} placeholder="예: 간사이행 항공편" /></label>
          <div className="grid grid-cols-2 gap-3"><label className="block text-xs font-bold text-gray-600">종류<select className={`${inputClass} mt-1`} value={form.type} onChange={event => setField('type', event.target.value as PlanReservationType)}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="block text-xs font-bold text-gray-600">상태<select className={`${inputClass} mt-1`} value={form.status} onChange={event => setField('status', event.target.value as PlanReservationStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
          <label className="block text-xs font-bold text-gray-600">업체<input maxLength={200} className={`${inputClass} mt-1`} value={form.provider || ''} onChange={event => setField('provider', event.target.value)} placeholder="항공사, 호텔, 예약처" /></label>
          <label className="block text-xs font-bold text-gray-600">예약번호<input maxLength={120} className={`${inputClass} mt-1 font-mono`} value={form.confirmationCode || ''} onChange={event => setField('confirmationCode', event.target.value)} /></label>
          <div className="grid grid-cols-2 gap-3"><label className="block text-xs font-bold text-gray-600">시작일<input type="date" className={`${inputClass} mt-1`} value={form.startDate || ''} onChange={event => setField('startDate', event.target.value)} /></label><label className="block text-xs font-bold text-gray-600">종료일<input type="date" className={`${inputClass} mt-1`} value={form.endDate || ''} onChange={event => setField('endDate', event.target.value)} /></label><label className="block text-xs font-bold text-gray-600">시작 시간<input type="time" className={`${inputClass} mt-1`} value={form.startTime || ''} onChange={event => setField('startTime', event.target.value)} /></label><label className="block text-xs font-bold text-gray-600">종료 시간<input type="time" className={`${inputClass} mt-1`} value={form.endTime || ''} onChange={event => setField('endTime', event.target.value)} /></label></div>
          <label className="block text-xs font-bold text-gray-600">연결할 일차<select className={`${inputClass} mt-1`} value={form.dayId ?? ''} onChange={event => setField('dayId', event.target.value ? Number(event.target.value) : null)}><option value="">여행 전체</option>{days.map(day => <option key={day.id} value={day.id}>{day.dayOrder}일차 · {day.dayName}</option>)}</select></label>
          <label className="block text-xs font-bold text-gray-600">주소<input maxLength={500} className={`${inputClass} mt-1`} value={form.address || ''} onChange={event => setField('address', event.target.value)} placeholder="주소 또는 터미널" /></label>
          <label className="block text-xs font-bold text-gray-600">예약 링크<input type="url" maxLength={1000} className={`${inputClass} mt-1`} value={form.bookingUrl || ''} onChange={event => setField('bookingUrl', event.target.value)} placeholder="https://" /></label>
          <label className="block text-xs font-bold text-gray-600">메모<textarea maxLength={2000} rows={3} className={`${inputClass} mt-1 resize-y`} value={form.memo || ''} onChange={event => setField('memo', event.target.value)} placeholder="체크인 안내, 좌석 정보 등" /></label>
          <button type="submit" disabled={saving} className="yume-button yume-button-primary min-h-11 w-full disabled:opacity-50">{saving ? '저장 중…' : editing ? '변경사항 저장' : '예약 저장'}</button>
          </fieldset>
        </form>
      </div>
    </section>
  </div>;
}
