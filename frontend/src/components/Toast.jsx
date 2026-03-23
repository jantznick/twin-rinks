import { useEffect } from "react";

export default function Toast({ message, type = "success", onClose, duration = 5000 }) {
  useEffect(() => {
    if (!message) return;
    // Increase duration for longer messages so users have time to read them
    const actualDuration = message.length > 50 ? Math.max(duration, 7000) : duration;
    const timer = setTimeout(() => {
      onClose();
    }, actualDuration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  const isSuccess = type === "success";

  return (
    <div className="fixed bottom-6 left-1/2 z-[60] w-full max-w-md -translate-x-1/2 transform px-4 transition-all duration-300 ease-out animate-in slide-in-from-bottom-4 fade-in">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900/95 px-4 py-3 text-slate-100 shadow-2xl shadow-slate-900/40 backdrop-blur">
        {isSuccess ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        )}
        <p className="flex-1 text-sm font-medium">{message}</p>
        <button 
          onClick={onClose} 
          className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
