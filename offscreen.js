// ===== Ambient sound playback =====
// `current` tracks the single ambient sound that's loaded right now, so:
//  - clicking the sound that's already playing never restarts it
//    (we bail out before touching the Audio element's position), and
//  - switching sounds fades the old Audio out while fading the new
//    one in, instead of a hard cut.
let current = {
  name: null,
  audio: null,
  targetVolume: 0.7,
  fadeInTimer: null
};

const FADE_MS = 400;
const FADE_STEPS = 20;

function clearFadeIn() {
  if (current.fadeInTimer) {
    clearInterval(current.fadeInTimer);
    current.fadeInTimer = null;
  }
}

function fadeOutAndStop(audio) {
  if (!audio) return;
  const stepTime = FADE_MS / FADE_STEPS;
  const startVolume = audio.volume;
  let step = 0;

  const timer = setInterval(() => {
    step++;
    audio.volume = Math.max(0, startVolume * (1 - step / FADE_STEPS));
    if (step >= FADE_STEPS) {
      clearInterval(timer);
      audio.pause();
    }
  }, stepTime);
}

function fadeIn(audio, targetVolume) {
  clearFadeIn();
  const stepTime = FADE_MS / FADE_STEPS;
  let step = 0;
  audio.volume = 0;

  current.fadeInTimer = setInterval(() => {
    step++;
    audio.volume = Math.min(targetVolume, targetVolume * (step / FADE_STEPS));
    if (step >= FADE_STEPS) {
      clearInterval(current.fadeInTimer);
      current.fadeInTimer = null;
      audio.volume = targetVolume;
    }
  }, stepTime);
}

function playSound(sound, volume) {
  const targetVolume = volume ?? 0.7;

  // Already playing this exact sound — just settle the volume,
  // never touch playback position.
  if (current.name === sound && current.audio) {
    current.targetVolume = targetVolume;
    if (!current.fadeInTimer) {
      current.audio.volume = targetVolume;
    }
    return;
  }

  // Switching sounds (or starting from idle): fade the old one out
  // and start the new one from the beginning, fading it in.
  fadeOutAndStop(current.audio);
  clearFadeIn();

  const src = chrome.runtime.getURL(`sounds/${sound}.mp3`);
  const audio = new Audio(src);
  audio.loop = true;
  audio.volume = 0;
  audio.play().catch(err => console.warn("Audio playback blocked:", err));

  current = { name: sound, audio, targetVolume, fadeInTimer: null };
  fadeIn(audio, targetVolume);
}

function stopSound() {
  clearFadeIn();
  fadeOutAndStop(current.audio);
  current = { name: null, audio: null, targetVolume: current.targetVolume, fadeInTimer: null };
}

function setVolume(volume) {
  current.targetVolume = volume;
  if (current.audio && !current.fadeInTimer) {
    current.audio.volume = volume;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.action !== "string") return false;

  if (msg.action === "play") {
    playSound(msg.sound, msg.volume);
    return false;
  }

  if (msg.action === "stop") {
    stopSound();
    return false;
  }

  if (msg.action === "volume") {
    setVolume(msg.volume);
    return false;
  }

  if (msg.action === "sound:getState") {
    sendResponse({ sound: current.name });
    return false;
  }

  return false;
});
