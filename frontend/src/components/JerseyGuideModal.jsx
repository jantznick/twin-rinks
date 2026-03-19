import { useEffect } from "react";

export default function JerseyGuideModal({ open, onClose, chart }) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Jersey Guide</h2>
            <p className="text-xs text-slate-600">
              Higher team color in chart wears white, lower wears black.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="mt-4 max-h-[62vh] overflow-y-auto">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Chart order (top = highest)
          </p>
          <ol className="space-y-1.5">
            {chart.map((item, index) => (
              <li
                key={item.name}
                className="flex items-center gap-2 rounded-md border border-slate-300 px-2 py-1.5"
                style={{ backgroundColor: item.bg, color: item.fg }}
              >
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-black/20 bg-white/40 px-1 text-[10px] font-bold">
                  {index + 1}
                </span>
                <span className="text-xs font-semibold">{item.name}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
