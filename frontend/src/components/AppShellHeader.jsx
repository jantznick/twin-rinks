import AppPageNav from "./AppPageNav";

export default function AppShellHeader({ title, subtitle, rightContent }) {
  return (
    <header className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-md shadow-slate-200/40 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            HR
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Hockey Rink Subs</p>
            <p className="text-xs text-slate-500">Internal operations portal</p>
          </div>
        </div>
        <AppPageNav />
        {rightContent ? <div className="shrink-0">{rightContent}</div> : null}
      </div>
      <div className="mt-4 border-t border-slate-200 pt-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
      </div>
    </header>
  );
}
