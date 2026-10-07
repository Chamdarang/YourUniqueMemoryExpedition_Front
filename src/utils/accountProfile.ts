export const ACCOUNT_PROFILE_UPDATED_EVENT = 'yume:account-profile-updated';

export function cacheAccountNickname(nickname: string) {
  localStorage.setItem('nickname', nickname);
  window.dispatchEvent(new CustomEvent(ACCOUNT_PROFILE_UPDATED_EVENT, { detail: { nickname } }));
}
