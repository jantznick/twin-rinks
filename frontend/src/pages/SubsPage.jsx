import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GamesCalendarView from "../components/GamesCalendarView";
import GamesGrid from "../components/GamesGrid";
import GamesListView from "../components/GamesListView";
import JerseyGuideModal from "../components/JerseyGuideModal";
import PendingChangesBar from "../components/PendingChangesBar";
import BlackoutConfirmModal from "../components/BlackoutConfirmModal";
import {
  buildDraftSelections,
  getJerseyChart,
  getGameStartDate,
  getGameHeadline,
  countsAsPlayingForSubWarn,
  getPlayingTeamColor,
  getScheduleText,
  getDateKeyIsoLocal,
  normalizeGames,
  checkIsProcessed,
  applyPendingUpdate
} from "../lib/gameUtils";
import {
  getBlackoutReasonEntries,
  getBlackoutReasonLines,
  getImportedActiveBlackoutLines,
  getImportedReasonEntries,
  getImportedTentativeBlackoutLines,
  hasAnyBlackoutForGame,
  TWIN_RINKS_SCOPE
} from "../lib/blackoutRules";

const DENSE_MODE_KEY = "subs-dense-mode";
const VIEW_MODE_KEY = "subs-view-mode";
const PENDING_UPDATES_KEY = "twin-rinks-pending-updates";
const MAX_PENDING_AGE = 20 * 60 * 1000; // 20 minutes

function addDaysToIsoLocal(iso, deltaDays) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  if (!m) {
    return null;
  }
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  dt.setDate(dt.getDate() + deltaDays);
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function selectionForConflictCheck(game, draftSelections, submittedSelections) {
  return Object.prototype.hasOwnProperty.call(draftSelections, game.gameId)
    ? normalizeSelection(draftSelections[game.gameId])
    : normalizeSelection(submittedSelections[game.gameId]);
}

/** Same rules as submit pipeline — used when turning “I can sub” on so it matches blackout-date flow. */
function collectSubScheduleConflictReasonEntries(
  g,
  games,
  draftSelections,
  submittedSelections,
  blackoutPrefs
) {
  const entries = [];
  if (!g || g.source === "sportsengine") {
    return entries;
  }
  if (!blackoutPrefs?.subWarnIfSameDayGame && !blackoutPrefs?.subWarnIfAdjacentGameDays) {
    return entries;
  }
  const dk = getDateKeyIsoLocal(g);
  if (!dk) {
    return entries;
  }

  if (blackoutPrefs.subWarnIfSameDayGame) {
    for (const h of games) {
      if (h.gameId === g.gameId) {
        continue;
      }
      if (getDateKeyIsoLocal(h) !== dk) {
        continue;
      }
      const selH = selectionForConflictCheck(h, draftSelections, submittedSelections);
      if (countsAsPlayingForSubWarn(h, selH)) {
        entries.push({
          line: `Another game that same calendar day`
        });
      }
    }
  }

  if (blackoutPrefs.subWarnIfAdjacentGameDays) {
    const prev = addDaysToIsoLocal(dk, -1);
    const next = addDaysToIsoLocal(dk, 1);
    for (const h of games) {
      if (h.gameId === g.gameId) {
        continue;
      }
      const dh = getDateKeyIsoLocal(h);
      if (dh !== prev && dh !== next) {
        continue;
      }
      const selH = selectionForConflictCheck(h, draftSelections, submittedSelections);
      if (countsAsPlayingForSubWarn(h, selH)) {
        const side = dh === prev ? "Previous calendar day" : "Next calendar day";
        entries.push({
          line: `${side}`
        });
      }
    }
  }

  return entries;
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

export default function SubsPage({
  phpsessid,
  gamesResponse,
  loading,
  error,
  isUploading,
  isSubmitting,
  onRefresh,
  onSubmitGames,
  demoMode,
  setDemoMode,
  showToast,
  blackoutRules = [],
  calendarBlocklist = [],
  sportsengineCalendars = [],
  blackoutPrefs = { subWarnIfSameDayGame: false, subWarnIfAdjacentGameDays: false }
}) {
  const [draftSelections, setDraftSelections] = useState({});
  const [denseMode, setDenseMode] = useState(getSavedDenseMode);
  const [viewMode, setViewMode] = useState(getSavedViewMode);
  const [calendarLayoutMode, setCalendarLayoutMode] = useState("planner");
  const [activeTab, setActiveTab] = useState("games");
  const [submittedSelections, setSubmittedSelections] = useState({});
  const [pendingExpanded, setPendingExpanded] = useState(false);
  const [jerseyGuideOpen, setJerseyGuideOpen] = useState(false);
  const [showMyGames, setShowMyGames] = useState(true);
  const [showSubOptions, setShowSubOptions] = useState(true);
  const [pendingUpdates, setPendingUpdates] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [blackoutToggleModal, setBlackoutToggleModal] = useState(null);
  const [blackoutSubmitModal, setBlackoutSubmitModal] = useState(null);
  const submitPipelineRef = useRef({ steps: [], index: 0 });

  const rawGames = useMemo(() => normalizeGames(gamesResponse), [gamesResponse]);

  const resolveLeagueLabel = useCallback(
    (scopeId) => {
      if (scopeId === TWIN_RINKS_SCOPE) {
        return "Twin Rinks";
      }
      const cal = sportsengineCalendars.find((c) => String(c.scheduleId || "") === String(scopeId));
      return cal?.leagueLabel?.trim() || "League schedule";
    },
    [sportsengineCalendars]
  );

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

  const blackoutReasonsByGameId = useMemo(() => {
    const map = {};
    for (const g of games) {
      const ruleLines = getBlackoutReasonLines(g, blackoutRules, resolveLeagueLabel);
      const importedLines = getImportedActiveBlackoutLines(g, calendarBlocklist, resolveLeagueLabel);
      map[g.gameId] = [...ruleLines, ...importedLines];
    }
    return map;
  }, [games, blackoutRules, calendarBlocklist, resolveLeagueLabel]);

  const tentativeBlackoutReasonsByGameId = useMemo(() => {
    const map = {};
    for (const g of games) {
      map[g.gameId] = getImportedTentativeBlackoutLines(g, calendarBlocklist, resolveLeagueLabel);
    }
    return map;
  }, [games, calendarBlocklist, resolveLeagueLabel]);

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

  const isTwinRinksLeagueGame = (game) => game?.source === "twin-rinks-league";
  const isSubListingGame = (game) =>
    game?.source === "subs" ||
    game?.source === undefined ||
    game?.source === null ||
    game?.source === "";

  const combinedMainGames = useMemo(
    () =>
      games.filter((game) => {
        if (outGameIds.has(game.gameId)) {
          return false;
        }
        const myGameRow =
          submittedGameIds.has(game.gameId) ||
          game.source === "sportsengine" ||
          isTwinRinksLeagueGame(game);
        const subOptionsRow = isSubListingGame(game);
        return (
          (myGameRow && showMyGames) || (subOptionsRow && showSubOptions)
        );
      }),
    [games, outGameIds, showMyGames, showSubOptions, submittedGameIds]
  );

  const myGames = useMemo(
    () =>
      games.filter(
        (game) =>
          !outGameIds.has(game.gameId) &&
          (submittedGameIds.has(game.gameId) ||
            game.source === "sportsengine" ||
            isTwinRinksLeagueGame(game))
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
      activeTab === "hidden" ? hiddenTabGames : combinedMainGames,
    [activeTab, hiddenTabGames, combinedMainGames]
  );

  const isMyGameFn = useMemo(
    () => (game) =>
      Boolean(
        game &&
          (submittedGameIds.has(game.gameId) ||
            game.source === "sportsengine" ||
            isTwinRinksLeagueGame(game))
      ),
    [submittedGameIds]
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
    const game = games.find((g) => g.gameId === gameId);
    const wasSelected = Boolean(draftSelections[gameId]?.sub);

    if (wasSelected) {
      setDraftSelections((previous) => ({
        ...previous,
        [gameId]: {
          ...previous[gameId],
          sub: false,
          attendance: previous[gameId]?.attendance || ""
        }
      }));
      return;
    }

    const blackoutReasons = game
      ? [
          ...getBlackoutReasonEntries(game, blackoutRules, resolveLeagueLabel),
          ...getImportedReasonEntries(game, calendarBlocklist, resolveLeagueLabel)
        ]
      : [];
    const scheduleReasons = game
      ? collectSubScheduleConflictReasonEntries(
          game,
          games,
          draftSelections,
          submittedSelections,
          blackoutPrefs
        )
      : [];
    const reasons = [...blackoutReasons, ...scheduleReasons];

    if (reasons.length > 0) {
      const hasBlackout = blackoutReasons.length > 0;
      const hasSchedule = scheduleReasons.length > 0;
      setBlackoutToggleModal({
        gameId,
        reasons,
        headline: getGameHeadline(game),
        schedule: getScheduleText(game),
        ...(hasSchedule
          ? {
              modalTitle: "This date is on your blackout list",
              modalSubtitle:
                "Review the items below, then continue only if requesting a sub still makes sense.",
              reasonIntro:
                hasBlackout && hasSchedule
                  ? "Before requesting a sub, review:"
                  : "You asked to be warned before requesting a sub on dates like this:"
            }
          : {})
      });
      return;
    }

    setDraftSelections((previous) => ({
      ...previous,
      [gameId]: {
        ...previous[gameId],
        sub: true,
        attendance: ""
      }
    }));
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

  const runSubmitGames = async () => {
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
      .filter((game) => game.source !== "sportsengine")
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
        const changedUpdates = updates.filter((u) => {
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

  const advanceSubmitPipeline = () => {
    const { steps, index } = submitPipelineRef.current;
    if (index >= steps.length) {
      setBlackoutSubmitModal(null);
      void runSubmitGames();
      return;
    }
    const step = steps[index];
    submitPipelineRef.current = { steps, index: index + 1 };
    setBlackoutSubmitModal({
      ...step,
      hasMore: index + 1 < steps.length
    });
  };

  const handleSubmitPendingChanges = async () => {
    setSubmitError(null);

    if (window.__FAKE_SUB_FAILURE) {
      await runSubmitGames();
      return;
    }

    const steps = [];

    const needBlackout = [];
    for (const game of games) {
      const baseline = normalizeSelection(submittedSelections[game.gameId]);
      const draft = normalizeSelection(draftSelections[game.gameId]);
      if (!draft.sub || baseline.sub) {
        continue;
      }
      if (!hasAnyBlackoutForGame(game, blackoutRules, calendarBlocklist)) {
        continue;
      }
      needBlackout.push(game);
    }

    if (needBlackout.length > 0) {
      steps.push({
        title: "Some sub requests are on blackout dates",
        subtitle: "Confirm once to move through reminders, then submit all pending changes.",
        reasonIntro: null,
        footnote: null,
        items: needBlackout.map((g) => ({
          key: g.gameId,
          gameId: g.gameId,
          headline: getGameHeadline(g),
          schedule: getScheduleText(g),
          reasons: [
            ...getBlackoutReasonEntries(g, blackoutRules, resolveLeagueLabel),
            ...getImportedReasonEntries(g, calendarBlocklist, resolveLeagueLabel)
          ]
        }))
      });
    }

    if (steps.length === 0) {
      await runSubmitGames();
      return;
    }

    submitPipelineRef.current = { steps, index: 0 };
    advanceSubmitPipeline();
  };

  const confirmBlackoutToggle = () => {
    if (!blackoutToggleModal) {
      return;
    }
    const { gameId } = blackoutToggleModal;
    setBlackoutToggleModal(null);
    setDraftSelections((previous) => ({
      ...previous,
      [gameId]: {
        ...previous[gameId],
        sub: true,
        attendance: ""
      }
    }));
  };

  const confirmBlackoutSubmit = () => {
    setBlackoutSubmitModal(null);
    advanceSubmitPipeline();
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
              onClick={() => setActiveTab("games")}
              className={`flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition sm:flex-none ${
                activeTab === "games"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              Games ({combinedMainGames.length})
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
              Twin Rinks Subs Jersey guide
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
              {activeTab === "games" ? (
                <>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={showMyGames}
                      onChange={(e) => setShowMyGames(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                    />
                    Show my games
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={showSubOptions}
                      onChange={(e) => setShowSubOptions(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                    />
                    Show sub options
                  </label>
                </>
              ) : null}
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
            isMyGame={isMyGameFn}
            blackoutReasonsByGameId={blackoutReasonsByGameId}
            tentativeBlackoutReasonsByGameId={tentativeBlackoutReasonsByGameId}
          />
        ) : viewMode === "list" ? (
          <GamesListView
            games={visibleGames}
            draftSelections={draftSelections}
            pendingGameIds={pendingGameIds}
            onToggleSub={handleToggleSub}
            onToggleAttendance={handleToggleAttendance}
            isMyGame={isMyGameFn}
            blackoutReasonsByGameId={blackoutReasonsByGameId}
            tentativeBlackoutReasonsByGameId={tentativeBlackoutReasonsByGameId}
          />
        ) : (
          <GamesGrid
            games={visibleGames}
            draftSelections={draftSelections}
            pendingGameIds={pendingGameIds}
            denseMode={denseMode}
            onToggleSub={handleToggleSub}
            onToggleAttendance={handleToggleAttendance}
            isMyGame={isMyGameFn}
            blackoutReasonsByGameId={blackoutReasonsByGameId}
            tentativeBlackoutReasonsByGameId={tentativeBlackoutReasonsByGameId}
          />
        )}

        {visibleGames.length === 0 && !loading && !error ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="text-sm font-medium text-slate-900">
              {activeTab === "hidden"
                ? "No hidden games right now."
                : games.some((g) => !outGameIds.has(g.gameId))
                ? "No games match your filters. Try enabling Show my games and/or Show sub options."
                : "No upcoming games right now."}
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

      <BlackoutConfirmModal
        open={Boolean(blackoutToggleModal)}
        title={blackoutToggleModal?.modalTitle ?? "This date is on your blackout list"}
        subtitle={
          blackoutToggleModal?.modalSubtitle ??
          "Review why you marked it, then continue only if requesting a sub still makes sense."
        }
        reasonIntro={blackoutToggleModal?.reasonIntro}
        footnote={blackoutToggleModal?.footnote}
        items={
          blackoutToggleModal
            ? [
                {
                  key: blackoutToggleModal.gameId,
                  headline: blackoutToggleModal.headline,
                  schedule: blackoutToggleModal.schedule,
                  reasons: blackoutToggleModal.reasons
                }
              ]
            : []
        }
        onConfirm={confirmBlackoutToggle}
        onCancel={() => setBlackoutToggleModal(null)}
      />

      <BlackoutConfirmModal
        open={Boolean(blackoutSubmitModal)}
        title={blackoutSubmitModal?.title || "Review before submit"}
        subtitle={blackoutSubmitModal?.subtitle || ""}
        reasonIntro={blackoutSubmitModal?.reasonIntro}
        footnote={blackoutSubmitModal?.footnote}
        items={blackoutSubmitModal?.items || []}
        confirmLabel={blackoutSubmitModal?.hasMore ? "Continue" : "Submit all"}
        onConfirm={confirmBlackoutSubmit}
        onCancel={() => {
          setBlackoutSubmitModal(null);
          submitPipelineRef.current = { steps: [], index: 0 };
        }}
      />
    </div>
  );
}
