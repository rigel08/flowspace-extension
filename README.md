# FlowSpace 🧘‍♂️

A focused Chrome extension for ambient soundscapes, configurable focus sessions, reminders, scheduling, and local music playback.

FlowSpace brings the tools you need to stay in a focused environment into one lightweight browser extension.

## ✨ Features

### 🎯 Focus Sessions

- Configurable focus durations
- Preset sessions: 15, 25, 45, and 60 minutes
- Custom session durations
- Start, pause, resume, and end controls
- Persistent timer state
- Timer continues accurately when the popup is closed
- Focus completion notification

### 🌧️ Ambient Soundscapes

Choose from built-in environments:

- 🌧️ Rain
- 🌲 Forest
- 🌊 Ocean
- 🎧 Lofi

Sound playback includes volume control and persistent background audio through Chrome's offscreen document architecture.

### ✨ Flow Mode

Flow Mode connects the focus session with the visual environment.

Different soundscapes create different visual atmospheres through the particle system, with changes to movement, intensity, color, and other visual parameters.

The focus timer can also influence the visual intensity of the environment.

### 🎵 My Music

Import your own audio directly into FlowSpace.

- Import local audio files
- Store tracks locally using IndexedDB
- Play imported tracks through the same audio pipeline
- Manage and remove imported tracks
- No music upload server required

### 📅 Advanced Scheduler

Create scheduled tasks and reminders with:

- Due dates
- Specific times
- Persistent scheduled events
- Chrome alarm-based notifications

Scheduled events continue to work without requiring the popup to remain open.

### 🔔 Notifications

FlowSpace uses Chrome's alarm and notification APIs for persistent background events.

Notifications can be triggered by:

- Focus session completion
- Scheduled reminders
- Scheduled tasks

## 🧠 Built For Focus

FlowSpace is designed around a simple idea:

**Create your environment, start your session, and stay there.**

Instead of switching between a timer, music player, reminder app, and multiple browser tabs, FlowSpace keeps these pieces together in one focused workspace.

## 🛠️ Technical Architecture

FlowSpace is built with:

- JavaScript
- HTML
- CSS
- Chrome Extension Manifest V3
- Chrome Storage API
- Chrome Alarms API
- Chrome Notifications API
- Chrome Offscreen Documents
- IndexedDB

### Popup

`popup.html`, `popup.js`, and `style.css` provide the main FlowSpace interface.

The popup controls:

- Focus sessions
- Ambient sounds
- Volume
- Imported music
- Flow Mode
- Tasks and reminders

### Background Service Worker

`background.js` handles functionality that needs to persist outside the popup, including:

- Focus timer state
- Chrome alarms
- Notifications
- Audio communication
- Background scheduling

### Offscreen Audio

Chrome Manifest V3 service workers cannot directly maintain normal audio playback.

FlowSpace uses an offscreen document to handle audio playback so ambient sounds and imported music can continue while the popup is closed.

### Persistent Timer

The focus timer uses timestamps rather than relying on a continuously decrementing counter.

The remaining time is calculated from the target completion time:

```text
remaining = targetEndTime - currentTime
