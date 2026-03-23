import { NavLink } from "react-router-dom";

export default function TopNav({ isLoggedIn, userEmail, onLogout, onOpenLogin }) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6 md:gap-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white shadow-sm">
              HR
            </div>
            <span className="hidden text-lg font-bold tracking-tight text-slate-900 sm:block">
              Hockey Rink
            </span>
          </div>
          <nav className="flex items-center gap-1">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`
              }
            >
              Subs
            </NavLink>
            <NavLink
              to="/schedule"
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`
              }
            >
              Schedule
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {isLoggedIn ? (
            <div className="flex items-center gap-4">
              <NavLink
                to="/profile"
                className={({ isActive }) =>
                  `hidden text-sm font-medium transition sm:block ${
                    isActive ? "text-indigo-600" : "text-slate-700 hover:text-indigo-600"
                  }`
                }
              >
                {userEmail} (Edit your profile)
              </NavLink>
              <button
                type="button"
                onClick={onLogout}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Log out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenLogin}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
