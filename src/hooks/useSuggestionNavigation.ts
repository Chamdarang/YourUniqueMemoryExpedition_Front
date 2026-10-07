import { useEffect, useId, useState, type KeyboardEvent } from 'react';

/** Keep focus on the search input while navigating its suggestions. */
export function useSuggestionNavigation({ count, query, open, onOpen, onClose, onSelect }: {
  count: number; query: string; open: boolean;
  onOpen: () => void; onClose: () => void; onSelect: (index: number) => void;
}) {
  const listId = useId();
  const [selection, setSelection] = useState({ query: '', index: -1 });
  const activeIndex = open && selection.query === query && selection.index < count ? selection.index : -1;
  const optionId = (index: number) => `${listId}-${index}`;
  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, listId]);
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape' && open) {
      event.preventDefault(); event.stopPropagation(); onClose(); setSelection({ query, index: -1 });
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && count > 0) {
      event.preventDefault(); onOpen();
      const index = event.key === 'ArrowDown' ? (activeIndex + 1) % count : (activeIndex < 0 ? count - 1 : (activeIndex - 1 + count) % count);
      setSelection({ query, index });
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault(); onClose(); setSelection({ query, index: -1 }); onSelect(activeIndex);
    }
  };
  return { listId, optionId, activeIndex, inputProps: {
    role: 'combobox' as const, 'aria-autocomplete': 'list' as const,
    'aria-expanded': open, 'aria-controls': open ? listId : undefined,
    'aria-activedescendant': activeIndex >= 0 ? optionId(activeIndex) : undefined, onKeyDown,
  } };
}
