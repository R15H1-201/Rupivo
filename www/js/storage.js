/**
 * storage.js — the ONLY file that touches localStorage.
 *
 *   rupivo.data.v1   -> your money data (plain JSON wrapper, or AES-GCM envelope if a passcode is set)
 *   rupivo.prefs.v1  -> non-sensitive UI prefs (theme, last range). Always plain so the lock screen can be themed.
 */
(function (g) {
  'use strict';
  const MT = (g.MT = g.MT || {});
  const K = MT.config.storageKeys;

  const ls = () => {
    try {
      return g.localStorage;
    } catch (e) {
      return null;
    }
  };

  MT.storage = {
    read() {
      const s = ls();
      return s ? s.getItem(K.data) : null;
    },
    write(text) {
      const s = ls();
      if (!s) throw new Error('Browser storage is not available');
      s.setItem(K.data, text); // throws if quota is exceeded -> store.js reports it
    },
    clearData() {
      const s = ls();
      if (s) s.removeItem(K.data);
    },
    getPrefs() {
      try {
        return JSON.parse(ls().getItem(K.prefs)) || {};
      } catch (e) {
        return {};
      }
    },
    setPrefs(patch) {
      const next = Object.assign(MT.storage.getPrefs(), patch);
      try {
        ls().setItem(K.prefs, JSON.stringify(next));
      } catch (e) {
        /* prefs are optional */
      }
      return next;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
