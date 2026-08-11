// ===== Shared "My Music" storage (IndexedDB) =====
// Loaded as a plain classic script by both popup.html and offscreen.html
// (same extension origin), so track metadata and audio blobs are read
// and written from one place instead of duplicating storage logic
// between the popup and the offscreen document.
//
// Metadata (name/type/size/createdAt) and the actual audio Blob are kept
// in two separate object stores on purpose: the popup only ever needs
// metadata to render the list, and only needs the (potentially large)
// blob at the moment a track is actually played.
(function (global) {
  const DB_NAME = "flowspaceMusicDB";
  const DB_VERSION = 1;
  const META_STORE = "tracksMeta";
  const BLOB_STORE = "trackBlobs";
  const MAX_TRACK_SIZE_BYTES = 15 * 1024 * 1024; // 15MB — reasonable ceiling for local blob storage

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(BLOB_STORE)) {
          db.createObjectStore(BLOB_STORE, { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function isSupportedAudioFile(file) {
    if (!file) return false;
    if (file.type && file.type.startsWith("audio/")) return true;
    // Fall back to extension sniffing — some OS/browser combos leave
    // file.type empty for formats like .m4a.
    return /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.name || "");
  }

  async function addTrack(file) {
    if (!isSupportedAudioFile(file)) {
      throw new Error("unsupported-type");
    }
    if (file.size > MAX_TRACK_SIZE_BYTES) {
      throw new Error("too-large");
    }
    if (file.size === 0) {
      throw new Error("empty-file");
    }

    const db = await openDB();
    const id = `track_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const meta = {
      id,
      name: file.name || "Untitled track",
      type: file.type || "audio/mpeg",
      size: file.size,
      createdAt: Date.now()
    };

    await new Promise((resolve, reject) => {
      const tx = db.transaction([META_STORE, BLOB_STORE], "readwrite");
      tx.objectStore(META_STORE).put(meta);
      tx.objectStore(BLOB_STORE).put({ id, blob: file });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
    return meta;
  }

  async function getAllTracksMeta() {
    const db = await openDB();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readonly");
      const req = tx.objectStore(META_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }

  async function getTrackBlob(id) {
    const db = await openDB();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(BLOB_STORE, "readonly");
      const req = tx.objectStore(BLOB_STORE).get(id);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result || null;
  }

  async function deleteTrack(id) {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([META_STORE, BLOB_STORE], "readwrite");
      tx.objectStore(META_STORE).delete(id);
      tx.objectStore(BLOB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  global.FlowspaceMusicDB = {
    MAX_TRACK_SIZE_BYTES,
    isSupportedAudioFile,
    addTrack,
    getAllTracksMeta,
    getTrackBlob,
    deleteTrack
  };
})(self);
