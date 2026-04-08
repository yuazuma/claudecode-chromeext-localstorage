// shared/storage.js - content script と popup/options 共通のメッセージ送信ラッパー

const BackupStorage = (() => {
  function send(message) {
    return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
  }

  function makeStorageKey(origin, selector) {
    return `backup::${origin}::${selector}`;
  }

  function makeBackupKey(origin, selector) {
    return makeStorageKey(origin, selector);
  }

  return {
    saveBackup(origin, url, selector, value) {
      const key = makeBackupKey(origin, selector);
      return send({ type: "SAVE_BACKUP", payload: { key, origin, url, selector, value } });
    },

    getBackups(origin, selector) {
      const key = makeBackupKey(origin, selector);
      return send({ type: "GET_BACKUPS", key });
    },

    deleteBackup(origin, selector, timestamp) {
      const key = makeBackupKey(origin, selector);
      return send({ type: "DELETE_BACKUP", key, timestamp });
    },

    getAllBackups() {
      return send({ type: "GET_ALL_BACKUPS" });
    },

    deleteAllBackups() {
      return send({ type: "DELETE_ALL_BACKUPS" });
    },

    getSettings() {
      return send({ type: "GET_SETTINGS" });
    },

    setSettings(settings) {
      return send({ type: "SET_SETTINGS", settings });
    },

    isSiteEnabled(origin) {
      return send({ type: "IS_SITE_ENABLED", origin });
    },

    setSiteEnabled(origin, enabled) {
      return send({ type: "SET_SITE_ENABLED", origin, enabled });
    },

    getAllSites() {
      return send({ type: "GET_ALL_SITES" });
    },

    deleteSite(origin) {
      return send({ type: "DELETE_SITE", origin });
    },

    exportAll() {
      return send({ type: "EXPORT_ALL" });
    },

    importAll(data, mode) {
      return send({ type: "IMPORT_ALL", data, mode });
    },

    makeStorageKey,
  };
})();
