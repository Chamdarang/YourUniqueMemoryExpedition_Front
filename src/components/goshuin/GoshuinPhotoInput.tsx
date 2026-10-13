import { useEffect, useId, useRef, useState } from 'react';
import GoshuinPhoto from './GoshuinPhoto';

export default function GoshuinPhotoInput({ photoId, file, remove, onFile, onRemove }: {
  photoId: string | null; file: File | null; remove: boolean;
  onFile: (file: File | null) => void; onRemove: (remove: boolean) => void;
}) {
  const id = useId(); const [error, setError] = useState(''); const previewRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (previewRef.current) previewRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <div className="space-y-2">
    <label htmlFor={id} className="block text-sm font-semibold">사진 (선택)</label>
    <p className="text-xs text-gray-500">JPEG·PNG·WebP, 최대 10MB · HEIC는 지원하지 않습니다.</p>
    <input id={id} type="file" accept="image/jpeg,image/png,image/webp" className="block max-w-full text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-blue-50 file:px-3 file:text-blue-700"
      onChange={e => {
        const next = e.target.files?.[0] || null;
        if (next && (next.size > 10 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(next.type))) {
          setError('JPEG·PNG·WebP 사진을 10MB 이하로 선택해 주세요.'); e.target.value = ''; return;
        }
        setError(''); onFile(next); onRemove(false);
      }} />
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {file ? <img ref={previewRef} alt="선택한 사진 미리보기" className="max-h-48 max-w-full rounded-xl object-contain" />
      : photoId && !remove ? <GoshuinPhoto key={photoId} id={photoId} alt="현재 사진" /> : null}
    {(file || (photoId && !remove)) && <button type="button" className="yume-button yume-button-secondary" onClick={() => { onFile(null); onRemove(Boolean(photoId)); }}>사진 제거</button>}
    {remove && <p className="text-xs text-gray-500">저장하면 사진을 제거합니다. <button type="button" className="min-h-11 text-blue-700" onClick={() => onRemove(false)}>되돌리기</button></p>}
  </div>;
}
