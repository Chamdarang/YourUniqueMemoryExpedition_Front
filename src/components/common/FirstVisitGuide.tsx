import { useEffect, useState } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { createPortal } from 'react-dom';

export type GuideStep = {
  target: string;
  title: string;
  description: string;
};

const onboardingSteps: GuideStep[] = [
  { target: 'home-plan', title: '홈에서 여행 상황을 확인해요', description: '여행 중에는 진행 중인 여행과 오늘 일정이 이곳에 표시돼요.' },
  { target: 'nav-plans', title: '여행과 날짜별 일정을 관리해요', description: '내 여행에서 여행을 열고 날짜별 일정을 추가하거나 수정할 수 있어요.' },
  { target: 'nav-explore', title: '장소를 찾아 보관해요', description: '탐색에서 장소를 찾고 내 장소에 저장해 두면 일정에 추가하기 편해요.' },
];

type Rect = { top: number; left: number; width: number; height: number };
type Box = { top: number; left: number; width: number; height: number };

function findTargetElement(target: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-guide-target="${target}"]`))
    .find(candidate => {
      const rect = candidate.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }) ?? null;
}

function readTargetRect(target: string): Rect | null {
  const element = findTargetElement(target);
  if (!element) return null;
  const { top, left, width, height } = element.getBoundingClientRect();
  return { top, left, width, height };
}


export default function FirstVisitGuide({ onClose, steps = onboardingSteps, label = '처음 사용하기' }: { onClose: () => void; steps?: GuideStep[]; label?: string }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const step = steps[stepIndex];

  const dialogRef = useDialogFocus(Boolean(targetRect && box), onClose);

  useEffect(() => {
    const update = () => {
      const rect = readTargetRect(step.target);
      setTargetRect(rect);
      if (!rect) { setBox(null); return; }

      const width = window.innerWidth;
      const height = window.innerHeight;
      const mobile = width < 768;
      const boxWidth = mobile ? Math.max(280, width - 32) : 344;
      const boxHeight = Math.min(232, height - 32);
      const left = mobile
        ? 16
        : rect.left > boxWidth + 48
          ? 24
          : Math.min(width - boxWidth - 24, Math.max(24, rect.left + rect.width + 20));
      const top = mobile
        ? rect.top + rect.height / 2 > height / 2 ? 16 : height - boxHeight - 16
        : Math.min(height - boxHeight - 24, Math.max(24, rect.top + rect.height / 2 - boxHeight / 2));
      setBox({ top, left, width: Math.min(boxWidth, width - 32), height: boxHeight });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(document.documentElement);
    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step.target]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  if (!targetRect || !box) return null;

  const target = {
    top: Math.max(4, targetRect.top - 6),
    left: Math.max(4, targetRect.left - 6),
    width: Math.min(window.innerWidth - 8, targetRect.width + 12),
    height: Math.min(window.innerHeight - 8, targetRect.height + 12),
  };
  const boxCenterX = box.left + box.width / 2;
  const boxCenterY = box.top + box.height / 2;
  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;
  const directionX = targetCenterX - boxCenterX;
  const directionY = targetCenterY - boxCenterY;
  const unitLength = Math.hypot(directionX, directionY) || 1;
  const unitX = directionX / unitLength;
  const unitY = directionY / unitLength;
  const boxScale = Math.min(
    box.width / 2 / Math.max(Math.abs(directionX), 0.001),
    box.height / 2 / Math.max(Math.abs(directionY), 0.001),
  );
  const targetScale = Math.min(
    target.width / 2 / Math.max(Math.abs(directionX), 0.001),
    target.height / 2 / Math.max(Math.abs(directionY), 0.001),
  );
  const arrowStartX = boxCenterX + directionX * boxScale;
  const arrowStartY = boxCenterY + directionY * boxScale;
  const targetEdgeX = targetCenterX - directionX * targetScale;
  const targetEdgeY = targetCenterY - directionY * targetScale;
  const arrowEndX = targetEdgeX - unitX * 8;
  const arrowEndY = targetEdgeY - unitY * 8;

  const next = () => {
    if (stepIndex === steps.length - 1) onClose();
    else setStepIndex(index => index + 1);
  };

  return createPortal(
    <div ref={dialogRef} tabIndex={-1} className="fixed inset-0 z-[1000]" role="dialog" aria-modal="true" aria-labelledby="first-visit-guide-title" aria-describedby="first-visit-guide-description">
      <button type="button" tabIndex={-1} aria-hidden="true" aria-label="가이드 닫기" className="absolute inset-0 h-full w-full cursor-default bg-transparent" onClick={onClose} />
      <div aria-hidden="true" className="pointer-events-none fixed rounded-2xl border-2 border-white shadow-[0_0_0_9999px_rgba(15,23,42,0.64)]" style={{ top: target.top, left: target.left, width: target.width, height: target.height }} />
      <svg className="pointer-events-none fixed inset-0 h-full w-full" aria-hidden="true">
        <defs><marker id="guide-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9" fill="none" stroke="#fff" strokeWidth="1.5" /></marker></defs>
        <line x1={arrowStartX} y1={arrowStartY} x2={arrowEndX} y2={arrowEndY} stroke="white" strokeWidth="2" markerEnd="url(#guide-arrow)" />
      </svg>
      <section className="fixed z-[1002] overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl" style={{ top: box.top, left: box.left, width: box.width, maxHeight: 'calc(100dvh - 32px)' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-500">{label} · {stepIndex + 1}/{steps.length}</p>
            <h2 id="first-visit-guide-title" className="mt-1 text-base font-bold">{step.title}</h2>
            <p id="first-visit-guide-description" className="mt-2 text-sm leading-5 text-slate-600">{step.description}</p>
          </div>
          <button type="button" onClick={onClose} className="min-h-11 min-w-11 -mr-1 -mt-1 shrink-0 rounded px-1 text-lg leading-none text-slate-400 hover:text-slate-700" aria-label="가이드 닫기">×</button>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800">건너뛰기</button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && <button type="button" onClick={() => setStepIndex(index => index - 1)} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">이전</button>}
            <button type="button" onClick={next} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
              {stepIndex === steps.length - 1 ? '시작하기' : '다음'}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
