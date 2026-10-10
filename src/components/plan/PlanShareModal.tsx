import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useCallback, useEffect, useState } from 'react';
import { createPlanShareLink, getPlanShareStatus, revokePlanShareLink } from '../../api/planShareApi';
import { getPlanMembers, removePlanMember } from '../../api/planMemberApi';
import type { PlanMemberResponse } from '../../types/plan';
import type { PlanShareStatus } from '../../types/planShare';
import { useFeedback } from '../common/useFeedback';

interface Props { planId: number; planName: string; onClose: () => void; }
function formatDateTime(value: string) { return new Date(value).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }); }
function clearCachedShareToken(planId: number) {
  try { window.localStorage.removeItem(`yume:plan-share-token:${planId}`); } catch { /* Ignore storage cleanup failures. */ }
}

export default function PlanShareModal({ planId, planName, onClose }: Props) {
  const dialogRef = useDialogFocus(true, onClose);
  const { confirm, showToast } = useFeedback();
  const [status, setStatus] = useState<PlanShareStatus | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [busy, setBusy] = useState(true);
  const [statusReady, setStatusReady] = useState(false);
  const [error, setError] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('7');
  const [accessMode, setAccessMode] = useState<'VIEW' | 'EDIT'>('VIEW');
  const [members, setMembers] = useState<PlanMemberResponse[]>([]);

  const applyStatus = useCallback((value: PlanShareStatus) => {
    setStatus(value);
    setAccessMode(value.accessMode || 'VIEW');
    clearCachedShareToken(planId);
    setShareUrl(value.active && value.token ? `${window.location.origin}/shared#${value.token}` : '');
    setStatusReady(true);
  }, [planId]);

  const refreshMembers = async () => {
    try { setMembers((await getPlanMembers(planId)).filter(member => member.status === 'ACCEPTED')); } catch { /* Keep the current editor list if refresh fails. */ }
  };

  useEffect(() => {
    let active = true;
    getPlanShareStatus(planId)
      .then(value => { if (active) applyStatus(value); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '공유 상태를 불러오지 못했습니다.'); })
      .finally(() => { if (active) setBusy(false); });
    getPlanMembers(planId).then(value => { if (active) setMembers(value.filter(member => member.status === 'ACCEPTED')); }).catch(() => {});
    return () => { active = false; };
  }, [planId, applyStatus]);

  const retryStatus = async () => {
    setBusy(true); setError('');
    try { applyStatus(await getPlanShareStatus(planId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '공유 상태를 불러오지 못했습니다.'); }
    finally { setBusy(false); }
  };

  const issueLink = async () => {
    if (status?.active && !await confirm({
      title: '공유 링크 갱신',
      message: '새 링크를 만들면 기존 링크와 이 링크로 참여한 편집 권한은 더 이상 사용할 수 없게 됩니다. 계속할까요?',
      confirmLabel: '새 링크 만들기',
    })) return;
    setBusy(true); setError('');
    try {
      const result = await createPlanShareLink(planId, expiresInDays === 'never' ? null : Number(expiresInDays), accessMode);
      const next: PlanShareStatus = { state: 'ACTIVE', active: true, updatedAt: result.createdAt, expiresAt: result.expiresAt, token: result.token, accessMode: result.accessMode };
      applyStatus(next);
      await refreshMembers();
      showToast({ message: '공유 링크를 만들었습니다.', type: 'success' });
    } catch (reason) { setError(reason instanceof Error ? reason.message : '공유 링크를 만들지 못했습니다.'); }
    finally { setBusy(false); }
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareUrl); showToast({ message: '공유 링크를 복사했습니다.', type: 'success' }); }
    catch { setError('자동 복사에 실패했습니다. 링크를 직접 복사해 주세요.'); }
  };

  const revokeLink = async () => {
    if (!await confirm({ title: '공유 중지', message: '이 링크와 링크로 참여한 편집 권한을 모두 중지할까요?', confirmLabel: '공유 중지', danger: true })) return;
    setBusy(true); setError('');
    try {
      await revokePlanShareLink(planId); clearCachedShareToken(planId);
      setStatus({ state: 'REVOKED', active: false, updatedAt: status?.updatedAt ?? null, expiresAt: status?.expiresAt ?? null, token: null, accessMode: status?.accessMode ?? 'VIEW' });
      setShareUrl(''); await refreshMembers(); showToast({ message: '공유를 중지했습니다.', type: 'success' });
    } catch (reason) { setError(reason instanceof Error ? reason.message : '공유를 중지하지 못했습니다.'); }
    finally { setBusy(false); }
  };

  const removeMember = async (member: PlanMemberResponse) => {
    if (!await confirm({ title: '공동 편집자 제거', message: `${member.username}님을 이 여행에서 제거할까요?`, confirmLabel: '제거', danger: true })) return;
    try { await removePlanMember(planId, member.id); setMembers(current => current.filter(item => item.id !== member.id)); }
    catch (reason) { showToast({ message: reason instanceof Error ? reason.message : '편집자를 제거하지 못했습니다.', type: 'error' }); }
  };

  return (
    <div ref={dialogRef} tabIndex={-1} className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="plan-share-title">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl md:p-6">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0"><h2 id="plan-share-title" className="text-xl font-bold text-slate-900">공유</h2><p className="mt-1 truncate text-sm text-slate-500">{planName}</p></div>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-md px-2 text-xl text-slate-400 hover:bg-slate-100">×</button>
        </header>

        <section className="mt-5 border-t border-slate-200 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">링크 권한</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">링크를 받은 사람은 여행을 볼 수 있습니다. 편집 링크는 YUME 로그인 후 참여를 수락해야 편집할 수 있습니다.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className={`cursor-pointer rounded-lg border p-3 ${accessMode === 'VIEW' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
              <input type="radio" name="share-access" value="VIEW" checked={accessMode === 'VIEW'} onChange={() => setAccessMode('VIEW')} className="mr-2 accent-blue-600" />
              <span className="text-sm font-semibold text-slate-800">보기 전용</span><span className="mt-1 block pl-5 text-xs text-slate-500">로그인 없이 일정을 볼 수 있어요.</span>
            </label>
            <label className={`cursor-pointer rounded-lg border p-3 ${accessMode === 'EDIT' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
              <input type="radio" name="share-access" value="EDIT" checked={accessMode === 'EDIT'} onChange={() => setAccessMode('EDIT')} className="mr-2 accent-blue-600" />
              <span className="text-sm font-semibold text-slate-800">편집 가능</span><span className="mt-1 block pl-5 text-xs text-slate-500">로그인하고 참여를 수락하면 함께 편집해요.</span>
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor="share-expiry" className="shrink-0 text-xs font-medium text-slate-600">링크 만료</label>
            <select id="share-expiry" value={expiresInDays} onChange={event => setExpiresInDays(event.target.value)} disabled={busy || !statusReady} className="yume-input min-w-0 flex-1 disabled:opacity-60">
              <option value="never">만료 없음</option><option value="1">1일 후</option><option value="7">7일 후</option><option value="30">30일 후</option>
            </select>
            <button type="button" disabled={busy || !statusReady} onClick={() => void issueLink()} className="yume-button yume-button-primary shrink-0">{busy ? '처리 중…' : status?.active ? '새 링크 만들기' : '링크 만들기'}</button>
          </div>
          <p className="mt-2 text-xs text-slate-500">새 링크는 기본 7일 후 만료됩니다.</p>
          {status?.active && <p className="mt-3 text-xs text-slate-600">현재 링크 · {status.accessMode === 'EDIT' ? '편집 가능' : '보기 전용'} · {status.expiresAt ? `${formatDateTime(status.expiresAt)} 만료` : '만료 없음'}</p>}
          {status?.state === 'EXPIRED' && <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">{status.expiresAt ? `${formatDateTime(status.expiresAt)}에 공유 링크가 만료되었습니다.` : '공유 링크가 만료되었습니다.'} 새 링크를 만들면 다시 공유할 수 있습니다.</p>}
          {status?.state === 'REVOKED' && <p role="status" className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs leading-5 text-slate-700">공유를 중지한 상태입니다. 새 링크를 만들면 다시 공유할 수 있습니다.</p>}
          {status?.active && !status.token && <p className="mt-2 text-xs leading-5 text-amber-700">현재 링크 주소를 복구할 수 없습니다. 새 링크를 만들면 기존 링크는 사용할 수 없게 됩니다.</p>}
          {shareUrl && <div className="mt-3 flex gap-2"><input aria-label="공유 링크" readOnly value={shareUrl} onFocus={event => event.currentTarget.select()} className="yume-input yume-input-soft min-w-0 flex-1 text-xs" /><button type="button" onClick={() => void copyLink()} className="yume-button yume-button-secondary shrink-0">복사</button></div>}
          {status?.active && <button type="button" disabled={busy} onClick={() => void revokeLink()} className="yume-button yume-button-danger-outline mt-3">링크 공유 중지</button>}
        </section>

        {members.length > 0 && <section className="mt-5 border-t border-slate-200 pt-4"><h3 className="text-sm font-semibold text-slate-900">함께 편집 중</h3><ul className="mt-2 divide-y divide-slate-100">{members.map(member => <li key={member.id} className="flex items-center justify-between gap-3 py-2"><span className="truncate text-sm text-slate-700">{member.username}</span><button type="button" onClick={() => void removeMember(member)} className="shrink-0 px-2 py-1 text-xs text-slate-500 hover:text-red-600">제거</button></li>)}</ul></section>}
        {error && <div className="mt-4 flex items-center justify-between gap-3 text-sm text-red-600"><p role="alert">{error}</p>{!statusReady && <button type="button" disabled={busy} onClick={() => void retryStatus()} className="shrink-0 underline disabled:opacity-50">다시 확인</button>}</div>}
        <footer className="mt-5 flex justify-end border-t border-slate-100 pt-4"><button type="button" onClick={onClose} className="yume-button yume-button-secondary">닫기</button></footer>
      </div>
    </div>
  );
}
