let currentAudio = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "play") {
    if (currentAudio) currentAudio.pause();

    const src = chrome.runtime.getURL(`sounds/${msg.sound}.mp3`);
    currentAudio = new Audio(src);
    currentAudio.loop = true;
    currentAudio.volume = msg.volume ?? 0.7;
    currentAudio.muted = false;
    currentAudio.play().catch(err => console.warn("Audio playback blocked:", err));
  }

  if (msg.action === "stop" && currentAudio) currentAudio.pause();
  if (msg.action === "volume" && currentAudio) currentAudio.volume = msg.volume;
});
