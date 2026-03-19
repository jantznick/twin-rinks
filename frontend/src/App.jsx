import { useEffect, useMemo, useState } from "react";
import GamesCalendarView from "./components/GamesCalendarView";
import GamesGrid from "./components/GamesGrid";
import GamesListView from "./components/GamesListView";
import JerseyGuideModal from "./components/JerseyGuideModal";
import LoginPanel from "./components/LoginPanel";
import PendingChangesBar from "./components/PendingChangesBar";
import {
  buildDraftSelections,
  getJerseyChart,
  getGameStartDate,
  getScheduleText,
  normalizeGames
} from "./lib/gameUtils";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
const SAVED_SESSION_KEY = "legacy-phpsessid";
const SAVED_EMAIL_KEY = "legacy-user-email";
const DENSE_MODE_KEY = "subs-dense-mode";
const VIEW_MODE_KEY = "subs-view-mode";

function getSavedSession() {
  try {
    return localStorage.getItem(SAVED_SESSION_KEY) || "";
  } catch {
    return "";
  }
}

function getSavedEmail() {
  try {
    return localStorage.getItem(SAVED_EMAIL_KEY) || "";
  } catch {
    return "";
  }
}

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
  const attendance = selection?.attendance === "IN" || selection?.attendance === "OUT"
    ? selection.attendance
    : "";
  return {
    sub: Boolean(selection?.sub),
    attendance
  };
}

function areSelectionsEqual(a, b) {
  return Boolean(a?.sub) === Boolean(b?.sub) && (a?.attendance || "") === (b?.attendance || "");
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

export default function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phpsessid, setPhpsessid] = useState(getSavedSession);
  const [userEmail, setUserEmail] = useState(getSavedEmail);
  const [gamesResponse, setGamesResponse] = useState(null);
  const [draftSelections, setDraftSelections] = useState({});
  const [denseMode, setDenseMode] = useState(getSavedDenseMode);
  const [viewMode, setViewMode] = useState(getSavedViewMode);
  const [calendarLayoutMode, setCalendarLayoutMode] = useState("planner");
  const [activeTab, setActiveTab] = useState("subs");
  const [submittedSelections, setSubmittedSelections] = useState({});
  const [pendingExpanded, setPendingExpanded] = useState(false);
  const [jerseyGuideOpen, setJerseyGuideOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isLoggedIn = useMemo(() => phpsessid.length > 0, [phpsessid]);
  const games = useMemo(() => normalizeGames(gamesResponse), [gamesResponse]);
  const initialDraft = useMemo(() => buildDraftSelections(games), [games]);
  const submittedGameIds = useMemo(() => {
    const ids = new Set();
    for (const game of games) {
      const stage = String(game?.stage || "").toLowerCase();
      if (stage === "selected" || stage === "confirmed-in") {
        ids.add(game.gameId);
      }
    }
    for (const [gameId, selection] of Object.entries(submittedSelections)) {
      if (isMyGameSelection(selection)) {
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
      } else if (ids.has(gameId)) {
        ids.delete(gameId);
      }
    }
    return ids;
  }, [games, submittedSelections]);
  const subsGames = useMemo(
    () =>
      games.filter(
        (game) => !submittedGameIds.has(game.gameId) && !outGameIds.has(game.gameId)
      ),
    [games, submittedGameIds, outGameIds]
  );
  const myGames = useMemo(
    () => games.filter((game) => submittedGameIds.has(game.gameId) && !outGameIds.has(game.gameId)),
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

  const saveSession = (value) => {
    setPhpsessid(value);
    try {
      if (value) {
        localStorage.setItem(SAVED_SESSION_KEY, value);
      } else {
        localStorage.removeItem(SAVED_SESSION_KEY);
      }
    } catch {
      // Ignore localStorage failures.
    }
  };

  const saveUserEmail = (value) => {
    const nextEmail = String(value || "").trim();
    setUserEmail(nextEmail);
    try {
      if (nextEmail) {
        localStorage.setItem(SAVED_EMAIL_KEY, nextEmail);
      } else {
        localStorage.removeItem(SAVED_EMAIL_KEY);
      }
    } catch {
      // Ignore localStorage failures.
    }
  };

  const fetchGames = async (sessionId) => {
    const response = await fetch(`${API_BASE}/get-games`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phpsessid: sessionId })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Unable to load games");
    }
    setGamesResponse(data);
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password })
      });
      const data = await response.json();
      if (!response.ok || !data.ok || !data.phpsessid) {
        throw new Error(data.error || "Login failed");
      }
      const normalizedEmail = username.trim();
      saveSession(data.phpsessid);
      saveUserEmail(normalizedEmail);
      await fetchGames(data.phpsessid);
    } catch (requestError) {
      setGamesResponse(null);
      setError(requestError.message || "Unable to login");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!isLoggedIn) {
      return;
    }
    setError("");
    setLoading(true);
    try {
      await fetchGames(phpsessid);
    } catch (requestError) {
      setError(requestError.message || "Unable to refresh games");
      setGamesResponse(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    saveSession("");
    saveUserEmail("");
    setGamesResponse(null);
    setPassword("");
    setError("");
    setDraftSelections({});
    setSubmittedSelections({});
    setPendingExpanded(false);
    setActiveTab("subs");
  };

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
    setDraftSelections((previous) => {
      const current = previous[gameId]?.attendance || "";
      const nextValue = current === value ? "" : value;
      return {
        ...previous,
        [gameId]: {
          ...previous[gameId],
          attendance: nextValue,
          sub: false
        }
      };
    });
  };

  const handleSubmitPendingChanges = () => {
    setSubmittedSelections(cloneSelections(draftSelections));
    setPendingExpanded(false);
  };

  const handleCancelPendingChanges = () => {
    setDraftSelections(cloneSelections(submittedSelections));
    setPendingExpanded(false);
  };

  const handleRemovePendingChange = (gameId) => {
    const baseline = normalizeSelection(submittedSelections[gameId]);
    setDraftSelections((previous) => ({
      ...previous,
      [gameId]: baseline
    }));
  };

  return (
    <main
      className={`min-h-screen bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-4 text-slate-900 md:p-6 ${
        hasPendingSelectionChanges ? "pb-36 md:pb-44" : ""
      }`}
    >
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <header className="overflow-hidden rounded-3xl border border-white/70 bg-white/80 p-5 shadow-xl shadow-slate-200/60 backdrop-blur md:p-6">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">
                Hockey Rink
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                Subs Program
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Compact hockey game scheduling and sub management.
              </p>
            </div>
            {isLoggedIn ? (
              <div className="flex flex-col items-start gap-2">
                <div className="flex items-center gap-2">
                  <p className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-900">
                    Hi {userEmail || "there"}
                  </p>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Log out
                  </button>
                </div>
                <p className="text-xs font-medium text-slate-600">
                  {nextGameText
                    ? `Your next game is ${nextGameText}`
                    : "Your next game is not scheduled yet."}
                </p>
              </div>
            ) : null}
          </div>
          {isLoggedIn ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-slate-300 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("subs")}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
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
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
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
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    activeTab === "hidden"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Hidden ({hiddenTabGames.length})
                </button>
              </div>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading}
                aria-label="Refresh games"
                className="inline-flex h-9 w-9 items-center justify-center text-slate-600 transition hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
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
                className="text-sm font-medium text-indigo-700 transition hover:text-indigo-900"
              >
                View jersey guide
              </button>
            </div>
          ) : null}
        </header>

        {!isLoggedIn ? (
          <LoginPanel
            username={username}
            password={password}
            loading={loading}
            onUsernameChange={setUsername}
            onPasswordChange={setPassword}
            onSubmit={handleLogin}
          />
        ) : (
          <section className="space-y-4">
            <div className="p-1">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
                    <button
                      type="button"
                      onClick={() => handleChangeViewMode("cards")}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                        viewMode === "cards"
                          ? "bg-indigo-600 text-white"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Cards
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChangeViewMode("calendar")}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                        viewMode === "calendar"
                          ? "bg-indigo-600 text-white"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Calendar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChangeViewMode("list")}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                        viewMode === "list"
                          ? "bg-indigo-600 text-white"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      List
                    </button>
                  </div>
                  {viewMode === "calendar" ? (
                    <div className="flex items-center gap-3 px-2 text-sm">
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
                  <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
                    <button
                      type="button"
                      onClick={() => handleSetDenseMode(false)}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                        !denseMode
                          ? "bg-indigo-600 text-white"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Big
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetDenseMode(true)}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                        denseMode
                          ? "bg-indigo-600 text-white"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Small
                    </button>
                  </div>
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
              />
            ) : viewMode === "list" ? (
              <GamesListView
                games={visibleGames}
                draftSelections={draftSelections}
                pendingGameIds={pendingGameIds}
                onToggleSub={handleToggleSub}
                onToggleAttendance={handleToggleAttendance}
              />
            ) : (
              <GamesGrid
                games={visibleGames}
                draftSelections={draftSelections}
                pendingGameIds={pendingGameIds}
                denseMode={denseMode}
                onToggleSub={handleToggleSub}
                onToggleAttendance={handleToggleAttendance}
              />
            )}

            {visibleGames.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                {activeTab === "hidden"
                  ? "No hidden games right now."
                  : "No games in this tab right now."}
              </p>
            ) : null}

            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
              Demo mode: selections are local only. Submit to `bnbform.cgi` is not
              wired yet.
            </div>
          </section>
        )}

        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </div>
      {isLoggedIn ? (
        <PendingChangesBar
          isExpanded={pendingExpanded}
          changeCount={pendingSelectionChanges.length}
          changes={pendingSelectionChanges}
          loading={false}
          onToggleExpanded={() => setPendingExpanded((previous) => !previous)}
          onSubmit={handleSubmitPendingChanges}
          onCancel={handleCancelPendingChanges}
          onRemoveChange={handleRemovePendingChange}
        />
      ) : null}
      {isLoggedIn ? (
        <JerseyGuideModal
          open={jerseyGuideOpen}
          onClose={() => setJerseyGuideOpen(false)}
          chart={jerseyChart}
        />
      ) : null}
    </main>
  );
}
