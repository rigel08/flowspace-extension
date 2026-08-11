// ===== ANIMATED BACKGROUND =====
const canvas = document.getElementById('animated-bg');
const ctx = canvas.getContext('2d');
canvas.width = 380;
canvas.height = 580;

const particles = [];
const particleCount = 50;

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
    this.hue = Math.random() * 60 + 240; // Blue-purple range
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;

    if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
    if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
  }

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${this.hue}, 70%, 60%, 0.6)`;
    ctx.fill();
  }
}

for (let i = 0; i < particleCount; i++) {
  particles.push(new Particle());
}

function animate() {
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
        ctx.strokeStyle = `hsla(${p.hue}, 70%, 60%, ${0.2 * (1 - distance / 80)})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  });

  requestAnimationFrame(animate);
}

animate();

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

    setActiveSound(sound);
  });
});

// Stop button handler
document.getElementById('stop-sound').addEventListener('click', () => {
  chrome.runtime.sendMessage({ 
    action: 'stop' 
  });

  setActiveSound(null);
});

// Highlights whichever sound card is currently playing (purple glow)
// and clears the rest.
function setActiveSound(soundName) {
  document.querySelectorAll('.sound').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-sound') === soundName);
  });
}

// Sync the active-sound highlight with whatever is actually playing —
// covers reopening the popup while ambient audio keeps running in the
// background offscreen document.
chrome.runtime.sendMessage({ action: 'sound:getState' }, (response) => {
  if (response && response.sound) {
    setActiveSound(response.sound);
  }
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
      time: time
    };
    
    // Save to storage
    chrome.storage.local.get(['reminders'], (result) => {
      const reminders = result.reminders || [];
      reminders.push(reminder);
      chrome.storage.local.set({ reminders: reminders });
    });
    
    // Add to list
    addReminderToList(text, time, reminder.id);
    
    // Schedule notification
    scheduleReminder(reminder);
    
    // Clear form
    reminderText.value = '';
    reminderTime.value = '';
  }
});

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
  chrome.storage.local.get(['reminders'], (result) => {
    const reminders = result.reminders || [];
    const updatedReminders = reminders.filter(r => r.id !== id);
    chrome.storage.local.set({ reminders: updatedReminders });
  });
}

function scheduleReminder(reminder) {
  const now = new Date();
  const [hours, minutes] = reminder.time.split(':');
  const reminderDate = new Date();
  reminderDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  
  // If the time has passed today, schedule for tomorrow
  if (reminderDate < now) {
    reminderDate.setDate(reminderDate.getDate() + 1);
  }
  
  const delay = reminderDate - now;
  
  setTimeout(() => {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'FlowSpace Reminder',
      message: reminder.text,
      priority: 2
    });
  }, delay);
}
// ===== FOCUS TIMER =====
// Timestamp-based countdown: the popup never owns the authoritative
// timer state. It asks background.js for { status, targetEndTime,
// remainingMs, duration } and, while running, redraws every second by
// recomputing (targetEndTime - Date.now()) — never by decrementing a
// local counter. This means closing/reopening the popup can never
// desync the displayed time.
const FOCUS_DURATION_MS = 25 * 60 * 1000;

const timerDisplay = document.getElementById('timer-display');
const timerStatusEl = document.getElementById('timer-status');
const timerStartBtn = document.getElementById('timer-start');
const timerPauseBtn = document.getElementById('timer-pause');
const timerResumeBtn = document.getElementById('timer-resume');
const timerEndBtn = document.getElementById('timer-end');

let timerTickInterval = null;

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
    timerDisplay.textContent = formatTimerMs(state.remainingMs ?? state.duration ?? FOCUS_DURATION_MS);
  } else if (state.status === 'completed') {
    setTimerButtons({ start: true, pause: false, resume: false, end: false });
    timerStatusEl.textContent = 'Session complete 🎉';
    timerDisplay.textContent = '0:00';
  } else {
    setTimerButtons({ start: true, pause: false, resume: false, end: false });
    timerStatusEl.textContent = 'Ready to focus';
    timerDisplay.textContent = formatTimerMs(state.duration ?? FOCUS_DURATION_MS);
  }
}

function requestTimerState() {
  chrome.runtime.sendMessage({ action: 'timer:getState' }, renderTimerState);
}

timerStartBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'timer:start', duration: FOCUS_DURATION_MS }, renderTimerState);
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
