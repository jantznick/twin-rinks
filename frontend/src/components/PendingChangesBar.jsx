export default function PendingChangesBar({
  isExpanded,
  changeCount,
  changes,
  loading,
  error,
  onToggleExpanded,
  onSubmit,
  onCancel,
  onRemoveChange
}) {
  if (changeCount === 0) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 md:p-4">
      <div className="mx-auto w-full max-w-6xl rounded-2xl border border-slate-700 bg-slate-900/95 text-slate-100 shadow-2xl shadow-slate-900/40 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <p className="text-sm font-semibold">
            You have {changeCount} unsaved {changeCount === 1 ? "change" : "changes"}.
          </p>
          <button
            type="button"
            onClick={onToggleExpanded}
            className="rounded-lg border border-slate-600 px-2.5 py-1 text-xs text-slate-200 transition hover:bg-slate-800"
          >
            {isExpanded ? "Hide details" : "Review changes"}
          </button>
          <div className="grid w-full grid-cols-[1fr_3fr] gap-2 sm:ml-auto sm:flex sm:w-auto sm:grid-cols-none sm:items-center">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800 sm:py-1.5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={loading}
              className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60 sm:py-1.5"
            >
              {loading ? "Saving..." : "Submit"}
            </button>
          </div>
        </div>

        {error && (
          <div className="border-t border-rose-900/50 bg-rose-900/20 px-4 py-2.5">
            <p className="text-sm text-rose-200 flex items-center gap-2">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-rose-400">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </p>
          </div>
        )}

        {isExpanded ? (
          <div className="max-h-64 space-y-2 overflow-y-auto border-t border-slate-700 px-4 py-3">
            {changes.map((change) => (
              <div
                key={change.gameId}
                className="flex items-start gap-2 rounded-lg border border-slate-700/80 bg-slate-800/60 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100">
                    {change.headline}
                  </p>
                  <p className="truncate text-xs text-slate-300">{change.schedule}</p>
                  <p className="mt-0.5 text-xs text-indigo-200">{change.summary}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveChange(change.gameId)}
                  className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-200 transition hover:bg-slate-700"
                  aria-label={`Remove change for ${change.headline}`}
                >
                  x
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
