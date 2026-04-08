// background.js - Service Worker (MV3)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_BACKUPS") {
    handleGetBackups(message.key).then(sendResponse);
    return true;
  }
  if (message.type === "SAVE_BACKUP") {
    handleSaveBackup(message.payload).then(sendResponse);
    return true;
  }
  if (message.type === "DELETE_BACKUP") {
    handleDeleteBackup(message.key, message.timestamp).then(sendResponse);
    return true;
  }
  if (message.type === "GET_ALL_BACKUPS") {
    handleGetAllBackups().then(sendResponse);
    return true;
  }
  if (message.type === "GET_SETTINGS") {
    handleGetSettings().then(sendResponse);
    return true;
  }
  if (message.type === "SET_SETTINGS") {
    handleSetSettings(message.settings).then(sendResponse);
    return true;
  }
  if (message.type === "IS_SITE_ENABLED") {
    handleIsSiteEnabled(message.origin).then(sendResponse);
    return true;
  }
  if (message.type === "SET_SITE_ENABLED") {
    handleSetSiteEnabled(message.origin, message.enabled).then(sendResponse);
    return true;
  }
  if (message.type === "GET_ALL_SITES") {
    handleGetAllSites().then(sendResponse);
    return true;
  }
  if (message.type === "DELETE_SITE") {
    handleDeleteSite(message.origin).then(sendResponse);
    return true;
  }
  if (message.type === "EXPORT_ALL") {
    handleExportAll().then(sendResponse);
    return true;
  }
  if (message.type === "IMPORT_ALL") {
    handleImportAll(message.data, message.mode).then(sendResponse);
    return true;
  }
  if (message.type === "DELETE_ALL_BACKUPS") {
    handleDeleteAllBackups().then(sendResponse);
    return true;
  }
});

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return settings || { maxCount: 50, maxDays: 30 };
}

async function handleGetSettings() {
  return await getSettings();
}

async function handleSetSettings(settings) {
  await chrome.storage.local.set({ settings });
  return { ok: true };
}

async function handleIsSiteEnabled(origin) {
  const { disabledSites } = await chrome.storage.local.get("disabledSites");
  const list = disabledSites || [];
  return { enabled: !list.includes(origin) };
}

async function handleSetSiteEnabled(origin, enabled) {
  const { disabledSites } = await chrome.storage.local.get("disabledSites");
  let list = disabledSites || [];
  if (enabled) {
    list = list.filter((o) => o !== origin);
  } else {
    if (!list.includes(origin)) list.push(origin);
  }
  await chrome.storage.local.set({ disabledSites: list });
  return { ok: true };
}

async function handleGetAllSites() {
  const { disabledSites } = await chrome.storage.local.get("disabledSites");
  const all = await chrome.storage.local.get(null);
  const siteSet = new Set();
  for (const key of Object.keys(all)) {
    if (key.startsWith("backup::")) {
      const origin = key.split("::")[1];
      if (origin) siteSet.add(origin);
    }
  }
  const list = disabledSites || [];
  return Array.from(siteSet).map((origin) => ({
    origin,
    enabled: !list.includes(origin),
  }));
}

async function handleDeleteSite(origin) {
  const all = await chrome.storage.local.get(null);
  const keysToRemove = Object.keys(all).filter((k) =>
    k.startsWith(`backup::${origin}::`)
  );
  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
  }
  const { disabledSites } = await chrome.storage.local.get("disabledSites");
  const list = (disabledSites || []).filter((o) => o !== origin);
  await chrome.storage.local.set({ disabledSites: list });
  return { ok: true };
}

async function handleGetBackups(key) {
  const { [key]: entries } = await chrome.storage.local.get(key);
  return entries || [];
}

async function handleSaveBackup({ key, origin, url, selector, value }) {
  const settings = await getSettings();
  // key は shared/storage.js で makeBackupKey() により既に "backup::origin::selector" 形式
  const storageKey = key;
  const { [storageKey]: existing } = await chrome.storage.local.get(storageKey);
  let entries = existing || [];

  // 重複チェック
  if (entries.length > 0 && entries[entries.length - 1].value === value) {
    return { ok: true, skipped: true };
  }

  const now = Date.now();
  entries.push({ timestamp: now, value, url, selector });

  // 保持ポリシー適用
  const cutoff = now - settings.maxDays * 24 * 60 * 60 * 1000;
  entries = entries.filter((e) => e.timestamp >= cutoff);
  if (entries.length > settings.maxCount) {
    entries = entries.slice(entries.length - settings.maxCount);
  }

  await chrome.storage.local.set({ [storageKey]: entries });
  return { ok: true, skipped: false };
}

async function handleDeleteBackup(storageKey, timestamp) {
  const { [storageKey]: existing } = await chrome.storage.local.get(storageKey);
  const entries = (existing || []).filter((e) => e.timestamp !== timestamp);
  if (entries.length === 0) {
    await chrome.storage.local.remove(storageKey);
  } else {
    await chrome.storage.local.set({ [storageKey]: entries });
  }
  return { ok: true };
}

async function handleGetAllBackups() {
  const all = await chrome.storage.local.get(null);
  const result = {};
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith("backup::")) {
      result[key] = value;
    }
  }
  return result;
}

async function handleDeleteAllBackups() {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith("backup::"));
  if (keys.length > 0) await chrome.storage.local.remove(keys);
  return { ok: true };
}

async function handleExportAll() {
  const all = await chrome.storage.local.get(null);
  const { settings } = await chrome.storage.local.get("settings");
  const { disabledSites } = await chrome.storage.local.get("disabledSites");
  const backups = {};
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith("backup::")) backups[key] = value;
  }
  return {
    version: 1,
    exportedAt: Date.now(),
    settings: settings || null,
    disabledSites: disabledSites || [],
    backups,
  };
}

async function handleImportAll(data, mode) {
  if (mode === "overwrite") {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter(
      (k) => k.startsWith("backup::") || k === "settings" || k === "disabledSites"
    );
    if (keys.length > 0) await chrome.storage.local.remove(keys);
  }

  const toSet = {};
  if (data.backups) {
    for (const [key, value] of Object.entries(data.backups)) {
      if (mode === "merge") {
        const { [key]: existing } = await chrome.storage.local.get(key);
        const merged = mergeEntries(existing || [], value);
        toSet[key] = merged;
      } else {
        toSet[key] = value;
      }
    }
  }
  if (data.settings) toSet["settings"] = data.settings;
  if (data.disabledSites) toSet["disabledSites"] = data.disabledSites;
  await chrome.storage.local.set(toSet);
  return { ok: true };
}

function mergeEntries(existing, incoming) {
  const map = new Map(existing.map((e) => [e.timestamp, e]));
  for (const e of incoming) {
    if (!map.has(e.timestamp)) map.set(e.timestamp, e);
  }
  return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
}
