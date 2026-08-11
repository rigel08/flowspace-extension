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
  const MIN_DURATION_MS = 60 * 1000; // 1 minute
  const MAX_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours — safety ceiling, not the UI limit
  const duration = Number.isFinite(durationMs) && durationMs >= MIN_DURATION_MS && durationMs <= MAX_DURATION_MS
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

// ===== SCHEDULED REMINDERS (quick reminders + scheduler tasks) =====
// Both reminder types are migrated off setTimeout entirely. setTimeout
// only lives as long as the page that created it (the popup or the
// scheduler tab) stays open, so it can't survive a closed popup, a
// service-worker restart, or a browser restart. chrome.alarms persists
// independently of any page, which is what "reliable" means here.
//
// Every scheduled item carries its own absolute fire time
// (`reminderAt` / `dueAt`, computed once at creation) plus a
// "*NotifiedAt" / "firedAt" flag. The flag is the duplicate guard: an
// alarm firing twice, a reconciliation pass overlapping a real alarm,
// or a stale alarm surviving a reload can never produce two
// notifications for the same event because we check the flag before
// creating one and set it atomically alongside the notification.
const QUICK_REMINDER_ALARM_PREFIX = "flowspaceQuickReminder:";
const TASK_REMINDER_ALARM_PREFIX = "flowspaceTaskReminder:";
const TASK_DUE_ALARM_PREFIX = "flowspaceTaskDue:";

// Reconciliation (see reconcileScheduledAlarms) won't fire a
// notification for anything more overdue than this — an ancient stale
// reminder just gets silently marked as handled instead of surprising
// the user with a notification for something from days ago.
const STALE_NOTIFICATION_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function playNotificationSound() {
  forwardAudioMessage({ action: "play", sound: "notification", volume: 0.7 });
}

// ---- Quick reminders (popup "Quick Reminders" list) ----

async function scheduleQuickReminderAlarm(reminder) {
  if (!reminder || reminder.id === undefined || !Number.isFinite(reminder.reminderAt)) return;
  const name = QUICK_REMINDER_ALARM_PREFIX + reminder.id;
  await chrome.alarms.clear(name); // guard against duplicate alarms for the same reminder
  if (!reminder.firedAt && reminder.reminderAt > Date.now()) {
    chrome.alarms.create(name, { when: reminder.reminderAt });
  }
}

async function cancelQuickReminderAlarm(id) {
  await chrome.alarms.clear(QUICK_REMINDER_ALARM_PREFIX + id);
}

async function fireQuickReminder(id) {
  const { reminders = [] } = await chrome.storage.local.get("reminders");
  const idx = reminders.findIndex((r) => String(r.id) === String(id));
  if (idx === -1) return; // deleted before the alarm fired

  const reminder = reminders[idx];
  if (reminder.firedAt) return; // already handled — duplicate guard

  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "FlowSpace Reminder",
    message: reminder.text,
    priority: 2
  });
  playNotificationSound();

  reminders[idx] = { ...reminder, firedAt: Date.now() };
  await chrome.storage.local.set({ reminders });
  await chrome.alarms.clear(QUICK_REMINDER_ALARM_PREFIX + id);
}

// ---- Scheduler tasks ----

async function scheduleTaskAlarms(task) {
  if (!task || task.id === undefined) return;
  const reminderName = TASK_REMINDER_ALARM_PREFIX + task.id;
  const dueName = TASK_DUE_ALARM_PREFIX + task.id;

  // Always clear first — prevents duplicate alarms if this task is
  // rescheduled (e.g. edited, or re-sent on popup reopen).
  await chrome.alarms.clear(reminderName);
  await chrome.alarms.clear(dueName);

  if (task.completed) return;

  const now = Date.now();
  if (Number.isFinite(task.reminderAt) && !task.reminderNotifiedAt && task.reminderAt > now) {
    chrome.alarms.create(reminderName, { when: task.reminderAt });
  }
  if (Number.isFinite(task.dueAt) && !task.dueNotifiedAt && task.dueAt > now) {
    chrome.alarms.create(dueName, { when: task.dueAt });
  }
}

async function cancelTaskAlarms(id) {
  await chrome.alarms.clear(TASK_REMINDER_ALARM_PREFIX + id);
  await chrome.alarms.clear(TASK_DUE_ALARM_PREFIX + id);
}

async function fireTaskAlarm(id, kind) {
  const { tasks = [] } = await chrome.storage.local.get("tasks");
  const idx = tasks.findIndex((t) => String(t.id) === String(id));
  if (idx === -1) return; // deleted before the alarm fired

  const task = tasks[idx];
  if (task.completed) return;

  if (kind === "reminder") {
    if (task.reminderNotifiedAt) return; // duplicate guard
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: `⏰ ${task.title}`,
      message: task.reminder === 0 ? "Time for your task!" : `Starting in ${task.reminder} minutes`,
      priority: 2,
      requireInteraction: true
    });
    tasks[idx] = { ...task, reminderNotifiedAt: Date.now() };
  } else {
    if (task.dueNotifiedAt) return; // duplicate guard
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: `🔔 ${task.title}`,
      message: "Task time is now!",
      priority: 2,
      requireInteraction: true
    });
    tasks[idx] = { ...task, dueNotifiedAt: Date.now() };
  }

  await chrome.storage.local.set({ tasks });
  playNotificationSound();
  await chrome.alarms.clear((kind === "reminder" ? TASK_REMINDER_ALARM_PREFIX : TASK_DUE_ALARM_PREFIX) + id);
}

// ---- Reconciliation ----
// chrome.alarms already persists across service-worker restarts and
// browser restarts on its own — this pass is a safety net on top of
// that: it recreates any alarm that should exist but doesn't (belt and
// suspenders), and resolves anything that was already due while the
// browser was completely closed (alarms don't fire while Chrome isn't
// running at all) — firing it late if it's recent, or silently
// expiring it if it's stale enough that a notification would just be
// confusing.
async function reconcileScheduledAlarms() {
  const now = Date.now();

  const { reminders = [] } = await chrome.storage.local.get("reminders");
  const staleReminderIds = [];
  for (const reminder of reminders) {
    if (reminder.firedAt || !Number.isFinite(reminder.reminderAt)) continue;
    if (reminder.reminderAt > now) {
      await scheduleQuickReminderAlarm(reminder);
    } else if (now - reminder.reminderAt <= STALE_NOTIFICATION_THRESHOLD_MS) {
      await fireQuickReminder(reminder.id);
    } else {
      staleReminderIds.push(reminder.id);
    }
  }
  if (staleReminderIds.length) {
    const { reminders: latest = [] } = await chrome.storage.local.get("reminders");
    const updated = latest.map((r) =>
      staleReminderIds.includes(r.id) ? { ...r, firedAt: now } : r
    );
    await chrome.storage.local.set({ reminders: updated });
  }

  const { tasks = [] } = await chrome.storage.local.get("tasks");
  const staleTaskPatches = []; // { id, field }
  for (const task of tasks) {
    if (task.completed) continue;

    if (Number.isFinite(task.reminderAt) && !task.reminderNotifiedAt) {
      if (task.reminderAt > now) {
        chrome.alarms.create(TASK_REMINDER_ALARM_PREFIX + task.id, { when: task.reminderAt });
      } else if (now - task.reminderAt <= STALE_NOTIFICATION_THRESHOLD_MS) {
        await fireTaskAlarm(task.id, "reminder");
      } else {
        staleTaskPatches.push({ id: task.id, field: "reminderNotifiedAt" });
      }
    }

    if (Number.isFinite(task.dueAt) && !task.dueNotifiedAt) {
      if (task.dueAt > now) {
        chrome.alarms.create(TASK_DUE_ALARM_PREFIX + task.id, { when: task.dueAt });
      } else if (now - task.dueAt <= STALE_NOTIFICATION_THRESHOLD_MS) {
        await fireTaskAlarm(task.id, "due");
      } else {
        staleTaskPatches.push({ id: task.id, field: "dueNotifiedAt" });
      }
    }
  }
  if (staleTaskPatches.length) {
    const { tasks: latest = [] } = await chrome.storage.local.get("tasks");
    const updated = latest.map((t) => {
      const patches = staleTaskPatches.filter((p) => p.id === t.id);
      if (!patches.length) return t;
      const patch = {};
      patches.forEach((p) => {
        patch[p.field] = now;
      });
      return { ...t, ...patch };
    });
    await chrome.storage.local.set({ tasks: updated });
  }
}

chrome.runtime.onStartup.addListener(() => {
  reconcileScheduledAlarms();
});
chrome.runtime.onInstalled.addListener(() => {
  reconcileScheduledAlarms();
});

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

  if (msg.action === "reminder:schedule") {
    scheduleQuickReminderAlarm(msg.reminder).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.action === "reminder:cancel") {
    cancelQuickReminderAlarm(msg.id).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.action === "task:schedule") {
    scheduleTaskAlarms(msg.task).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.action === "task:cancel") {
    cancelTaskAlarms(msg.id).then(() => sendResponse({ ok: true }));
    return true;
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

  if (alarm.name.startsWith(QUICK_REMINDER_ALARM_PREFIX)) {
    fireQuickReminder(alarm.name.slice(QUICK_REMINDER_ALARM_PREFIX.length));
    return;
  }

  if (alarm.name.startsWith(TASK_REMINDER_ALARM_PREFIX)) {
    fireTaskAlarm(alarm.name.slice(TASK_REMINDER_ALARM_PREFIX.length), "reminder");
    return;
  }

  if (alarm.name.startsWith(TASK_DUE_ALARM_PREFIX)) {
    fireTaskAlarm(alarm.name.slice(TASK_DUE_ALARM_PREFIX.length), "due");
    return;
  }

  // Fallback for any unrecognized alarm name (kept for forward compatibility).
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "FlowSpace Reminder ⏰",
    message: alarm.name,
    priority: 2
  });
});
