import type { ToastOptions } from './feedbackContext';

export const FEEDBACK_TOAST_EVENT = 'yume:feedback-toast';
export const FEEDBACK_FLASH_KEY = 'yume:feedback-flash';

export const emitFeedbackToast = (options: ToastOptions) => {
  window.dispatchEvent(new CustomEvent<ToastOptions>(FEEDBACK_TOAST_EVENT, { detail: options }));
};

export const saveFeedbackFlash = (options: ToastOptions) => {
  sessionStorage.setItem(FEEDBACK_FLASH_KEY, JSON.stringify(options));
};
