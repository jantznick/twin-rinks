export default function LandingPage({ onOpenLogin }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
          Manage your hockey schedule
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-slate-600">
          View the full season calendar, manage your sub requests, and confirm your
          attendance for upcoming games across all leagues.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={onOpenLogin}
            className="rounded-full bg-indigo-600 px-8 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-500"
          >
            Sign in to your account
          </button>
        </div>
      </div>
    </div>
  );
}
