import { useEffect, useRef } from 'react';

const dialogs: HTMLElement[] = [];
const focusable = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

/** Keep keyboard focus in the topmost dialog and return it to its opener. */
export function useDialogFocus(open: boolean, onClose: () => void, returnFocus?: () => HTMLElement | null) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const openerRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef(returnFocus);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => { returnFocusRef.current = returnFocus; }, [returnFocus]);
  useEffect(() => {
    if (open) return;
    const rememberOpener = (event: Event) => {
      if (event.target instanceof HTMLElement) openerRef.current = event.target.closest<HTMLElement>(`${focusable}, summary`);
    };
    document.addEventListener('pointerdown', rememberOpener, true);
    document.addEventListener('keydown', rememberOpener, true);
    return () => {
      document.removeEventListener('pointerdown', rememberOpener, true);
      document.removeEventListener('keydown', rememberOpener, true);
    };
  }, [open]);
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const opener = active && active !== document.body && !dialog.contains(active) && active.getClientRects().length > 0 ? active : openerRef.current;
    dialogs.push(dialog);
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusable))
      .filter(element => element.getClientRects().length > 0);
    (dialog.querySelector<HTMLElement>("[data-dialog-initial-focus]") || controls()[0] || dialog).focus();
    const keydown = (event: KeyboardEvent) => {
      if (dialogs.at(-1) !== dialog) return;
      if (event.key === 'Escape' && event.target instanceof HTMLElement && event.target.getAttribute('role') === 'combobox' && event.target.getAttribute('aria-expanded') === 'true') return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const items = controls();
      const first = items[0];
      const last = items.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (!dialog.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus();
      }
    };
    const focusin = (event: FocusEvent) => {
      if (dialogs.at(-1) === dialog && !dialog.contains(event.target as Node)) (controls()[0] || dialog).focus();
    };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', focusin);
    return () => {
      dialogs.splice(dialogs.indexOf(dialog), 1);
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', focusin);
      const explicitTarget = returnFocusRef.current?.();
      if (explicitTarget?.isConnected) explicitTarget.focus();
      else if (opener?.isConnected) {
        const menu = opener.closest('details');
        const restoreTarget = menu && !menu.open ? menu.querySelector('summary') : opener;
        restoreTarget?.focus();
      }
    };
  }, [open]);
  return ref;
}
