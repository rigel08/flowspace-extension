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

chrome.runtime.onMessage.addListener(async (msg) => {
  if (["play", "stop", "volume"].includes(msg.action)) {
    await ensureOffscreen();
    chrome.runtime.sendMessage(msg);
  }
});

// Reminder notifications
chrome.alarms.onAlarm.addListener((alarm) => {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "FlowSpace Reminder ⏰",
    message: alarm.name,
    priority: 2
  });
});
