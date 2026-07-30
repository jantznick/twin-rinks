import { useState, useEffect, useMemo, useCallback } from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import TopNav from "./components/TopNav";
import LoginModal from "./components/LoginModal";
import LandingPage from "./pages/LandingPage";
import SubsPage from "./pages/SubsPage";
import SchedulePage from "./pages/SchedulePage";
import ProfilePage from "./pages/ProfilePage";
import VerifyMagicLinkPage from "./pages/VerifyMagicLinkPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import Toast from "./components/Toast";
import { useAuth } from "./context/AuthContext";
import { apiFetch, getApiBase, authApi } from "./lib/api";
import { normalizeSportsengineScheduleGames } from "./lib/gameUtils";
import { twinRinksSeasonGamesForDashboard } from "./lib/twinRinksSeasonCalendar";
import {
  loadSportsengineCalendarsFromApi,
  normalizeCalendarsPayload,
  shortUrlKey,
  isScheduleId
} from "./lib/sportsengineCalendars";

const GAMES_UPLOAD_POLL_MS = 20000;
const GAMES_UPLOAD_POLL_SEC = Math.ceil(GAMES_UPLOAD_POLL_MS / 1000);

window.fake_sub_failure = () => {
  window.__FAKE_SUB_FAILURE = true;
  console.log("Next submission will fail!");
};

window.fake_games_next_failure = (message = "Simulated get-games failure") => {
  window.__FAKE_GAMES_NEXT = { type: "error", message };
  console.log("Next get-games call will fail:", message);
};

window.fake_games_next_uploading = () => {
  window.__FAKE_GAMES_NEXT = { type: "uploading" };
  console.log("Next get-games call will simulate legacy “uploading” state.");
};

window.fake_games_uploading_sticky = () => {
  window.__FAKE_GAMES_UPLOADING_STICKY = true;
  console.log(
    "Every get-games call will simulate “uploading” until you run clear_fake_games_simulation()"
  );
};

window.clear_fake_games_simulation = () => {
  delete window.__FAKE_GAMES_NEXT;
  delete window.__FAKE_GAMES_UPLOADING_STICKY;
  console.log("Games API simulation cleared. Refresh or use “Refresh” on subs if needed.");
};

export default function App() {
  const {
    user,
    loading: authLoading,
    isLoggedIn,
    hasTwinRinksLink,
    logout,
    checkAuth
  } = useAuth();

  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const [gamesResponse, setGamesResponse] = useState(null);
  const [sportsengineCalendars, setSportsengineCalendars] = useState([]);
  const [sportsengineScheduleResults, setSportsengineScheduleResults] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesError, setGamesError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [demoMode, setDemoMode] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [uploadRefreshCountdownSec, setUploadRefreshCountdownSec] = useState(null);
  const [blackoutRules, setBlackoutRules] = useState([]);
  const [calendarSubscriptions, setCalendarSubscriptions] = useState([]);
  const [calendarBlocklist, setCalendarBlocklist] = useState([]);
  const [blackoutPrefs, setBlackoutPrefs] = useState({
    subWarnIfSameDayGame: false,
    subWarnIfAdjacentGameDays: false
  });
  const [twinRinksSeason, setTwinRinksSeason] = useState({
    league: "",
    team: ""
  });

  const userEmail = user?.email || "";

  const clearAppData = useCallback(() => {
    setGamesResponse(null);
    setSportsengineCalendars([]);
    setSportsengineScheduleResults([]);
    setBlackoutRules([]);
    setCalendarSubscriptions([]);
    setCalendarBlocklist([]);
    setGamesError("");
    setIsUploading(false);
    setUploadRefreshCountdownSec(null);
    setBlackoutPrefs({
      subWarnIfSameDayGame: false,
      subWarnIfAdjacentGameDays: false
    });
    setTwinRinksSeason({ league: "", team: "" });
  }, []);

  const loadBlackouts = useCallback(async () => {
    if (!isLoggedIn) {
      setBlackoutRules([]);
      setCalendarSubscriptions([]);
      setCalendarBlocklist([]);
      setBlackoutPrefs({
        subWarnIfSameDayGame: false,
        subWarnIfAdjacentGameDays: false
      });
      setTwinRinksSeason({ league: "", team: "" });
      return;
    }
    try {
      const { data } = await apiFetch("/user/blackouts", { method: "POST", body: {} });
      if (data.ok && Array.isArray(data.rules)) {
        setBlackoutRules(data.rules);
        setCalendarSubscriptions(
          Array.isArray(data.calendarSubscriptions) ? data.calendarSubscriptions : []
        );
        setCalendarBlocklist(Array.isArray(data.calendarBlocklist) ? data.calendarBlocklist : []);
        setBlackoutPrefs({
          subWarnIfSameDayGame: data.subWarnIfSameDayGame === true,
          subWarnIfAdjacentGameDays: data.subWarnIfAdjacentGameDays === true
        });
        setTwinRinksSeason({
          league: String(data.twinRinksSeasonLeague || "").trim(),
          team: String(data.twinRinksSeasonTeam || "").trim()
        });
      } else {
        setBlackoutRules([]);
        setCalendarSubscriptions([]);
        setCalendarBlocklist([]);
      }
    } catch {
      setBlackoutRules([]);
      setCalendarSubscriptions([]);
      setCalendarBlocklist([]);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) {
      clearAppData();
      return;
    }
    loadBlackouts();
  }, [isLoggedIn, loadBlackouts, clearAppData]);

  useEffect(() => {
    if (!isLoggedIn) {
      setSportsengineCalendars([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const calendars = await loadSportsengineCalendarsFromApi(getApiBase());
        if (!cancelled) {
          setSportsengineCalendars(calendars);
        }
      } catch (e) {
        if (!cancelled) {
          setSportsengineCalendars([]);
          if (e.code === "database_unavailable") {
            setToastMessage({
              type: "error",
              text: "Calendar settings need a configured database on the server (DATABASE_URL)."
            });
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  const syncDemoSportsengineCalendars = useCallback((calendars) => {
    if (demoMode) {
      setSportsengineCalendars(calendars);
    }
  }, [demoMode]);

  const applyProfileSaveResponse = useCallback((data) => {
    if (data?.sportsengineCalendars && Array.isArray(data.sportsengineCalendars)) {
      setSportsengineCalendars(normalizeCalendarsPayload(data));
    }
  }, []);

  const fetchSportsengineSchedules = useCallback(async () => {
    const list = sportsengineCalendars.filter(
      (c) => String(c?.url || "").trim() && isScheduleId(c?.scheduleId)
    );
    if (list.length === 0 || !isLoggedIn) {
      setSportsengineScheduleResults([]);
      return;
    }
    const results = await Promise.all(
      list.map(async (cal) => {
        const requestedScheduleId = cal.scheduleId;
        const requestedUrl = cal.url;
        try {
          const { data } = await apiFetch("/sportsengine/team-schedule", {
            method: "POST",
            body: { scheduleId: requestedScheduleId }
          });
          return {
            ...data,
            requestedScheduleId: data.requestedScheduleId ?? requestedScheduleId,
            requestedUrl,
            leagueLabel: cal.leagueLabel
          };
        } catch (e) {
          return {
            ok: false,
            requestedScheduleId,
            requestedUrl,
            leagueLabel: cal.leagueLabel,
            error: e.message || "Request failed"
          };
        }
      })
    );
    setSportsengineScheduleResults(results);
  }, [sportsengineCalendars, isLoggedIn]);

  const combinedSportsengineGames = useMemo(() => {
    const merged = [];
    for (const r of sportsengineScheduleResults) {
      if (!r.ok || !Array.isArray(r.games)) {
        continue;
      }
      const cal = sportsengineCalendars.find(
        (c) => String(c.scheduleId || "") === String(r.requestedScheduleId || "")
      );
      const key = shortUrlKey(
        r.requestedScheduleId || r.requestedUrl || r.sourceUrl || ""
      );
      merged.push(
        ...normalizeSportsengineScheduleGames(r.games, {
          sourceKey: key,
          leagueLabel: cal?.leagueLabel || r.leagueLabel || "League schedule",
          teamName: r.teamName ?? "",
          scheduleId: r.requestedScheduleId || cal?.scheduleId || ""
        })
      );
    }
    return merged;
  }, [sportsengineScheduleResults, sportsengineCalendars]);

  const twinRinksSeasonMerged = useMemo(
    () =>
      twinRinksSeasonGamesForDashboard(
        twinRinksSeason.league,
        twinRinksSeason.team,
        gamesResponse?.ok && Array.isArray(gamesResponse.games) ? gamesResponse.games : []
      ),
    [twinRinksSeason.league, twinRinksSeason.team, gamesResponse?.ok, gamesResponse?.games]
  );

  const combinedGamesResponse = useMemo(() => {
    const se = combinedSportsengineGames;
    const tr = twinRinksSeasonMerged;
    if (gamesResponse?.ok) {
      const baseGames = Array.isArray(gamesResponse.games) ? gamesResponse.games : [];
      return {
        ...gamesResponse,
        games: [...baseGames, ...tr, ...se]
      };
    }
    const merged = [...tr, ...se];
    if (merged.length > 0) {
      return {
        ok: true,
        games: merged,
        profile: gamesResponse?.profile,
        profilePath: gamesResponse?.profilePath
      };
    }
    return gamesResponse;
  }, [gamesResponse, combinedSportsengineGames, twinRinksSeasonMerged]);

  const fetchGames = useCallback(async (isBackground = false) => {
    if (!hasTwinRinksLink) {
      setGamesResponse(null);
      setGamesLoading(false);
      setIsUploading(false);
      return;
    }
    if (!isBackground) {
      setGamesError("");
      setGamesLoading(true);
    }
    try {
      if (window.__FAKE_GAMES_UPLOADING_STICKY) {
        throw new Error("uploading");
      }
      if (window.__FAKE_GAMES_NEXT) {
        const next = window.__FAKE_GAMES_NEXT;
        window.__FAKE_GAMES_NEXT = null;
        if (next.type === "uploading") {
          throw new Error("uploading");
        }
        throw new Error(next.message || "Simulated get-games failure");
      }

      const { data } = await apiFetch("/get-games", {
        method: "POST",
        body: {}
      });
      if (!data.ok) {
        if (data.error === "uploading") {
          throw new Error("uploading");
        }
        throw new Error(data.error || "Unable to load games");
      }
      setGamesResponse(data);
      setIsUploading(false);
      if (isBackground) setGamesError("");
    } catch (err) {
      if (err.message === "uploading" || err.data?.error === "uploading") {
        setIsUploading(true);
        setUploadRefreshCountdownSec(GAMES_UPLOAD_POLL_SEC);
        const pollUnit = GAMES_UPLOAD_POLL_SEC === 1 ? "second" : "seconds";
        setGamesError(
          `Twin Rinks games in process of being uploaded, we'll keep refreshing in the background and update games when they're ready. Next refresh in ${GAMES_UPLOAD_POLL_SEC} ${pollUnit}.`
        );
      } else if (err.code === "twin_rinks_not_linked") {
        setGamesResponse(null);
        setGamesError("");
        setIsUploading(false);
      } else if (
        err.code === "session_expired" ||
        err.status === 401 ||
        String(err.message || "").toLowerCase().includes("session")
      ) {
        setGamesError(
          "Twin Rinks session expired. Reconnect your Twin Rinks account in Settings → Integrations."
        );
        setIsUploading(false);
      } else {
        setGamesResponse(null);
        setGamesError(err.message || "Unable to load games");
        setIsUploading(false);
      }
    } finally {
      if (!isBackground) {
        setGamesLoading(false);
      }
    }
  }, [hasTwinRinksLink]);

  useEffect(() => {
    if (
      isLoggedIn &&
      hasTwinRinksLink &&
      !gamesResponse &&
      !gamesLoading &&
      !gamesError &&
      !isUploading
    ) {
      fetchGames(false);
    }
  }, [
    isLoggedIn,
    hasTwinRinksLink,
    gamesResponse,
    gamesLoading,
    gamesError,
    isUploading,
    fetchGames
  ]);

  useEffect(() => {
    if (!isLoggedIn) {
      setSportsengineScheduleResults([]);
      return;
    }
    fetchSportsengineSchedules();
  }, [isLoggedIn, fetchSportsengineSchedules]);

  useEffect(() => {
    let interval;
    if (isUploading && hasTwinRinksLink) {
      interval = setInterval(() => {
        fetchGames(true);
      }, GAMES_UPLOAD_POLL_MS);
    }
    return () => clearInterval(interval);
  }, [isUploading, hasTwinRinksLink, fetchGames]);

  useEffect(() => {
    if (!isUploading) {
      setUploadRefreshCountdownSec(null);
      return;
    }
    const ticker = setInterval(() => {
      setUploadRefreshCountdownSec((s) => {
        if (s == null) return GAMES_UPLOAD_POLL_SEC;
        return s <= 1 ? GAMES_UPLOAD_POLL_SEC : s - 1;
      });
    }, 1000);
    return () => clearInterval(ticker);
  }, [isUploading]);

  useEffect(() => {
    if (!isUploading || uploadRefreshCountdownSec == null) return;
    const unit = uploadRefreshCountdownSec === 1 ? "second" : "seconds";
    setGamesError(
      `Twin Rinks games in process of being uploaded, we'll keep refreshing in the background and update games when they're ready. Next refresh in ${uploadRefreshCountdownSec} ${unit}.`
    );
  }, [isUploading, uploadRefreshCountdownSec]);

  const submitGames = async (profile, updates) => {
    setIsSubmitting(true);
    try {
      await apiFetch("/update-games", {
        method: "POST",
        body: {
          profile,
          games: updates
        }
      });
      await fetchGames(false);
      return { success: true };
    } catch (err) {
      if (err.code === "session_expired" || err.status === 401) {
        return {
          success: false,
          error: "Twin Rinks session expired. Reconnect in Settings → Integrations."
        };
      }
      return { success: false, error: err.message || "Failed to submit games" };
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    clearAppData();
  };

  const handleTwinRinksLinkChanged = async () => {
    await checkAuth();
    setGamesResponse(null);
    setGamesError("");
    setIsUploading(false);
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
        Loading…
      </div>
    );
  }

  const needsEmailVerification = Boolean(user && !user.emailVerified);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900">
      <TopNav
        isLoggedIn={isLoggedIn}
        hasTwinRinksLink={hasTwinRinksLink}
        userEmail={userEmail}
        onLogout={handleLogout}
        onOpenLogin={() => setLoginModalOpen(true)}
      />

      {needsEmailVerification ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
          Verify your email to use calendars and settings. Check your inbox (or the API console in development), then refresh.{" "}
          <button
            type="button"
            className="font-semibold text-indigo-700 underline"
            onClick={async () => {
              try {
                await authApi.resendVerification();
                setToastMessage({ type: "success", text: "Verification email sent." });
              } catch (e) {
                setToastMessage({ type: "error", text: e.message || "Could not resend" });
              }
            }}
          >
            Resend link
          </button>
        </div>
      ) : null}
      <div className="flex w-full flex-1 flex-col">
        <Routes>
          <Route
            path="/"
            element={
              isLoggedIn ? (
                <SubsPage
                  hasTwinRinksLink={hasTwinRinksLink}
                  gamesResponse={combinedGamesResponse}
                  loading={gamesLoading}
                  error={gamesError}
                  isUploading={isUploading}
                  isSubmitting={isSubmitting}
                  onRefresh={() => {
                    fetchGames(false);
                    fetchSportsengineSchedules();
                    loadBlackouts();
                  }}
                  onSubmitGames={submitGames}
                  demoMode={demoMode}
                  setDemoMode={setDemoMode}
                  showToast={setToastMessage}
                  blackoutRules={blackoutRules}
                  calendarBlocklist={calendarBlocklist}
                  sportsengineCalendars={sportsengineCalendars}
                  blackoutPrefs={blackoutPrefs}
                />
              ) : (
                <LandingPage onOpenLogin={() => setLoginModalOpen(true)} />
              )
            }
          />
          <Route
            path="/schedule"
            element={
              hasTwinRinksLink ? <SchedulePage /> : <Navigate to="/" replace />
            }
          />
          <Route path="/auth/verify" element={<VerifyMagicLinkPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/profile"
            element={
              isLoggedIn ? (
                <ProfilePage
                  userEmail={userEmail}
                  profilePath={gamesResponse?.profilePath}
                  demoMode={demoMode}
                  setDemoMode={setDemoMode}
                  showToast={setToastMessage}
                  sportsengineCalendars={sportsengineCalendars}
                  applyProfileSaveResponse={applyProfileSaveResponse}
                  syncDemoSportsengineCalendars={syncDemoSportsengineCalendars}
                  sportsengineScheduleResults={sportsengineScheduleResults}
                  onRefreshSportsengineSchedules={fetchSportsengineSchedules}
                  blackoutRules={blackoutRules}
                  calendarSubscriptions={calendarSubscriptions}
                  calendarBlocklist={calendarBlocklist}
                  onBlackoutsUpdated={setBlackoutRules}
                  loadBlackouts={loadBlackouts}
                  blackoutPrefs={blackoutPrefs}
                  onBlackoutPrefsUpdated={(patch) =>
                    setBlackoutPrefs((prev) => ({ ...prev, ...patch }))
                  }
                  twinRinksSeason={twinRinksSeason}
                  onTwinRinksSeasonUpdated={(patch) =>
                    setTwinRinksSeason((prev) => ({ ...prev, ...patch }))
                  }
                  hasTwinRinksLink={hasTwinRinksLink}
                  onTwinRinksLinkChanged={handleTwinRinksLinkChanged}
                />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      <LoginModal open={loginModalOpen} onClose={() => setLoginModalOpen(false)} />

      <Toast
        message={toastMessage?.text}
        type={toastMessage?.type}
        onClose={() => setToastMessage(null)}
      />
    </div>
  );
}
