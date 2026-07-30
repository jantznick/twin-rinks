import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setUserFromAuth } = useAuth();
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setError("Missing verification token.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await authApi.verifyEmail(token);
        if (cancelled) return;
        setUserFromAuth(data.user);
        setDone(true);
        setTimeout(() => navigate("/", { replace: true }), 800);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Verification link is invalid or expired.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, navigate, setUserFromAuth]);

  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col justify-center px-4 py-16">
      <h1 className="text-2xl font-bold text-slate-900">Verify email</h1>
      {error ? (
        <p className="mt-4 text-sm text-rose-700">{error}</p>
      ) : done ? (
        <p className="mt-4 text-sm text-emerald-700">Email verified. Redirecting…</p>
      ) : (
        <p className="mt-4 text-sm text-slate-600">Confirming your email…</p>
      )}
      <Link to="/" className="mt-6 text-sm font-medium text-indigo-600 hover:underline">
        Back home
      </Link>
    </div>
  );
}
