// ResumeTube popup: lists unfinished videos, newest activity first.

const STORE_PREFIX = "rt_";

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function fmtAge(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function watchUrl(v) {
  const base = "https://www.youtube.com/watch?v=" + encodeURIComponent(v.id);
  return v.currentTime > 0 ? `${base}&t=${v.currentTime}s` : base;
}

async function load() {
  const data = await chrome.storage.local.get(null);
  return Object.fromEntries(
    Object.entries(data).filter(([key, value]) =>
      key.startsWith(STORE_PREFIX) && value && typeof value === "object"
    )
  );
}

async function render() {
  const videos = await load();
  const list = document.getElementById("list");
  const count = document.getElementById("count");
  list.innerHTML = "";

  const items = Object.values(videos).sort((a, b) => b.updatedAt - a.updatedAt);
  count.textContent = items.length ? String(items.length) : "";

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent =
      "Nothing unfinished right now. Watch part of a YouTube video and it will show up here so you can resume it later.";
    list.appendChild(empty);
    return;
  }

  for (const v of items) {
    const el = document.createElement("div");
    el.className = "item";

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "thumbWrap";
    const img = document.createElement("img");
    img.src = v.thumbnail;
    img.alt = "";
    img.loading = "lazy";
    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("div");
    fill.style.width = (v.percent || 0) + "%";
    bar.appendChild(fill);
    thumbWrap.appendChild(img);
    thumbWrap.appendChild(bar);

    const meta = document.createElement("div");
    meta.className = "meta";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = v.title || v.id;
    const sub = document.createElement("div");
    sub.className = "sub";
    const left = fmtTime(v.currentTime);
    const total = fmtTime(v.duration);
    const channel = v.channel ? v.channel + " · " : "";
    sub.textContent = `${channel}${left} / ${total} (${v.percent}%) · ${fmtAge(v.updatedAt)}`;
    meta.appendChild(title);
    meta.appendChild(sub);

    const remove = document.createElement("button");
    remove.className = "remove";
    remove.textContent = "×";
    remove.title = "Remove from list";
    remove.addEventListener("click", async (e) => {
      e.stopPropagation();
      await chrome.storage.local.remove(STORE_PREFIX + v.id);
    });

    el.appendChild(thumbWrap);
    el.appendChild(meta);
    el.appendChild(remove);
    el.addEventListener("click", () => {
      chrome.tabs.create({ url: watchUrl(v) });
    });

    list.appendChild(el);
  }
}

document.getElementById("clearAll").addEventListener("click", async () => {
  if (!window.confirm("Remove all unfinished videos?")) return;
  const videos = await load();
  await chrome.storage.local.remove(Object.keys(videos));
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && Object.keys(changes).some((key) => key.startsWith(STORE_PREFIX))) {
    render();
  }
});

render();
