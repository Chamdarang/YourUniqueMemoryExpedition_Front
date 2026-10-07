import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { SpotPurchaseSaveRequest } from '../../types/purchase';
import type { PurchaseKind, PurchaseStatus } from '../../types/enums';
import { PURCHASE_KIND_KEYS, PURCHASE_STATUS_KEYS, getPurchaseKindInfo, getPurchaseStatusInfo } from '../../utils/purchaseUtils';
import PurchaseSpotSelect from './PurchaseSpotSelect';

export type PurchaseFormValue = SpotPurchaseSaveRequest & { spotUserId?: number };
interface Props {
    value: PurchaseFormValue;
    onChange: (updates: Partial<PurchaseFormValue>) => void;
    onSave: (value: PurchaseFormValue) => Promise<void>;
    onCancel?: () => void;
    editing?: boolean;
    selectSpot?: boolean;
    spotName?: string;
}
type FieldErrors = Partial<Record<'itemName' | 'spot' | 'price' | 'quantity' | 'save', string>>;

export default function PurchaseForm({ value, onChange, onSave, onCancel, editing = false, selectSpot = false, spotName }: Props) {
    const prefix = useId();
    const formRef = useRef<HTMLFormElement>(null);
    const nameRef = useRef<HTMLInputElement>(null);
    const submitting = useRef(false);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<FieldErrors>({});
    const id = (field: string) => `${prefix}-${field}`;
    const inputStyle = 'min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900';

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            formRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
            nameRef.current?.focus({ preventScroll: true });
        });
        return () => cancelAnimationFrame(frame);
    }, []);

    const update = (updates: Partial<PurchaseFormValue>) => {
        onChange(updates);
        setErrors(previous => {
            const next = { ...previous, save: undefined };
            for (const field of Object.keys(updates)) delete next[field as keyof FieldErrors];
            if ('spotUserId' in updates) delete next.spot;
            return next;
        });
    };
    const save = async () => {
        if (submitting.current) return;
        const next: FieldErrors = {
            itemName: value.itemName.trim() ? undefined : '기념품 이름을 입력해 주세요.',
            spot: selectSpot && !value.spotUserId ? '연결할 장소를 선택해 주세요.' : undefined,
            price: value.price != null && (!Number.isFinite(value.price) || value.price < 0) ? '가격은 0 이상으로 입력해 주세요.' : undefined,
            quantity: !Number.isInteger(value.quantity) || value.quantity < 1 ? '수량은 1 이상의 정수로 입력해 주세요.' : undefined,
        };
        setErrors(next);
        const field = (['itemName', 'spot', 'price', 'quantity'] as const).find(key => next[key]);
        if (field) {
            const target = field === 'spot' ? formRef.current?.querySelector<HTMLElement>('#purchase-spot') : document.getElementById(id(field));
            target?.focus();
            return;
        }
        submitting.current = true;
        setSaving(true);
        try { await onSave({ ...value, itemName: value.itemName.trim() }); }
        catch { setErrors({ save: '기념품을 저장하지 못했습니다. 입력 내용을 유지했으니 다시 시도해 주세요.' }); }
        finally { submitting.current = false; setSaving(false); }
    };
    const field = (key: string, label: string, control: ReactNode, error?: string) => (
        <div className="min-w-0">
            <label htmlFor={id(key)} className="mb-1 block text-xs font-semibold text-gray-700">{label}</label>
            {control}
            {error && <p id={id(`${key}-error`)} className="mt-1 text-xs text-red-700">{error}</p>}
        </div>
    );
    const describedBy = (key: keyof FieldErrors) => errors[key] ? id(`${key}-error`) : undefined;

    return (
        <form ref={formRef} aria-label={editing ? '기념품 정보 수정' : '새 기념품 등록'} aria-busy={saving} noValidate
            onSubmit={event => { event.preventDefault(); void save(); }}
            className="@container scroll-mt-4 space-y-4 rounded-3xl border border-gray-200 bg-gray-50 p-5 md:p-6">
            <h3 className="font-bold text-gray-900">{editing ? '✏️ 기념품 정보 수정' : '🎁 새 기념품 등록'}</h3>
            <p className="text-xs leading-5 text-gray-600">{selectSpot ? '이름과 장소는 필수입니다.' : '현재 장소에 기념품을 기록합니다.'} 가격·분류·메모는 나중에 추가할 수 있어요.</p>
            {errors.save && <p role="alert" className="text-sm text-red-700">{errors.save}</p>}
            <fieldset disabled={saving} className="space-y-4 disabled:opacity-70">
                <div className="grid grid-cols-1 gap-4 @md:grid-cols-2 @3xl:grid-cols-4">
                    {field('itemName', '기념품 이름 (필수)', <input ref={nameRef} id={id('itemName')} aria-required="true" aria-invalid={Boolean(errors.itemName)} aria-describedby={describedBy('itemName')} maxLength={200} placeholder="예: 교토 한정 부적" className={inputStyle} value={value.itemName} onChange={event => update({ itemName: event.target.value })} />, errors.itemName)}
                    {selectSpot ? <PurchaseSpotSelect value={value.spotUserId || 0} selectedName={spotName} validationError={errors.spot} onChange={spotUserId => update({ spotUserId })} />
                        : <div><p className="mb-1 text-xs font-semibold text-gray-700">장소</p><p className="min-h-11 rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-700">{spotName || '현재 장소'}</p></div>}
                    {field('kind', '종류', <select id={id('kind')} className={inputStyle} value={value.kind} onChange={event => update({ kind: event.target.value as PurchaseKind })}>{PURCHASE_KIND_KEYS.map(key => <option key={key} value={key}>{getPurchaseKindInfo(key).icon} {getPurchaseKindInfo(key).label}</option>)}</select>)}
                    {field('status', '구매 상태', <select id={id('status')} className={inputStyle} value={value.status} onChange={event => update({ status: event.target.value as PurchaseStatus })}>{PURCHASE_STATUS_KEYS.map(key => <option key={key} value={key}>{getPurchaseStatusInfo(key).label}</option>)}</select>)}
                </div>
                <div className="grid grid-cols-1 gap-4 @md:grid-cols-2 @3xl:grid-cols-4">
                    {field('price', '가격 (선택)', <input id={id('price')} type="number" min="0" step="any" aria-invalid={Boolean(errors.price)} aria-describedby={describedBy('price')} className={inputStyle} value={value.price ?? ''} onChange={event => update({ price: event.target.value === '' ? null : Number(event.target.value) })} />, errors.price)}
                    {field('currency', '통화', <select id={id('currency')} className={inputStyle} value={value.currency ?? 'JPY'} onChange={event => update({ currency: event.target.value })}><option value="JPY">JPY</option><option value="KRW">KRW</option>{value.currency && !['JPY', 'KRW'].includes(value.currency) && <option value={value.currency}>{value.currency}</option>}</select>)}
                    {field('quantity', '수량', <input id={id('quantity')} type="number" min="1" step="1" aria-invalid={Boolean(errors.quantity)} aria-describedby={describedBy('quantity')} className={inputStyle} value={Number.isNaN(value.quantity) ? '' : value.quantity} onChange={event => update({ quantity: event.target.value === '' ? NaN : Number(event.target.value) })} />, errors.quantity)}
                    {field('category', '카테고리 (선택)', <input id={id('category')} maxLength={40} className={inputStyle} value={value.category ?? ''} onChange={event => update({ category: event.target.value })} />)}
                </div>
                {field('note', '메모 (선택)', <textarea id={id('note')} maxLength={500} rows={2} className={`${inputStyle} py-3`} value={value.note ?? ''} placeholder="예약 정보나 기억할 내용을 적어 주세요." onChange={event => update({ note: event.target.value })} />)}
                <div className="flex flex-wrap justify-end gap-2">
                    {onCancel && <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-gray-300 bg-white px-5 text-sm font-semibold text-gray-700">취소</button>}
                    <button type="submit" className="min-h-11 rounded-xl bg-pink-600 px-6 text-sm font-bold text-white hover:bg-pink-700">{saving ? '저장 중…' : editing ? '수정 완료' : '저장하기'}</button>
                </div>
            </fieldset>
        </form>
    );
}
