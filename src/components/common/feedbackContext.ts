import { createContext } from 'react';

export interface ToastOptions {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
}

export interface UndoableOptions {
  key: string;
  message: string;
  commit: () => Promise<void>;
  duration?: number;
  successMessage?: string;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

export interface FeedbackContextValue {
  showToast: (options: ToastOptions | string) => void;
  runUndoable: (options: UndoableOptions) => boolean;
  isUndoablePending: (key: string) => boolean;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

export const FeedbackContext = createContext<FeedbackContextValue | null>(null);
