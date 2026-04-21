import { useEffect, useMemo, useState } from "react";
import { RECURRENCE, TWIN_RINKS_SCOPE } from "../lib/blackoutRules";
import ManualBlackoutModal, { draftRowsToPayload } from "./ManualBlackoutModal";
import { validateCalendarFeedUrl } from "../lib/calendarFeedUrl";
import { isScheduleId } from "../lib/sportsengineCalendars";

const MODE_ALL = "IMPORT_ALL";
const MODE_PICK = "IMPORT_PICK";
const UNIFIED_PAGE_SIZE = 10;

const WEEKDAYS = [
  { v: 0, label: "Sunday" },
  { v: 1, label: "Monday" },
  { v: 2, label: "Tuesday" },
  { v: 3, label: "Wednesday" },
  { v: 4, label: "Thursday" },
  { v: 5, label: "Friday" },
  { v: 6, label: "Saturday" }
];

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

function scopeLabelsFromIds(scopeIds, calendars) {
  const scopes = Array.isArray(scopeIds) ? scopeIds : [];
  if (scopes.length === 0) {
    return "All leagues";
  }
  return scopes
    .map((id) =>
      id === TWIN_RINKS_SCOPE
        ? "Twin Rinks"
        : calendars.find((c) => c.scheduleId === id)?.leagueLabel || "League"
    )
    .join(", ");
}

function scopeLineForManual(rule, calendars) {
  const useAll =
    rule.restrictLeagues === false ||
    !Array.isArray(rule.leagueScopes) ||
    rule.leagueScopes.length === 0;
  if (useAll) {
    return "All leagues";
  }
  return scopeLabelsFromIds(rule.leagueScopes, calendars);
}

/** Primary line (bold), optional note after em-dash, and meta — matches calendar row layout. */
function getManualRowParts(rule, calendars) {
  const noteText = String(rule.note || "").trim() || null;
  const scopes = scopeLineForManual(rule, calendars);
  const kind = rule.recurrenceKind;
  let primary = "";
  let recurrenceShort = "";
  if (kind === RECURRENCE.ONE_OFF) {
    primary = String(rule.oneOffDate || "").trim();
    recurrenceShort = "One-time";
  } else if (kind === RECURRENCE.WEEKLY) {
    primary = `Weekly · ${WEEKDAYS.find((w) => w.v === Number(rule.weekday))?.label || ""}`;
    recurrenceShort = "Weekly";
  } else {
    primary = formatMonthlyOccurrencePhrase(rule.monthOrdinal, rule.weekday);
    recurrenceShort = "Monthly";
  }
  const meta = `Manual · ${scopes} · ${recurrenceShort}`;
  return { primary, noteText, meta };
}

/**
 * Shared list row: badge, bold primary, optional “ — note”, meta line, action slot (calendar-style).
 */
function BlackoutListRow({ variant, primaryBold, note, meta, children }) {
  const badgeClass =
    variant === "manual"
      ? "rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600"
      : "rounded bg-indigo-100/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-800";
  const badgeLabel = variant === "manual" ? "Manual" : "Calendar";

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={badgeClass}>{badgeLabel}</span>
          <span className="min-w-0 text-slate-800">
            <span className="font-medium text-slate-900">{primaryBold}</span>
            {note ? <span className="text-slate-700"> — {note}</span> : null}
          </span>
        </div>
        <span className="mt-0.5 block text-xs text-slate-500">{meta}</span>
      </div>
      {children}
    </li>
  );
}

function manualSortKey(rule) {
  if (rule.recurrenceKind === RECURRENCE.ONE_OFF) {
    return String(rule.oneOffDate || "");
  }
  if (rule.recurrenceKind === RECURRENCE.WEEKLY) {
    return `~${String(rule.weekday).padStart(2, "0")}weekly`;
  }
  return `~monthly~${rule.monthOrdinal}~${rule.weekday}`;
}

function blocklistStatusLabel(status) {
  if (status === "active") return "Blocking";
  if (status === "purgatory") return "Tentative";
  if (status === "deleted") return "Off list";
  return status || "—";
}

function instanceKeyFromPreview(inst) {
  const iso = new Date(inst.instanceStartUtc).toISOString();
  return `${String(inst.icsUid || "unknown").trim()}\t${inst.recurrenceId || ""}\t${iso}`;
}

function formatRelativeAgo(iso) {
  if (!iso) {
    return null;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  const diffMs = Date.now() - d.getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) {
    return "just now";
  }
  if (m < 60) {
    return `${m}m ago`;
  }
  const h = Math.floor(m / 60);
  if (h < 48) {
    return `${h}h ago`;
  }
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export default function BlackoutsSettingsPanel({
  userEmail,
  sportsengineCalendars = [],
  initialRules = [],
  calendarSubscriptions = [],
  calendarBlocklist = [],
  demoMode,
  showToast,
  onRulesSaved,
  onReloadBlackouts,
  subWarnIfSameDayGame = false,
  subWarnIfAdjacentGameDays = false,
  onSubWarnPrefsUpdated
}) {
  const [draft, setDraft] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [subPrefsSaving, setSubPrefsSaving] = useState(false);

  const [url, setUrl] = useState("");
  const [mode, setMode] = useState(MODE_ALL);
  const [restrictLeagues, setRestrictLeagues] = useState(false);
  const [leagueScopes, setLeagueScopes] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [pickModal, setPickModal] = useState(null);
  const [pickPreviewLoading, setPickPreviewLoading] = useState(false);
  const [pickSaveLoading, setPickSaveLoading] = useState(false);
  const [pickInstances, setPickInstances] = useState([]);
  const [syncingId, setSyncingId] = useState(null);
  const [pickSelected, setPickSelected] = useState(() => new Set());
  const [disconnectTarget, setDisconnectTarget] = useState(null);
  const [unifiedPage, setUnifiedPage] = useState(1);

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

  const calendarUrlHint = useMemo(() => {
    const t = String(url || "").trim();
    if (!t) {
      return null;
    }
    const v = validateCalendarFeedUrl(t);
    return v.ok ? null : v.message;
  }, [url]);

  const unifiedRows = useMemo(() => {
    const manual = draft.map((rule) => ({
      key: `m-${rule.localKey}`,
      kind: "manual",
      sortKey: manualSortKey(rule),
      rule
    }));
    const imported = calendarBlocklist.map((e) => ({
      key: `i-${e.id}`,
      kind: "imported",
      sortKey: `${String(e.dateKeyChicago || "")}\t${String(e.instanceStartUtc || "")}`,
      entry: e
    }));
    return [...manual, ...imported].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [draft, calendarBlocklist]);

  const unifiedTotalPages = Math.max(1, Math.ceil(unifiedRows.length / UNIFIED_PAGE_SIZE));

  useEffect(() => {
    setUnifiedPage((p) => Math.min(Math.max(1, p), unifiedTotalPages));
  }, [unifiedTotalPages]);

  useEffect(() => {
    setUnifiedPage(1);
  }, [unifiedRows.length]);

  const pagedUnifiedRows = useMemo(() => {
    const start = (unifiedPage - 1) * UNIFIED_PAGE_SIZE;
    return unifiedRows.slice(start, start + UNIFIED_PAGE_SIZE);
  }, [unifiedRows, unifiedPage]);

  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
  const authBody = () => ({
    phpsessid:
      localStorage.getItem("legacy-phpsessid") || sessionStorage.getItem("legacy-phpsessid") || "",
    email: String(userEmail || "").trim()
  });

  const patchSubWarnPrefs = async (patch) => {
    if (demoMode) {
      onSubWarnPrefsUpdated?.(patch);
      return;
    }
    setSubPrefsSaving(true);
    try {
      const res = await fetch(`${apiBase}/user/blackouts/preferences`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...authBody(),
          ...patch
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not save sub warnings");
      }
      await onReloadBlackouts?.();
    } catch (e) {
      showToast?.({ type: "error", text: e.message || "Save failed" });
    } finally {
      setSubPrefsSaving(false);
    }
  };

  const persistManualRules = async (rulesPayload, options = {}) => {
    const successMessage = options.successMessage ?? "Blackout rules saved.";
    if (demoMode) {
      showToast?.({
        type: "error",
        text: "Blackout rules can’t be saved in demo mode. Turn off demo mode on My Games & Subs."
      });
      throw new Error("demo_mode");
    }
    const phpsessid =
      localStorage.getItem("legacy-phpsessid") || sessionStorage.getItem("legacy-phpsessid") || "";
    const response = await fetch(`${apiBase}/user/blackouts`, {
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
      await persistManualRules(draftRowsToPayload(snapshotAfter), { successMessage: "Rule removed." });
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

  const handleRulesSavedFromModal = (rules) => {
    onRulesSaved?.(rules);
  };

  const toggleImportScope = (scopeId, checked) => {
    setLeagueScopes((prev) => {
      const set = new Set(prev);
      if (checked) {
        set.add(scopeId);
      } else {
        set.delete(scopeId);
      }
      return [...set];
    });
  };

  const handleAddCalendar = async () => {
    if (demoMode) {
      showToast?.({
        type: "error",
        text: "Calendar import isn’t available in demo mode."
      });
      return;
    }
    const u = String(url || "").trim();
    const urlCheck = validateCalendarFeedUrl(u);
    if (!urlCheck.ok) {
      showToast?.({ type: "error", text: urlCheck.message });
      return;
    }
    if (restrictLeagues && leagueScopes.length === 0) {
      showToast?.({
        type: "error",
        text: "Choose at least one league, or turn off “specific leagues only.”"
      });
      return;
    }
    const scopes = restrictLeagues && leagueScopes.length > 0 ? [...leagueScopes] : [];
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/user/calendar-blocklists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...authBody(),
          url: u,
          mode,
          leagueScopes: scopes
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not save calendar");
      }
      const createdSub = data.subscription;
      setUrl("");
      setImportModalOpen(false);
      showToast?.({
        type: "success",
        text:
          mode === MODE_ALL
            ? "Calendar added. Sync is running in the background — check back in a few minutes."
            : "Loading dates to choose from…"
      });
      await onReloadBlackouts?.();
      if (mode === MODE_PICK && createdSub?.id) {
        await openPickModal(createdSub);
      }
    } catch (e) {
      showToast?.({ type: "error", text: e.message || "Failed to add calendar" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSync = async (subscriptionId) => {
    if (demoMode) {
      return;
    }
    setSyncingId(subscriptionId);
    try {
      const res = await fetch(`${apiBase}/user/calendar-blocklists/${subscriptionId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authBody())
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Sync failed");
      }
      showToast?.({
        type: "success",
        text:
          "Sync started in the background. Status below updates in a few seconds — new dates appear in the list above."
      });
      await onReloadBlackouts?.();
      window.setTimeout(() => onReloadBlackouts?.(), 1500);
      window.setTimeout(() => onReloadBlackouts?.(), 4500);
    } catch (e) {
      showToast?.({ type: "error", text: e.message || "Sync failed" });
    } finally {
      setSyncingId(null);
    }
  };

  const openPickModal = async (sub) => {
    setPickModal(sub);
    setPickPreviewLoading(true);
    setPickInstances([]);
    setPickSelected(new Set());
    try {
      const res = await fetch(`${apiBase}/user/calendar-blocklists/${sub.id}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authBody())
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not load calendar preview");
      }
      const list = Array.isArray(data.instances) ? data.instances : [];
      setPickInstances(list);
      const n = list.length;
      showToast?.({
        type: "success",
        text:
          n === 0
            ? "No events in the next 60 days for this feed (or the feed returned empty)."
            : `Loaded ${n} event${n === 1 ? "" : "s"} in the next 60 days. Check the boxes to block subs, then Save.`
      });
      await onReloadBlackouts?.();
    } catch (e) {
      showToast?.({ type: "error", text: e.message || "Preview failed" });
      setPickModal(null);
    } finally {
      setPickPreviewLoading(false);
    }
  };

  const savePickSelections = async () => {
    if (!pickModal || demoMode) {
      return;
    }
    const keys = [...pickSelected];
    setPickSaveLoading(true);
    try {
      const res = await fetch(`${apiBase}/user/calendar-blocklists/${pickModal.id}/selections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...authBody(),
          keys
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not save selections");
      }
      const created = typeof data.created === "number" ? data.created : keys.length;
      showToast?.({
        type: "success",
        text: `Saved ${created} blocked date${created === 1 ? "" : "s"}. They appear in the list above.`
      });
      setPickModal(null);
      await onReloadBlackouts?.();
    } catch (e) {
      showToast?.({ type: "error", text: e.message || "Save failed" });
    } finally {
      setPickSaveLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!disconnectTarget || demoMode) {
      return;
    }
    const removeBlocklistEntries = disconnectTarget.removeEntries;
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/user/calendar-blocklists/${disconnectTarget.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...authBody(),
          removeBlocklistEntries
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not remove calendar");
      }
      showToast?.({ type: "success", text: "Calendar disconnected." });
      setDisconnectTarget(null);
      await onReloadBlackouts?.();
    } catch (e) {
      showToast?.({ type: "error", text: e.message || "Remove failed" });
    } finally {
      setSubmitting(false);
    }
  };

  const updateEntryStatus = async (entryId, intent) => {
    if (demoMode) {
      return;
    }
    try {
      const res = await fetch(`${apiBase}/user/calendar-blocklist-entries/${entryId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...authBody(), intent })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Update failed");
      }
      await onReloadBlackouts?.();
    } catch (e) {
      showToast?.({ type: "error", text: e.message || "Update failed" });
    }
  };

  return (
    <>
      {loadError ? <p className="mt-3 text-sm text-rose-700">{loadError}</p> : null}

      {unifiedRows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No blackout dates yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {pagedUnifiedRows.map((row) => {
            if (row.kind === "manual") {
              const parts = getManualRowParts(row.rule, calendarsWithIds);
              return (
                <BlackoutListRow
                  key={row.key}
                  variant="manual"
                  primaryBold={parts.primary}
                  note={parts.noteText}
                  meta={parts.meta}
                >
                  <div className="flex shrink-0 flex-wrap justify-end gap-1 self-start sm:self-auto">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => removeRule(row.rule.localKey)}
                      className="cursor-pointer rounded px-1.5 py-0.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </BlackoutListRow>
              );
            }
            const e = row.entry;
            const scopePart = scopeLabelsFromIds(e.leagueScopes, calendarsWithIds);
            return (
              <BlackoutListRow
                key={row.key}
                variant="calendar"
                primaryBold={e.dateKeyChicago}
                note={e.note?.trim() || null}
                meta={`Calendar · ${scopePart} · ${e.subscriptionLabel || "Imported feed"} · ${blocklistStatusLabel(e.status)}`}
              >
                <div className="flex shrink-0 flex-wrap justify-end gap-1 self-start sm:self-auto">
                  {e.status === "active" ? (
                    <button
                      type="button"
                      disabled={demoMode}
                      onClick={() => updateEntryStatus(e.id, "mark_deleted")}
                      className="cursor-pointer rounded px-1.5 py-0.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Remove
                    </button>
                  ) : null}
                  {e.status === "purgatory" ? (
                    <>
                      <button
                        type="button"
                        disabled={demoMode}
                        onClick={() => updateEntryStatus(e.id, "mark_active")}
                        className="cursor-pointer rounded px-1.5 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Block again
                      </button>
                      <button
                        type="button"
                        disabled={demoMode}
                        onClick={() => updateEntryStatus(e.id, "mark_deleted")}
                        className="cursor-pointer rounded px-1.5 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Keep off list
                      </button>
                    </>
                  ) : null}
                </div>
              </BlackoutListRow>
            );
          })}
        </ul>
      )}

      {unifiedRows.length > UNIFIED_PAGE_SIZE ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            Showing {(unifiedPage - 1) * UNIFIED_PAGE_SIZE + 1}–
            {Math.min(unifiedPage * UNIFIED_PAGE_SIZE, unifiedRows.length)} of {unifiedRows.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={unifiedPage <= 1}
              onClick={() => setUnifiedPage((p) => Math.max(1, p - 1))}
              className="cursor-pointer rounded border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-slate-500">
              Page {unifiedPage} of {unifiedTotalPages}
            </span>
            <button
              type="button"
              disabled={unifiedPage >= unifiedTotalPages}
              onClick={() => setUnifiedPage((p) => Math.min(unifiedTotalPages, p + 1))}
              className="cursor-pointer rounded border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-start">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              disabled={demoMode}
              onClick={() => setManualModalOpen(true)}
              className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add blackout date
            </button>
            <button
              type="button"
              disabled={demoMode}
              onClick={() => setImportModalOpen(true)}
              className="cursor-pointer rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-800 shadow-sm transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Import from calendar
            </button>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-xl bg-slate-50/90 px-3 py-2.5 shadow-sm ring-1 ring-slate-200/70 lg:max-w-md">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <span className="text-sm text-slate-800">Already have a game that day</span>
                <div className="flex w-fit gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
                  <button
                    type="button"
                    disabled={demoMode || subPrefsSaving}
                    aria-pressed={subWarnIfSameDayGame === true}
                    onClick={() => patchSubWarnPrefs({ subWarnIfSameDayGame: true })}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      subWarnIfSameDayGame
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-50"
                    } ${demoMode || subPrefsSaving ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    ✓ Warn
                  </button>
                  <button
                    type="button"
                    disabled={demoMode || subPrefsSaving}
                    aria-pressed={subWarnIfSameDayGame === false}
                    onClick={() => patchSubWarnPrefs({ subWarnIfSameDayGame: false })}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      !subWarnIfSameDayGame
                        ? "bg-slate-700 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-50"
                    } ${demoMode || subPrefsSaving ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    ✗ Off
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <span className="text-sm text-slate-800">Back-to-back with another game</span>
                <div className="flex w-fit gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
                  <button
                    type="button"
                    disabled={demoMode || subPrefsSaving}
                    aria-pressed={subWarnIfAdjacentGameDays === true}
                    onClick={() => patchSubWarnPrefs({ subWarnIfAdjacentGameDays: true })}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      subWarnIfAdjacentGameDays
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-50"
                    } ${demoMode || subPrefsSaving ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    ✓ Warn
                  </button>
                  <button
                    type="button"
                    disabled={demoMode || subPrefsSaving}
                    aria-pressed={subWarnIfAdjacentGameDays === false}
                    onClick={() => patchSubWarnPrefs({ subWarnIfAdjacentGameDays: false })}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      !subWarnIfAdjacentGameDays
                        ? "bg-slate-700 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-50"
                    } ${demoMode || subPrefsSaving ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    ✗ Off
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {calendarSubscriptions.length > 0 ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50/60">
          <div className="border-b border-slate-200 px-3 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Imported calendars
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Feeds you&apos;ve connected. <strong className="font-medium text-slate-600">Block all</strong>{" "}
              uses Refresh sync; <strong className="font-medium text-slate-600">Pick dates</strong> opens the
              event picker.
            </p>
          </div>
          <ul className="divide-y divide-slate-200">
            {calendarSubscriptions.map((sub) => (
              <li
                key={sub.id}
                className="flex flex-col gap-2 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">
                    {sub.label?.trim() || "Imported calendar"}
                  </p>
                  <p className="truncate text-xs text-slate-500" title={sub.url}>
                    {sub.url}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {sub.mode === MODE_PICK ? "Pick dates" : "Block all"} ·{" "}
                    <span className="capitalize">{sub.syncStatus || "idle"}</span>
                    {sub.lastSyncAt ? (
                      <>
                        {" "}
                        · Synced {formatRelativeAgo(sub.lastSyncAt)}
                      </>
                    ) : (
                      <span className="text-slate-400"> · No sync yet</span>
                    )}
                    {sub.lastSyncError ? (
                      <span className="text-rose-600"> · {sub.lastSyncError}</span>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {sub.mode === MODE_ALL ? (
                    <button
                      type="button"
                      disabled={demoMode || syncingId === sub.id}
                      onClick={() => handleSync(sub.id)}
                      className="cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {syncingId === sub.id ? "Starting…" : "Refresh sync"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={
                        demoMode ||
                        (pickModal?.id === sub.id && (pickPreviewLoading || pickSaveLoading))
                      }
                      onClick={() => openPickModal(sub)}
                      className="cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {pickModal?.id === sub.id && pickPreviewLoading ? "Loading…" : "Choose dates"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={demoMode}
                    onClick={() =>
                      setDisconnectTarget({ id: sub.id, removeEntries: true, label: sub.label })
                    }
                    className="cursor-pointer rounded-md border border-rose-200 bg-white px-2 py-1 text-xs font-medium text-rose-800 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ManualBlackoutModal
        open={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        userEmail={userEmail}
        sportsengineCalendars={sportsengineCalendars}
        existingDraftRules={draft}
        demoMode={demoMode}
        showToast={showToast}
        onRulesSaved={handleRulesSavedFromModal}
      />

      {importModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal
          aria-labelledby="import-cal-title"
          onClick={(ev) => {
            if (ev.target === ev.currentTarget) setImportModalOpen(false);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 id="import-cal-title" className="text-base font-semibold text-slate-900">
                Import from calendar
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Paste the <strong className="font-medium text-slate-600">iCal / .ics feed URL</strong>, not
                the normal Google Calendar page. In Google: calendar → Settings →{" "}
                <strong className="font-medium text-slate-600">Integrate calendar</strong> →{" "}
                <strong className="font-medium text-slate-600">Secret address in iCal format</strong> (
                <code className="rounded bg-slate-100 px-0.5">basic.ics</code>). Links with{" "}
                <code className="rounded bg-slate-100 px-0.5">?cid=</code> won&apos;t work.
              </p>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <label className="block text-xs font-medium text-slate-700 sm:col-span-2">
                Calendar feed URL (iCal / .ics)
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
                {calendarUrlHint ? (
                  <p className="mt-1.5 text-xs text-amber-800" role="status">
                    {calendarUrlHint}
                  </p>
                ) : null}
              </label>
              <label className="block text-xs font-medium text-slate-700 sm:col-span-2">
                Mode
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
                >
                  <option value={MODE_ALL}>Block all events in range</option>
                  <option value={MODE_PICK}>Pick which dates block</option>
                </select>
              </label>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    checked={restrictLeagues}
                    onChange={(e) => setRestrictLeagues(e.target.checked)}
                  />
                  Only for specific league(s)
                </label>
                {restrictLeagues ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={leagueScopes.includes(TWIN_RINKS_SCOPE)}
                        onChange={(e) => toggleImportScope(TWIN_RINKS_SCOPE, e.target.checked)}
                      />
                      Twin Rinks
                    </label>
                    {calendarsWithIds.map((c) => (
                      <label
                        key={c.scheduleId}
                        className="flex items-center gap-1.5 text-xs text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={leagueScopes.includes(c.scheduleId)}
                          onChange={(e) => toggleImportScope(c.scheduleId, e.target.checked)}
                        />
                        {c.leagueLabel?.trim() || "League"}
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting || demoMode}
                onClick={handleAddCalendar}
                className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Add calendar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pickModal ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal
          aria-labelledby="pick-cal-title"
        >
          <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 id="pick-cal-title" className="text-base font-semibold text-slate-900">
                Choose dates to block
              </h2>
              <p className="text-xs text-slate-500">
                Next 60 days from this feed (Chicago).
                {!pickPreviewLoading && pickInstances.length > 0 ? (
                  <span className="text-slate-600">
                    {" "}
                    — {pickInstances.length} event{pickInstances.length === 1 ? "" : "s"} loaded
                  </span>
                ) : null}
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto px-2 py-2">
              {pickPreviewLoading ? (
                <p className="px-2 py-6 text-center text-sm text-slate-500">
                  Loading events from your feed…
                </p>
              ) : pickInstances.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-slate-500">No events in range.</p>
              ) : (
                pickInstances.map((inst) => {
                  const rowKey = inst.key || instanceKeyFromPreview(inst);
                  return (
                    <label
                      key={rowKey}
                      className="flex cursor-pointer gap-2 border-b border-slate-100 px-2 py-2 text-sm last:border-0 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={pickSelected.has(rowKey)}
                        onChange={(e) => {
                          setPickSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) {
                              next.add(rowKey);
                            } else {
                              next.delete(rowKey);
                            }
                            return next;
                          });
                        }}
                      />
                      <span className="min-w-0">
                        <span className="font-medium text-slate-900">{inst.dateKeyChicago}</span>
                        {inst.note ? <span className="text-slate-600"> — {inst.note}</span> : null}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                disabled={pickSaveLoading}
                onClick={() => setPickModal(null)}
                className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pickSaveLoading || pickSelected.size === 0}
                onClick={savePickSelections}
                className="cursor-pointer rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pickSaveLoading ? "Saving…" : "Save selection"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {disconnectTarget ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Disconnect calendar?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Remove imported block-out dates that came from this calendar, or keep them as manual
              one-offs (same treatment for Tentative rows).
            </p>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={disconnectTarget.removeEntries}
                onChange={(e) =>
                  setDisconnectTarget((p) => ({ ...p, removeEntries: e.target.checked }))
                }
              />
              Also remove all block list dates from this calendar
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDisconnectTarget(null)}
                className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleDisconnect}
                className="cursor-pointer rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
