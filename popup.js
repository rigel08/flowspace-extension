// ===== ANIMATED BACKGROUND =====
const canvas = document.getElementById('animated-bg');
const ctx = canvas.getContext('2d');
canvas.width = 380;
canvas.height = 580;

const particles = [];
const particleCount = 50;

// ---- Flow Mode scene state ----
// The constellation background already runs one requestAnimationFrame
// loop; Flow Mode reuses it entirely rather than adding a second one.
// Two module-level values (speedFactor, intensityFactor) are eased
// toward a target once per existing frame, and each particle eases its
// own hue toward a per-scene target — all O(1)/O(n) scalar math on top
// of work that was already happening every frame.
const DEFAULT_HUE_RANGE = [240, 300]; // original blue-purple range, used when Flow Mode is off
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let speedFactor = 1;
let targetSpeedFactor = 1;
let intensityFactor = 1;
let targetIntensityFactor = 1;

function setFlowMotionTargets(speed, intensity) {
  // Reduced-motion users still get the calmer color/atmosphere changes,
  // just without any extra drift speed on top of the baseline.
  targetSpeedFactor = reducedMotion ? Math.min(speed, 1) : speed;
  targetIntensityFactor = intensity;
}

class Particle {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.vx = (Math.random() - 0.5) * 0.5;
    this.vy = (Math.random() - 0.5) * 0.5;
    this.radius = Math.random() * 2 + 1;
    this.hue = Math.random() * (DEFAULT_HUE_RANGE[1] - DEFAULT_HUE_RANGE[0]) + DEFAULT_HUE_RANGE[0];
    this.targetHue = this.hue;
  }

  update() {
    this.x += this.vx * speedFactor;
    this.y += this.vy * speedFactor;
    // Slow hue drift toward whatever scene is currently targeted —
    // this is what makes scene switches feel like a slow fade instead
    // of an abrupt color jump.
    this.hue += (this.targetHue - this.hue) * 0.015;

    if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
    if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
  }

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${this.hue}, 70%, 60%, ${0.6 * intensityFactor})`;
    ctx.fill();
  }
}

for (let i = 0; i < particleCount; i++) {
  particles.push(new Particle());
}

// Re-targets every particle's hue toward a scene's range (or back to
// the original default range when scene is null). Called only on
// discrete events — scene changes, session start/pause/resume/end —
// never every frame.
function applySceneToParticles(hueRange) {
  const range = hueRange || DEFAULT_HUE_RANGE;
  particles.forEach((p) => {
    p.targetHue = range[0] + Math.random() * (range[1] - range[0]);
  });
}

function animate() {
  speedFactor += (targetSpeedFactor - speedFactor) * 0.03;
  intensityFactor += (targetIntensityFactor - intensityFactor) * 0.03;

  ctx.fillStyle = 'rgba(10, 10, 10, 0.1)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  particles.forEach((p, i) => {
    p.update();
    p.draw();

    // Connect nearby particles
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[j].x - p.x;
      const dy = particles[j].y - p.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 80) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.strokeStyle = `hsla(${p.hue}, 70%, 60%, ${0.2 * (1 - distance / 80) * intensityFactor})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  });

  requestAnimationFrame(animate);
}

animate();

// ===== FLOW MODE =====
// A visual-state system, not an audio visualizer: it never reads or
// analyzes audio data. There is deliberately no visible scene control —
// the scene is derived automatically from whichever built-in sound is
// active. Scene keys match sound names 1:1 (rain/forest/ocean/lofi) so
// there's no separate mapping table to drift out of sync; "cosmic" is
// only the calm internal default/idle atmosphere, never a sound name.
const FLOW_SCENES = {
  cosmic: { emoji: '🌌', label: 'Cosmic', hueRange: [255, 285], speedMul: 1 },
  rain: { emoji: '🌧', label: 'Rain', hueRange: [222, 250], speedMul: 1.25 },
  forest: { emoji: '🌲', label: 'Forest', hueRange: [150, 265], speedMul: 0.75 },
  ocean: { emoji: '🌊', label: 'Deep Ocean', hueRange: [195, 230], speedMul: 0.55 },
  lofi: { emoji: '🌃', label: 'Night City', hueRange: [270, 325], speedMul: 0.9 }
};

const FLOW_SCENE_STORAGE_KEY = 'flowScenePref'; // internal only — never surfaced as a control
const PRESET_SOUND_LABELS = { rain: '🌧 Rain', forest: '🌲 Forest', ocean: '🌊 Ocean', lofi: '🎵 Lofi' };

let currentScene = 'cosmic';
let currentSoundName = null;

const flowStatusLine = document.getElementById('flow-scene-status');

function updateFlowStatusLine() {
  if (!flowStatusLine) return;
  const scene = FLOW_SCENES[currentScene] || FLOW_SCENES.cosmic;
  let soundLabel = 'No sound';
  if (currentSoundName) {
    soundLabel = currentSoundName.startsWith('custom:')
      ? '🎵 Custom track'
      : (PRESET_SOUND_LABELS[currentSoundName] || currentSoundName);
  }
  flowStatusLine.textContent = `${soundLabel} · ${scene.emoji} ${scene.label}`;
}

// Re-applies the current status's motion targets using the *current*
// scene — called whenever either the scene or the timer status changes,
// so switching sounds mid-session updates the running animation
// immediately rather than waiting for the next status transition.
function refreshFlowMotionForCurrentStatus(status) {
  const scene = FLOW_SCENES[currentScene] || FLOW_SCENES.cosmic;
  if (status === 'running') {
    setFlowMotionTargets(scene.speedMul, 1);
    applySceneToParticles(scene.hueRange);
  } else if (status === 'paused') {
    setFlowMotionTargets(scene.speedMul * 0.35, 0.5);
    applySceneToParticles(scene.hueRange);
  } else {
    setFlowMotionTargets(1, 1);
    applySceneToParticles(null);
  }
}

function setScene(scene, { persist = true } = {}) {
  if (!FLOW_SCENES[scene]) scene = 'cosmic';
  currentScene = scene;

  Object.keys(FLOW_SCENES).forEach((key) => document.body.classList.remove(`flow-scene-${key}`));
  document.body.classList.add(`flow-scene-${scene}`);

  updateFlowStatusLine();
  refreshFlowMotionForCurrentStatus(currentTimerStatus);

  if (persist) {
    chrome.storage.local.set({ [FLOW_SCENE_STORAGE_KEY]: scene });
  }
}

// Called whenever the timer's status changes (start/pause/resume/end/
// complete) — see renderTimerState. Toggles the handful of Flow Mode
// classes; all the actual visual work happens in CSS transitions plus
// the particle easing already driven by the existing animate() loop.
function updateFlowMode(status) {
  const body = document.body;

  if (status === 'running') {
    body.classList.remove('flow-completing');
    body.classList.remove('flow-paused');
    body.classList.add('flow-mode');
  } else if (status === 'paused') {
    body.classList.add('flow-mode');
    body.classList.add('flow-paused');
  } else if (status === 'completed') {
    body.classList.remove('flow-paused');
    body.classList.add('flow-completing');
    // Return naturally: after a brief, subtle completion transition,
    // drop back to the normal (non-Flow-Mode) interface.
    setTimeout(() => {
      body.classList.remove('flow-mode');
      body.classList.remove('flow-completing');
      refreshFlowMotionForCurrentStatus(currentTimerStatus);
    }, reducedMotion ? 0 : 1600);
  } else {
    body.classList.remove('flow-mode');
    body.classList.remove('flow-paused');
    body.classList.remove('flow-completing');
  }

  refreshFlowMotionForCurrentStatus(status);
}

// ===== CLOCK =====
function updateClock() {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });
  document.getElementById('clock').textContent = time;
}
updateClock();
setInterval(updateClock, 1000);

// ===== TAB SWITCHING =====
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    tab.classList.add('active');
    document.getElementById(targetTab).classList.add('active');
  });
});

// ===== AUDIO SYSTEM - WORKS WITH YOUR BACKGROUND.JS =====

// Sound button handlers
document.querySelectorAll('.sound').forEach(btn => {
  btn.addEventListener('click', () => {
    const sound = btn.getAttribute('data-sound');
    const volume = parseFloat(document.getElementById('volume').value);
    
    // Send message to background.js which forwards to offscreen
    chrome.runtime.sendMessage({
      action: 'play',
      sound: sound,
      volume: volume
    });

    // setActiveSound derives and applies the matching Flow Scene
    // automatically for the four built-in sounds — there is no
    // separate visible scene control.
    setActiveSound(sound);
  });
});

// Stop button handler
document.getElementById('stop-sound').addEventListener('click', () => {
  chrome.runtime.sendMessage({ 
    action: 'stop' 
  });

  setActiveSound(null);
  // A deliberate stop settles the atmosphere back to the calm default
  // rather than leaving whichever preset's colors were last active.
  setScene('cosmic');
});

// Highlights whichever sound card (preset or imported track) is
// currently playing (purple glow) and clears the rest.
function setActiveSound(soundName) {
  document.querySelectorAll('.sound').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-sound') === soundName);
  });
  document.querySelectorAll('.music-track').forEach(item => {
    const isActive = soundName === `custom:${item.dataset.trackId}`;
    item.classList.toggle('active', isActive);
    const playBtn = item.querySelector('.music-track-play');
    if (playBtn) playBtn.textContent = isActive ? '♪ Playing' : '▶ Play';
  });

  currentSoundName = soundName;
  updateFlowStatusLine();

  // Automatic Flow Scene derivation: a mapped built-in sound switches
  // straight to its scene. No sound (Stop, or a call site that already
  // handles its own reset) and custom/imported tracks intentionally
  // leave the current scene untouched here — see the Stop Sound and
  // delete-track handlers for the two places that explicitly reset to
  // the default instead.
  if (soundName && FLOW_SCENES[soundName]) {
    setScene(soundName);
  }
}

// Sync the active-sound highlight — and by extension the Flow Scene —
// with whatever is actually playing. Covers reopening the popup while
// ambient audio keeps running in the background offscreen document.
// This is the single source of truth for the initial scene: if a
// mapped preset is already playing, that's authoritative; otherwise
// (nothing playing, or a custom track with no direct mapping) the last
// remembered internal scene is restored instead. There is only one
// path deciding this, so there's no race between two independent
// async lookups both trying to set the scene.
chrome.runtime.sendMessage({ action: 'sound:getState' }, (response) => {
  const sound = response && response.sound;

  if (sound && FLOW_SCENES[sound]) {
    setActiveSound(sound);
    return;
  }

  chrome.storage.local.get([FLOW_SCENE_STORAGE_KEY], (result) => {
    const remembered = result[FLOW_SCENE_STORAGE_KEY];
    if (remembered && FLOW_SCENES[remembered]) {
      setScene(remembered, { persist: false });
    }
    setActiveSound(sound || null);
  });
});

// Volume slider handler
document.getElementById('volume').addEventListener('input', (e) => {
  const volume = parseFloat(e.target.value);
  
  // Send volume update to background
  chrome.runtime.sendMessage({
    action: 'volume',
    volume: volume
  });
});

// ===== OPEN ADVANCED SCHEDULER =====
document.getElementById('open-scheduler').addEventListener('click', () => {
  chrome.tabs.create({ url: 'schedule.html' });
});

document.getElementById('open-scheduler-2').addEventListener('click', () => {
  chrome.tabs.create({ url: 'schedule.html' });
});

// ===== QUOTES =====
const quotes = [
  "Flow like water, focus like fire.",
  "Deep work is the superpower of the 21st century.",
  "Concentration is the root of all higher abilities.",
  "The quieter you become, the more you can hear.",
  "Focus on being productive instead of busy.",
  "Your mind is for having ideas, not holding them.",
  "Do less, but better.",
  "Time is what we want most, but use worst.",
  "The best time to plant a tree was 20 years ago. The second best time is now.",
  "Quality is not an act, it is a habit.",
  "Be present in all things and thankful for all things.",
  "Simplicity is the ultimate sophistication.",
  "Progress, not perfection.",
  "Less distraction, more traction.",
  "Breathing in, I calm my body. Breathing out, I smile."
];

const quoteElement = document.getElementById('quote');
const newQuoteButton = document.getElementById('new-quote');

function getRandomQuote() {
  const randomIndex = Math.floor(Math.random() * quotes.length);
  return quotes[randomIndex];
}

newQuoteButton.addEventListener('click', () => {
  quoteElement.style.opacity = '0';
  setTimeout(() => {
    quoteElement.textContent = getRandomQuote();
    quoteElement.style.opacity = '1';
  }, 300);
});

// ===== REMINDERS =====
const reminderForm = document.getElementById('reminder-form');
const reminderText = document.getElementById('reminder-text');
const reminderTime = document.getElementById('reminder-time');
const reminderList = document.getElementById('reminder-list');

// Load reminders from storage
chrome.storage.local.get(['reminders'], (result) => {
  const reminders = result.reminders || [];
  reminders.forEach(reminder => {
    addReminderToList(reminder.text, reminder.time, reminder.id);
  });
});

reminderForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const text = reminderText.value.trim();
  const time = reminderTime.value;
  
  if (text && time) {
    const reminder = {
      id: Date.now(),
      text: text,
      time: time,
      reminderAt: computeNextOccurrence(time),
      firedAt: null
    };
    
    // Save to storage, then hand off to background.js to create the
    // actual chrome.alarms entry — this is what lets the reminder fire
    // even if this popup is closed by the time it's due.
    chrome.storage.local.get(['reminders'], (result) => {
      const reminders = result.reminders || [];
      reminders.push(reminder);
      chrome.storage.local.set({ reminders: reminders }, () => {
        chrome.runtime.sendMessage({ action: 'reminder:schedule', reminder });
      });
    });
    
    // Add to list
    addReminderToList(text, time, reminder.id);
    
    // Clear form
    reminderText.value = '';
    reminderTime.value = '';
  }
});

// Same "next occurrence of this clock time" logic as before — if the
// time has already passed today, the reminder targets tomorrow.
function computeNextOccurrence(time) {
  const now = new Date();
  const [hours, minutes] = time.split(':');
  const target = new Date();
  target.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
  if (target < now) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

function addReminderToList(text, time, id) {
  const li = document.createElement('li');
  li.innerHTML = `
    <span>${text} - ${time}</span>
    <button class="delete-reminder" data-id="${id}" style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 6px 12px; color: #fff; cursor: pointer; font-size: 0.8rem;">🗑️</button>
  `;
  reminderList.appendChild(li);
  
  // Add delete functionality
  li.querySelector('.delete-reminder').addEventListener('click', () => {
    deleteReminder(id);
    li.remove();
  });
}

function deleteReminder(id) {
  chrome.runtime.sendMessage({ action: 'reminder:cancel', id });
  chrome.storage.local.get(['reminders'], (result) => {
    const reminders = result.reminders || [];
    const updatedReminders = reminders.filter(r => r.id !== id);
    chrome.storage.local.set({ reminders: updatedReminders });
  });
}
// ===== FOCUS SESSION DURATION =====
// The selected duration only ever gets read at the moment "Start" is
// clicked — nothing here ever sends a message that could touch a
// session that's already running or paused, so changing the selector
// mid-session is inherently a no-op for that session by construction.
const DURATION_STORAGE_KEY = 'focusDurationPref';
const MIN_CUSTOM_MINUTES = 1;
const MAX_CUSTOM_MINUTES = 180;
const DEFAULT_DURATION_MINUTES = 25;
const VALID_DURATION_SELECTIONS = ['15', '25', '45', '60', 'custom'];

const durationSelect = document.getElementById('timer-duration');
const durationCustomRow = document.getElementById('timer-duration-custom-row');
const durationCustomInput = document.getElementById('timer-duration-custom');
const durationErrorEl = document.getElementById('timer-duration-error');

function showDurationError(message) {
  durationErrorEl.textContent = message;
  durationErrorEl.hidden = false;
}

function clearDurationError() {
  durationErrorEl.hidden = true;
  durationErrorEl.textContent = '';
}

// Returns a validated whole-minute duration, or null (after showing an
// inline error) if the custom field holds 0, a negative number, or
// anything non-numeric/unreasonable. Never mutates any state.
function getSelectedDurationMinutes() {
  if (durationSelect.value !== 'custom') {
    clearDurationError();
    return parseInt(durationSelect.value, 10);
  }

  const raw = durationCustomInput.value.trim();
  const parsed = Number(raw);

  if (raw === '' || !Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    showDurationError('Enter a whole number of minutes.');
    return null;
  }
  if (parsed < MIN_CUSTOM_MINUTES) {
    showDurationError('Duration must be at least 1 minute.');
    return null;
  }
  if (parsed > MAX_CUSTOM_MINUTES) {
    showDurationError(`Keep custom sessions under ${MAX_CUSTOM_MINUTES} minutes.`);
    return null;
  }

  clearDurationError();
  return parsed;
}

function saveDurationPref() {
  chrome.storage.local.set({
    [DURATION_STORAGE_KEY]: {
      selection: durationSelect.value,
      customMinutes: durationSelect.value === 'custom' ? durationCustomInput.value : null
    }
  });
}

function applyDurationPref(pref) {
  const selection = pref && VALID_DURATION_SELECTIONS.includes(pref.selection) ? pref.selection : '25';
  durationSelect.value = selection;

  if (selection === 'custom') {
    durationCustomRow.hidden = false;
    const customMinutes = Number(pref && pref.customMinutes);
    durationCustomInput.value =
      Number.isFinite(customMinutes) && customMinutes >= MIN_CUSTOM_MINUTES && customMinutes <= MAX_CUSTOM_MINUTES
        ? customMinutes
        : DEFAULT_DURATION_MINUTES;
  } else {
    durationCustomRow.hidden = true;
  }

  refreshIdleDurationPreview();
}

// While idle (no session running/paused), the countdown display previews
// whatever duration is currently selected, so the user sees exactly what
// "Start" is about to begin. Once a session exists, the display always
// comes from background.js's authoritative state instead.
function refreshIdleDurationPreview() {
  if (currentTimerStatus === 'running' || currentTimerStatus === 'paused') return;
  const minutes = getSelectedDurationMinutes();
  if (minutes) {
    timerDisplay.textContent = formatTimerMs(minutes * 60 * 1000);
  }
}

durationSelect.addEventListener('change', () => {
  durationCustomRow.hidden = durationSelect.value !== 'custom';
  if (durationSelect.value === 'custom') {
    durationCustomInput.focus();
  }
  if (getSelectedDurationMinutes()) {
    saveDurationPref();
  }
  refreshIdleDurationPreview();
});

durationCustomInput.addEventListener('input', () => {
  if (getSelectedDurationMinutes()) {
    saveDurationPref();
  }
  refreshIdleDurationPreview();
});

// Load the saved preference as soon as the popup opens; defaults to 25
// minutes (matching the markup's default <option selected>) if nothing
// was ever saved, or if the stored value is somehow invalid.
chrome.storage.local.get([DURATION_STORAGE_KEY], (result) => {
  applyDurationPref(result[DURATION_STORAGE_KEY]);
});

// ===== FOCUS TIMER =====
// Timestamp-based countdown: the popup never owns the authoritative
// timer state. It asks background.js for { status, targetEndTime,
// remainingMs, duration } and, while running, redraws every second by
// recomputing (targetEndTime - Date.now()) — never by decrementing a
// local counter. This means closing/reopening the popup can never
// desync the displayed time.
const timerDisplay = document.getElementById('timer-display');
const timerStatusEl = document.getElementById('timer-status');
const timerStartBtn = document.getElementById('timer-start');
const timerPauseBtn = document.getElementById('timer-pause');
const timerResumeBtn = document.getElementById('timer-resume');
const timerEndBtn = document.getElementById('timer-end');

let timerTickInterval = null;
let currentTimerStatus = 'idle';

function formatTimerMs(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function setTimerButtons({ start, pause, resume, end }) {
  timerStartBtn.hidden = !start;
  timerPauseBtn.hidden = !pause;
  timerResumeBtn.hidden = !resume;
  timerEndBtn.hidden = !end;
}

function renderTimerState(state) {
  if (!state) return;

  clearInterval(timerTickInterval);
  timerTickInterval = null;
  currentTimerStatus = state.status;
  updateFlowMode(state.status);

  // A session in progress must not be affected by the duration
  // controls — lock them while running/paused, unlock otherwise.
  const durationLocked = state.status === 'running' || state.status === 'paused';
  durationSelect.disabled = durationLocked;
  durationCustomInput.disabled = durationLocked;

  if (state.status === 'running') {
    setTimerButtons({ start: false, pause: true, resume: false, end: true });
    timerStatusEl.textContent = 'Focusing…';

    const tick = () => {
      const remaining = state.targetEndTime - Date.now();
      if (remaining <= 0) {
        clearInterval(timerTickInterval);
        timerTickInterval = null;
        timerDisplay.textContent = '0:00';
        // Session has ended — ask background for the authoritative
        // post-completion state (it owns the transition + notification).
        requestTimerState();
        return;
      }
      timerDisplay.textContent = formatTimerMs(remaining);
    };

    tick();
    timerTickInterval = setInterval(tick, 1000);
  } else if (state.status === 'paused') {
    setTimerButtons({ start: false, pause: false, resume: true, end: true });
    timerStatusEl.textContent = 'Paused';
    timerDisplay.textContent = formatTimerMs(state.remainingMs ?? state.duration ?? DEFAULT_DURATION_MINUTES * 60 * 1000);
  } else if (state.status === 'completed') {
    setTimerButtons({ start: true, pause: false, resume: false, end: false });
    timerStatusEl.textContent = 'Session complete 🎉';
    timerDisplay.textContent = '0:00';
  } else {
    setTimerButtons({ start: true, pause: false, resume: false, end: false });
    timerStatusEl.textContent = 'Ready to focus';
    refreshIdleDurationPreview();
  }
}

function requestTimerState() {
  chrome.runtime.sendMessage({ action: 'timer:getState' }, renderTimerState);
}

timerStartBtn.addEventListener('click', () => {
  const minutes = getSelectedDurationMinutes();
  if (!minutes) return; // invalid custom input — inline error already shown

  saveDurationPref();
  const durationMs = minutes * 60 * 1000;
  chrome.runtime.sendMessage({ action: 'timer:start', duration: durationMs }, renderTimerState);
});

timerPauseBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'timer:pause' }, renderTimerState);
});

timerResumeBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'timer:resume' }, renderTimerState);
});

timerEndBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'timer:reset' }, renderTimerState);
});

// Pick up the current state as soon as the popup opens (covers the
// "closed then reopened" case) and again whenever the user switches
// back to the Focus tab.
requestTimerState();
document.querySelector('.tab[data-tab="focus"]')?.addEventListener('click', requestTimerState);

// ===== MY MUSIC (user-imported tracks) =====
// Imported tracks integrate with the exact same offscreen playback
// pipeline as the preset ambient sounds — a track is just played as
// sound name "custom:<trackId>". That reuses no-restart-on-reclick,
// crossfade-on-switch, volume, and Stop Sound for free, with no second
// audio system. See offscreen.js for the playback side and music-db.js
// for the shared IndexedDB storage (metadata + blob) used by both this
// page and the offscreen document.
const importAudioBtn = document.getElementById('import-audio-btn');
const importAudioInput = document.getElementById('import-audio-input');
const myMusicList = document.getElementById('my-music-list');
const myMusicEmpty = document.getElementById('my-music-empty');
const myMusicErrorEl = document.getElementById('my-music-error');

function showMusicError(message) {
  myMusicErrorEl.textContent = message;
  myMusicErrorEl.hidden = false;
}

function clearMusicError() {
  myMusicErrorEl.hidden = true;
  myMusicErrorEl.textContent = '';
}

function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function buildTrackListItem(track) {
  const li = document.createElement('li');
  li.className = 'music-track';
  li.dataset.trackId = track.id;

  const info = document.createElement('div');
  info.className = 'music-track-info';

  const icon = document.createElement('span');
  icon.className = 'music-track-icon';
  icon.textContent = '🎵';
  icon.setAttribute('aria-hidden', 'true');

  const nameWrap = document.createElement('div');
  nameWrap.className = 'music-track-name-wrap';

  const name = document.createElement('span');
  name.className = 'music-track-name';
  name.textContent = track.name; // textContent — never innerHTML with a user filename

  const meta = document.createElement('span');
  meta.className = 'music-track-meta';
  meta.textContent = formatFileSize(track.size);

  nameWrap.append(name, meta);
  info.append(icon, nameWrap);

  const actions = document.createElement('div');
  actions.className = 'music-track-actions';

  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'music-track-play';
  playBtn.dataset.id = track.id;
  playBtn.textContent = '▶ Play';
  playBtn.addEventListener('click', () => {
    const volume = parseFloat(document.getElementById('volume').value);
    chrome.runtime.sendMessage({ action: 'play', sound: `custom:${track.id}`, volume });
    setActiveSound(`custom:${track.id}`);
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'music-track-delete';
  deleteBtn.setAttribute('aria-label', `Remove ${track.name}`);
  deleteBtn.textContent = '🗑';
  deleteBtn.addEventListener('click', async () => {
    // If this track is currently playing, stop it first so we never
    // leave audio referencing a blob that's about to be deleted.
    chrome.runtime.sendMessage({ action: 'sound:getState' }, async (response) => {
      if (response && response.sound === `custom:${track.id}`) {
        chrome.runtime.sendMessage({ action: 'stop' });
        setActiveSound(null);
        setScene('cosmic');
      }
      await FlowspaceMusicDB.deleteTrack(track.id);
      await renderMusicList();
    });
  });

  actions.append(playBtn, deleteBtn);

  const errorLine = document.createElement('p');
  errorLine.className = 'music-track-error';
  errorLine.hidden = true;

  li.append(info, actions, errorLine);
  return li;
}

async function renderMusicList() {
  clearMusicError();
  let tracks = [];
  try {
    tracks = await FlowspaceMusicDB.getAllTracksMeta();
  } catch (err) {
    console.warn('Could not read My Music list:', err);
    showMusicError('Could not load your saved tracks.');
  }

  myMusicList.innerHTML = '';
  if (tracks.length === 0) {
    myMusicEmpty.hidden = false;
    return;
  }
  myMusicEmpty.hidden = true;

  tracks.forEach((track) => {
    myMusicList.appendChild(buildTrackListItem(track));
  });

  // Re-apply the active-sound highlight to whichever track (if any) is
  // currently playing, so it's correct immediately after a re-render.
  chrome.runtime.sendMessage({ action: 'sound:getState' }, (response) => {
    if (response && response.sound) setActiveSound(response.sound);
  });
}

importAudioBtn.addEventListener('click', () => {
  importAudioInput.click();
});

importAudioInput.addEventListener('change', async () => {
  const file = importAudioInput.files && importAudioInput.files[0];
  importAudioInput.value = ''; // allow re-importing the same file later
  if (!file) return;

  clearMusicError();
  try {
    await FlowspaceMusicDB.addTrack(file);
    await renderMusicList();
  } catch (err) {
    if (err && err.message === 'unsupported-type') {
      showMusicError('That file type isn\u2019t supported. Try MP3, WAV, OGG, or M4A.');
    } else if (err && err.message === 'too-large') {
      const limitMb = Math.round(FlowspaceMusicDB.MAX_TRACK_SIZE_BYTES / (1024 * 1024));
      showMusicError(`That file is too large. Please keep tracks under ${limitMb}MB.`);
    } else if (err && err.message === 'empty-file') {
      showMusicError('That file looks empty or corrupted.');
    } else {
      console.warn('Could not import track:', err);
      showMusicError('Could not import that file. Please try again.');
    }
  }
});

// Surface playback errors from the offscreen document (e.g. a track's
// stored blob went missing, or the browser blocked/failed playback)
// next to the relevant track instead of failing silently.
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.action !== 'music:playbackError') return;
  if (typeof msg.sound !== 'string' || !msg.sound.startsWith('custom:')) return;

  const id = msg.sound.slice('custom:'.length);
  const item = myMusicList.querySelector(`[data-track-id="${CSS.escape(id)}"]`);
  const errorLine = item && item.querySelector('.music-track-error');
  if (errorLine) {
    errorLine.textContent = msg.message || 'Playback failed.';
    errorLine.hidden = false;
  }
  setActiveSound(null);
});

renderMusicList();
