export default function LoginPanel({
  username,
  password,
  loading,
  onUsernameChange,
  onPasswordChange,
  onSubmit
}) {
  return (
    <section className="mx-auto max-w-md rounded-3xl border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-200/50 backdrop-blur">
      <h2 className="text-lg font-semibold text-slate-900">Sign in</h2>
      <p className="mt-1 text-sm text-slate-600">
        Use your existing login to view available games.
      </p>
      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Email</span>
          <input
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none ring-indigo-300 transition focus:ring-2"
            value={username}
            onChange={(event) => onUsernameChange(event.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Password</span>
          <input
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none ring-indigo-300 transition focus:ring-2"
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </section>
  );
}
