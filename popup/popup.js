// popup.js

let currentTab = null;
let currentOrigin = null;
let pageElements = []; // { selector, storageKey, url, origin }

// ---- 初期化 ----

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  try {
    currentOrigin = new URL(tab.url).origin;
  } catch (_) {
    showError("このページでは使用できません");
    return;
  }

  document.getElementById("site-label").textContent = currentOrigin;

  // サイト有効状態
  const { enabled } = await BackupStorage.isSiteEnabled(currentOrigin);
  const toggle = document.getElementById("toggle-site");
  toggle.checked = enabled;
  toggle.addEventListener("change", onToggleSite);

  // 設定ページ
  document.getElementById("btn-options").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // 手動保存ボタン
  document.getElementById("btn-save").addEventListener("click", onManualSave);

  // バックアップ一覧の取得
  await loadBackups();
}

// ---- トグル ----

async function onToggleSite() {
  const enabled = document.getElementById("toggle-site").checked;
  await BackupStorage.setSiteEnabled(currentOrigin, enabled);

  // content script に通知
  try {
    await chrome.tabs.sendMessage(currentTab.id, {
      type: "SITE_ENABLED_CHANGED",
      enabled,
    });
  } catch (_) {}

  showStatus(enabled ? "このサイトを有効にしました" : "このサイトを無効にしました");
}

// ---- 手動保存 ----

async function onManualSave() {
  const btn = document.getElementById("btn-save");
  btn.disabled = true;
  btn.textContent = "保存中...";

  try {
    const res = await chrome.tabs.sendMessage(currentTab.id, {
      type: "MANUAL_SAVE",
    });
    if (res && res.ok) {
      const saved = (res.results || []).filter((r) => !r.skipped).length;
      showStatus(saved > 0 ? `${saved} 件保存しました` : "変更なし（スキップ）");
      await loadBackups();
    } else {
      showError(res?.reason === "disabled" ? "このサイトは無効です" : "保存に失敗しました");
    }
  } catch (_) {
    showError("ページと通信できませんでした");
  }

  btn.disabled = false;
  btn.textContent = "今すぐ保存";
}

// ---- バックアップ一覧 ----

async function loadBackups() {
  // ページ上の要素一覧を取得
  try {
    const res = await chrome.tabs.sendMessage(currentTab.id, {
      type: "GET_PAGE_ELEMENTS",
    });
    pageElements = res?.elements || [];
  } catch (_) {
    pageElements = [];
  }

  // 全バックアップを取得してページに紐づくものだけ抽出
  const allBackups = await BackupStorage.getAllBackups();

  // ページ要素に関連するキーと、URLがページURLに一致するものを集める
  const pageUrl = currentTab.url.split("?")[0];

  // storageKey のセット（ページ上に現存する要素）
  const elementKeys = new Set(pageElements.map((e) => e.storageKey));

  // allBackups の中からページに関連するものを抽出
  const relevant = {};
  for (const [key, entries] of Object.entries(allBackups)) {
    // キーが backup::{origin}::{selector} 形式
    const parts = key.split("::");
    if (parts.length < 3) continue;
    const keyOrigin = parts[1];
    if (keyOrigin !== currentOrigin) continue;

    // URL が一致するエントリのみ残す
    const filtered = entries.filter((e) => {
      const entryUrl = (e.url || "").split("?")[0];
      return entryUrl === pageUrl || elementKeys.has(key);
    });
    if (filtered.length > 0) {
      relevant[key] = filtered;
    }
  }

  renderBackupList(relevant);
}

function renderBackupList(backupsByKey) {
  const list = document.getElementById("backup-list");
  const noMsg = document.getElementById("no-backups");
  list.innerHTML = "";

  const keys = Object.keys(backupsByKey);
  if (keys.length === 0) {
    noMsg.classList.remove("hidden");
    return;
  }
  noMsg.classList.add("hidden");

  for (const storageKey of keys) {
    const entries = backupsByKey[storageKey];
    const parts = storageKey.split("::");
    const selector = parts.slice(2).join("::");

    const item = document.createElement("li");
    item.className = "backup-item";

    const selectorEl = document.createElement("div");
    selectorEl.className = "backup-selector";
    selectorEl.textContent = selector;
    item.appendChild(selectorEl);

    const entriesList = document.createElement("ul");
    entriesList.className = "backup-entries";

    // 新しい順に表示
    const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);
    for (const entry of sorted) {
      const li = createEntryElement(storageKey, selector, entry);
      entriesList.appendChild(li);
    }

    item.appendChild(entriesList);
    list.appendChild(item);
  }
}

function createEntryElement(storageKey, selector, entry) {
  const li = document.createElement("li");
  li.className = "backup-entry";

  const timeEl = document.createElement("span");
  timeEl.className = "entry-time";
  timeEl.textContent = formatTime(entry.timestamp);

  const previewEl = document.createElement("span");
  previewEl.className = "entry-preview";
  previewEl.textContent = entry.value.replace(/\n/g, " ").slice(0, 80);
  previewEl.title = entry.value;

  const delBtn = document.createElement("button");
  delBtn.className = "entry-delete";
  delBtn.textContent = "×";
  delBtn.title = "削除";
  delBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const parts = storageKey.split("::");
    const origin = parts[1];
    const sel = parts.slice(2).join("::");
    await BackupStorage.deleteBackup(origin, sel, entry.timestamp);
    await loadBackups();
  });

  // クリックでリストア
  li.addEventListener("click", async () => {
    try {
      const res = await chrome.tabs.sendMessage(currentTab.id, {
        type: "RESTORE",
        selector,
        value: entry.value,
      });
      if (res?.ok) {
        showStatus("復元しました");
      } else {
        showError("復元先の要素が見つかりません");
      }
    } catch (_) {
      showError("ページと通信できませんでした");
    }
  });

  li.appendChild(timeEl);
  li.appendChild(previewEl);
  li.appendChild(delBtn);
  return li;
}

// ---- ユーティリティ ----

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);

  if (diffMin < 1) return "今すぐ";
  if (diffMin < 60) return `${diffMin}分前`;
  if (diffH < 24) return `${diffH}時間前`;

  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${min}`;
}

function showStatus(msg) {
  const el = document.getElementById("status-msg");
  el.textContent = msg;
  el.classList.remove("hidden", "error");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add("hidden"), 3000);
}

function showError(msg) {
  const el = document.getElementById("status-msg");
  el.textContent = msg;
  el.classList.remove("hidden");
  el.classList.add("error");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add("hidden"), 4000);
}

init();
