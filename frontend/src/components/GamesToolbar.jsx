export default function GamesToolbar({
  loading,
  gameCount,
  hiddenCount,
  sourceType,
  pendingChanges,
  showHidden,
  denseMode,
  viewMode,
  onRefresh,
  onDemoSave,
  onToggleShowHidden,
  onToggleDenseMode,
  onChangeViewMode,
  onLogout
}) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-lg shadow-slate-200/40">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
        <div className="rounded-xl border border-slate-200 bg-white p-2.5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Actions
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Refreshing..." : "Refresh games"}
            </button>
            <button
              type="button"
              onClick={onDemoSave}
              className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800 transition hover:bg-sky-100"
            >
              Save selections (demo)
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-2.5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Views
          </p>
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
            <button
              type="button"
              onClick={() => onChangeViewMode("cards")}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                viewMode === "cards"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              Cards
            </button>
            <button
              type="button"
              onClick={() => onChangeViewMode("calendar")}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                viewMode === "calendar"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              Calendar
            </button>
            <button
              type="button"
              onClick={() => onChangeViewMode("list")}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                viewMode === "list"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              List
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleShowHidden}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {showHidden ? "Hide hidden" : "Show hidden"}
            </button>
            <button
              type="button"
              onClick={onToggleDenseMode}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {denseMode ? "Comfort" : "Dense"}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-2.5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Session
          </p>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Log out
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <span>
          Games loaded: <strong className="text-slate-900">{gameCount}</strong>
        </span>
        <span>
          Hidden: <strong className="text-slate-900">{hiddenCount}</strong>
        </span>
        <span className="text-xs text-slate-500">Parsed from: {sourceType}</span>
      </div>

      {pendingChanges ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          You have local changes not submitted yet.
        </p>
      ) : null}
    </div>
  );
}
