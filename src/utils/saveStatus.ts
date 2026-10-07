export type SaveStatus = 'IDLE' | 'SAVING' | 'SAVED' | 'ERROR';

export const SAVE_STATUS_EVENT = 'yume:save-status';

let pendingSaveCount = 0;
let hasSaveError = false;

export const publishSaveStatus = (status: SaveStatus) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<SaveStatus>(SAVE_STATUS_EVENT, { detail: status }));
  }
};

export const beginTrackedSave = () => {
  if (pendingSaveCount === 0) hasSaveError = false;
  pendingSaveCount += 1;
  publishSaveStatus('SAVING');
};

export const finishTrackedSave = (succeeded: boolean) => {
  if (!succeeded) hasSaveError = true;
  pendingSaveCount = Math.max(0, pendingSaveCount - 1);
  if (pendingSaveCount > 0) return;
  publishSaveStatus(hasSaveError ? 'ERROR' : 'SAVED');
};
