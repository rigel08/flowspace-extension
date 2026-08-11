// ===== ANIMATED BACKGROUND =====
const canvas = document.getElementById('animated-bg');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const particles = [];
const particleCount = 80;

class Particle {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.vx = (Math.random() - 0.5) * 0.3;
    this.vy = (Math.random() - 0.5) * 0.3;
    this.radius = Math.random() * 2 + 1;
    this.hue = Math.random() * 60 + 240;
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
  ctx.fillStyle = 'rgba(10, 10, 10, 0.05)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  particles.forEach((p, i) => {
    p.update();
    p.draw();

    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[j].x - p.x;
      const dy = particles[j].y - p.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 120) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.strokeStyle = `hsla(${p.hue}, 70%, 60%, ${0.15 * (1 - distance / 120)})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  });

  requestAnimationFrame(animate);
}

animate();

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});

// ===== CURRENT TIME =====
function updateCurrentTime() {
  const now = new Date();
  const timeString = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
  document.getElementById('current-time').textContent = timeString;
}
updateCurrentTime();
setInterval(updateCurrentTime, 1000);

// ===== TASK MANAGEMENT =====
let tasks = [];
let currentFilter = 'all';

// Load tasks from storage
chrome.storage.local.get(['tasks', 'streak'], (result) => {
  tasks = result.tasks || [];
  const streak = result.streak || 0;
  document.getElementById('streak-count').textContent = streak;
  renderTasks();
  updateStats();
});

// Get today's date in YYYY-MM-DD format
function getTodayDate() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

// Set default date to today
document.getElementById('task-date').value = getTodayDate();

// Form submission
document.getElementById('task-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const date = document.getElementById('task-date').value;
  const time = document.getElementById('task-time').value;
  const reminderMinutes = parseInt(document.getElementById('task-reminder').value, 10) || 0;

  // Compute absolute fire times once, at creation. These (not the raw
  // date/time strings) are the source of truth background.js uses to
  // schedule and reconcile chrome.alarms.
  const dueAt = new Date(`${date}T${time}`).getTime();
  const reminderAt = reminderMinutes > 0 ? dueAt - reminderMinutes * 60000 : null;

  const task = {
    id: Date.now(),
    title: document.getElementById('task-title').value.trim(),
    description: document.getElementById('task-description').value.trim(),
    date,
    time,
    reminder: reminderMinutes,
    priority: document.getElementById('task-priority').value,
    category: document.getElementById('task-category').value,
    completed: false,
    createdAt: new Date().toISOString(),
    dueAt: Number.isFinite(dueAt) ? dueAt : null,
    reminderAt: Number.isFinite(reminderAt) ? reminderAt : null,
    reminderNotifiedAt: null,
    dueNotifiedAt: null
  };

  tasks.push(task);
  saveTasks();
  // Hand off to background.js to create the chrome.alarms entries —
  // this is what lets the reminder/due notifications survive the
  // scheduler tab (or the popup) being closed.
  chrome.runtime.sendMessage({ action: 'task:schedule', task });
  renderTasks();
  updateStats();

  // Reset form
  document.getElementById('task-form').reset();
  document.getElementById('task-date').value = getTodayDate();

  // Show success feedback
  showNotification('✅ Task created successfully!');
});

// Save tasks to storage
function saveTasks() {
  chrome.storage.local.set({ tasks: tasks });
}

// Filter tabs
document.querySelectorAll('.filter-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    currentFilter = tab.dataset.filter;
    
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    renderTasks();
  });
});

// Render tasks
function renderTasks() {
  const tasksList = document.getElementById('tasks-list');
  const emptyState = document.getElementById('empty-state');
  
  let filteredTasks = filterTasks(tasks, currentFilter);
  
  if (filteredTasks.length === 0) {
    tasksList.innerHTML = '';
    emptyState.classList.add('show');
    return;
  }

  emptyState.classList.remove('show');
  
  // Sort by date and time
  filteredTasks.sort((a, b) => {
    const dateA = new Date(`${a.date}T${a.time}`);
    const dateB = new Date(`${b.date}T${b.time}`);
    return dateA - dateB;
  });

  tasksList.innerHTML = filteredTasks.map(task => createTaskCard(task)).join('');
  
  // Attach event listeners
  filteredTasks.forEach(task => {
    document.getElementById(`complete-${task.id}`)?.addEventListener('click', () => {
      toggleComplete(task.id);
    });
    
    document.getElementById(`delete-${task.id}`)?.addEventListener('click', () => {
      deleteTask(task.id);
    });
  });
}

// Filter tasks
function filterTasks(tasks, filter) {
  const today = getTodayDate();
  
  switch(filter) {
    case 'today':
      return tasks.filter(t => t.date === today && !t.completed);
    case 'upcoming':
      return tasks.filter(t => t.date > today && !t.completed);
    case 'completed':
      return tasks.filter(t => t.completed);
    case 'all':
    default:
      return tasks;
  }
}

// Create task card HTML
function createTaskCard(task) {
  const categoryIcons = {
    work: '💼',
    personal: '🏠',
    health: '💪',
    study: '📚',
    other: '📌'
  };

  const priorityColors = {
    low: 'low',
    medium: 'medium',
    high: 'high',
    urgent: 'urgent'
  };

  const taskDate = new Date(`${task.date}T${task.time}`);
  const isOverdue = taskDate < new Date() && !task.completed;

  return `
    <div class="task-card ${task.completed ? 'completed' : ''}" data-task-id="${task.id}">
      <div class="task-priority-indicator ${priorityColors[task.priority]}"></div>
      
      <div class="task-header">
        <div class="task-main">
          <div class="task-title">${task.title}</div>
          ${task.description ? `<div class="task-description">${task.description}</div>` : ''}
          
          <div class="task-meta">
            <div class="task-meta-item">
              📅 ${formatDate(task.date)}
            </div>
            <div class="task-meta-item">
              ⏰ ${formatTime(task.time)}
            </div>
            <div class="task-meta-item">
              ${categoryIcons[task.category]} ${task.category}
            </div>
            <div class="task-meta-item">
              🏷️ ${task.priority}
            </div>
            ${isOverdue ? '<div class="task-meta-item" style="background: rgba(239, 68, 68, 0.2);">⚠️ Overdue</div>' : ''}
          </div>
        </div>
      </div>
      
      <div class="task-actions">
        <button id="complete-${task.id}" class="task-btn complete">
          ${task.completed ? '↩️ Undo' : '✅ Complete'}
        </button>
        <button id="delete-${task.id}" class="task-btn delete">🗑️ Delete</button>
      </div>
    </div>
  `;
}

// Format date
function formatDate(dateString) {
  const date = new Date(dateString);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (dateString === getTodayDate()) return 'Today';
  if (dateString === tomorrow.toISOString().split('T')[0]) return 'Tomorrow';
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Format time
function formatTime(timeString) {
  const [hours, minutes] = timeString.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

// Toggle task completion
function toggleComplete(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (task) {
    task.completed = !task.completed;
    
    if (task.completed) {
      showNotification('🎉 Task completed! Great job!');
      updateStreak();
      // A completed task should never fire its reminder/due notification.
      chrome.runtime.sendMessage({ action: 'task:cancel', id: task.id });
    } else {
      // Un-completed: re-eligible for its reminder/due notification if
      // that time is still ahead of now.
      chrome.runtime.sendMessage({ action: 'task:schedule', task });
    }
    
    saveTasks();
    renderTasks();
    updateStats();
  }
}

// Delete task
function deleteTask(taskId) {
  if (confirm('Are you sure you want to delete this task?')) {
    tasks = tasks.filter(t => t.id !== taskId);
    saveTasks();
    chrome.runtime.sendMessage({ action: 'task:cancel', id: taskId });
    renderTasks();
    updateStats();
    showNotification('🗑️ Task deleted');
  }
}

// Update statistics
function updateStats() {
  const today = getTodayDate();
  const completedToday = tasks.filter(t => 
    t.completed && t.date === today
  ).length;
  
  const pending = tasks.filter(t => !t.completed).length;
  
  document.getElementById('completed-count').textContent = completedToday;
  document.getElementById('pending-count').textContent = pending;
}

// Update streak
function updateStreak() {
  chrome.storage.local.get(['streak', 'lastCompletionDate'], (result) => {
    let streak = result.streak || 0;
    const lastDate = result.lastCompletionDate;
    const today = getTodayDate();
    
    if (lastDate !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayDate = yesterday.toISOString().split('T')[0];
      
      if (lastDate === yesterdayDate) {
        streak++;
      } else {
        streak = 1;
      }
      
      chrome.storage.local.set({
        streak: streak,
        lastCompletionDate: today
      });
      
      document.getElementById('streak-count').textContent = streak;
    }
  });
}

// Show notification toast
function showNotification(message) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: white;
    padding: 16px 24px;
    border-radius: 12px;
    font-weight: 600;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    animation: slideInRight 0.3s ease-out;
  `;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInRight {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOutRight {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);