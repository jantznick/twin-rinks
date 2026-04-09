import { useState, useEffect, useMemo, useCallback } from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import TopNav from "./components/TopNav";
import LoginModal from "./components/LoginModal";
import SiteBlocker from "./components/SiteBlocker";
import LandingPage from "./pages/LandingPage";
import SubsPage from "./pages/SubsPage";
import SchedulePage from "./pages/SchedulePage";
import ProfilePage from "./pages/ProfilePage";
import Toast from "./components/Toast";
import { normalizeSportsengineScheduleGames } from "./lib/gameUtils";
import {
  loadSportsengineCalendarsFromApi,
  saveSportsengineCalendarsToApi,
  shortUrlKey
} from "./lib/sportsengineCalendars";

const SAVED_SESSION_KEY = "legacy-phpsessid";
const SAVED_EMAIL_KEY = "legacy-user-email";
const GAMES_UPLOAD_POLL_MS = 20000;
const GAMES_UPLOAD_POLL_SEC = Math.ceil(GAMES_UPLOAD_POLL_MS / 1000);

// Expose a global function for testing submission failures
window.fake_sub_failure = () => {
  window.__FAKE_SUB_FAILURE = true;
  console.log("Next submission will fail!");
};

/**
 * Simulate get-games API outcomes from the browser console (dev / QA).
 *
 * One-shot (next fetch only):
 *   fake_games_next_failure()           → generic error UI
 *   fake_games_next_failure("timeout")  → custom message
 *   fake_games_next_uploading()         → uploading + countdown (then real API on later polls unless sticky)
 *
 * Sticky (every poll until cleared — good for testing the countdown):
 *   fake_games_uploading_sticky()
 *   clear_fake_games_simulation()       → stop sticky + cancel pending one-shot
 */
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

function getSavedSession() {
  try {
    return localStorage.getItem(SAVED_SESSION_KEY) || sessionStorage.getItem(SAVED_SESSION_KEY) || "";
  } catch {
    return "";
  }
}

function getSavedEmail() {
  try {
    return localStorage.getItem(SAVED_EMAIL_KEY) || sessionStorage.getItem(SAVED_EMAIL_KEY) || "";
  } catch {
    return "";
  }
}

function isLegacySessionExpiredResponse(response, data) {
  if (!response) {
    return false;
  }
  if (String(data?.code || "").toLowerCase() === "session_expired") {
    return true;
  }
  if (response.status === 401) {
    return true;
  }
  const errorText = String(data?.error || "").toLowerCase();
  const hintText = String(data?.hint || "").toLowerCase();
  if (errorText.includes("session")) {
    return true;
  }
  if (hintText.includes("session may be invalid")) {
    return true;
  }
  return false;
}

export default function App() {
  const [siteUnlocked, setSiteUnlocked] = useState(() => {
    try {
      return localStorage.getItem("site-unlocked") === "true";
    } catch {
      return false;
    }
  });
  const [phpsessid, setPhpsessid] = useState(getSavedSession);
  const [userEmail, setUserEmail] = useState(getSavedEmail);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginRemember, setLoginRemember] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [gamesResponse, setGamesResponse] = useState(null);
  const [sportsengineCalendarUrls, setSportsengineCalendarUrls] = useState([]);
  const [sportsengineScheduleResults, setSportsengineScheduleResults] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesError, setGamesError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [demoMode, setDemoMode] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [uploadRefreshCountdownSec, setUploadRefreshCountdownSec] = useState(null);

  const isLoggedIn = Boolean(phpsessid);

  useEffect(() => {
    if (!phpsessid || !String(userEmail || "").trim()) {
      setSportsengineCalendarUrls([]);
      return;
    }
    let cancelled = false;
    const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
    (async () => {
      try {
        const urls = await loadSportsengineCalendarsFromApi(
          API_BASE,
          phpsessid,
          userEmail
        );
        if (!cancelled) {
          setSportsengineCalendarUrls(urls);
        }
      } catch (e) {
        if (!cancelled) {
          setSportsengineCalendarUrls([]);
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
  }, [phpsessid, userEmail]);

  const updateSportsengineCalendarUrls = useCallback(
    async (urls) => {
      setSportsengineCalendarUrls(urls);
      if (!phpsessid || !String(userEmail || "").trim()) {
        return;
      }
      const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
      try {
        const saved = await saveSportsengineCalendarsToApi(
          API_BASE,
          phpsessid,
          userEmail,
          urls
        );
        setSportsengineCalendarUrls(saved);
      } catch (e) {
        console.error(e);
        setToastMessage({
          type: "error",
          text: e.message || "Could not save SportsEngine calendars."
        });
      }
    },
    [phpsessid, userEmail]
  );

  const fetchSportsengineSchedules = useCallback(async () => {
    const urls = sportsengineCalendarUrls.filter(Boolean);
    if (urls.length === 0) {
      setSportsengineScheduleResults([]);
      return;
    }
    const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
    const results = await Promise.all(
      urls.map(async (requestedUrl) => {
        try {
          const response = await fetch(
            `${API_BASE}/sportsengine/team-schedule?url=${encodeURIComponent(requestedUrl)}`
          );
          const data = await response.json();
          return { requestedUrl, ...data };
        } catch (e) {
          return {
            ok: false,
            requestedUrl,
            error: e.message || "Request failed"
          };
        }
      })
    );
    setSportsengineScheduleResults(results);
  }, [sportsengineCalendarUrls]);

  const combinedSportsengineGames = useMemo(() => {
    const merged = [];
    for (const r of sportsengineScheduleResults) {
      if (!r.ok || !Array.isArray(r.games)) {
        continue;
      }
      const key = shortUrlKey(r.requestedUrl || r.sourceUrl || "");
      const teamName = r.teamName || "";
      merged.push(
        ...normalizeSportsengineScheduleGames(r.games, teamName, {
          sourceKey: key,
          leagueLabel: teamName || "League schedule"
        })
      );
    }
    return merged;
  }, [sportsengineScheduleResults]);

  const combinedGamesResponse = useMemo(() => {
    if (!gamesResponse?.ok) {
      return gamesResponse;
    }
    const baseGames = Array.isArray(gamesResponse.games) ? gamesResponse.games : [];
    return {
      ...gamesResponse,
      games: [...baseGames, ...combinedSportsengineGames]
    };
  }, [gamesResponse, combinedSportsengineGames]);

  const clearSession = (preserveEmail = false) => {
    const savedEmail = preserveEmail ? userEmail || getSavedEmail() : "";
    setPhpsessid("");
    setGamesResponse(null);
    setSportsengineScheduleResults([]);
    setGamesError("");
    setIsUploading(false);
    setUploadRefreshCountdownSec(null);
    setUserEmail(savedEmail);

    try {
      localStorage.removeItem(SAVED_SESSION_KEY);
      sessionStorage.removeItem(SAVED_SESSION_KEY);
      if (preserveEmail && savedEmail) {
        localStorage.setItem(SAVED_EMAIL_KEY, savedEmail);
        sessionStorage.removeItem(SAVED_EMAIL_KEY);
      } else {
        localStorage.removeItem(SAVED_EMAIL_KEY);
        sessionStorage.removeItem(SAVED_EMAIL_KEY);
      }
    } catch {
      // Ignore localStorage/sessionStorage failures
    }
  };

  const promptReauth = (message) => {
    const emailForRelogin = userEmail || getSavedEmail();
    clearSession(true);
    setLoginUsername(emailForRelogin);
    setLoginPassword("");
    setLoginError(message || "Your session expired. Please sign in again.");
    setLoginModalOpen(true);
  };

  const fetchGames = async (sessionId, isBackground = false) => {
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

      const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
      const response = await fetch(`${API_BASE}/get-games`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phpsessid: sessionId })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        if (data.error === "uploading") {
          throw new Error("uploading");
        }
        if (isLegacySessionExpiredResponse(response, data)) {
          promptReauth("Session expired on Twin Rinks. Please sign in again.");
          return;
        }
        throw new Error(data.error || "Unable to load games");
      }
      setGamesResponse(data);
      setIsUploading(false);
      if (isBackground) setGamesError("");
    } catch (err) {
      if (err.message === "uploading") {
        setIsUploading(true);
        setUploadRefreshCountdownSec(GAMES_UPLOAD_POLL_SEC);
        const pollUnit = GAMES_UPLOAD_POLL_SEC === 1 ? "second" : "seconds";
        setGamesError(
          `Games in process of being uploaded, we'll keep refreshing in the background and update games when they're ready. Next refresh in ${GAMES_UPLOAD_POLL_SEC} ${pollUnit}.`
        );
      } else {
        setGamesResponse(null);
        setSportsengineScheduleResults([]);
        setGamesError(err.message || "Unable to load games");
        setIsUploading(false);
      }
    } finally {
      if (!isBackground) {
        setGamesLoading(false);
      }
    }
  };

  useEffect(() => {
    if (phpsessid && !gamesResponse && !gamesLoading && !gamesError && !isUploading) {
      fetchGames(phpsessid);
    }
  }, [phpsessid, gamesResponse, gamesLoading, gamesError, isUploading]);

  useEffect(() => {
    if (!phpsessid) {
      setSportsengineScheduleResults([]);
      return;
    }
    fetchSportsengineSchedules();
  }, [phpsessid, fetchSportsengineSchedules]);

  useEffect(() => {
    let interval;
    if (isUploading && phpsessid) {
      interval = setInterval(() => {
        fetchGames(phpsessid, true);
      }, GAMES_UPLOAD_POLL_MS);
    }
    return () => clearInterval(interval);
  }, [isUploading, phpsessid]);

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
      `Games in process of being uploaded, we'll keep refreshing in the background and update games when they're ready. Next refresh in ${uploadRefreshCountdownSec} ${unit}.`
    );
  }, [isUploading, uploadRefreshCountdownSec]);

  const submitGames = async (profile, updates) => {
    setIsSubmitting(true);
    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
      const response = await fetch(`${API_BASE}/update-games`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phpsessid,
          profile,
          games: updates
        })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        if (isLegacySessionExpiredResponse(response, data)) {
          promptReauth("Session expired before submit. Please sign in again.");
          return { success: false, error: "Session expired. Please sign in again." };
        }
        throw new Error(data.error || "Failed to submit games");
      }
      // Refresh games to get the latest state from the server
      await fetchGames(phpsessid);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || "Failed to submit games" };
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
      const response = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername.trim(), password: loginPassword })
      });
      const data = await response.json();
      if (!response.ok || !data.ok || !data.phpsessid) {
        throw new Error(data.error || "Login failed");
      }
      
      const normalizedEmail = loginUsername.trim();
      setPhpsessid(data.phpsessid);
      setUserEmail(normalizedEmail);
      setGamesResponse(null);
      setGamesError("");
      setIsUploading(false);
      
      if (loginRemember) {
        try {
          localStorage.setItem(SAVED_SESSION_KEY, data.phpsessid);
          localStorage.setItem(SAVED_EMAIL_KEY, normalizedEmail);
          sessionStorage.removeItem(SAVED_SESSION_KEY);
          sessionStorage.removeItem(SAVED_EMAIL_KEY);
        } catch {
          // Ignore localStorage failures
        }
      } else {
        try {
          localStorage.removeItem(SAVED_SESSION_KEY);
          localStorage.removeItem(SAVED_EMAIL_KEY);
          sessionStorage.setItem(SAVED_SESSION_KEY, data.phpsessid);
          sessionStorage.setItem(SAVED_EMAIL_KEY, normalizedEmail);
        } catch {
          // Ignore localStorage failures
        }
      }
      
      setLoginModalOpen(false);
      setLoginPassword("");
    } catch (err) {
      setLoginError(err.message || "Unable to login");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    clearSession(false);
  };

  const handleUnlock = () => {
    setSiteUnlocked(true);
    try {
      localStorage.setItem("site-unlocked", "true");
    } catch {
      // Ignore localStorage failures
    }
  };

  if (!siteUnlocked) {
    return <SiteBlocker onUnlock={handleUnlock} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900">
      <TopNav
        isLoggedIn={isLoggedIn}
        userEmail={userEmail}
        onLogout={handleLogout}
        onOpenLogin={() => setLoginModalOpen(true)}
      />

      <div className="flex w-full flex-1 flex-col">
        <Routes>
          <Route
            path="/"
            element={
              isLoggedIn ? (
                <SubsPage
                  phpsessid={phpsessid}
                  gamesResponse={combinedGamesResponse}
                  loading={gamesLoading}
                  error={gamesError}
                  isUploading={isUploading}
                  isSubmitting={isSubmitting}
                  onRefresh={() => {
                    fetchGames(phpsessid);
                    fetchSportsengineSchedules();
                  }}
                  onSubmitGames={submitGames}
                  demoMode={demoMode}
                  setDemoMode={setDemoMode}
                  showToast={setToastMessage}
                />
              ) : (
                <LandingPage onOpenLogin={() => setLoginModalOpen(true)} />
              )
            }
          />
          <Route path="/schedule" element={<SchedulePage />} />
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
                  sportsengineCalendarUrls={sportsengineCalendarUrls}
                  onSportsengineCalendarUrlsChange={updateSportsengineCalendarUrls}
                  sportsengineScheduleResults={sportsengineScheduleResults}
                  onRefreshSportsengineSchedules={fetchSportsengineSchedules}
                />
              ) : (
                <Navigate to="/" replace />
              )
            } 
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      <LoginModal
        open={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        username={loginUsername}
        password={loginPassword}
        remember={loginRemember}
        loading={loginLoading}
        error={loginError}
        onUsernameChange={setLoginUsername}
        onPasswordChange={setLoginPassword}
        onRememberChange={setLoginRemember}
        onSubmit={handleLoginSubmit}
      />

      <Toast 
        message={toastMessage?.text} 
        type={toastMessage?.type} 
        onClose={() => setToastMessage(null)} 
      />
    </div>
  );
}
