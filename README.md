# ResumeTube — Unfinished YouTube Video Tracker

A Chrome extension (Manifest V3) that automatically tracks YouTube videos you start but don't finish, so you can resume them later — solving the common complaint that "Watch Later" doesn't track partial progress.

## What it does

- **Automatic tracking** — while you watch a video on youtube.com, your progress is saved in the background (no clicks needed).
- **Smart finished detection** — once you pass ~92% of a video, it's considered finished and drops off the list automatically.
- **Auto-resume** — reopen a tracked video and it seeks back to where you stopped (unless the URL already has a timestamp).
- **Popup dashboard** — click the toolbar icon to see all unfinished videos with thumbnails, progress bars, channel name, and how long ago you watched. Click any item to resume at the exact timestamp.
- **Cleanup controls** — remove individual videos or clear the whole list.
- **Private by design** — everything is stored in `chrome.storage.local`. No accounts, no servers, no tracking.

## Install (unpacked)

1. Download and unzip `ResumeTube.zip` (or keep this folder).
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `ResumeTube` folder.
5. Pin the extension to the toolbar for quick access.

## Usage

Just watch YouTube normally. Videos you watch for more than ~30 seconds but don't finish appear in the popup. Click one to jump back to where you left off.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | MV3 manifest (storage permission, YouTube content script) |
| `content.js` | Tracks playback progress, handles YouTube SPA navigation, auto-resume |
| `popup.html` / `popup.js` | Toolbar popup listing unfinished videos |
| `icons/` | Toolbar/store icons |

## Notes / possible v2 ideas

- Sync across devices via `chrome.storage.sync` (watch the 8 KB-per-item quota).
- Shorts tracking toggle.
- "Resume playlist" ordering by oldest unfinished.
- Export/import of the unfinished list.
