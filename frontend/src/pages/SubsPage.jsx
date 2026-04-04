import { useEffect, useMemo, useState } from "react";
import GamesCalendarView from "../components/GamesCalendarView";
import GamesGrid from "../components/GamesGrid";
import GamesListView from "../components/GamesListView";
import JerseyGuideModal from "../components/JerseyGuideModal";
import PendingChangesBar from "../components/PendingChangesBar";
import {
  buildDraftSelections,
  getJerseyChart,
  getGameStartDate,
  getGameHeadline,
  isPlayerPlaying,
  getPlayingTeamColor,
  getScheduleText,
  normalizeGames,
  checkIsProcessed,
  applyPendingUpdate
} from "../lib/gameUtils";

const DENSE_MODE_KEY = "subs-dense-mode";
const VIEW_MODE_KEY = "subs-view-mode";
const PENDING_UPDATES_KEY = "twin-rinks-pending-updates";
const MAX_PENDING_AGE = 20 * 60 * 1000; // 20 minutes

function getSavedDenseMode() {
  try {
    return localStorage.getItem(DENSE_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

function getSavedViewMode() {
  try {
    const value = localStorage.getItem(VIEW_MODE_KEY);
    return value === "calendar" || value === "list" ? value : "cards";
  } catch {
    return "cards";
  }
}

function isMyGameSelection(selection) {
  if (!selection) {
    return false;
  }
  return Boolean(selection.sub) || selection.attendance === "IN";
}

function normalizeSelection(selection) {
  const attendance =
    selection?.attendance === "IN" || selection?.attendance === "OUT"
      ? selection.attendance
      : "";
  return {
    sub: Boolean(selection?.sub),
    attendance
  };
}

function areSelectionsEqual(a, b) {
  return (
    Boolean(a?.sub) === Boolean(b?.sub) &&
    (a?.attendance || "") === (b?.attendance || "")
  );
}

function cloneSelections(map) {
  const clone = {};
  for (const [gameId, selection] of Object.entries(map || {})) {
    clone[gameId] = normalizeSelection(selection);
  }
  return clone;
}

function selectionLabel(selection) {
  const normalized = normalizeSelection(selection);
  if (normalized.sub) {
    return "SUB";
  }
  if (normalized.attendance === "IN") {
    return "IN";
  }
  if (normalized.attendance === "OUT") {
    return "OUT";
  }
  return "No response";
}

function getChangeSummary(before, after) {
  const fromLabel = selectionLabel(before);
  const toLabel = selectionLabel(after);
  if (fromLabel === "No response") {
    return `Set to ${toLabel}`;
  }
  if (toLabel === "No response") {
    return `Cleared ${fromLabel}`;
  }
  return `${fromLabel} → ${toLabel}`;
}

export default function SubsPage({ phpsessid, gamesResponse, loading, error, isUploading, isSubmitting, onRefresh, onSubmitGames, demoMode, setDemoMode, showToast }) {
  const [draftSelections, setDraftSelections] = useState({});
  const [denseMode, setDenseMode] = useState(getSavedDenseMode);
  const [viewMode, setViewMode] = useState(getSavedViewMode);
  const [calendarLayoutMode, setCalendarLayoutMode] = useState("planner");
  const [activeTab, setActiveTab] = useState("subs");
  const [submittedSelections, setSubmittedSelections] = useState({});
  const [pendingExpanded, setPendingExpanded] = useState(false);
  const [jerseyGuideOpen, setJerseyGuideOpen] = useState(false);
  const [hideMyGames, setHideMyGames] = useState(false);
  const [pendingUpdates, setPendingUpdates] = useState({});
  const [submitError, setSubmitError] = useState(null);

  const rawGames = useMemo(() => normalizeGames(gamesResponse), [gamesResponse]);

  useEffect(() => {
    const profile = gamesResponse?.profile;
    if (!profile || !rawGames.length) return;

    try {
      const stored = JSON.parse(localStorage.getItem(PENDING_UPDATES_KEY) || "{}");
      const userPending = stored[profile] || {};
      let changed = false;
      const now = Date.now();
      const newPending = { ...userPending };

      for (const [gameId, pending] of Object.entries(newPending)) {
        if (now - pending.timestamp > MAX_PENDING_AGE) {
          delete newPending[gameId];
          changed = true;
          continue;
        }
        const game = rawGames.find((g) => g.gameId === gameId);
        if (game && checkIsProcessed(game, pending.selection)) {
          delete newPending[gameId];
          changed = true;
        }
      }

      if (changed) {
        stored[profile] = newPending;
        localStorage.setItem(PENDING_UPDATES_KEY, JSON.stringify(stored));
      }
      setPendingUpdates(newPending);
    } catch (e) {
      console.error("Failed to parse pending updates", e);
    }
  }, [rawGames, gamesResponse?.profile]);

  const games = useMemo(() => {
    const withPending =
      !Object.keys(pendingUpdates).length
        ? rawGames
        : rawGames.map((game) => {
            const pending = pendingUpdates[game.gameId];
            if (pending) {
              return applyPendingUpdate(game, pending.selection);
            }
            return game;
          });
    return [...withPending].sort((a, b) => {
      const ta = getGameStartDate(a)?.getTime();
      const tb = getGameStartDate(b)?.getTime();
      if (ta == null && tb == null) {
        return 0;
      }
      if (ta == null) {
        return 1;
      }
      if (tb == null) {
        return -1;
      }
      return ta - tb;
    });
  }, [rawGames, pendingUpdates]);

  const initialDraft = useMemo(() => buildDraftSelections(games), [games]);

  const submittedGameIds = useMemo(() => {
    const ids = new Set();
    for (const game of games) {
      const stage = String(game?.stage || "").toLowerCase();
      if (stage === "selected" || stage === "confirmed-in" || stage === "sub-requested") {
        ids.add(game.gameId);
      }
    }
    for (const [gameId, selection] of Object.entries(submittedSelections)) {
      if (selection?.attendance === "IN" || selection?.sub) {
        ids.add(gameId);
      }
    }
    return ids;
  }, [games, submittedSelections]);

  const outGameIds = useMemo(() => {
    const ids = new Set();
    for (const game of games) {
      const stage = String(game?.stage || "").toLowerCase();
      if (stage === "out") {
        ids.add(game.gameId);
      }
    }
    for (const [gameId, selection] of Object.entries(submittedSelections)) {
      if (selection?.attendance === "OUT") {
        ids.add(gameId);
      } else if (selection?.attendance === "" && ids.has(gameId)) {
        ids.delete(gameId);
      }
    }
    return ids;
  }, [games, submittedSelections]);

  const subsGames = useMemo(
    () =>
      games.filter(
        (game) =>
          game.source !== "rosemont" &&
          !outGameIds.has(game.gameId) &&
          (!hideMyGames || !submittedGameIds.has(game.gameId))
      ),
    [games, outGameIds, hideMyGames, submittedGameIds]
  );

  const myGames = useMemo(
    () =>
      games.filter(
        (game) =>
          !outGameIds.has(game.gameId) &&
          (submittedGameIds.has(game.gameId) || game.source === "rosemont")
      ),
    [games, submittedGameIds, outGameIds]
  );

  const hiddenTabGames = useMemo(
    () => games.filter((game) => outGameIds.has(game.gameId)),
    [games, outGameIds]
  );

  const nextGameText = useMemo(() => {
    const now = Date.now();
    let nextGame = null;
    for (const game of myGames) {
      const date = getGameStartDate(game);
      if (!date) {
        continue;
      }
      const timestamp = date.getTime();
      if (timestamp < now) {
        continue;
      }
      if (!nextGame || timestamp < nextGame.timestamp) {
        nextGame = { timestamp, game };
      }
    }
    return nextGame ? getScheduleText(nextGame.game) : "";
  }, [myGames]);

  const activeTabGames = useMemo(
    () =>
      activeTab === "my-games"
        ? myGames
        : activeTab === "hidden"
        ? hiddenTabGames
        : subsGames,
    [activeTab, myGames, hiddenTabGames, subsGames]
  );

  const visibleGames = useMemo(() => {
    return activeTabGames;
  }, [activeTabGames]);

  const pendingSelectionChanges = useMemo(() => {
    const changes = [];
    for (const game of games) {
      const baseline = normalizeSelection(submittedSelections[game.gameId]);
      const draft = normalizeSelection(draftSelections[game.gameId]);
      if (!areSelectionsEqual(baseline, draft)) {
        changes.push({
          gameId: game.gameId,
          headline: getGameHeadline(game),
          schedule: getScheduleText(game),
          summary: getChangeSummary(baseline, draft)
        });
      }
    }
    return changes;
  }, [games, submittedSelections, draftSelections]);

  const hasPendingSelectionChanges = pendingSelectionChanges.length > 0;
  const pendingGameIds = useMemo(
    () => new Set(pendingSelectionChanges.map((change) => change.gameId)),
    [pendingSelectionChanges]
  );

  const jerseyChart = useMemo(() => getJerseyChart(), []);

  useEffect(() => {
    setDraftSelections(cloneSelections(initialDraft));
    setSubmittedSelections(cloneSelections(initialDraft));
  }, [initialDraft]);

  useEffect(() => {
    if (!hasPendingSelectionChanges) {
      setPendingExpanded(false);
    }
  }, [hasPendingSelectionChanges]);

  const handleSetDenseMode = (nextDenseMode) => {
    setDenseMode(nextDenseMode);
    try {
      localStorage.setItem(DENSE_MODE_KEY, nextDenseMode ? "1" : "0");
    } catch {
      // Ignore localStorage failures.
    }
  };

  const handleChangeViewMode = (nextMode) => {
    setViewMode(nextMode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, nextMode);
    } catch {
      // Ignore localStorage failures.
    }
  };

  const handleToggleSub = (gameId) => {
    setSubmitError(null);
    setDraftSelections((previous) => {
      const wasSelected = Boolean(previous[gameId]?.sub);
      return {
        ...previous,
        [gameId]: {
          ...previous[gameId],
          sub: !wasSelected,
          attendance: ""
        }
      };
    });
  };

  const handleToggleAttendance = (gameId, value) => {
    setSubmitError(null);
    setDraftSelections((previous) => {
      if (value === "") {
        return {
          ...previous,
          [gameId]: {
            ...(previous[gameId] || {}),
            attendance: "",
            sub: false
          }
        };
      }
      const current = previous[gameId]?.attendance || "";
      const nextValue = current === value ? "" : value;
      return {
        ...previous,
        [gameId]: {
          ...(previous[gameId] || {}),
          attendance: nextValue,
          sub: false
        }
      };
    });
  };

  const handleSubmitPendingChanges = async () => {
    setSubmitError(null);

    if (window.__FAKE_SUB_FAILURE) {
      window.__FAKE_SUB_FAILURE = false;
      setSubmitError("Failed to submit games. Please try again.");
      setTimeout(() => {
        setSubmitError((prev) => 
          prev === "Failed to submit games. Please try again." ? null : prev
        );
      }, 5000);
      return;
    }

    const updates = games
      .filter((game) => game.source !== "rosemont")
      .map((game) => {
        const draft = normalizeSelection(draftSelections[game.gameId]);
        return {
          gameId: game.gameId,
          dateTimeRink: game.dateTimeRink || game.schedule?.raw || "",
          selection: draft.sub ? "SUB" : draft.attendance
        };
      });

    if (demoMode) {
      console.group("🚀 [DEMO MODE] Simulated Submission Payload");
      console.log("JSON sent to our Node backend:", {
        profile: gamesResponse?.profile || "UNKNOWN_PROFILE",
        games: updates
      });

      // Mock the URLSearchParams that the backend will generate
      const bodyParams = new URLSearchParams();
      bodyParams.append("action", "games update");
      bodyParams.append("profile", gamesResponse?.profile || "UNKNOWN_PROFILE");
      
      const activeSelections = [];
      for (const game of updates) {
        bodyParams.append(game.gameId, game.dateTimeRink);
        if (game.selection) {
          bodyParams.append(`${game.gameId}i`, game.selection);
          activeSelections.push(`${game.gameId}i=${game.selection}`);
        }
      }
      
      bodyParams.append("submit", "Submit");
      bodyParams.append("required", "");
      bodyParams.append("data_order", "action,profile12/03/2015");
      const dataOrderParts = ["action", "profile"];
      for (let i = 1; i <= 100; i++) {
        dataOrderParts.push(`g${i}`, `g${i}i`);
      }
      bodyParams.append("data_order", dataOrderParts.join(","));
      bodyParams.append("outputfile", "../adulthockey/subs/subs_entry");
      bodyParams.append("countfile", "form1");
      bodyParams.append("emailfile", "form1");
      bodyParams.append("form_id", "My Test Form");
      bodyParams.append("ok_url", "../adulthockey/subs/subs_submit_ok.html");
      bodyParams.append("not_ok_url", "../adulthockey/subs/sub_submit_not_ok.html");

      console.log("✨ Active Selections (The important part!):", activeSelections);
      console.log("📝 Full URL-Encoded Body (sent to legacy server):", decodeURIComponent(bodyParams.toString()));
      console.groupEnd();

      setSubmittedSelections(cloneSelections(draftSelections));
      setPendingExpanded(false);
      showToast({ type: "success", text: "Games updated successfully (Demo Mode)" });
      return;
    }

    const result = await onSubmitGames(gamesResponse?.profile, updates);
    if (result && result.success) {
      // Save to local storage for optimistic UI
      try {
        const profile = gamesResponse?.profile;
        const changedUpdates = updates.filter(u => {
          const draft = normalizeSelection(draftSelections[u.gameId]);
          const submitted = normalizeSelection(submittedSelections[u.gameId]);
          return !areSelectionsEqual(draft, submitted);
        });

        if (profile && changedUpdates.length > 0) {
          const stored = JSON.parse(localStorage.getItem(PENDING_UPDATES_KEY) || "{}");
          const userPending = stored[profile] || {};
          const now = Date.now();
          changedUpdates.forEach((u) => {
            userPending[u.gameId] = { selection: u.selection, timestamp: now };
          });
          stored[profile] = userPending;
          localStorage.setItem(PENDING_UPDATES_KEY, JSON.stringify(stored));
          setPendingUpdates(userPending);
        }
      } catch (e) {
        console.error("Failed to save pending updates", e);
      }

      setSubmittedSelections(cloneSelections(draftSelections));
      setPendingExpanded(false);
      showToast({ type: "success", text: "Games updated successfully!" });
    } else if (result && !result.success) {
      const errorMessage = result.error || "An unknown error occurred while submitting.";
      setSubmitError(errorMessage);
      setTimeout(() => {
        setSubmitError((prev) => (prev === errorMessage ? null : prev));
      }, 5000);
    }
  };

  const handleCancelPendingChanges = () => {
    setSubmitError(null);
    setDraftSelections(cloneSelections(submittedSelections));
    setPendingExpanded(false);
  };

  const handleRemovePendingChange = (gameId) => {
    setSubmitError(null);
    const baseline = normalizeSelection(submittedSelections[gameId]);
    setDraftSelections((previous) => ({
      ...previous,
      [gameId]: baseline
    }));
  };

  return (
    <div className={`mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 ${hasPendingSelectionChanges ? "pb-36 md:pb-44" : ""}`}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            My Games & Subs
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {nextGameText
              ? `Your next game is ${nextGameText}`
              : "Your next game is not scheduled yet."}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="flex w-full items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:w-auto sm:inline-flex sm:overflow-visible">
            <button
              type="button"
              onClick={() => setActiveTab("subs")}
              className={`flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition sm:flex-none ${
                activeTab === "subs"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              Subs ({subsGames.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("my-games")}
              className={`flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition sm:flex-none ${
                activeTab === "my-games"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              My Games ({myGames.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("hidden")}
              className={`flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition sm:flex-none ${
                activeTab === "hidden"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              Hidden ({hiddenTabGames.length})
            </button>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              aria-label="Refresh games"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                <path
                  d="M20 12a8 8 0 1 1-2.34-5.66M20 4v6h-6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setJerseyGuideOpen(true)}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 shadow-sm transition hover:bg-slate-50 hover:text-indigo-900 sm:flex-none"
            >
              Subs Jersey guide
            </button>
          </div>
        </div>
      </div>

      {error && !isUploading ? (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {isUploading ? (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
          <svg className="h-5 w-5 animate-spin text-sky-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p>{error}</p>
        </div>
      ) : null}

      {demoMode ? (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <div>
            <strong>Demo mode:</strong> selections and submissions are local only.
          </div>
          <button 
            type="button" 
            className="shrink-0 cursor-pointer rounded-md border border-sky-300 bg-sky-200 px-2 py-1 text-xs font-medium text-sky-900 transition hover:bg-sky-300" 
            onClick={() => setDemoMode(false)}
          >
            Activate Live Mode
          </button>
        </div>
      ) : (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div>
            <strong>Live mode active:</strong> Submitting changes will update your actual games on the server.
          </div>
          <button 
            type="button" 
            className="shrink-0 cursor-pointer rounded-md border border-emerald-300 bg-emerald-200 px-2 py-1 text-xs font-medium text-emerald-900 transition hover:bg-emerald-300" 
            onClick={() => setDemoMode(true)}
          >
            Return to Demo Mode
          </button>
        </div>
      )}

      <section className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex w-full items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 sm:w-auto sm:inline-flex">
                <button
                  type="button"
                  onClick={() => handleChangeViewMode("cards")}
                  className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition sm:flex-none ${
                    viewMode === "cards"
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Cards
                </button>
                <button
                  type="button"
                  onClick={() => handleChangeViewMode("calendar")}
                  className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition sm:flex-none ${
                    viewMode === "calendar"
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Calendar
                </button>
                <button
                  type="button"
                  onClick={() => handleChangeViewMode("list")}
                  className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition sm:flex-none ${
                    viewMode === "list"
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  List
                </button>
              </div>
              {viewMode === "calendar" ? (
                <div className="flex w-full items-center justify-center gap-3 px-2 py-1 text-sm sm:w-auto sm:justify-start sm:py-0">
                  <button
                    type="button"
                    onClick={() => setCalendarLayoutMode("planner")}
                    className={`transition ${
                      calendarLayoutMode === "planner"
                        ? "font-semibold text-slate-900"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Planner
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarLayoutMode("week")}
                    className={`transition ${
                      calendarLayoutMode === "week"
                        ? "font-semibold text-slate-900"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Week
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarLayoutMode("grouped")}
                    className={`transition ${
                      calendarLayoutMode === "grouped"
                        ? "font-semibold text-slate-900"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Grouped
                  </button>
                </div>
              ) : null}
            </div>
            
            <div className="flex w-full items-center gap-4 sm:w-auto">
              <div className="flex w-full items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 sm:w-auto sm:inline-flex">
                <button
                  type="button"
                  onClick={() => handleSetDenseMode(false)}
                  className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition sm:flex-none ${
                    !denseMode
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Big
                </button>
                <button
                  type="button"
                  onClick={() => handleSetDenseMode(true)}
                  className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition sm:flex-none ${
                    denseMode
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Small
                </button>
              </div>
              {activeTab === "subs" && (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={hideMyGames}
                    onChange={(e) => setHideMyGames(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  Hide my games
                </label>
              )}
            </div>
          </div>
        </div>

        {viewMode === "calendar" ? (
          <GamesCalendarView
            games={visibleGames}
            draftSelections={draftSelections}
            pendingGameIds={pendingGameIds}
            denseMode={denseMode}
            layoutMode={calendarLayoutMode}
            onToggleSub={handleToggleSub}
            onToggleAttendance={handleToggleAttendance}
            isMyGamesTab={activeTab === "my-games"}
          />
        ) : viewMode === "list" ? (
          <GamesListView
            games={visibleGames}
            draftSelections={draftSelections}
            pendingGameIds={pendingGameIds}
            onToggleSub={handleToggleSub}
            onToggleAttendance={handleToggleAttendance}
            isMyGamesTab={activeTab === "my-games"}
          />
        ) : (
          <GamesGrid
            games={visibleGames}
            draftSelections={draftSelections}
            pendingGameIds={pendingGameIds}
            denseMode={denseMode}
            onToggleSub={handleToggleSub}
            onToggleAttendance={handleToggleAttendance}
            isMyGamesTab={activeTab === "my-games"}
          />
        )}

        {visibleGames.length === 0 && !loading && !error ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="text-sm font-medium text-slate-900">
              {activeTab === "hidden"
                ? "No hidden games right now."
                : "No games in this tab right now."}
            </p>
          </div>
        ) : null}

      </section>

      <PendingChangesBar
        isExpanded={pendingExpanded}
        changeCount={pendingSelectionChanges.length}
        changes={pendingSelectionChanges}
        loading={isSubmitting}
        error={submitError}
        onToggleExpanded={() => setPendingExpanded((previous) => !previous)}
        onSubmit={handleSubmitPendingChanges}
        onCancel={handleCancelPendingChanges}
        onRemoveChange={handleRemovePendingChange}
      />

      <JerseyGuideModal
        open={jerseyGuideOpen}
        onClose={() => setJerseyGuideOpen(false)}
        chart={jerseyChart}
      />
    </div>
  );
}
