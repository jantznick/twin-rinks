import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "../lib/api";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setInfo("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!token) {
      setError("Missing reset token");
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setInfo("Password updated. You can sign in now.");
      setTimeout(() => navigate("/", { replace: true }), 1200);
    } catch (err) {
      setError(err.message || "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col justify-center px-4 py-16">
      <h1 className="text-2xl font-bold text-slate-900">Choose a new password</h1>
      {error ? (
        <p className="mt-4 text-sm text-rose-700">{error}</p>
      ) : null}
      {info ? (
        <p className="mt-4 text-sm text-emerald-700">{info}</p>
      ) : null}
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">New password</span>
          <input
            type="password"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Confirm password</span>
          <input
            type="password"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Saving…" : "Update password"}
        </button>
      </form>
      <Link to="/" className="mt-6 text-sm font-medium text-indigo-600 hover:underline">
        Back home
      </Link>
    </div>
  );
}
