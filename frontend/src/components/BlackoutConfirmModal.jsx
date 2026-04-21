export default function BlackoutConfirmModal({
  open,
  title,
  subtitle,
  items,
  /** Replaces the default “You marked this date as a blackout because:” line above each item’s reasons. */
  reasonIntro,
  /** Replaces the small footer note under the list. */
  footnote,
  confirmLabel = "Continue anyway",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal
      aria-labelledby="blackout-confirm-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 id="blackout-confirm-title" className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
        ) : null}

        <ul className="mt-4 space-y-4">
          {(items || []).map((item) => (
            <li
              key={item.key || item.gameId || item.headline}
              className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm"
            >
              <p className="font-medium text-slate-900">{item.headline}</p>
              {item.schedule ? (
                <p className="mt-0.5 text-xs text-slate-600">{item.schedule}</p>
              ) : null}
              <p className="mt-2 text-xs font-medium text-amber-900">
                {reasonIntro != null && reasonIntro !== ""
                  ? reasonIntro
                  : "You marked this date as a blackout because:"}
              </p>
              <ul className="mt-1 list-disc pl-4 text-xs text-amber-950/90">
                {(item.reasons || []).map((entry, i) => {
                  const line = typeof entry === "string" ? entry : entry?.line ?? "";
                  const note = typeof entry === "object" && entry?.note ? String(entry.note) : "";
                  return (
                    <li key={i}>
                      <span>{line}</span>
                      {note ? (
                        <span className="mt-0.5 block text-slate-700">
                          <span className="font-medium text-slate-800">Your note:</span> {note}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-xs text-slate-500">
          {footnote != null && footnote !== ""
            ? footnote
            : "Blackouts don’t block subs — this is a reminder. You can still request a sub if you’re only available for part of the day."}
        </p>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-amber-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
