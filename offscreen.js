// ===== Ambient + imported-music playback =====
// `current` tracks the single sound loaded right now — whether it's a
// preset ambient sound (sounds/rain.mp3, etc.) or a user-imported track
// (identified as "custom:<trackId>"). Both go through the exact same
// state machine, so:
//  - clicking the sound/track that's already playing never restarts it
//    (we bail out before touching the Audio element's position), and
//  - switching sounds fades the old Audio out while fading the new
//    one in, instead of a hard cut.
let current = {
  name: null,
  audio: null,
  targetVolume: 0.7,
  fadeInTimer: null,
  objectUrl: null // set when `audio.src` is a blob: URL that needs revoking
};

const FADE_MS = 400;
const FADE_STEPS = 20;
const CUSTOM_TRACK_PREFIX = "custom:";

function isCustomTrack(sound) {
  return typeof sound === "string" && sound.startsWith(CUSTOM_TRACK_PREFIX);
}

async function resolveAudioSrc(sound) {
  if (isCustomTrack(sound)) {
    const id = sound.slice(CUSTOM_TRACK_PREFIX.length);
    if (typeof FlowspaceMusicDB === "undefined") {
      throw new Error("music-db-unavailable");
    }
    const blob = await FlowspaceMusicDB.getTrackBlob(id);
    if (!blob) {
      throw new Error("missing-track");
    }
    return { src: URL.createObjectURL(blob), objectUrl: true };
  }
  return { src: chrome.runtime.getURL(`sounds/${sound}.mp3`), objectUrl: false };
}

function notifyPlaybackError(sound, message) {
  // Best-effort broadcast — if no popup is open there's simply no
  // listener, which is fine; this must never throw.
  try {
    chrome.runtime.sendMessage({ action: "music:playbackError", sound, message });
  } catch (err) {
    // ignore — no receiving context open
  }
}

function clearFadeIn() {
  if (current.fadeInTimer) {
    clearInterval(current.fadeInTimer);
    current.fadeInTimer = null;
  }
}

function fadeOutAndStop(audio, objectUrl) {
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
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch (err) {
          // ignore
        }
      }
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

function resetCurrent(keepTargetVolume) {
  current = {
    name: null,
    audio: null,
    targetVolume: keepTargetVolume ?? current.targetVolume,
    fadeInTimer: null,
    objectUrl: null
  };
}

async function playSound(sound, volume) {
  const targetVolume = volume ?? 0.7;

  // Already playing this exact sound/track — just settle the volume,
  // never touch playback position (this is what makes re-clicking the
  // active sound a no-op instead of a restart).
  if (current.name === sound && current.audio) {
    current.targetVolume = targetVolume;
    if (!current.fadeInTimer) {
      current.audio.volume = targetVolume;
    }
    return;
  }

  let resolved;
  try {
    resolved = await resolveAudioSrc(sound);
  } catch (err) {
    console.warn("Could not load sound:", sound, err);
    const message =
      err && err.message === "missing-track"
        ? "This track is no longer available. It may have been removed."
        : "This sound could not be loaded.";
    notifyPlaybackError(sound, message);
    return;
  }

  // Switching sounds (or starting from idle): fade the old one out and
  // start the new one from the beginning, fading it in.
  fadeOutAndStop(current.audio, current.objectUrl);
  clearFadeIn();

  const audio = new Audio(resolved.src);
  audio.loop = true;
  audio.volume = 0;

  audio.addEventListener("error", () => {
    console.warn("Audio playback error for", sound);
    notifyPlaybackError(sound, "Playback failed for this track.");
    if (current.audio === audio) {
      if (resolved.objectUrl) {
        try {
          URL.revokeObjectURL(resolved.src);
        } catch (err) {
          // ignore
        }
      }
      resetCurrent();
    }
  });

  audio.play().catch((err) => {
    console.warn("Audio playback blocked:", err);
    notifyPlaybackError(sound, "Playback was blocked by the browser.");
  });

  current = {
    name: sound,
    audio,
    targetVolume,
    fadeInTimer: null,
    objectUrl: resolved.objectUrl ? resolved.src : null
  };
  fadeIn(audio, targetVolume);
}

function stopSound() {
  clearFadeIn();
  fadeOutAndStop(current.audio, current.objectUrl);
  resetCurrent();
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
