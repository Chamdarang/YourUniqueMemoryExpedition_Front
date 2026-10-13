import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { changeAccountPassword, deleteAccount, getAccountProfile, updateAccountNickname } from '../api/accountApi';
import { useFeedback } from '../components/common/useFeedback';
import { clearOfflineHomeSnapshot } from '../utils/offlineHomeStorage';
import { cacheAccountNickname } from '../utils/accountProfile';
import type { AccountProfile } from '../types/account';

export default function AccountSettingsPage() {
  const navigate = useNavigate();
  const { confirm, showToast } = useFeedback();
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [nickname, setNickname] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingNickname, setSavingNickname] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    let active = true;
    getAccountProfile()
      .then(account => {
        if (!active) return;
        setProfile(account);
        setNickname(account.nickname);
        cacheAccountNickname(account.nickname);
      })
      .catch(error => {
        if (active) showToast({ message: error instanceof Error ? error.message : '계정 정보를 불러오지 못했습니다.', type: 'error' });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [showToast]);

  const handleNicknameSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingNickname(true);
    try {
      const updated = await updateAccountNickname(nickname);
      setProfile(updated);
      setNickname(updated.nickname);
      cacheAccountNickname(updated.nickname);
      showToast({ message: '닉네임을 변경했습니다.', type: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : '닉네임을 변경하지 못했습니다.', type: 'error' });
    } finally {
      setSavingNickname(false);
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 4 || newPassword.length > 72) {
      showToast({ message: '새 비밀번호는 4~72자로 입력해 주세요.', type: 'info' });
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      showToast({ message: '새 비밀번호 확인이 일치하지 않습니다.', type: 'info' });
      return;
    }

    setSavingPassword(true);
    try {
      await changeAccountPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
      showToast({ message: '비밀번호를 변경했습니다.', type: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : '비밀번호를 변경하지 못했습니다.', type: 'error' });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDeleteAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (deleteConfirmation !== '탈퇴') {
      showToast({ message: '확인란에 탈퇴를 입력해 주세요.', type: 'info' });
      return;
    }
    if (!await confirm({
      title: '계정을 삭제할까요?',
      message: '계정과 함께 내 여행, 일정, 장소 보관함, 방문 기록이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.',
      confirmLabel: '계정 삭제',
      danger: true,
    })) return;

    setDeletingAccount(true);
    try {
      await deleteAccount(deletePassword);
      const username = localStorage.getItem('username');
      if (username) await clearOfflineHomeSnapshot(username).catch(() => undefined);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('username');
      localStorage.removeItem('nickname');
      localStorage.removeItem('tokenExpiry');
      navigate('/login', { replace: true });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : '계정을 삭제하지 못했습니다.', type: 'error' });
      setDeletingAccount(false);
    }
  };

  if (loading) return <div className="mx-auto max-w-3xl p-6 text-sm text-slate-500">계정 정보를 불러오는 중…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 pb-10 md:p-8">
      <header>
        <p className="text-sm font-semibold text-blue-600">MY ACCOUNT</p>
        <h1 className="mt-1 text-2xl font-black text-slate-900">계정 관리</h1>
        <p className="mt-2 text-sm text-slate-500">프로필과 로그인 정보를 관리할 수 있어요.</p>
      </header>

      <section className="yume-card p-5 md:p-6">
        <h2 className="text-lg font-bold text-slate-900">프로필</h2>
        <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3">
          <p className="text-xs font-medium text-slate-500">로그인 아이디</p>
          <p className="mt-1 font-semibold text-slate-800">{profile?.username || localStorage.getItem('username')}</p>
          <p className="mt-1 text-xs text-slate-500">아이디는 공동 계획 초대와 로그인에 사용됩니다.</p>
        </div>
        <form onSubmit={handleNicknameSubmit} className="mt-5">
          <label htmlFor="account-nickname" className="mb-1.5 block text-sm font-semibold text-slate-700">닉네임</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id="account-nickname" value={nickname} onChange={event => setNickname(event.target.value)} maxLength={100} required className="yume-input min-w-0 flex-1" />
            <button type="submit" disabled={savingNickname || !nickname.trim() || nickname.trim() === profile?.nickname} className="yume-button yume-button-primary">{savingNickname ? '저장 중…' : '닉네임 저장'}</button>
          </div>
        </form>
      </section>

      <section className="yume-card p-5 md:p-6">
        <h2 className="text-lg font-bold text-slate-900">비밀번호 변경</h2>
        <p className="mt-1 text-sm text-slate-500">현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다.</p>
        <form onSubmit={handlePasswordSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="current-password" className="mb-1.5 block text-sm font-semibold text-slate-700">현재 비밀번호</label>
            <input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required className="yume-input" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="new-password" className="mb-1.5 block text-sm font-semibold text-slate-700">새 비밀번호</label>
              <input id="new-password" type="password" autoComplete="new-password" minLength={4} maxLength={72} value={newPassword} onChange={event => setNewPassword(event.target.value)} required className="yume-input" />
            </div>
            <div>
              <label htmlFor="new-password-confirm" className="mb-1.5 block text-sm font-semibold text-slate-700">새 비밀번호 확인</label>
              <input id="new-password-confirm" type="password" autoComplete="new-password" minLength={4} maxLength={72} value={newPasswordConfirm} onChange={event => setNewPasswordConfirm(event.target.value)} required className="yume-input" />
            </div>
          </div>
          <button type="submit" disabled={savingPassword || !currentPassword || !newPassword || !newPasswordConfirm} className="yume-button yume-button-secondary px-5">{savingPassword ? '변경 중…' : '비밀번호 변경'}</button>
        </form>
      </section>

      <section className="yume-card yume-card-error p-5 md:p-6">
        <h2 className="text-lg font-bold text-red-800">계정 탈퇴</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">내 여행과 일정, 장소 보관함, 방문 기록이 삭제됩니다. 공동 편집 중인 다른 사용자의 여행에서는 계정이 제외되며, 삭제 후에는 복구할 수 없습니다.</p>
        <form onSubmit={handleDeleteAccount} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="delete-password" className="mb-1.5 block text-sm font-semibold text-slate-700">현재 비밀번호</label>
              <input id="delete-password" type="password" autoComplete="current-password" value={deletePassword} onChange={event => setDeletePassword(event.target.value)} required className="yume-input" />
            </div>
            <div>
              <label htmlFor="delete-confirmation" className="mb-1.5 block text-sm font-semibold text-slate-700">확인을 위해 ‘탈퇴’ 입력</label>
              <input id="delete-confirmation" value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value)} required className="yume-input" />
            </div>
          </div>
          <button type="submit" disabled={deletingAccount || !deletePassword || deleteConfirmation !== '탈퇴'} className="yume-button yume-button-danger-solid px-5">{deletingAccount ? '삭제 중…' : '계정 탈퇴'}</button>
        </form>
      </section>
    </div>
  );
}
