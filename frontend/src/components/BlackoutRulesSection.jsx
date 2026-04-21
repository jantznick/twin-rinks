import { useEffect, useMemo, useState } from "react";
import { RECURRENCE, TWIN_RINKS_SCOPE } from "../lib/blackoutRules";
import { isScheduleId } from "../lib/sportsengineCalendars";

const WEEKDAYS = [
  { v: 0, label: "Sunday" },
  { v: 1, label: "Monday" },
  { v: 2, label: "Tuesday" },
  { v: 3, label: "Wednesday" },
  { v: 4, label: "Thursday" },
  { v: 5, label: "Friday" },
  { v: 6, label: "Saturday" }
];

/** 1–4 = nth time that weekday appears in the month; 5 = last occurrence that month */
const MONTH_ORD = [
  { v: 1, label: "First" },
  { v: 2, label: "Second" },
  { v: 3, label: "Third" },
  { v: 4, label: "Fourth" },
  { v: 5, label: "Last" }
];

function formatMonthlyOccurrencePhrase(monthOrdinal, weekday) {
  const wd = WEEKDAYS.find((w) => w.v === Number(weekday))?.label || "day";
  const o = Number(monthOrdinal);
  if (o === 5) {
    return `Last ${wd} of each month`;
  }
  const lead = MONTH_ORD.find((x) => x.v === o)?.label || "";
  return `${lead} ${wd} of each month`;
}

function newDraftRule() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return {
    localKey: `new-${Date.now()}`,
    recurrenceKind: RECURRENCE.ONE_OFF,
    oneOffDate: `${y}-${m}-${d}`,
    weekday: 6,
    monthOrdinal: 1,
    leagueScopes: [],
    restrictLeagues: false,
    note: ""
  };
}

function draftRowsToPayload(rows) {
  return rows.map((r) => {
    const scopes =
      r.restrictLeagues && Array.isArray(r.leagueScopes) && r.leagueScopes.length > 0
        ? r.leagueScopes
        : [];
    const noteRaw = String(r.note ?? "").trim();
    const note = noteRaw.length > 0 ? noteRaw.slice(0, 500) : undefined;
    const base = {
      recurrenceKind: r.recurrenceKind,
      leagueScopes: scopes,
      ...(note ? { note } : {})
    };
    if (r.recurrenceKind === RECURRENCE.ONE_OFF) {
      return { ...base, oneOffDate: r.oneOffDate, weekday: null, monthOrdinal: null };
    }
    if (r.recurrenceKind === RECURRENCE.WEEKLY) {
      return { ...base, oneOffDate: null, weekday: Number(r.weekday), monthOrdinal: null };
    }
    return {
      ...base,
      oneOffDate: null,
      weekday: Number(r.weekday),
      monthOrdinal: Number(r.monthOrdinal)
    };
  });
}

function buildRowFromEditor(editor) {
  const scopes =
    editor.restrictLeagues &&
    Array.isArray(editor.leagueScopes) &&
    editor.leagueScopes.length > 0
      ? editor.leagueScopes
      : [];
  if (editor.restrictLeagues && scopes.length === 0) {
    return {
      error: "Choose at least one league, or turn off “specific league only.”"
    };
  }
  return {
    row: {
      localKey: `new-${Date.now()}`,
      recurrenceKind: editor.recurrenceKind,
      oneOffDate: editor.oneOffDate,
      weekday: editor.weekday,
      monthOrdinal: editor.monthOrdinal,
      leagueScopes: scopes,
      restrictLeagues: editor.restrictLeagues,
      note: String(editor.note ?? "").trim()
    }
  };
}

function summarizeRule(rule, calendars) {
  const useAll =
    rule.restrictLeagues === false ||
    !Array.isArray(rule.leagueScopes) ||
    rule.leagueScopes.length === 0;
  const scopes = useAll
    ? "All leagues"
    : rule.leagueScopes
        .map((id) =>
          id === TWIN_RINKS_SCOPE
            ? "Twin Rinks"
            : calendars.find((c) => c.scheduleId === id)?.leagueLabel || "League"
        )
        .join(", ");
  const kind = rule.recurrenceKind;
  let rec = "";
  if (kind === RECURRENCE.ONE_OFF) {
    rec = `One-time · ${rule.oneOffDate || ""}`;
  } else if (kind === RECURRENCE.WEEKLY) {
    rec = `Weekly · ${WEEKDAYS.find((w) => w.v === Number(rule.weekday))?.label || ""}`;
  } else {
    rec = formatMonthlyOccurrencePhrase(rule.monthOrdinal, rule.weekday);
  }
  const note = String(rule.note || "").trim();
  const noteBit = note ? ` · Note: ${note}` : "";
  return `${scopes} — ${rec}${noteBit}`;
}

export default function BlackoutRulesSection({
  userEmail,
  sportsengineCalendars = [],
  initialRules = [],
  demoMode,
  showToast,
  onRulesSaved
}) {
  const [draft, setDraft] = useState([]);
  const [editor, setEditor] = useState(() => newDraftRule());
  const [editorDirty, setEditorDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const patchEditor = (partial) => {
    setEditorDirty(true);
    setEditor((p) => ({ ...p, ...partial }));
  };

  const patchEditorFn = (fn) => {
    setEditorDirty(true);
    setEditor(fn);
  };

  useEffect(() => {
    setDraft(
      (initialRules || []).map((r) => ({
        ...r,
        note: r.note != null ? String(r.note) : "",
        localKey: r.id || `k-${Math.random().toString(36).slice(2)}`,
        restrictLeagues: Array.isArray(r.leagueScopes) && r.leagueScopes.length > 0
      }))
    );
  }, [initialRules]);

  const calendarsWithIds = useMemo(
    () => sportsengineCalendars.filter((c) => isScheduleId(String(c?.scheduleId || "").trim())),
    [sportsengineCalendars]
  );

  const persist = async (rulesPayload, options = {}) => {
    const successMessage = options.successMessage ?? "Blackout rules saved.";
    if (demoMode) {
      showToast?.({
        type: "error",
        text: "Blackout rules can’t be saved in demo mode. Turn off demo mode on My Games & Subs."
      });
      throw new Error("demo_mode");
    }
    const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
    const phpsessid =
      localStorage.getItem("legacy-phpsessid") || sessionStorage.getItem("legacy-phpsessid") || "";
    const response = await fetch(`${API_BASE}/user/blackouts`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phpsessid,
        email: String(userEmail || "").trim(),
        rules: rulesPayload
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Failed to save blackout rules");
    }
    onRulesSaved?.(data.rules || []);
    showToast?.({ type: "success", text: successMessage });
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setLoadError(null);
    try {
      let rows = [...draft];
      const includeEditor = editorDirty || draft.length === 0;
      if (includeEditor) {
        const built = buildRowFromEditor(editor);
        if (built.error) {
          showToast?.({ type: "error", text: built.error });
          setSaving(false);
          return;
        }
        rows = [...rows, built.row];
      }
      await persist(draftRowsToPayload(rows));
      setEditor(newDraftRule());
      setEditorDirty(false);
    } catch (e) {
      if (e.message === "demo_mode") {
        return;
      }
      setLoadError(e.message || "Save failed");
      showToast?.({ type: "error", text: e.message || "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const removeRule = async (localKey) => {
    let snapshotBefore;
    let snapshotAfter;
    setDraft((prev) => {
      snapshotBefore = prev;
      snapshotAfter = prev.filter((r) => r.localKey !== localKey);
      return snapshotAfter;
    });
    if (demoMode) {
      return;
    }
    setSaving(true);
    setLoadError(null);
    try {
      await persist(draftRowsToPayload(snapshotAfter), { successMessage: "Rule removed." });
    } catch (e) {
      if (e.message === "demo_mode") {
        return;
      }
      setDraft(snapshotBefore);
      setLoadError(e.message || "Failed to remove rule");
      showToast?.({ type: "error", text: e.message || "Failed to remove rule" });
    } finally {
      setSaving(false);
    }
  };

  const toggleScope = (scopeId, checked, ruleLocalKey) => {
    if (ruleLocalKey) {
      setDraft((prev) =>
        prev.map((r) => {
          if (r.localKey !== ruleLocalKey) {
            return r;
          }
          const set = new Set(r.leagueScopes || []);
          if (checked) {
            set.add(scopeId);
          } else {
            set.delete(scopeId);
          }
          return { ...r, leagueScopes: [...set], restrictLeagues: set.size > 0 };
        })
      );
      return;
    }
    setEditorDirty(true);
    setEditor((prev) => {
      const set = new Set(prev.leagueScopes || []);
      if (checked) {
        set.add(scopeId);
      } else {
        set.delete(scopeId);
      }
      const next = [...set];
      return {
        ...prev,
        leagueScopes: next,
        restrictLeagues: prev.restrictLeagues
      };
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-base font-semibold text-slate-900">Blackout dates</h2>
      <p className="mt-1 text-sm text-slate-600">
        Whole calendar days you&apos;re usually unavailable. Sub requests still work — we&apos;ll remind you when you pick
        a blackout day.
      </p>

      {loadError ? (
        <p className="mt-3 text-sm text-rose-700">{loadError}</p>
      ) : null}

      {draft.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {draft.map((rule) => (
            <li
              key={rule.localKey}
              className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm"
            >
              <span className="min-w-0 text-slate-800">{summarizeRule(rule, calendarsWithIds)}</span>
              <button
                type="button"
                disabled={saving}
                onClick={() => removeRule(rule.localKey)}
                className="shrink-0 text-xs font-medium text-rose-700 hover:text-rose-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500">No blackout rules yet.</p>
      )}

      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
        <h3 className="text-sm font-semibold text-slate-900">
          {draft.length > 0 ? "Add another rule" : "New rule"}
        </h3>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-700">
            Repeat
            <select
              value={editor.recurrenceKind}
              onChange={(e) => patchEditor({ recurrenceKind: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value={RECURRENCE.ONE_OFF}>One date</option>
              <option value={RECURRENCE.WEEKLY}>Every week (same weekday)</option>
              <option value={RECURRENCE.MONTHLY_NTH}>Every month (same weekday)</option>
            </select>
          </label>

          {editor.recurrenceKind === RECURRENCE.ONE_OFF ? (
            <label className="block text-xs font-medium text-slate-700">
              Date
              <input
                type="date"
                value={editor.oneOffDate || ""}
                onChange={(e) => patchEditor({ oneOffDate: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
              />
            </label>
          ) : null}

          {editor.recurrenceKind === RECURRENCE.WEEKLY ? (
            <label className="block text-xs font-medium text-slate-700 sm:col-span-2">
              Which weekday?
              <select
                value={Number(editor.weekday)}
                onChange={(e) => patchEditor({ weekday: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
              >
                {WEEKDAYS.map((w) => (
                  <option key={w.v} value={w.v}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {editor.recurrenceKind === RECURRENCE.MONTHLY_NTH ? (
            <>
              <label className="block text-xs font-medium text-slate-700 sm:col-span-2">
                Which weekday?
                <select
                  value={Number(editor.weekday)}
                  onChange={(e) => patchEditor({ weekday: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                >
                  {WEEKDAYS.map((w) => (
                    <option key={w.v} value={w.v}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-700 sm:col-span-2">
                Which occurrence that month?
                <select
                  value={Number(editor.monthOrdinal)}
                  onChange={(e) => patchEditor({ monthOrdinal: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                >
                  {MONTH_ORD.map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.v === 5
                        ? "Last (final one that month)"
                        : `${o.label} occurrence of that weekday`}
                    </option>
                  ))}
                </select>
              </label>
              <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="text-sm font-medium text-slate-900">
                  {formatMonthlyOccurrencePhrase(editor.monthOrdinal, editor.weekday)}
                </p>
              </div>
            </>
          ) : null}
        </div>

        <div className="mt-4 border-t border-slate-200 pt-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={editor.restrictLeagues}
              onChange={(e) => {
                const checked = e.target.checked;
                patchEditorFn((p) => ({
                  ...p,
                  restrictLeagues: checked,
                  leagueScopes: checked ? p.leagueScopes : []
                }));
              }}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600"
            />
            Specific league blackout only?
          </label>

          {editor.restrictLeagues ? (
            <div className="mt-3 rounded-lg border border-indigo-200 bg-white px-3 py-3">
              <p className="text-xs font-medium text-slate-700">Applies to</p>
              <ul className="mt-2 space-y-2">
                <li className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="scope-tr"
                    checked={(editor.leagueScopes || []).includes(TWIN_RINKS_SCOPE)}
                    onChange={(e) => toggleScope(TWIN_RINKS_SCOPE, e.target.checked, null)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <label htmlFor="scope-tr" className="text-sm text-slate-800">
                    Twin Rinks (subs &amp; league games)
                  </label>
                </li>
                {calendarsWithIds.map((cal) => {
                  const sid = String(cal.scheduleId || "").trim();
                  return (
                    <li key={sid} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`scope-${sid}`}
                        checked={(editor.leagueScopes || []).includes(sid)}
                        onChange={(e) => toggleScope(sid, e.target.checked, null)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <label htmlFor={`scope-${sid}`} className="text-sm text-slate-800">
                        {cal.leagueLabel?.trim() || "League schedule"}
                      </label>
                    </li>
                  );
                })}
              </ul>
              {calendarsWithIds.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">Add a SportsEngine calendar above to target a single league.</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          <label className="block text-xs font-medium text-slate-700">
            Note (optional)
            <textarea
              value={editor.note ?? ""}
              onChange={(e) => patchEditor({ note: e.target.value })}
              maxLength={500}
              rows={2}
              placeholder="Why you’re usually out — e.g. standing obligation"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400"
            />
          </label>
          <p className="mt-1 text-xs text-slate-500">Shown in the sub reminder if this rule applies.</p>
        </div>

        <div className="mt-4">
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveAll}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save blackout rules"}
          </button>
        </div>
      </div>
    </section>
  );
}
