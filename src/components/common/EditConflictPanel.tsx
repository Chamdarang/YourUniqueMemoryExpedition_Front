import { useEffect, useId, useState } from 'react';

export interface EditConflictField {
  key: string;
  label: string;
  original: string | null;
  mine: string | null;
  latest: string | null;
}

interface Props {
  title: string;
  fields: EditConflictField[];
  onApply: (values: Record<string, string | null>) => void;
  onUseLatest: () => void;
  onCancel: () => void;
}

const shown = (value: string | null) => value == null || value === '' ? '(비어 있음)' : value;

export default function EditConflictPanel({ title, fields, onApply, onUseLatest, onCancel }: Props) {
  const titleId = useId();
  const conflictingFields = fields.filter(field =>
    field.mine !== field.original && field.latest !== field.original && field.mine !== field.latest
  );
  const [choices, setChoices] = useState<Record<string, 'mine' | 'latest'>>({});
  const conflictSnapshot = fields.map(field => `${field.key}:${field.original ?? ''}:${field.mine ?? ''}:${field.latest ?? ''}`).join('|');
  useEffect(() => setChoices({}), [conflictSnapshot]);
  const unresolved = conflictingFields.filter(field => !choices[field.key]);

  const applyMerge = () => {
    const values: Record<string, string | null> = {};
    for (const field of fields) {
      if (field.mine === field.original) values[field.key] = field.latest;
      else if (field.latest === field.original || field.mine === field.latest) values[field.key] = field.mine;
      else values[field.key] = choices[field.key] === 'mine' ? field.mine : field.latest;
    }
    onApply(values);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <h2 id={titleId} className="text-lg font-black text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">저장 중 다른 사용자가 내용을 바꿨습니다. 원래 내용과 각 변경값을 비교해 주세요. 한쪽에서만 바뀐 항목은 자동으로 병합되고, 양쪽에서 다르게 바꾼 항목은 선택이 필요합니다.</p>
        <div className="mt-4 space-y-3">
          {fields.filter(field => field.mine !== field.original || field.latest !== field.original).map(field => {
            const conflict = conflictingFields.some(item => item.key === field.key);
            return (
              <article key={field.key} className="rounded-xl border border-slate-200 p-3">
                <h3 className="font-bold text-slate-800">{field.label}{conflict && <span className="ml-2 text-xs font-bold text-amber-700">양쪽에서 수정</span>}</h3>
                <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                  <div><dt className="text-xs font-semibold text-slate-500">처음 불러온 값</dt><dd className="mt-1 whitespace-pre-wrap break-words">{shown(field.original)}</dd></div>
                  <div><dt className="text-xs font-semibold text-blue-700">내 수정안</dt><dd className="mt-1 whitespace-pre-wrap break-words">{shown(field.mine)}</dd></div>
                  <div><dt className="text-xs font-semibold text-emerald-700">최신 저장값</dt><dd className="mt-1 whitespace-pre-wrap break-words">{shown(field.latest)}</dd></div>
                </dl>
                {conflict && <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => setChoices(current => ({ ...current, [field.key]: 'mine' }))} aria-pressed={choices[field.key] === 'mine'} className={`min-h-10 rounded-lg border px-3 text-sm font-bold ${choices[field.key] === 'mine' ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-300 text-slate-700'}`}>내 수정안 사용</button>
                  <button type="button" onClick={() => setChoices(current => ({ ...current, [field.key]: 'latest' }))} aria-pressed={choices[field.key] === 'latest'} className={`min-h-10 rounded-lg border px-3 text-sm font-bold ${choices[field.key] === 'latest' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-300 text-slate-700'}`}>최신 저장값 사용</button>
                </div>}
              </article>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={onCancel} className="min-h-10 rounded-lg border border-slate-300 px-4 text-sm font-bold text-slate-700">계속 편집</button>
          <button type="button" onClick={onUseLatest} className="min-h-10 rounded-lg border border-slate-300 px-4 text-sm font-bold text-slate-700">최신 저장값으로 바꾸기</button>
          <button type="button" disabled={unresolved.length > 0} onClick={applyMerge} className="min-h-10 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">선택한 값으로 병합 저장</button>
        </div>
      </section>
    </div>
  );
}
