import { useState, useMemo, useEffect } from "react";
import PendingChangesBar from "../components/PendingChangesBar";
import TelegramInstructionsModal from "../components/TelegramInstructionsModal";
import { normalizeCalendarUrlInput, isScheduleId } from "../lib/sportsengineCalendars";

function scheduleFetchResultMatchesCalendar(cal, r) {
  const sid = String(cal.scheduleId || "").trim();
  if (sid && isScheduleId(sid) && r.requestedScheduleId && String(r.requestedScheduleId) === sid) {
    return true;
  }
  const u1 = normalizeCalendarUrlInput(cal.url) || String(cal.url || "").trim();
  const u2 =
    normalizeCalendarUrlInput(r.requestedUrl || r.sourceUrl) ||
    String(r.requestedUrl || r.sourceUrl || "").trim();
  return u1 === u2;
}

const PENDING_PROFILE_KEY = "twin-rinks-pending-profile";
const MAX_PENDING_AGE = 20 * 60 * 1000; // 20 minutes

const FIELD_LABELS = {
  password: "Password",
  position: "Position Preference",
  cell: "Cell Phone",
  carrier: "Carrier / Messaging App",
  chatid: "Telegram Chat ID",
  t_enabled: "Telegram Reminders Enabled",
  t_day: "Telegram Reminder (Days)",
  t_hou: "Telegram Reminder (Hours)",
  t_min: "Telegram Reminder (Minutes)",
  e_enabled: "Email Reminders Enabled",
  e_day: "Email Reminder (Days)",
  e_hou: "Email Reminder (Hours)",
  e_min: "Email Reminder (Minutes)",
  s_day: "Sub Notification (Days)",
  s_hou: "Sub Notification (Hours)",
  s_min: "Sub Notification (Minutes)",
  test_text: "Test Telegram Notification",
  test_mail: "Test Email Message"
};

export default function ProfilePage({
  userEmail,
  profilePath,
  demoMode,
  setDemoMode,
  showToast,
  sportsengineCalendars = [],
  applyProfileSaveResponse = () => {},
  syncDemoSportsengineCalendars = () => {},
  sportsengineScheduleResults = [],
  onRefreshSportsengineSchedules
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const [pendingExpanded, setPendingExpanded] = useState(false);
  const [newCalendarUrl, setNewCalendarUrl] = useState("");
  const [newCalendarLeagueLabel, setNewCalendarLeagueLabel] = useState("");
  const [draftSportsengineCalendars, setDraftSportsengineCalendars] = useState([]);
  /** `cal.url` of row whose detail modal is open */
  const [calendarDetailUrl, setCalendarDetailUrl] = useState(null);

  useEffect(() => {
    setDraftSportsengineCalendars(sportsengineCalendars);
  }, [sportsengineCalendars]);

  useEffect(() => {
    if (!calendarDetailUrl) {
      return undefined;
    }
    const onKey = (e) => {
      if (e.key === "Escape") {
        setCalendarDetailUrl(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [calendarDetailUrl]);

  useEffect(() => {
    if (
      calendarDetailUrl &&
      !draftSportsengineCalendars.some((c) => c.url === calendarDetailUrl)
    ) {
      setCalendarDetailUrl(null);
    }
  }, [calendarDetailUrl, draftSportsengineCalendars]);

  // Initial state for diffing
  const [initialFormData, setInitialFormData] = useState({
    password: "",
    position: "D",
    cell: "",
    carrier: "telegram",
    chatid: "",
    t_enabled: false,
    t_day: "0",
    t_hou: "3",
    t_min: "0",
    e_enabled: false,
    e_day: "0",
    e_hou: "1",
    e_min: "0",
    s_day: "0",
    s_hou: "2",
    s_min: "0",
    test_text: false,
    test_mail: false,
    profile: "",
    player: ""
  });

  // Form state
  const [formData, setFormData] = useState({ ...initialFormData });

  useEffect(() => {
    async function fetchProfile() {
      if (!profilePath) {
        setFetchError("Profile link not found. Please load your games first.");
        setIsLoading(false);
        return;
      }

      setFetchError(null);
      setIsLoading(true);

      try {
        const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
        const phpsessid = localStorage.getItem("legacy-phpsessid") || sessionStorage.getItem("legacy-phpsessid") || "";
        
        const response = await fetch(`${API_BASE}/get-profile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phpsessid, profilePath })
        });
        
        const data = await response.json();
        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Failed to fetch profile");
        }

        const p = data.profile;
        const newInitial = {
          password: "",
          position: p.position || "D",
          cell: p.cell || "",
          carrier: p.carrier || "telegram",
          chatid: p.chatid || "",
          t_enabled: (p.t_day && p.t_day !== "0") || (p.t_hou && p.t_hou !== "0") || (p.t_min && p.t_min !== "0"),
          t_day: p.t_day || "0",
          t_hou: p.t_hou || "0",
          t_min: p.t_min || "0",
          e_enabled: (p.e_day && p.e_day !== "0") || (p.e_hou && p.e_hou !== "0") || (p.e_min && p.e_min !== "0"),
          e_day: p.e_day || "0",
          e_hou: p.e_hou || "0",
          e_min: p.e_min || "0",
          s_day: p.s_day || "0",
          s_hou: p.s_hou || "0",
          s_min: p.s_min || "0",
          test_text: false,
          test_mail: false,
          profile: p.profile || "profile change",
          player: p.player || ""
        };

        let finalInitial = { ...newInitial };

        // Handle optimistic UI persistence
        try {
          const storedStr = localStorage.getItem(PENDING_PROFILE_KEY);
          if (storedStr) {
            const stored = JSON.parse(storedStr);
            if (stored && stored.timestamp && Date.now() - stored.timestamp < MAX_PENDING_AGE) {
              // Check if the backend has caught up
              let isMatch = true;
              const keysToCheck = ["position", "cell", "carrier", "chatid", "t_enabled", "t_day", "t_hou", "t_min", "e_enabled", "e_day", "e_hou", "e_min", "s_day", "s_hou", "s_min"];
              
              for (const key of keysToCheck) {
                if (String(stored.formData[key]) !== String(newInitial[key])) {
                  isMatch = false;
                  break;
                }
              }

              if (isMatch) {
                // Backend caught up, clear pending
                localStorage.removeItem(PENDING_PROFILE_KEY);
              } else {
                // Apply optimistic update
                finalInitial = { ...newInitial, ...stored.formData };
              }
            } else {
              // Expired
              localStorage.removeItem(PENDING_PROFILE_KEY);
            }
          }
        } catch (e) {
          console.error("Failed to parse pending profile updates", e);
        }

        setInitialFormData(finalInitial);
        setFormData(finalInitial);
      } catch (err) {
        setFetchError(err.message || "Failed to load profile data.");
      } finally {
        setIsLoading(false);
      }
    }

    fetchProfile();
  }, [profilePath]);

  const calendarsDirty = useMemo(() => {
    if (
      JSON.stringify(draftSportsengineCalendars) !== JSON.stringify(sportsengineCalendars)
    ) {
      return true;
    }
    // If draft and parent JSON match but rows still lack a server UUID, we must POST
    // sportsengineCalendars again — otherwise update-profile omits them and IDs never get assigned.
    return draftSportsengineCalendars.some(
      (c) => !isScheduleId(String(c?.scheduleId ?? "").trim())
    );
  }, [draftSportsengineCalendars, sportsengineCalendars]);

  const pendingChanges = useMemo(() => {
    const formChanges = Object.keys(formData)
      .filter((key) => key !== "test_text" && key !== "test_mail")
      .filter((key) => formData[key] !== initialFormData[key])
      .map((key) => {
        let summary = `${initialFormData[key]} → ${formData[key]}`;
        if (key === "password") summary = "Password changed";
        if (typeof formData[key] === "boolean") {
          summary = formData[key] ? "Enabled" : "Disabled";
        }

        return {
          gameId: key, // Reusing gameId as the generic key for PendingChangesBar
          headline: FIELD_LABELS[key] || key,
          schedule: "",
          summary
        };
      });
    if (calendarsDirty) {
      formChanges.push({
        gameId: "__sportsengine_calendars__",
        headline: "SportsEngine calendars",
        schedule: "",
        summary: "Team schedule URLs or display names changed"
      });
    }
    return formChanges;
  }, [formData, initialFormData, calendarsDirty]);

  const hasPendingChanges = pendingChanges.length > 0;

  const formHasPendingChanges = useMemo(
    () => pendingChanges.some((c) => c.gameId !== "__sportsengine_calendars__"),
    [pendingChanges]
  );

  const changedFields = useMemo(() => {
    const changes = new Set();
    Object.keys(formData).forEach(key => {
      if (key !== "test_text" && key !== "test_mail" && formData[key] !== initialFormData[key]) {
        changes.add(key);
      }
    });
    return changes;
  }, [formData, initialFormData]);

  const showTelegramTestOption = formData.t_enabled && (
                                 changedFields.has("chatid") || 
                                 changedFields.has("cell") || 
                                 changedFields.has("carrier") ||
                                 changedFields.has("t_enabled") ||
                                 changedFields.has("t_day") ||
                                 changedFields.has("t_hou") ||
                                 changedFields.has("t_min") ||
                                 changedFields.has("s_day") ||
                                 changedFields.has("s_hou") ||
                                 changedFields.has("s_min")
                               );

  const showEmailTestOption = formData.e_enabled && (
                              changedFields.has("e_enabled") ||
                              changedFields.has("e_day") ||
                              changedFields.has("e_hou") ||
                              changedFields.has("e_min")
                            );

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    setFormData((prev) => {
      const next = {
        ...prev,
        [name]: type === "checkbox" ? checked : value
      };

      // If a timer is enabled, but all values are 0, set a default so it actually works
      if (name === "t_enabled" && checked && next.t_day === "0" && next.t_hou === "0" && next.t_min === "0") {
        next.t_hou = "3";
      }
      if (name === "e_enabled" && checked && next.e_day === "0" && next.e_hou === "0" && next.e_min === "0") {
        next.e_hou = "1";
      }

      return next;
    });
  };

  const handleTestSubmit = async (type) => {
    setIsSubmitting(true);

    const testPayload = {
      ...initialFormData,
      test_text: type === "telegram",
      test_mail: type === "email"
    };

    if (demoMode) {
      console.group(`🚀 [DEMO MODE] Simulated Test ${type === "telegram" ? "Telegram" : "Email"}`);
      console.log("Payload:", testPayload);
      console.groupEnd();
      
      setTimeout(() => {
        setIsSubmitting(false);
        showToast({ type: "success", text: `Test ${type === "telegram" ? "Telegram" : "Email"} requested! It will be sent in the next 5-10 minutes. (Demo Mode)` });
      }, 800);
      return;
    }

    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
      const phpsessid = localStorage.getItem("legacy-phpsessid") || sessionStorage.getItem("legacy-phpsessid") || "";
      
      const response = await fetch(`${API_BASE}/update-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...testPayload,
          email: userEmail,
          phpsessid
        })
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.ok) {
        throw new Error(data.error || `Failed to send test ${type === "telegram" ? "Telegram" : "Email"}`);
      }

      setIsSubmitting(false);
      showToast({ type: "success", text: `Test ${type === "telegram" ? "Telegram" : "Email"} requested! It will be sent in the next 5-10 minutes.` });
    } catch (err) {
      setIsSubmitting(false);
      showToast({ type: "error", text: err.message || `Failed to send test ${type === "telegram" ? "Telegram" : "Email"}.` });
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setIsSubmitting(true);

    if (window.__FAKE_SUB_FAILURE) {
      window.__FAKE_SUB_FAILURE = false;
      setIsSubmitting(false);
      showToast({ type: "error", text: "Simulated submission failure from fake_sub_failure()" });
      return;
    }

    if (demoMode) {
      console.group("🚀 [DEMO MODE] Simulated Profile Submission");
      console.log("Form Data:", formData);
      if (calendarsDirty) {
        console.log("SportsEngine calendars (draft):", draftSportsengineCalendars);
      }
      console.groupEnd();

      setTimeout(async () => {
        try {
          if (calendarsDirty) {
            syncDemoSportsengineCalendars(draftSportsengineCalendars);
          }
          setIsSubmitting(false);
          setInitialFormData({ ...formData, test_text: false, test_mail: false });
          setFormData((prev) => ({ ...prev, test_text: false, test_mail: false }));
          setPendingExpanded(false);

          let msg = "Profile updated successfully (Demo Mode)";
          if (formData.test_text || formData.test_mail) {
            msg = "Profile updated! Test message(s) will be sent in the next 5-10 minutes. (Demo Mode)";
          }
          showToast({ type: "success", text: msg });
        } catch (err) {
          setIsSubmitting(false);
          showToast({
            type: "error",
            text: err.message || "Could not save SportsEngine calendars."
          });
        }
      }, 800);
      return;
    }

    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
      const phpsessid = localStorage.getItem("legacy-phpsessid") || sessionStorage.getItem("legacy-phpsessid") || "";

      const payload = {
        phpsessid,
        email: String(userEmail || "").trim()
      };
      if (formHasPendingChanges) {
        payload.twinRinksProfile = {
          profile: formData.profile,
          player: formData.player,
          email: payload.email,
          pass: formData.password,
          position: formData.position,
          cell: formData.cell,
          carrier: formData.carrier,
          chatid: formData.chatid,
          t_enabled: formData.t_enabled,
          t_day: formData.t_day,
          t_hou: formData.t_hou,
          t_min: formData.t_min,
          e_enabled: formData.e_enabled,
          e_day: formData.e_day,
          e_hou: formData.e_hou,
          e_min: formData.e_min,
          s_day: formData.s_day,
          s_hou: formData.s_hou,
          s_min: formData.s_min,
          test_text: formData.test_text,
          test_mail: formData.test_mail
        };
      }
      if (calendarsDirty) {
        payload.sportsengineCalendars = draftSportsengineCalendars;
      }

      const response = await fetch(`${API_BASE}/update-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Failed to submit profile");
      }

      applyProfileSaveResponse(data);

      // Save to local storage for optimistic UI
      try {
        const pendingUpdate = { formData: { ...formData, test_text: false, test_mail: false }, timestamp: Date.now() };
        localStorage.setItem(PENDING_PROFILE_KEY, JSON.stringify(pendingUpdate));
      } catch (e) {
        console.error("Failed to save pending profile updates", e);
      }

      setIsSubmitting(false);
      setInitialFormData({ ...formData, test_text: false, test_mail: false });
      setFormData((prev) => ({ ...prev, test_text: false, test_mail: false }));
      setPendingExpanded(false);

      let msg = "Profile updated successfully!";
      if (formData.test_text || formData.test_mail) {
        msg = "Profile updated! Test message(s) will be sent in the next 5-10 minutes.";
      }
      showToast({ type: "success", text: msg });
    } catch (err) {
      setIsSubmitting(false);
      showToast({ type: "error", text: err.message || "Failed to submit profile." });
    }
  };

  const handleCancel = () => {
    setFormData({ ...initialFormData });
    setDraftSportsengineCalendars(sportsengineCalendars);
    setPendingExpanded(false);
  };

  const handleAddSportsengineCalendar = () => {
    const normalized = normalizeCalendarUrlInput(newCalendarUrl);
    if (!normalized) {
      showToast({ type: "error", text: "Paste a valid team schedule URL (https://…/schedule/team_instance/…?subseason=…)." });
      return;
    }
    const label = newCalendarLeagueLabel.trim();
    if (!label) {
      showToast({ type: "error", text: "Enter a display name for this calendar (e.g. league name). It appears on game cards." });
      return;
    }
    if (draftSportsengineCalendars.some((c) => c.url === normalized)) {
      showToast({ type: "error", text: "That calendar is already in your list." });
      return;
    }
    setDraftSportsengineCalendars((prev) => [
      ...prev,
      {
        url: normalized,
        leagueLabel: label
      }
    ]);
    setNewCalendarUrl("");
    setNewCalendarLeagueLabel("");
  };

  const handleRemoveSportsengineCalendar = (url) => {
    setDraftSportsengineCalendars((prev) => prev.filter((c) => c.url !== url));
  };

  const patchSportsengineCalendar = (url, patch) => {
    setDraftSportsengineCalendars((prev) =>
      prev.map((c) => (c.url === url ? { ...c, ...patch } : c))
    );
  };

  const handleRemoveChange = (fieldKey) => {
    if (fieldKey === "__sportsengine_calendars__") {
      setDraftSportsengineCalendars(sportsengineCalendars);
      return;
    }
    setFormData((prev) => ({ ...prev, [fieldKey]: initialFormData[fieldKey] }));
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
        <div className="inline-flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
          <svg className="h-5 w-5 animate-spin text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-sm font-medium text-slate-700">Loading profile...</span>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="text-sm font-medium text-rose-800">{fetchError}</p>
          <button 
            onClick={() => {
              // Instead of reloading the page, redirect to home to fetch games first
              window.location.href = "/";
            }}
            className="mt-4 rounded-lg bg-rose-100 px-4 py-2 text-sm font-medium text-rose-800 hover:bg-rose-200"
          >
            Return to Games
          </button>
        </div>
      </div>
    );
  }

  const telegramTestDisabled = formData.chatid !== initialFormData.chatid || 
                               formData.cell !== initialFormData.cell || 
                               formData.carrier !== initialFormData.carrier;

  return (
    <div className={`mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8 ${hasPendingChanges ? "pb-36 md:pb-44" : ""}`}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Your Profile</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your contact information and notification preferences.
        </p>
      </div>

      <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">SportsEngine team calendars</h2>
          {onRefreshSportsengineSchedules ? (
            <button
              type="button"
              onClick={() => onRefreshSportsengineSchedules()}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
            >
              Refresh schedules
            </button>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Add public team schedule pages (SportsEngine / Sports NGIN). You choose the <strong>display name</strong> for each
          calendar (purple badge on game cards). Your team name for matchup lines comes from the schedule page. Games appear alongside Twin Rinks subs on{" "}
          <a href="/" className="font-medium text-indigo-600 hover:text-indigo-800 hover:underline">
            My Games &amp; Subs
          </a>
          .
        </p>
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-700 break-all">
          Example:{" "}
          <span className="text-slate-900">
            rosemontahl.com/schedule/team_instance/10537221?subseason=961098
          </span>
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="new-se-calendar" className="block text-sm font-medium text-slate-700">
              Schedule URL
            </label>
            <input
              id="new-se-calendar"
              type="url"
              autoComplete="off"
              placeholder="https://yoursite.com/schedule/team_instance/…?subseason=…"
              value={newCalendarUrl}
              onChange={(e) => setNewCalendarUrl(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="new-se-league" className="block text-sm font-medium text-slate-700">
              Display name <span className="text-rose-600">*</span>
            </label>
            <input
              id="new-se-league"
              type="text"
              autoComplete="off"
              placeholder="e.g. Rosemont AHL"
              value={newCalendarLeagueLabel}
              onChange={(e) => setNewCalendarLeagueLabel(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-slate-500">Shown on the purple badge on each game card.</p>
          </div>
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={handleAddSportsengineCalendar}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
          >
            Add calendar
          </button>
        </div>
        {draftSportsengineCalendars.length > 0 ? (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-800">Loaded calendars</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Click a league for URL and games; Remove deletes it from your profile.
            </p>
            <ul className="mt-3 flex flex-col gap-2">
            {draftSportsengineCalendars.map((cal) => (
              <li key={cal.url} className="flex items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setCalendarDetailUrl(cal.url)}
                  className="min-w-0 flex-1 truncate rounded-lg border border-indigo-200 bg-white px-4 py-2.5 text-left text-sm font-semibold text-slate-900 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50/60 hover:cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400/45"
                >
                  {cal.leagueLabel?.trim() || "Untitled league"}
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveSportsengineCalendar(cal.url)}
                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-800 hover:cursor-pointer"
                >
                  Remove
                </button>
              </li>
            ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">No extra calendars yet. Add a schedule URL and display name above.</p>
        )}
      </section>

      {demoMode ? (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <div>
            <strong>Demo mode:</strong> submissions are local only.
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
            <strong>Live mode active:</strong> Submitting changes will update your actual profile.
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

      <form onSubmit={handleSubmit} className="space-y-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Twin Rinks settings</h2>
          <p className="mt-1 text-sm text-slate-600">
            Your Twin Rinks account, subs preferences, and reminders — separate from extra SportsEngine calendars above.
          </p>
        </div>

        {/* Account Info */}
        <section>
          <h3 className="text-base font-semibold text-slate-900">Account Information</h3>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Email Address</label>
              <input
                type="text"
                disabled
                value={userEmail || "Loading..."}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500 shadow-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                Please email <a href="mailto:subs@twinrinks.com" className="text-indigo-600 hover:underline">subs@twinrinks.com</a> to change your email.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Change Password</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Leave blank to keep current"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </section>

        <hr className="border-slate-200" />

        {/* Player Preferences */}
        <section>
          <h3 className="text-base font-semibold text-slate-900">Player Preferences</h3>
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 mb-3">What position do you prefer to play?</label>
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
              <label className={`flex items-center justify-center gap-2 text-sm font-medium cursor-pointer rounded-xl border-2 p-4 transition-all ${
                formData.position === "F" 
                  ? "border-indigo-600 bg-indigo-50 text-indigo-900 shadow-sm" 
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}>
                <input type="radio" name="position" value="F" checked={formData.position === "F"} onChange={handleChange} className="sr-only" />
                Forward
              </label>
              <label className={`flex items-center justify-center gap-2 text-sm font-medium cursor-pointer rounded-xl border-2 p-4 transition-all ${
                formData.position === "D" 
                  ? "border-indigo-600 bg-indigo-50 text-indigo-900 shadow-sm" 
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}>
                <input type="radio" name="position" value="D" checked={formData.position === "D"} onChange={handleChange} className="sr-only" />
                Defense <span className={`text-xs font-normal ${formData.position === "D" ? "text-indigo-600" : "text-slate-500"}`}>(Goalies check D)</span>
              </label>
              <label className={`flex items-center justify-center gap-2 text-sm font-medium cursor-pointer rounded-xl border-2 p-4 transition-all ${
                formData.position === "B" 
                  ? "border-indigo-600 bg-indigo-50 text-indigo-900 shadow-sm" 
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}>
                <input type="radio" name="position" value="B" checked={formData.position === "B"} onChange={handleChange} className="sr-only" />
                Both
              </label>
            </div>
          </div>
        </section>

        <hr className="border-slate-200" />

        {/* Contact Info */}
        <section>
          <h3 className="text-base font-semibold text-slate-900">Contact & Messaging</h3>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Cell Phone</label>
              <input
                type="text"
                name="cell"
                value={formData.cell}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <label className="block text-sm font-medium text-slate-700">Carrier / Messaging App</label>
                <div className="group relative flex items-center justify-center">
                  <svg className="h-4 w-4 text-slate-400 hover:text-slate-600 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="absolute bottom-full left-1/2 z-10 mb-2 hidden w-64 -translate-x-1/2 flex-col rounded-lg bg-slate-800 p-3 text-xs text-white shadow-lg group-hover:flex">
                    <p className="mb-2">The following carriers do not send our text messages through:</p>
                    <p className="mb-2 font-medium text-slate-300">Alltel, ATT, Boost, Cingular, Consumer Cellular(ATT), Cricket, Mint, Pure Talk USA, Sprint, T-Mobile, Verizon, Xfinity</p>
                    <p className="mb-0">You must install Telegram and select Telegram Messenger from below.</p>
                    <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-slate-800"></div>
                  </div>
                </div>
              </div>
              <select
                name="carrier"
                value={formData.carrier}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="telegram">Telegram Messenger</option>
                <option value="paging.acswireless.com">Ameritech</option>
                <option value="bellsouth.ci">Bellsouth</option>
                <option value="mobile.celloneusa.com">CellularOne / O2 / Orange</option>
                <option value="mailmymobile.net">Consumer Cellular(T-Mobile)</option>
                <option value="sms.edgewireless.com">Edge Wireless</option>
                <option value="msg.fi.google.com">Google Project Fi</option>
                <option value="messaging.nextel.com">Nextel</option>
                <option value="mymetropcs.com">Metro PCS</option>
                <option value="qwestmp.com">Qwest</option>
                <option value="text.republicwireless.com">Republic Wireless</option>
                <option value="pcs.rogers.com">Rogers Wireless</option>
                <option value="msg.telus.com">TelMobility</option>
                <option value="email.uscc.net">US-Cellular</option>
                <option value="vmobl.com">Virgin Mobile</option>
                <option value="notext-nosub.com">No Texts - No Sub</option>
              </select>
              <button 
                type="button" 
                onClick={(e) => { e.preventDefault(); setTelegramModalOpen(true); }}
                className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline text-left block"
              >
                Click here for Telegram installation instructions.
              </button>
            </div>
            {formData.carrier === "telegram" && (
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Telegram Chat ID</label>
                <input
                  type="text"
                  name="chatid"
                  value={formData.chatid}
                  onChange={handleChange}
                  className="mt-1 block w-full sm:w-1/2 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            )}
          </div>
        </section>

        <hr className="border-slate-200" />

        {/* Notifications */}
        <section>
          <h3 className="text-base font-semibold text-slate-900">Reminder Notifications</h3>
          <p className="mt-1 text-xs text-slate-500 mb-4">Configure when you want to be notified before your games.</p>
          
          <div className="space-y-3">
            {/* Telegram Reminder */}
            <div className={`rounded-xl border transition-all duration-200 ${
              formData.t_enabled ? "border-indigo-300 bg-white shadow-sm" : "border-slate-200 bg-slate-50"
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-4">
                <div className="flex items-center gap-3 min-w-[140px]">
                  <label className="relative inline-flex cursor-pointer items-center shrink-0">
                    <input type="checkbox" name="t_enabled" checked={formData.t_enabled} onChange={handleChange} className="peer sr-only" />
                    <div className="h-5 w-9 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300"></div>
                  </label>
                  <span className={`text-sm font-semibold ${formData.t_enabled ? "text-slate-900" : "text-slate-500"}`}>Telegram</span>
                </div>
                
                <div className={`flex flex-wrap items-center gap-2 transition-opacity duration-200 ${formData.t_enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                  <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 shadow-sm">
                    <input type="number" min="0" max="99" name="t_day" value={formData.t_day} onChange={handleChange} disabled={!formData.t_enabled} className="w-8 border-none p-0 text-center text-sm font-medium focus:ring-0 disabled:bg-white" />
                    <span className="text-[10px] font-medium text-slate-500 uppercase">Days</span>
                  </div>
                  <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 shadow-sm">
                    <input type="number" min="0" max="23" name="t_hou" value={formData.t_hou} onChange={handleChange} disabled={!formData.t_enabled} className="w-8 border-none p-0 text-center text-sm font-medium focus:ring-0 disabled:bg-white" />
                    <span className="text-[10px] font-medium text-slate-500 uppercase">Hrs</span>
                  </div>
                  <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 shadow-sm">
                    <input type="number" min="0" max="59" name="t_min" value={formData.t_min} onChange={handleChange} disabled={!formData.t_enabled} className="w-8 border-none p-0 text-center text-sm font-medium focus:ring-0 disabled:bg-white" />
                    <span className="text-[10px] font-medium text-slate-500 uppercase">Mins</span>
                  </div>
                  <span className="text-xs font-medium text-slate-500 hidden sm:block">before game</span>
                </div>
              </div>
            </div>

            {/* Email Reminder */}
            <div className={`rounded-xl border transition-all duration-200 ${
              formData.e_enabled ? "border-indigo-300 bg-white shadow-sm" : "border-slate-200 bg-slate-50"
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-4">
                <div className="flex items-center gap-3 min-w-[140px]">
                  <label className="relative inline-flex cursor-pointer items-center shrink-0">
                    <input type="checkbox" name="e_enabled" checked={formData.e_enabled} onChange={handleChange} className="peer sr-only" />
                    <div className="h-5 w-9 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300"></div>
                  </label>
                  <span className={`text-sm font-semibold ${formData.e_enabled ? "text-slate-900" : "text-slate-500"}`}>Email</span>
                </div>
                
                <div className={`flex flex-wrap items-center gap-2 transition-opacity duration-200 ${formData.e_enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                  <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 shadow-sm">
                    <input type="number" min="0" max="99" name="e_day" value={formData.e_day} onChange={handleChange} disabled={!formData.e_enabled} className="w-8 border-none p-0 text-center text-sm font-medium focus:ring-0 disabled:bg-white" />
                    <span className="text-[10px] font-medium text-slate-500 uppercase">Days</span>
                  </div>
                  <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 shadow-sm">
                    <input type="number" min="0" max="23" name="e_hou" value={formData.e_hou} onChange={handleChange} disabled={!formData.e_enabled} className="w-8 border-none p-0 text-center text-sm font-medium focus:ring-0 disabled:bg-white" />
                    <span className="text-[10px] font-medium text-slate-500 uppercase">Hrs</span>
                  </div>
                  <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 shadow-sm">
                    <input type="number" min="0" max="59" name="e_min" value={formData.e_min} onChange={handleChange} disabled={!formData.e_enabled} className="w-8 border-none p-0 text-center text-sm font-medium focus:ring-0 disabled:bg-white" />
                    <span className="text-[10px] font-medium text-slate-500 uppercase">Mins</span>
                  </div>
                  <span className="text-xs font-medium text-slate-500 hidden sm:block">before game</span>
                </div>
              </div>
            </div>

            {/* Sub Notification Needed */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-4">
                <div className="flex items-center gap-3 min-w-[140px]">
                  <div className="flex h-5 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">Sub Notice</span>
                </div>
                
                <div className="flex flex-col sm:items-end gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-600 hidden sm:block">I need at least:</span>
                    <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 shadow-sm">
                      <input type="number" min="0" max="99" name="s_day" value={formData.s_day} onChange={handleChange} className="w-8 border-none p-0 text-center text-sm font-medium focus:ring-0" />
                      <span className="text-[10px] font-medium text-slate-500 uppercase">Days</span>
                    </div>
                    <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 shadow-sm">
                      <input type="number" min="0" max="23" name="s_hou" value={formData.s_hou} onChange={handleChange} className="w-8 border-none p-0 text-center text-sm font-medium focus:ring-0" />
                      <span className="text-[10px] font-medium text-slate-500 uppercase">Hrs</span>
                    </div>
                    <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 shadow-sm">
                      <input type="number" min="0" max="59" name="s_min" value={formData.s_min} onChange={handleChange} className="w-8 border-none p-0 text-center text-sm font-medium focus:ring-0" />
                      <span className="text-[10px] font-medium text-slate-500 uppercase">Mins</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2 rounded-b-xl">
                <p className="text-[11px] text-slate-500">
                  Example: If someone marks OUT 30 mins before game time and you list 2 hours, you will not be notified.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <button
                type="button"
                onClick={() => handleTestSubmit("telegram")}
                disabled={isSubmitting || telegramTestDisabled || !formData.t_enabled}
                className="w-full cursor-pointer rounded-md bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send Test Telegram
              </button>
              {telegramTestDisabled && formData.t_enabled && (
                <p className="mt-1.5 text-center text-xs text-slate-500">
                  Save changes first to test new settings
                </p>
              )}
            </div>
            <div className="flex-1 min-w-[200px]">
              <button
                type="button"
                onClick={() => handleTestSubmit("email")}
                disabled={isSubmitting || !formData.e_enabled}
                className="w-full cursor-pointer rounded-md bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send Test Email
              </button>
            </div>
          </div>
        </section>

        <div className="hidden">
          {/* We hide the inline buttons since PendingChangesBar handles it, but keep form submit valid */}
          <button type="submit" disabled={isSubmitting}>Save</button>
        </div>
      </form>

      <PendingChangesBar
        isExpanded={pendingExpanded}
        changeCount={pendingChanges.length}
        changes={pendingChanges}
        loading={isSubmitting}
        onToggleExpanded={() => setPendingExpanded((prev) => !prev)}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        onRemoveChange={handleRemoveChange}
        extraControls={
          (showTelegramTestOption || showEmailTestOption) ? (
            <div className="flex flex-wrap gap-6 text-sm">
              {showTelegramTestOption && (
                <label className="group flex cursor-pointer items-center gap-3">
                  <div className="relative flex items-center">
                    <input 
                      type="checkbox" 
                      name="test_text" 
                      checked={formData.test_text} 
                      onChange={handleChange} 
                      className="peer sr-only" 
                    />
                    <div className="h-5 w-9 rounded-full bg-slate-700 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-slate-300 after:transition-all after:content-[''] peer-checked:bg-indigo-500 peer-checked:after:translate-x-full peer-checked:after:bg-white peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500/50 group-hover:bg-slate-600 peer-checked:group-hover:bg-indigo-400"></div>
                  </div>
                  <span className={`font-medium transition-colors ${formData.test_text ? "text-indigo-300" : "text-slate-400 group-hover:text-slate-300"}`}>
                    Also send test Telegram
                  </span>
                </label>
              )}
              {showEmailTestOption && (
                <label className="group flex cursor-pointer items-center gap-3">
                  <div className="relative flex items-center">
                    <input 
                      type="checkbox" 
                      name="test_mail" 
                      checked={formData.test_mail} 
                      onChange={handleChange} 
                      className="peer sr-only" 
                    />
                    <div className="h-5 w-9 rounded-full bg-slate-700 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-slate-300 after:transition-all after:content-[''] peer-checked:bg-indigo-500 peer-checked:after:translate-x-full peer-checked:after:bg-white peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500/50 group-hover:bg-slate-600 peer-checked:group-hover:bg-indigo-400"></div>
                  </div>
                  <span className={`font-medium transition-colors ${formData.test_mail ? "text-indigo-300" : "text-slate-400 group-hover:text-slate-300"}`}>
                    Also send test Email
                  </span>
                </label>
              )}
            </div>
          ) : null
        }
      />

      {calendarDetailUrl ? (
        (() => {
          const detailCal = draftSportsengineCalendars.find((c) => c.url === calendarDetailUrl);
          if (!detailCal) {
            return null;
          }
          const detailStatus = sportsengineScheduleResults.find((r) =>
            scheduleFetchResultMatchesCalendar(detailCal, r)
          );
          const ok = detailStatus?.ok;
          const games = ok && Array.isArray(detailStatus.games) ? detailStatus.games : [];
          const needsSaveForId =
            !String(detailCal.scheduleId || "").trim() || !isScheduleId(detailCal.scheduleId);

          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
              onClick={() => setCalendarDetailUrl(null)}
              role="presentation"
            >
              <div
                className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="se-cal-modal-title"
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                  <div className="min-w-0">
                    <h2 id="se-cal-modal-title" className="text-lg font-semibold text-slate-900">
                      Calendar details
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCalendarDetailUrl(null)}
                    className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    aria-label="Close"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>

                <div className="space-y-5 overflow-y-auto px-5 py-4 text-sm text-slate-700">
                  <div>
                    <label
                      htmlFor="se-cal-modal-label"
                      className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      Display name
                    </label>
                    <input
                      id="se-cal-modal-label"
                      type="text"
                      value={detailCal.leagueLabel}
                      onChange={(e) =>
                        patchSportsengineCalendar(detailCal.url, { leagueLabel: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div>
                    <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Schedule URL
                    </span>
                    <p className="mt-1 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-800 ring-1 ring-inset ring-slate-200/80">
                      {detailCal.url}
                    </p>
                  </div>

                  <dl className="grid grid-cols-1 gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="font-medium text-slate-500">Team Name</dt>
                      <dd className="mt-0.5 text-slate-800">
                        {ok && detailStatus.teamName
                          ? detailStatus.teamName
                          : needsSaveForId
                            ? "Save profile first"
                            : detailStatus && !ok
                              ? "—"
                              : "Loading…"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Games loaded</dt>
                      <dd className="mt-0.5 text-slate-800">
                        {ok
                          ? `${detailStatus.gameCount ?? games.length ?? 0} games`
                          : detailStatus && !ok
                            ? "Could not load"
                            : needsSaveForId
                              ? "Save profile to fetch"
                              : "Not loaded yet"}
                      </dd>
                    </div>
                  </dl>

                  {detailStatus && !ok ? (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      {String(detailStatus.error || detailStatus.details || "Schedule request failed")}
                    </p>
                  ) : null}

                  {ok && games.length > 0 ? (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Games on this schedule
                      </h3>
                      <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-200">
                        <table className="w-full min-w-[100%] border-collapse text-left text-[11px]">
                          <thead className="sticky top-0 bg-slate-100 text-slate-600">
                            <tr>
                              <th className="px-2 py-1.5 font-medium">Date</th>
                              <th className="px-2 py-1.5 font-medium">Opponent</th>
                              <th className="px-2 py-1.5 font-medium">Time</th>
                              <th className="hidden px-2 py-1.5 font-medium sm:table-cell">Rink</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {games.map((g) => (
                              <tr key={g.gameId} className="text-slate-800">
                                <td className="whitespace-nowrap px-2 py-1.5 align-top text-slate-600">
                                  {g.dateRaw}
                                </td>
                                <td className="px-2 py-1.5 align-top">
                                  {g.isAway ? (
                                    <span className="text-slate-500">@ </span>
                                  ) : null}
                                  {g.opponentName}
                                </td>
                                <td className="whitespace-nowrap px-2 py-1.5 align-top text-slate-600">
                                  {g.statusTime}
                                </td>
                                <td className="hidden max-w-[8rem] truncate px-2 py-1.5 align-top text-slate-500 sm:table-cell">
                                  {g.location}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-slate-200 px-5 py-3">
                  <button
                    type="button"
                    onClick={() => setCalendarDetailUrl(null)}
                    className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          );
        })()
      ) : null}

      <TelegramInstructionsModal 
        open={telegramModalOpen} 
        onClose={() => setTelegramModalOpen(false)} 
      />
    </div>
  );
}
