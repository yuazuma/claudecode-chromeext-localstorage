// options.js

// ---- タブ切り替え ----

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((s) => s.classList.add("hidden"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove("hidden");
  });
});

// ---- バックアップ一覧タブ ----

let allBackupsCache = {};

async function loadBackupsTab() {
  allBackupsCache = await BackupStorage.getAllBackups();
  renderBackups(document.getElementById("search-input").value);
}

document.getElementById("search-input").addEventListener("input", (e) => {
  renderBackups(e.target.value);
});

function renderBackups(filter) {
  const container = document.getElementById("backups-container");
  const emptyMsg = document.getElementById("backups-empty");
  container.innerHTML = "";

  const q = filter.trim().toLowerCase();
  let count = 0;

  for (const [storageKey, entries] of Object.entries(allBackupsCache)) {
    const parts = storageKey.split("::");
    const origin = parts[1] || "";
    const selector = parts.slice(2).join("::") || "";

    const filtered = q
      ? entries.filter(
          (e) =>
            e.value.toLowerCase().includes(q) ||
            origin.toLowerCase().includes(q) ||
            selector.toLowerCase().includes(q) ||
            (e.url || "").toLowerCase().includes(q)
        )
      : entries;

    if (filtered.length === 0) continue;
    count++;

    const group = document.createElement("div");
    group.className = "backup-group";

    const header = document.createElement("div");
    header.className = "backup-group-header";

    const headerInfo = document.createElement("div");
    const originEl = document.createElement("div");
    originEl.className = "backup-group-origin";
    originEl.textContent = origin;
    const selectorEl = document.createElement("div");
    selectorEl.className = "backup-group-selector";
    selectorEl.textContent = selector;
    headerInfo.appendChild(originEl);
    headerInfo.appendChild(selectorEl);

    const delGroupBtn = document.createElement("button");
    delGroupBtn.className = "btn btn-danger";
    delGroupBtn.style.fontSize = "12px";
    delGroupBtn.style.padding = "4px 10px";
    delGroupBtn.textContent = "全削除";
    delGroupBtn.addEventListener("click", async () => {
      if (!confirm(`「${selector}」のバックアップをすべて削除しますか？`)) return;
      for (const e of entries) {
        await BackupStorage.deleteBackup(origin, selector, e.timestamp);
      }
      await loadBackupsTab();
    });

    header.appendChild(headerInfo);
    header.appendChild(delGroupBtn);
    group.appendChild(header);

    const table = document.createElement("table");
    table.className = "backup-entries-table";
    table.innerHTML = `<thead><tr>
      <th class="col-time">日時</th>
      <th class="col-preview">内容</th>
      <th class="col-url">URL</th>
      <th class="col-action"></th>
    </tr></thead>`;
    const tbody = document.createElement("tbody");

    const sorted = [...filtered].sort((a, b) => b.timestamp - a.timestamp);
    for (const entry of sorted) {
      const tr = document.createElement("tr");

      const tdTime = document.createElement("td");
      tdTime.className = "col-time";
      tdTime.textContent = formatDateTime(entry.timestamp);

      const tdPreview = document.createElement("td");
      tdPreview.className = "col-preview";
      const previewSpan = document.createElement("span");
      previewSpan.className = "preview-text";
      previewSpan.textContent = entry.value.replace(/\n/g, " ");
      previewSpan.title = entry.value;
      tdPreview.appendChild(previewSpan);

      const tdUrl = document.createElement("td");
      tdUrl.className = "col-url";
      tdUrl.textContent = entry.url || "";
      tdUrl.title = entry.url || "";

      const tdAction = document.createElement("td");
      tdAction.className = "col-action";
      const delBtn = document.createElement("button");
      delBtn.className = "btn-del-entry";
      delBtn.textContent = "×";
      delBtn.title = "削除";
      delBtn.addEventListener("click", async () => {
        await BackupStorage.deleteBackup(origin, selector, entry.timestamp);
        await loadBackupsTab();
      });
      tdAction.appendChild(delBtn);

      tr.appendChild(tdTime);
      tr.appendChild(tdPreview);
      tr.appendChild(tdUrl);
      tr.appendChild(tdAction);
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    group.appendChild(table);
    container.appendChild(group);
  }

  if (count === 0) {
    emptyMsg.classList.remove("hidden");
  } else {
    emptyMsg.classList.add("hidden");
  }
}

document.getElementById("btn-delete-all").addEventListener("click", async () => {
  if (!confirm("すべてのバックアップを削除しますか？この操作は元に戻せません。")) return;
  await BackupStorage.deleteAllBackups();
  await loadBackupsTab();
});

// ---- サイト管理タブ ----

async function loadSitesTab() {
  const sites = await BackupStorage.getAllSites();
  const tbody = document.getElementById("sites-tbody");
  const table = document.getElementById("sites-table");
  const emptyMsg = document.getElementById("sites-empty");
  tbody.innerHTML = "";

  if (sites.length === 0) {
    table.classList.add("hidden");
    emptyMsg.classList.remove("hidden");
    return;
  }

  table.classList.remove("hidden");
  emptyMsg.classList.add("hidden");

  for (const site of sites) {
    const tr = document.createElement("tr");

    const tdOrigin = document.createElement("td");
    tdOrigin.textContent = site.origin;

    const tdEnabled = document.createElement("td");
    const label = document.createElement("label");
    label.className = "toggle-small";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = site.enabled;
    checkbox.addEventListener("change", async () => {
      await BackupStorage.setSiteEnabled(site.origin, checkbox.checked);
    });
    const slider = document.createElement("span");
    slider.className = "slider-small";
    label.appendChild(checkbox);
    label.appendChild(slider);
    tdEnabled.appendChild(label);

    const tdAction = document.createElement("td");
    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-danger";
    delBtn.style.fontSize = "12px";
    delBtn.style.padding = "4px 10px";
    delBtn.textContent = "削除";
    delBtn.addEventListener("click", async () => {
      if (!confirm(`「${site.origin}」のすべてのデータを削除しますか？`)) return;
      await BackupStorage.deleteSite(site.origin);
      await loadSitesTab();
    });
    tdAction.appendChild(delBtn);

    tr.appendChild(tdOrigin);
    tr.appendChild(tdEnabled);
    tr.appendChild(tdAction);
    tbody.appendChild(tr);
  }
}

// ---- 全般設定タブ ----

async function loadGeneralTab() {
  const settings = await BackupStorage.getSettings();
  document.getElementById("max-count").value = settings.maxCount;
  document.getElementById("max-days").value = settings.maxDays;
}

document.getElementById("btn-save-settings").addEventListener("click", async () => {
  const maxCount = parseInt(document.getElementById("max-count").value, 10);
  const maxDays = parseInt(document.getElementById("max-days").value, 10);
  if (!maxCount || !maxDays || maxCount < 1 || maxDays < 1) {
    showInlineMsg("settings-saved", "無効な値です", true);
    return;
  }
  await BackupStorage.setSettings({ maxCount, maxDays });
  showInlineMsg("settings-saved", "保存しました", false);
});

// ---- エクスポート ----

document.getElementById("btn-export").addEventListener("click", async () => {
  const data = await BackupStorage.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `textarea-backup-${formatDateForFile(Date.now())}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// ---- インポート ----

document.getElementById("import-merge").addEventListener("change", (e) =>
  handleImport(e, "merge")
);
document.getElementById("import-overwrite").addEventListener("change", (e) =>
  handleImport(e, "overwrite")
);

async function handleImport(e, mode) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = "";

  const modeLabel = mode === "merge" ? "マージ" : "上書き";
  if (!confirm(`バックアップデータを${modeLabel}インポートしますか？`)) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.version || !data.backups) throw new Error("invalid format");
    await BackupStorage.importAll(data, mode);
    showInlineMsg("import-msg", `${modeLabel}インポートが完了しました`, false);
    await loadBackupsTab();
    await loadSitesTab();
  } catch (_) {
    showInlineMsg("import-msg", "インポートに失敗しました（形式が正しくありません）", true);
  }
}

// ---- ユーティリティ ----

function formatDateTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDateForFile(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function showInlineMsg(id, msg, isError) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove("hidden", "error");
  if (isError) el.classList.add("error");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add("hidden"), 4000);
}

// ---- 初期ロード ----

loadBackupsTab();
loadSitesTab();
loadGeneralTab();
