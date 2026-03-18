import { useEffect, useMemo, useState } from "react";
import GamesCalendarView from "./components/GamesCalendarView";
import GamesGrid from "./components/GamesGrid";
import GamesListView from "./components/GamesListView";
import GamesToolbar from "./components/GamesToolbar";
import LoginPanel from "./components/LoginPanel";
import {
  buildDraftSelections,
  countSelected,
  hasDraftChanges,
  normalizeGames
} from "./lib/gameUtils";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
const SAVED_SESSION_KEY = "legacy-phpsessid";
const DENSE_MODE_KEY = "subs-dense-mode";
const VIEW_MODE_KEY = "subs-view-mode";

function getSavedSession() {
  try {
    return localStorage.getItem(SAVED_SESSION_KEY) || "";
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

export default function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phpsessid, setPhpsessid] = useState(getSavedSession);
  const [gamesResponse, setGamesResponse] = useState(null);
  const [draftSelections, setDraftSelections] = useState({});
  const [hiddenGames, setHiddenGames] = useState({});
  const [showHidden, setShowHidden] = useState(false);
  const [denseMode, setDenseMode] = useState(getSavedDenseMode);
  const [viewMode, setViewMode] = useState(getSavedViewMode);
  const [demoMessage, setDemoMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isLoggedIn = useMemo(() => phpsessid.length > 0, [phpsessid]);
  const games = useMemo(() => normalizeGames(gamesResponse), [gamesResponse]);
  const initialDraft = useMemo(() => buildDraftSelections(games), [games]);
  const pendingChanges = useMemo(
    () => hasDraftChanges(games, initialDraft, draftSelections, hiddenGames),
    [games, initialDraft, draftSelections, hiddenGames]
  );
  const visibleGames = useMemo(
    () => games.filter((game) => showHidden || !hiddenGames[game.gameId]),
    [games, hiddenGames, showHidden]
  );

  useEffect(() => {
    setDraftSelections(initialDraft);
    if (games.length === 0) {
      setHiddenGames({});
    }
  }, [initialDraft, games.length]);

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
      saveSession(data.phpsessid);
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
    setGamesResponse(null);
    setPassword("");
    setError("");
    setDemoMessage("");
    setShowHidden(false);
    setHiddenGames({});
    setDraftSelections({});
  };

  const handleToggleDenseMode = () => {
    setDenseMode((previous) => {
      const next = !previous;
      try {
        localStorage.setItem(DENSE_MODE_KEY, next ? "1" : "0");
      } catch {
        // Ignore localStorage failures.
      }
      return next;
    });
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
    setDemoMessage("");
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
    setDemoMessage("");
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

  const handleToggleHidden = (gameId) => {
    setDemoMessage("");
    setHiddenGames((previous) => {
      const next = { ...previous };
      if (next[gameId]) {
        delete next[gameId];
      } else {
        next[gameId] = true;
      }
      return next;
    });
  };

  const handleDemoSave = () => {
    const { subCount, inCount, outCount } = countSelected(games, draftSelections);
    setDemoMessage(
      `POV save complete. SUB: ${subCount}, IN: ${inCount}, OUT: ${outCount}. (No backend submit yet)`
    );
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-4 text-slate-900 md:p-6">
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
                Compact scheduling for sub requests and attendance choices.
              </p>
            </div>
            {isLoggedIn ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
                  <p className="text-xs uppercase tracking-wide text-indigo-500">Visible</p>
                  <p className="font-semibold">{visibleGames.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Hidden</p>
                  <p className="font-semibold">{Object.keys(hiddenGames).length}</p>
                </div>
              </div>
            ) : null}
          </div>
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
            <GamesToolbar
              loading={loading}
              gameCount={gamesResponse?.gameCount ?? games.length}
              hiddenCount={Object.keys(hiddenGames).length}
              sourceType={gamesResponse?.sourceType || "unknown"}
              pendingChanges={pendingChanges}
              showHidden={showHidden}
              denseMode={denseMode}
              viewMode={viewMode}
              onRefresh={handleRefresh}
              onDemoSave={handleDemoSave}
              onToggleShowHidden={() => setShowHidden((previous) => !previous)}
              onToggleDenseMode={handleToggleDenseMode}
              onChangeViewMode={handleChangeViewMode}
              onLogout={handleLogout}
            />

            {viewMode === "calendar" ? (
              <GamesCalendarView
                games={visibleGames}
                draftSelections={draftSelections}
                hiddenGames={hiddenGames}
                denseMode={denseMode}
                onToggleSub={handleToggleSub}
                onToggleAttendance={handleToggleAttendance}
                onToggleHidden={handleToggleHidden}
              />
            ) : viewMode === "list" ? (
              <GamesListView
                games={visibleGames}
                draftSelections={draftSelections}
                hiddenGames={hiddenGames}
                onToggleSub={handleToggleSub}
                onToggleAttendance={handleToggleAttendance}
                onToggleHidden={handleToggleHidden}
              />
            ) : (
              <GamesGrid
                games={visibleGames}
                draftSelections={draftSelections}
                hiddenGames={hiddenGames}
                denseMode={denseMode}
                onToggleSub={handleToggleSub}
                onToggleAttendance={handleToggleAttendance}
                onToggleHidden={handleToggleHidden}
              />
            )}

            {visibleGames.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                No visible games right now. Toggle "Show hidden games" to review
                hidden items.
              </p>
            ) : null}

            {demoMessage ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {demoMessage}
              </div>
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
    </main>
  );
}
