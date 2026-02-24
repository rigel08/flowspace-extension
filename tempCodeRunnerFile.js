// --- Ambient Sound Setup ---
const soundFiles = ["rain", "lofi", "forest", "ocean"];
const sounds = {};
soundFiles.forEach(name => {
  const audio = new Audio(chrome.runtime.getURL(`sounds/${name}.mp3`));
  audio.loop = true;
  audio.volume = 0.7;
  sounds[name] = audio;
});

// --- Fading Utility ---
function fadeAudio(audio, fadeIn = true, duration = 1000) {
  const steps = 20;
  const stepTime = duration / steps;
  let step = 0;
  const startVol = fadeIn ? 0 : audio.volume;
  const endVol = fadeIn ? audio.volume : 0;

  if (fadeIn) {
    audio.volume = 0;
    audio.play();
  }

  const interval = setInterval(() => {
    step++;
    const newVol = startVol + (endVol - startVol) * (step / steps);
    audio.volume = Math.max(0, Math.min(1, newVol));
    if (step >= steps) {
      clearInterval(interval);
      if (!fadeIn) audio.pause();
    }
  }, stepTime);
}

// --- Storage Restore ---
chrome.storage.local.get(["volume", "activeSounds", "theme"], (data) => {
  if (data.volume) {
    document.getElementById("volume").value = data.volume;
    Object.values(sounds).forEach(a => (a.volume = data.volume));
  }
  if (data.activeSounds) {
    data.activeSounds.forEach(name => {
      const btn = document.querySelector(`[data-sound="${name}"]`);
      btn.classList.add("active");
      fadeAudio(sounds[name], true, 1000);
    });
  }
  if (data.theme) {
    const bg = document.getElementById("background");
    const themeSelect = document.getElementById("theme");
    themeSelect.value = data.theme;
    bg.style.backgroundImage = themes[data.theme];
  }
});

// --- Sound Control ---
document.querySelectorAll(".sound").forEach(btn => {
  btn.addEventListener("click", () => {
    const soundName = btn.dataset.sound;
    const sound = sounds[soundName];
    if (sound.paused) {
      btn.classList.add("active");
      fadeAudio(sound, true, 1000);
    } else {
      btn.classList.remove("active");
      fadeAudio(sound, false, 1000);
    }
    const active = Array.from(document.querySelectorAll(".sound.active"))
      .map(b => b.dataset.sound);
    chrome.storage.local.set({ activeSounds: active });
  });
});

// --- Volume Control ---
document.getElementById("volume").addEventListener("input", (e) => {
  const vol = parseFloat(e.target.value);
  Object.values(sounds).forEach(s => (s.volume = vol));
  chrome.storage.local.set({ volume: vol });
});

// --- Pomodoro Timer ---
let totalSeconds = 25 * 60;
let timerInterval = null;
const timeEl = document.getElementById("time");
const startBtn = document.getElementById("start");
const resetBtn = document.getElementById("reset");

function updateTimer() {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  timeEl.textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

startBtn.addEventListener("click", () => {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    if (totalSeconds > 0) {
      totalSeconds--;
      updateTimer();
    } else {
      clearInterval(timerInterval);
      timerInterval = null;
      timeEl.textContent = "Done!";
      new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg").play();
    }
  }, 1000);
});

resetBtn.addEventListener("click", () => {
  clearInterval(timerInterval);
  timerInterval = null;
  totalSeconds = 25 * 60;
  updateTimer();
  Object.values(sounds).forEach(a => fadeAudio(a, false, 500));
  document.querySelectorAll(".sound").forEach(b => b.classList.remove("active"));
  chrome.storage.local.remove("activeSounds");
});

// --- Quotes ---
const quoteEl = document.getElementById("quote");
const newQuoteBtn = document.getElementById("new-quote");
const categorySelect = document.getElementById("category");
const quotes = {
  focus: [
    "Focus on progress, not perfection.",
    "Small steps every day lead to big results.",
    "Do something today that your future self will thank you for."
  ],
  relax: [
    "Breathe in peace, exhale stress.",
    "You deserve a moment to rest.",
    "Let calmness flow through you."
  ],
  productivity: [
    "Discipline is stronger than motivation.",
    "Work smart, not just hard.",
    "Your potential is endless—use it."
  ]
};
function loadRandomQuote(category = "focus") {
  const arr = quotes[category] || quotes.focus;
  const randomIndex = Math.floor(Math.random() * arr.length);
  quoteEl.style.opacity = 0;
  setTimeout(() => {
    quoteEl.textContent = `"${arr[randomIndex]}"`;
    quoteEl.style.opacity = 1;
  }, 300);
}
newQuoteBtn.addEventListener("click", () => loadRandomQuote(categorySelect.value));
loadRandomQuote();
updateTimer();

// --- Theme Logic ---
const bg = document.getElementById("background");
const themeSelect = document.getElementById("theme");
const themes = {
  rain: "url('https://images.unsplash.com/photo-1505483531331-251cf3f8b27b?auto=format&fit=crop&w=600&q=80')",
  forest: "url('https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=600&q=80')",
  ocean: "url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80')",
  lofi: "url('https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=600&q=80')"
};
themeSelect.addEventListener("change", () => {
  bg.style.backgroundImage = themes[themeSelect.value];
  chrome.storage.local.set({ theme: themeSelect.value });
});

// --- Particle Animation ---
const canvas = document.getElementById("particles");
const ctx = canvas.getContext("2d");
canvas.width = 360;
canvas.height = 520;
const particles = Array.from({ length: 30 }, () => ({
  x: Math.random() * canvas.width,
  y: Math.random() * canvas.height,
  speed: Math.random() * 2 + 0.5,
  size: Math.random() * 2 + 1
}));
function drawParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  particles.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    p.y += p.speed;
    if (p.y > canvas.height) p.y = 0;
  });
  requestAnimationFrame(drawParticles);
}
drawParticles();
