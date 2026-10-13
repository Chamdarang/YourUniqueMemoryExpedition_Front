import { useEffect, useRef, useState } from 'react';
import { getGoshuinPhoto } from '../../api/goshuinApi';

export default function GoshuinPhoto({ id, large = false, alt }: { id: string; large?: boolean; alt: string }) {
  const wrapper = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(large);
  const [state, setState] = useState<{ url?: string; failed?: boolean }>({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const element = wrapper.current;
    if (large || !element) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '150px' });
    observer.observe(element); return () => observer.disconnect();
  }, [large]);
  useEffect(() => {
    if (!visible) return;
    const abort = new AbortController(); let url = '';
    void getGoshuinPhoto(id, !large, abort.signal).then(blob => {
      if (abort.signal.aborted) return;
      url = URL.createObjectURL(blob); setState({ url });
    }).catch(() => { if (!abort.signal.aborted) setState({ failed: true }); });
    return () => { abort.abort(); if (url) URL.revokeObjectURL(url); };
  }, [id, large, retry, visible]);
  return <span ref={wrapper} className={large ? 'block' : 'inline-flex h-14 w-14 shrink-0 items-center justify-center'}>
    {state.failed ? <span className="text-xs text-gray-500">사진 보기 실패
      {large && <button type="button" className="ml-2 min-h-11 text-blue-700" onClick={() => { setState({}); setRetry(n => n + 1); }}>재시도</button>}
    </span> : state.url ? <img src={state.url} alt={alt} loading="lazy" className={large ? 'max-h-[65dvh] w-full object-contain' : 'h-14 w-14 rounded-lg bg-gray-50 object-contain'} />
      : <span role="status" className="text-xs text-gray-500">사진 읽는 중</span>}
  </span>;
}
