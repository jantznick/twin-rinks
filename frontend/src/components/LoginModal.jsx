import { useEffect, useState } from "react";
import { authApi } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const TABS = {
  login: "login",
  register: "register"
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginModal({ open, onClose, initialEmail = "" }) {
  const { login, register, setUserFromAuth } = useAuth();
  const [tab, setTab] = useState(TABS.login);
  const [forgotMode, setForgotMode] = useState(false);
  const [magicCodeSent, setMagicCodeSent] = useState(false);
  const [magicCode, setMagicCode] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    setEmail(initialEmail || "");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setInfo("");
    setTab(TABS.login);
    setForgotMode(false);
    setMagicCodeSent(false);
    setMagicCode("");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open, initialEmail]);

  if (!open) return null;

  const isRegister = tab === TABS.register;

  const switchTab = (nextTab) => {
    setTab(nextTab);
    setForgotMode(false);
    setMagicCodeSent(false);
    setMagicCode("");
    setError("");
    setInfo("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const trimmed = email.trim();
      if (magicCodeSent) {
        const data = await authApi.verifyMagicCode(trimmed, magicCode);
        setUserFromAuth(data.user);
        onClose();
      } else if (forgotMode) {
        await authApi.forgotPassword(trimmed);
        setInfo("If an account exists for that email, a reset link was sent.");
      } else if (isRegister) {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match");
        }
        await register(trimmed, password);
        onClose();
      } else {
        await login(trimmed, password);
        onClose();
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async () => {
    const trimmed = email.trim();
    setError("");
    setInfo("");
    if (!EMAIL_RE.test(trimmed)) {
      setError("Enter a valid email first.");
      return;
    }
    setMagicLoading(true);
    try {
      await authApi.requestMagicLink(trimmed, isRegister ? "register" : undefined);
      setMagicCodeSent(true);
      setMagicCode("");
      setInfo(
        isRegister
          ? "Enter the six-digit code below or click the link in the email to finish creating your account."
          : "Enter the six-digit code below or click the link in the email to continue. If you don’t have an account yet, we’ll create one."
      );
    } catch (err) {
      setError(err.message || "Could not send magic link");
    } finally {
      setMagicLoading(false);
    }
  };

  const tabClass = (tabId) =>
    `flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
      tab === tabId
        ? "bg-white text-slate-900 shadow-sm"
        : "text-slate-600 hover:text-slate-900"
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-white/70 bg-white/90 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">
            {forgotMode ? "Reset password" : isRegister ? "Create account" : "Sign in"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {!forgotMode ? (
          <div className="mt-4 flex gap-1 rounded-xl bg-slate-100 p-1">
            <button type="button" className={tabClass(TABS.login)} onClick={() => switchTab(TABS.login)}>
              Sign in
            </button>
            <button type="button" className={tabClass(TABS.register)} onClick={() => switchTab(TABS.register)}>
              Create account
            </button>
          </div>
        ) : null}

        <p className="mt-3 text-sm text-slate-600">
          {magicCodeSent
            ? "Use the six-digit code or the link from the same email."
            : forgotMode
            ? "We’ll email a link to choose a new password."
            : isRegister
              ? "Create an account for this app. You can connect Twin Rinks later under Profile."
              : "Sign in with the email and password for this app. Twin Rinks is connected separately in Profile."}
        </p>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        {info ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            {info}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Email</span>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none ring-indigo-300 transition focus:ring-2"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                disabled={magicCodeSent}
                required
              />
            </label>

            {!forgotMode ? (
              <button
                type="button"
                onClick={handleMagicLink}
                disabled={magicLoading}
                className="mt-1.5 text-left text-sm text-slate-500 transition hover:text-indigo-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
              >
                {magicLoading
                  ? "Sending…"
                  : magicCodeSent
                    ? "Send a new code and magic link"
                    : "Email me a code or magic link instead"}
              </button>
            ) : null}
          </div>

          {magicCodeSent ? (
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Six-digit code</span>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-center text-xl font-semibold tracking-[0.35em] outline-none ring-indigo-300 transition focus:ring-2"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={magicCode}
                onChange={(event) =>
                  setMagicCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </label>
          ) : !forgotMode ? (
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Password</span>
              <div className="relative mt-1">
                <input
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 pr-16 outline-none ring-indigo-300 transition focus:ring-2"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>
          ) : null}

          {!magicCodeSent && !forgotMode && isRegister ? (
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Confirm password</span>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none ring-indigo-300 transition focus:ring-2"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
              />
            </label>
          ) : null}

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? "Please wait…"
                : magicCodeSent
                  ? "Verify code"
                  : forgotMode
                  ? "Send reset link"
                  : isRegister
                    ? "Create account"
                    : "Sign in"}
            </button>
          </div>
        </form>

        <div className="mt-4 text-center text-sm">
          {magicCodeSent ? (
            <button
              type="button"
              className="text-indigo-600 hover:underline"
              onClick={() => {
                setMagicCodeSent(false);
                setMagicCode("");
                setError("");
                setInfo("");
              }}
            >
              Use a password instead
            </button>
          ) : forgotMode ? (
            <button
              type="button"
              className="text-indigo-600 hover:underline"
              onClick={() => {
                setForgotMode(false);
                setError("");
                setInfo("");
              }}
            >
              Back to sign in
            </button>
          ) : !isRegister ? (
            <button
              type="button"
              className="text-indigo-600 hover:underline"
              onClick={() => {
                setForgotMode(true);
                setError("");
                setInfo("");
              }}
            >
              Forgot password?
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
