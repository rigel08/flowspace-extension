// ===== OFFSCREEN AUDIO MANAGEMENT =====
async function ensureOffscreen() {
  const exists = await chrome.offscreen.hasDocument();
  if (!exists) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: "Keep FlowSpace music running after popup closes."
    });
  }
}

async function forwardAudioMessage(msg) {
  await ensureOffscreen();
  chrome.runtime.sendMessage(msg);
}

// ===== FOCUS TIMER =====
// Timestamp-based timer: we never decrement a counter. We store the
// absolute time the session should end, and every reader (popup or
// background) derives "time remaining" from Date.now(). This keeps
// the timer correct across popup closes, service worker restarts,
// and system sleep.
const TIMER_ALARM_NAME = "flowspaceFocusTimer";
const TIMER_STORAGE_KEY = "focusTimer";
const DEFAULT_FOCUS_DURATION_MS = 25 * 60 * 1000;

function defaultTimerState() {
  return {
    status: "idle", // idle | running | paused | completed
    duration: DEFAULT_FOCUS_DURATION_MS,
    targetEndTime: null,
    remainingMs: null
  };
}

async function getTimerState() {
  const stored = await chrome.storage.local.get(TIMER_STORAGE_KEY);
  let state = stored[TIMER_STORAGE_KEY] || defaultTimerState();

  // Defensive: if a running timer's target time has already passed
  // (e.g. the completion alarm fired while the service worker was
  // asleep, or right before the popup re-opened), resolve it to
  // "completed" instead of showing a negative countdown.
  if (state.status === "running" && typeof state.targetEndTime === "number") {
    if (Date.now() >= state.targetEndTime) {
      state = { ...state, status: "completed", targetEndTime: null, remainingMs: 0 };
      await chrome.storage.local.set({ [TIMER_STORAGE_KEY]: state });
    }
  }

  return state;
}

async function setTimerState(state) {
  await chrome.storage.local.set({ [TIMER_STORAGE_KEY]: state });
  return state;
}

async function startTimer(durationMs) {
  const duration = Number.isFinite(durationMs) && durationMs > 0
    ? durationMs
    : DEFAULT_FOCUS_DURATION_MS;
  const now = Date.now();
  const state = {
    status: "running",
    duration,
    targetEndTime: now + duration,
    remainingMs: null
  };

  await chrome.alarms.clear(TIMER_ALARM_NAME);
  chrome.alarms.create(TIMER_ALARM_NAME, { when: state.targetEndTime });

  return setTimerState(state);
}

async function pauseTimer() {
  const state = await getTimerState();
  if (state.status !== "running") return state;

  const remainingMs = Math.max(0, state.targetEndTime - Date.now());
  await chrome.alarms.clear(TIMER_ALARM_NAME);

  return setTimerState({
    ...state,
    status: "paused",
    remainingMs,
    targetEndTime: null
  });
}

async function resumeTimer() {
  const state = await getTimerState();
  if (state.status !== "paused") return state;

  const remainingMs = state.remainingMs ?? state.duration;
  const targetEndTime = Date.now() + remainingMs;
  chrome.alarms.create(TIMER_ALARM_NAME, { when: targetEndTime });

  return setTimerState({
    ...state,
    status: "running",
    targetEndTime,
    remainingMs: null
  });
}

async function resetTimer() {
  await chrome.alarms.clear(TIMER_ALARM_NAME);
  return setTimerState(defaultTimerState());
}

async function completeTimer() {
  const state = await getTimerState();
  await setTimerState({
    ...state,
    status: "completed",
    targetEndTime: null,
    remainingMs: 0
  });

  // Reuse the existing offscreen audio pipeline for the completion chime.
  forwardAudioMessage({ action: "play", sound: "notification", volume: 0.7 });

  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "🌸 Focus session complete",
    message: "Nice work — take a moment to stretch before your next task.",
    priority: 2
  });
}

async function handleTimerMessage(msg) {
  switch (msg.action) {
    case "timer:start":
      return startTimer(msg.duration);
    case "timer:pause":
      return pauseTimer();
    case "timer:resume":
      return resumeTimer();
    case "timer:reset":
      return resetTimer();
    case "timer:getState":
      return getTimerState();
    default:
      return getTimerState();
  }
}

// ===== MESSAGE ROUTING =====
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.action !== "string") return false;

  if (msg.action === "play" || msg.action === "stop" || msg.action === "volume") {
    forwardAudioMessage(msg);
    return false; // no response expected, don't hold the port open
  }

  if (msg.action === "sound:getState") {
    (async () => {
      await ensureOffscreen();
      chrome.runtime.sendMessage({ action: "sound:getState" }, (response) => {
        sendResponse(response || { sound: null });
      });
    })();
    return true; // keep the message channel open for the async response
  }

  if (msg.action.startsWith("timer:")) {
    handleTimerMessage(msg).then(sendResponse);
    return true; // keep the message channel open for the async response
  }

  return false;
});

// ===== ALARMS =====
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TIMER_ALARM_NAME) {
    completeTimer();
    return;
  }

  // Generic reminder/scheduling alarms (used by the scheduler) fall back
  // to a simple notification using the alarm's name as the message.
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "FlowSpace Reminder ⏰",
    message: alarm.name,
    priority: 2
  });
});
