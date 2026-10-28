/**
 * utils.js — small helpers with no knowledge of the app's data.
 */
(function (g) {
  'use strict';
  const MT = (g.MT = g.MT || {});
  const C = MT.config;
  const U = (MT.util = {});

  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  U.MON = MON;

  /* ---------- ids & text ---------- */
  U.uid = (prefix) => (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  U.esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  U.round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

  U.parseAmount = (v) => {
    const n = Number(String(v == null ? '' : v).replace(/[,\s]/g, ''));
    return isFinite(n) ? U.round2(n) : NaN;
  };

  U.debounce = (fn, ms) => {
    let t;
    return function () {
      const a = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, a), ms);
    };
  };

  /* ---------- money ---------- */
  let symbol = '₹';
  let code = 'INR';
  let nf = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  U.setCurrency = (c) => {
    code = C.currencies[c] ? c : 'INR';
    symbol = C.currencies[code];
    nf = new Intl.NumberFormat(code === 'INR' ? 'en-IN' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };
  U.symbol = () => symbol;

  /** U.money(-250) -> "−₹250" ; U.money(250,{sign:true}) -> "+₹250" */
  U.money = (n, opts) => {
    const v = U.round2(n);
    const sign = v < 0 ? '−' : opts && opts.sign && v > 0 ? '+' : '';
    return sign + symbol + nf.format(Math.abs(v));
  };

  U.compact = (n) => {
    const a = Math.abs(n);
    const s = n < 0 ? '-' : '';
    const f = (x, u) => s + (Math.round(x * 10) / 10).toString().replace(/\.0$/, '') + u;
    if (code === 'INR') {
      if (a >= 1e7) return f(a / 1e7, 'Cr');
      if (a >= 1e5) return f(a / 1e5, 'L');
    } else if (a >= 1e6) return f(a / 1e6, 'M');
    if (a >= 1e3) return f(a / 1e3, 'K');
    return s + Math.round(a);
  };

  /* ---------- dates (always plain 'YYYY-MM-DD' strings, no time zones) ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  U.pad = pad;
  const toISO = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  U.toISO = toISO;
  U.parseISO = (iso) => {
    const p = String(iso).split('-').map(Number);
    return { y: p[0], m: p[1], d: p[2] };
  };
  U.isISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
  U.today = () => toISO(new Date());
  U.addDays = (iso, n) => {
    const p = U.parseISO(iso);
    return toISO(new Date(p.y, p.m - 1, p.d + n));
  };
  U.monthRange = (iso) => {
    const p = U.parseISO(iso);
    const last = new Date(p.y, p.m, 0).getDate();
    return { from: p.y + '-' + pad(p.m) + '-01', to: p.y + '-' + pad(p.m) + '-' + pad(last) };
  };
  U.shiftMonth = (iso, n) => {
    const p = U.parseISO(iso);
    return toISO(new Date(p.y, p.m - 1 + n, 1));
  };
  U.fmtDate = (iso) => {
    if (!iso) return '';
    const t = U.today();
    if (iso === t) return 'Today';
    if (iso === U.addDays(t, -1)) return 'Yesterday';
    const p = U.parseISO(iso);
    return p.d + ' ' + MON[p.m - 1] + ' ' + p.y;
  };
  U.monthLabel = (key) => MON[+key.slice(5, 7) - 1] + ' ' + key.slice(0, 4);

  /* ---------- files ---------- */
  U.csv = (rows) =>
    rows
      .map((r) =>
        r
          .map((c) => {
            const s = String(c == null ? '' : c);
            return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
          })
          .join(',')
      )
      .join('\r\n');

  /**
   * Save/share a text file. In a browser it downloads; inside the Android app
   * (Capacitor) it writes to cache and opens the share sheet, because WebViews
   * can't download blobs. Needs @capacitor/filesystem + @capacitor/share installed.
   */
  U.saveFile = async (name, text, mime) => {
    const cap = g.Capacitor;
    const plugins = cap && cap.Plugins;
    const native = cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform();
    if (native && plugins && plugins.Filesystem && plugins.Share) {
      const w = await plugins.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
      await plugins.Share.share({ title: name, url: w.uri });
      return;
    }
    const blob = new Blob([text], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  U.readFileText = (file) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(new Error('Could not read the file'));
      r.readAsText(file);
    });
})(typeof window !== 'undefined' ? window : globalThis);
