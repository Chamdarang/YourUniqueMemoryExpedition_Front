import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginApi } from '../api/authApi';

export default function LoginPage() {
    const navigate = useNavigate();

    // 백엔드 필드명(username)에 맞춰 상태 관리
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            // 1. API 호출
            const data = await loginApi({ username, password });

            // 2. 토큰 및 정보 저장
            localStorage.setItem('accessToken', data.token);
            localStorage.setItem('username', data.username);
            localStorage.setItem('tokenExpiry', data.expiryDate);

            alert('로그인 성공: ' + data.username);
            navigate('/', { replace: true });

        } catch (error: unknown) {
            console.error('로그인 에러:', error);

            if (error instanceof Error) {
                alert(error.message);
            } else {
                alert('알 수 없는 오류가 발생했습니다.');
            }
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 space-y-6">
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-gray-900">로그인</h1>
                    <p className="mt-2 text-sm text-gray-500">서비스 이용을 위해 로그인해주세요.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                            아이디 (Username)
                        </label>
                        <input
                            id="username"
                            type="text"
                            required
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
                            placeholder="아이디를 입력하세요"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>

                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                            비밀번호
                        </label>
                        <input
                            id="password"
                            type="password"
                            required
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
                            placeholder="비밀번호를 입력하세요"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition shadow-md active:scale-95"
                    >
                        로그인 하기
                    </button>
                </form>
            </div>
        </div>
    );
}