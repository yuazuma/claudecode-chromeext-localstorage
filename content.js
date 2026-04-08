// content.js - ページに注入されるスクリプト

const ORIGIN = location.origin;

// ---- セレクター生成 ----

function getSelector(el) {
  if (el.id) return `#${CSS.escape(el.id)}`;

  const parts = [];
  let node = el;
  while (node && node !== document.body) {
    let part = node.tagName.toLowerCase();
    if (node.id) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      break;
    }
    const siblings = node.parentElement
      ? Array.from(node.parentElement.children).filter(
          (c) => c.tagName === node.tagName
        )
      : [];
    if (siblings.length > 1) {
      const idx = siblings.indexOf(node) + 1;
      part += `:nth-of-type(${idx})`;
    }
    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.join(" > ");
}

// ---- 対象要素の判定 ----

function isTarget(el) {
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea") return true;
  if (tag === "input" && el.type === "text") return true;
  if (el.isContentEditable) return true;
  return false;
}

function getValue(el) {
  if (el.isContentEditable) return el.innerText;
  return el.value;
}

function setValue(el, text) {
  if (el.isContentEditable) {
    el.focus();
    el.innerText = text;
    // React 等の仮想DOMに変更を伝える
    el.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    el.focus();
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      el.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value"
    ).set;
    nativeInputValueSetter.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

// ---- サイト有効確認キャッシュ ----

let siteEnabled = null;

async function checkSiteEnabled() {
  const result = await BackupStorage.isSiteEnabled(ORIGIN);
  siteEnabled = result.enabled;
  return siteEnabled;
}

// ---- blur イベントによる自動バックアップ ----

async function onBlur(e) {
  const el = e.target;
  if (!isTarget(el)) return;
  if (siteEnabled === null) await checkSiteEnabled();
  if (!siteEnabled) return;

  const value = getValue(el);
  if (!value.trim()) return;

  const selector = getSelector(el);
  const url = location.href.split("?")[0];
  await BackupStorage.saveBackup(ORIGIN, url, selector, value);
}

document.addEventListener("blur", onBlur, true);

// ---- メッセージ受信（popup から） ----

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "MANUAL_SAVE") {
    handleManualSave().then(sendResponse);
    return true;
  }
  if (message.type === "RESTORE") {
    handleRestore(message.selector, message.value).then(sendResponse);
    return true;
  }
  if (message.type === "SITE_ENABLED_CHANGED") {
    siteEnabled = message.enabled;
    sendResponse({ ok: true });
  }
  if (message.type === "GET_PAGE_ELEMENTS") {
    sendResponse(getPageElements());
  }
});

async function handleManualSave() {
  if (siteEnabled === null) await checkSiteEnabled();
  if (!siteEnabled) return { ok: false, reason: "disabled" };

  const url = location.href.split("?")[0];
  const results = [];
  const targets = document.querySelectorAll(
    'textarea, input[type="text"], [contenteditable="true"], [contenteditable=""]'
  );

  for (const el of targets) {
    const value = getValue(el);
    if (!value.trim()) continue;
    const selector = getSelector(el);
    const res = await BackupStorage.saveBackup(ORIGIN, url, selector, value);
    results.push({ selector, skipped: res.skipped });
  }
  return { ok: true, results };
}

async function handleRestore(selector, value) {
  let el = null;
  try {
    el = document.querySelector(selector);
  } catch (_) {}
  if (!el) return { ok: false, reason: "element not found" };
  setValue(el, value);
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  return { ok: true };
}

function getPageElements() {
  const url = location.href.split("?")[0];
  const targets = document.querySelectorAll(
    'textarea, input[type="text"], [contenteditable="true"], [contenteditable=""]'
  );
  const elements = [];
  for (const el of targets) {
    elements.push({
      selector: getSelector(el),
      storageKey: BackupStorage.makeStorageKey(ORIGIN, getSelector(el)),
      url,
      origin: ORIGIN,
    });
  }
  return { elements, url, origin: ORIGIN };
}

// 初期化
checkSiteEnabled();
