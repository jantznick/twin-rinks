import { NavLink } from "react-router-dom";

export default function AppPageNav() {
  return (
    <nav className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            isActive
              ? "bg-white text-slate-900 shadow-sm shadow-slate-200/70"
              : "text-slate-600 hover:bg-white/70 hover:text-slate-800"
          }`
        }
      >
        Subs
      </NavLink>
      <NavLink
        to="/schedule"
        className={({ isActive }) =>
          `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            isActive
              ? "bg-white text-slate-900 shadow-sm shadow-slate-200/70"
              : "text-slate-600 hover:bg-white/70 hover:text-slate-800"
          }`
        }
      >
        Schedule
      </NavLink>
    </nav>
  );
}
