import { useState, useEffect } from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import TopNav from "./components/TopNav";
import LoginModal from "./components/LoginModal";
import SiteBlocker from "./components/SiteBlocker";
import LandingPage from "./pages/LandingPage";
import SubsPage from "./pages/SubsPage";
import SchedulePage from "./pages/SchedulePage";

const SAVED_SESSION_KEY = "legacy-phpsessid";
const SAVED_EMAIL_KEY = "legacy-user-email";

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
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [gamesResponse, setGamesResponse] = useState(null);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesError, setGamesError] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const isLoggedIn = Boolean(phpsessid);

  const fetchGames = async (sessionId, isBackground = false) => {
    if (!isBackground) {
      setGamesError("");
      setGamesLoading(true);
    }
    try {
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
        throw new Error(data.error || "Unable to load games");
      }
      setGamesResponse(data);
      setIsUploading(false);
      if (isBackground) setGamesError("");
    } catch (err) {
      if (err.message === "uploading") {
        setIsUploading(true);
        setGamesError("Games in process of being uploaded, we'll keep refreshing in the background and update games when they're ready.");
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
  };

  useEffect(() => {
    if (phpsessid && !gamesResponse && !gamesLoading && !gamesError && !isUploading) {
      fetchGames(phpsessid);
    }
  }, [phpsessid, gamesResponse, gamesLoading, gamesError, isUploading]);

  useEffect(() => {
    let interval;
    if (isUploading && phpsessid) {
      interval = setInterval(() => {
        fetchGames(phpsessid, true);
      }, 10000);
    }
    return () => clearInterval(interval);
  }, [isUploading, phpsessid]);

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
      
      try {
        localStorage.setItem(SAVED_SESSION_KEY, data.phpsessid);
        localStorage.setItem(SAVED_EMAIL_KEY, normalizedEmail);
      } catch {
        // Ignore localStorage failures
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
    setPhpsessid("");
    setUserEmail("");
    setGamesResponse(null);
    setGamesError("");
    setIsUploading(false);
    try {
      localStorage.removeItem(SAVED_SESSION_KEY);
      localStorage.removeItem(SAVED_EMAIL_KEY);
    } catch {
      // Ignore localStorage failures
    }
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
                  gamesResponse={gamesResponse}
                  loading={gamesLoading}
                  error={gamesError}
                  isUploading={isUploading}
                  onRefresh={() => fetchGames(phpsessid)}
                />
              ) : (
                <LandingPage onOpenLogin={() => setLoginModalOpen(true)} />
              )
            }
          />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      <LoginModal
        open={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        username={loginUsername}
        password={loginPassword}
        loading={loginLoading}
        error={loginError}
        onUsernameChange={setLoginUsername}
        onPasswordChange={setLoginPassword}
        onSubmit={handleLoginSubmit}
      />
    </div>
  );
}
