import { useEffect, useState } from 'react';
import { createPlanShareLink, getPlanShareStatus, revokePlanShareLink } from '../../api/planShareApi';
import type { PlanShareStatus } from '../../types/planShare';
import { useFeedback } from '../common/useFeedback';

interface Props {
  planId: number;
  planName: string;
  onClose: () => void;
}

export default function PlanShareModal({ planId, planName, onClose }: Props) {
  const { confirm, showToast } = useFeedback();
  const [status, setStatus] = useState<PlanShareStatus | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [busy, setBusy] = useState(true);
  const [statusReady, setStatusReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getPlanShareStatus(planId)
      .then(value => {
        if (!active) return;
        setStatus(value);
        setStatusReady(true);
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '공유 상태를 불러오지 못했습니다.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [planId]);

  const retryStatus = async () => {
    setBusy(true);
    setError('');
    try {
      setStatus(await getPlanShareStatus(planId));
      setStatusReady(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '공유 상태를 불러오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const issueLink = async () => {
    if (status?.active && !await confirm({
      title: '공유 링크 갱신',
      message: '새 링크를 만들면 이전 링크는 바로 사용할 수 없게 됩니다. 계속할까요?',
      confirmLabel: '새 링크 만들기',
    })) return;

    setBusy(true);
    setError('');
    try {
      const result = await createPlanShareLink(planId);
      setShareUrl(`${window.location.origin}/shared#${result.token}`);
      setStatus({ active: true, updatedAt: result.createdAt });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '공유 링크를 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast({ message: '공유 링크를 복사했습니다.', type: 'success' });
    } catch {
      setError('자동 복사에 실패했습니다. 링크를 길게 눌러 복사해 주세요.');
    }
  };

  const revokeLink = async () => {
    if (!await confirm({
      title: '공유 중지',
      message: '이 링크로 여행 일정을 더 이상 볼 수 없게 됩니다. 공유를 중지할까요?',
      confirmLabel: '공유 중지',
      danger: true,
    })) return;

    setBusy(true);
    setError('');
    try {
      await revokePlanShareLink(planId);
      setStatus({ active: false, updatedAt: status?.updatedAt ?? null });
      setShareUrl('');
      showToast({ message: '공유를 중지했습니다.', type: 'success' });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '공유를 중지하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="plan-share-title">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-blue-600">YUME · 일정 공유</p>
            <h2 id="plan-share-title" className="mt-2 text-2xl font-black text-gray-900">{planName}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-lg px-2 text-2xl text-gray-400 hover:bg-gray-100">×</button>
        </div>

        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
          링크를 가진 사람은 로그인 없이 여행 날짜, 장소, 일정과 메모를 볼 수 있습니다. 개인적인 내용이 없는지 확인한 뒤 공유하세요.
        </div>

        {status?.active && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-800">
            공유 링크가 활성화되어 있습니다{status.updatedAt ? ` · ${new Date(status.updatedAt).toLocaleString()}` : ''}.
          </div>
        )}

        {shareUrl && (
          <div className="mt-4">
            <label htmlFor="share-link" className="mb-2 block text-xs font-bold text-gray-500">새 공유 링크</label>
            <div className="flex gap-2">
              <input id="share-link" readOnly value={shareUrl} onFocus={event => event.currentTarget.select()} className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700" />
              <button type="button" onClick={() => void copyLink()} className="rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700">복사</button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-center justify-between gap-3 text-sm font-semibold text-red-600">
            <p role="alert">{error}</p>
            {!statusReady && <button type="button" disabled={busy} onClick={() => void retryStatus()} className="shrink-0 underline disabled:opacity-50">다시 확인</button>}
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <div>
            {status?.active && <button type="button" disabled={busy} onClick={() => void revokeLink()} className="w-full rounded-xl border border-red-200 px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50 sm:w-auto">공유 중지</button>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50 sm:flex-none">닫기</button>
            <button type="button" disabled={busy || !statusReady} onClick={() => void issueLink()} className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50 sm:flex-none">
              {busy ? '처리 중…' : !statusReady ? '상태 확인 필요' : status?.active ? '새 링크 만들기' : '공유 링크 만들기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
