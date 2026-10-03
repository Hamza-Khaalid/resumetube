// ResumeTube content script
// Tracks watch progress on YouTube video pages and stores unfinished videos
// in chrome.storage.local so the popup can offer one-click resume.

(function () {
  "use strict";

  const STORE_PREFIX = "rt_";
  const LEGACY_STORE_KEY = "videos";
  const MIN_PROGRESS_SECONDS = 30;
  const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
  const MAX_ENTRIES = 100;
  const SAVE_INTERVAL_MS = 3000;

  let pendingVideoId = null;
  let activeVideoId = null;
  let metadataReadyId = null;
  let resumedVideoId = null;
  let lastSave = 0;
  let listening = true;
  let initialNavigation = true;

  function storageCall(method, ...args) {
    try {
      return chrome.storage.local[method](...args).catch((error) => {
        if (/extension context invalidated/i.test(String(error))) stopListening();
        else console.warn("ResumeTube storage error:", error);
        return null;
      });
    } catch (error) {
      if (/extension context invalidated/i.test(String(error))) stopListening();
      else console.warn("ResumeTube storage error:", error);
      return Promise.resolve(null);
    }
  }

  function storageKey(id) {
    return STORE_PREFIX + id;
  }

  function getVideoId() {
    try {
      const url = new URL(location.href);
      if (url.pathname === "/watch") return url.searchParams.get("v");
    } catch (e) { /* ignore */ }
    return null;
  }

  function getVideoElement() {
    return document.querySelector("#movie_player video.html5-main-video");
  }

  function getPlayerVideoId() {
    try {
      return document.querySelector("#movie_player").getVideoData().video_id;
    } catch (e) {
      return null;
    }
  }

  function isBlockedPlayback() {
    return Boolean(
      document.querySelector("#movie_player.ad-showing") ||
      document.querySelector("#movie_player .ytp-live")
    );
  }

  function getTitle() {
    const el =
      document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
      document.querySelector("h1.title yt-formatted-string") ||
      document.querySelector("h1.ytd-video-primary-info-renderer");
    const t = el ? el.textContent.trim() : "";
    return t || document.title.replace(/ - YouTube$/, "").trim();
  }

  function getChannel() {
    const el =
      document.querySelector("ytd-channel-name a") ||
      document.querySelector("#owner-name a") ||
      document.querySelector("ytd-video-owner-renderer a");
    return el ? el.textContent.trim() : "";
  }

  function thumbnailFor(id) {
    return "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg";
  }

  function saveProgress(force = false) {
    const video = getVideoElement();
    const id = activeVideoId;
    if (!video || !id || isBlockedPlayback()) return;
    if (!force && getVideoId() !== id) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;

    const current = video.currentTime;
    const duration = video.duration;
    const remaining = duration - current;
    if (video.ended || remaining <= Math.min(duration * 0.08, 120)) {
      storageCall("remove", storageKey(id));
      return;
    }

    if (current < MIN_PROGRESS_SECONDS) return;

    const entry = {
      id,
      title: getTitle(),
      channel: getChannel(),
      thumbnail: thumbnailFor(id),
      currentTime: Math.floor(current),
      duration: Math.floor(duration),
      percent: Math.min(99, Math.round((current / duration) * 100)),
      updatedAt: Date.now()
    };
    storageCall("set", { [storageKey(id)]: entry });
  }

  function onLoadedMetadata(event) {
    if (event.target !== getVideoElement()) return;
    const id = getVideoId();
    if (!id || id !== pendingVideoId || isBlockedPlayback()) return;
    metadataReadyId = id;
    activateVideo(id);
  }

  function activateVideo(id) {
    if (!id || id !== pendingVideoId || metadataReadyId !== id || isBlockedPlayback()) return;
    activeVideoId = id;
    if (resumedVideoId !== id) {
      resumedVideoId = id;
      resumeIfTracked(id);
    }
  }

  function onPlaybackEvent(event) {
    if (event.target !== getVideoElement()) return;
    if (!activeVideoId && metadataReadyId === pendingVideoId) activateVideo(pendingVideoId);
    if (!activeVideoId || isBlockedPlayback()) return;
    if (event.type === "timeupdate") {
      const now = Date.now();
      if (now - lastSave < SAVE_INTERVAL_MS) return;
      lastSave = now;
    }
    saveProgress();
  }

  function flushProgress() {
    saveProgress(true);
  }

  function onNavigateStart() {
    flushProgress();
    pendingVideoId = null;
    activeVideoId = null;
    metadataReadyId = null;
    resumedVideoId = null;
  }

  function onNavigate() {
    const id = getVideoId();
    const isInitialNavigation = initialNavigation;
    initialNavigation = false;
    if (id === pendingVideoId) return;
    pendingVideoId = id;
    activeVideoId = null;
    metadataReadyId = null;
    resumedVideoId = null;
    if (isInitialNavigation && id) {
      const video = getVideoElement();
      if (video && video.readyState >= 1 && getPlayerVideoId() === id && !isBlockedPlayback()) {
        metadataReadyId = id;
        activateVideo(id);
      }
    }
  }

  async function resumeIfTracked(id) {
    const data = await storageCall("get", storageKey(id));
    if (!data || !listening || activeVideoId !== id || getVideoId() !== id || isBlockedPlayback()) return;
    const entry = data[storageKey(id)];
    if (!entry) return;
    const url = new URL(location.href);
    if (url.searchParams.get("t")) return;
    const video = getVideoElement();
    if (!video || entry.currentTime <= MIN_PROGRESS_SECONDS) return;
    video.currentTime = entry.currentTime;
  }

  async function initializeStorage() {
    const data = await storageCall("get", null);
    if (!data || !listening) return;

    const legacy = data[LEGACY_STORE_KEY];
    if (legacy && typeof legacy === "object") {
      const migrated = {};
      for (const entry of Object.values(legacy)) {
        if (entry && entry.id && !data[storageKey(entry.id)]) {
          migrated[storageKey(entry.id)] = entry;
        }
      }
      if (Object.keys(migrated).length && await storageCall("set", migrated) === null) return;
      await storageCall("remove", LEGACY_STORE_KEY);
    }

    const current = await storageCall("get", null);
    if (!current || !listening) return;
    const entries = Object.entries(current)
      .filter(([key, entry]) => key.startsWith(STORE_PREFIX) && entry && typeof entry.updatedAt === "number")
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt);
    const expired = entries
      .filter(([, entry]) => Date.now() - entry.updatedAt > MAX_AGE_MS)
      .map(([key]) => key);
    const excess = entries.slice(MAX_ENTRIES).map(([key]) => key);
    const removals = [...new Set([...expired, ...excess])];
    if (removals.length) await storageCall("remove", removals);
  }

  function stopListening() {
    if (!listening) return;
    listening = false;
    document.removeEventListener("loadedmetadata", onLoadedMetadata, true);
    document.removeEventListener("timeupdate", onPlaybackEvent, true);
    document.removeEventListener("pause", onPlaybackEvent, true);
    document.removeEventListener("ended", onPlaybackEvent, true);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", flushProgress);
    window.removeEventListener("yt-navigate-start", onNavigateStart);
    window.removeEventListener("yt-navigate-finish", onNavigate);
    window.removeEventListener("yt-page-data-updated", onNavigate);
  }

  function onVisibilityChange() {
    if (document.visibilityState === "hidden") flushProgress();
  }

  document.addEventListener("loadedmetadata", onLoadedMetadata, true);
  document.addEventListener("timeupdate", onPlaybackEvent, true);
  document.addEventListener("pause", onPlaybackEvent, true);
  document.addEventListener("ended", onPlaybackEvent, true);
  window.addEventListener("yt-navigate-start", onNavigateStart);
  window.addEventListener("yt-navigate-finish", onNavigate);
  window.addEventListener("yt-page-data-updated", onNavigate);
  window.addEventListener("pagehide", flushProgress);
  document.addEventListener("visibilitychange", onVisibilityChange);

  initializeStorage();
  onNavigate();
})();
