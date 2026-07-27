import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginApi, signupApi } from "../api/authApi";

type AuthMode = "login" | "signup";

export default function LoginPage() {
    const navigate = useNavigate();
    const [mode, setMode] = useState<AuthMode>("login");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const changeMode = (nextMode: AuthMode) => {
        setMode(nextMode);
        setPassword("");
        setPasswordConfirm("");
        setError("");
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const id = username.trim();

        if (!/^[A-Za-z0-9_]{3,30}$/.test(id)) {
            setError("아이디는 영문, 숫자, 밑줄을 사용해 3~30자로 입력해 주세요.");
            return;
        }
        if (password.length < 4 || password.length > 72) {
            setError("비밀번호는 4~72자로 입력해 주세요.");
            return;
        }
        if (mode === "signup" && password !== passwordConfirm) {
            setError("비밀번호 확인이 일치하지 않습니다.");
            return;
        }

        setLoading(true);
        setError("");
        try {
            if (mode === "signup") {
                await signupApi({ username: id, password });
            }

            const data = await loginApi({ username: id, password });
            localStorage.setItem("accessToken", data.token);
            localStorage.setItem("username", data.username);
            localStorage.setItem("tokenExpiry", data.expiryDate);
            navigate("/", { replace: true });
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "요청 처리 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
            <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
                <div className="bg-gradient-to-br from-blue-700 to-sky-500 px-8 py-9 text-white">
                    <p className="text-xs font-black tracking-[0.25em] text-blue-100">YUME</p>
                    <h1 className="mt-2 text-3xl font-black">여행의 모든 순간을 한곳에</h1>
                    <p className="mt-2 text-sm text-blue-50">이메일 없이 아이디와 비밀번호만 사용합니다.</p>
                </div>

                <div className="p-8">
                    <div className="mb-7 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                        <button
                            type="button"
                            onClick={() => changeMode("login")}
                            className={`rounded-lg py-2.5 text-sm font-bold transition ${
                                mode === "login"
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "text-slate-400 hover:text-slate-600"
                            }`}
                        >
                            로그인
                        </button>
                        <button
                            type="button"
                            onClick={() => changeMode("signup")}
                            className={`rounded-lg py-2.5 text-sm font-bold transition ${
                                mode === "signup"
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "text-slate-400 hover:text-slate-600"
                            }`}
                        >
                            회원가입
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="username" className="mb-1.5 block text-sm font-bold text-slate-700">
                                아이디
                            </label>
                            <input
                                id="username"
                                type="text"
                                required
                                minLength={3}
                                maxLength={30}
                                autoComplete="username"
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                                placeholder="예: chamchi"
                                value={username}
                                onChange={event => setUsername(event.target.value)}
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="mb-1.5 block text-sm font-bold text-slate-700">
                                비밀번호
                            </label>
                            <input
                                id="password"
                                type="password"
                                required
                                minLength={4}
                                maxLength={72}
                                autoComplete={mode === "login" ? "current-password" : "new-password"}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                                placeholder="4자 이상 입력"
                                value={password}
                                onChange={event => setPassword(event.target.value)}
                            />
                        </div>

                        {mode === "signup" && (
                            <div>
                                <label htmlFor="password-confirm" className="mb-1.5 block text-sm font-bold text-slate-700">
                                    비밀번호 확인
                                </label>
                                <input
                                    id="password-confirm"
                                    type="password"
                                    required
                                    minLength={4}
                                    maxLength={72}
                                    autoComplete="new-password"
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                                    placeholder="비밀번호를 한 번 더 입력"
                                    value={passwordConfirm}
                                    onChange={event => setPasswordConfirm(event.target.value)}
                                />
                            </div>
                        )}

                        {error && (
                            <div role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-2 w-full rounded-xl bg-blue-600 py-3.5 font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
                        >
                            {loading
                                ? "처리 중…"
                                : mode === "signup"
                                    ? "가입하고 시작하기"
                                    : "로그인"}
                        </button>
                    </form>

                    {mode === "signup" && (
                        <p className="mt-4 text-center text-xs leading-relaxed text-slate-400">
                            가입 후 바로 로그인되어 홈 화면으로 이동합니다.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
