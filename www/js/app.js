/**
 * app.js — start-up, router, theme, global event handling. Load this script LAST.
 *
 * Routes (hash based, so it works inside an Android WebView with no server):
 *   #/dashboard  #/transactions  #/accounts[/id]  #/people[/id]  #/reports  #/settings
 */
(function (g) {
  'use strict';
  const MT = (g.MT = g.MT || {});
  const U = MT.util;
  const C = MT.config;
  const ui = MT.ui;
  const icon = MT.icon;

  const NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: 'home' },
    { id: 'accounts', label: 'Accounts', icon: 'wallet' },
    { id: 'people', label: 'People', icon: 'users' },
    { id: 'reports', label: 'Reports', icon: 'chart' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];
  const $ = (id) => document.getElementById(id);
  let started = false;
  let hiddenAt = 0;

  /* ------------------------------------------------------------------ theme */
  const mq = g.matchMedia ? g.matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme() {
    const pref = MT.storage.getPrefs().theme || 'system';
    const dark = pref === 'dark' || (pref === 'system' && mq && mq.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = dark ? '#0b1020' : '#f5f7fb';
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', applyTheme);

  /* ----------------------------------------------------------------- router */
  function parseRoute() {
    const parts = (location.hash || '#/dashboard').replace(/^#\/?/, '').split('/');
    const id = MT.views[parts[0]] ? parts[0] : 'dashboard';
    return { id: id, param: parts[1] ? decodeURIComponent(parts[1]) : '' };
  }

  function render() {
    if (!started) return;
    const r = parseRoute();
    const view = MT.views[r.id];
    const main = $('view');
    const scroll = main.dataset.route === r.id + '/' + r.param ? g.scrollY : 0;
    main.innerHTML = view.render(r.param);
    main.dataset.route = r.id + '/' + r.param;
    main.classList.remove('enter');
    void main.offsetWidth; // restart the fade-in animation
    main.classList.add('enter');
    g.scrollTo(0, scroll);
    const section = r.id === 'transactions' ? 'dashboard' : r.id;
    document.querySelectorAll('[data-nav]').forEach((a) => {
      const on = a.dataset.nav === section;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.title = view.title + ' · ' + C.appName;
    const lockBtn = $('lock-now');
    if (lockBtn) lockBtn.hidden = !MT.store.encrypted;
  }

  /* ----------------------------------------------------------------- events */
  document.addEventListener('click', (e) => {
    const fab = $('fab-menu');
    if (fab && !fab.hidden && !e.target.closest('#fab-menu') && !e.target.closest('#fab')) closeFab();
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = MT.actions[el.dataset.action];
    if (fn) {
      e.preventDefault();
      closeFab();
      Promise.resolve(fn(el, e)).catch((err) => ui.toast(err.message || 'Something went wrong', 'error'));
    }
  });
  const textual = (el) => el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search)$/.test(el.type));
  document.addEventListener('input', (e) => {
    const el = e.target.closest && e.target.closest('[data-change]');
    if (el && textual(el) && MT.changes[el.dataset.change]) MT.changes[el.dataset.change](el, e);
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest && e.target.closest('[data-change]');
    if (el && !textual(el) && MT.changes[el.dataset.change]) Promise.resolve(MT.changes[el.dataset.change](el, e)).catch((err) => ui.toast(err.message, 'error'));
  });

  /* ------------------------------------------------------------- FAB / menu */
  function closeFab() {
    const m = $('fab-menu');
    if (m && !m.hidden) {
      m.hidden = true;
      $('fab').classList.remove('open');
      $('fab').setAttribute('aria-expanded', 'false');
    }
  }
  MT.actions['fab'] = () => {
    const m = $('fab-menu');
    const open = m.hidden;
    m.hidden = !open;
    $('fab').classList.toggle('open', open);
    $('fab').setAttribute('aria-expanded', String(open));
  };
  MT.actions['toggle-theme'] = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    MT.app.setTheme(dark ? 'light' : 'dark');
    if (parseRoute().id === 'settings') render();
  };
  MT.actions['lock-now'] = () => MT.app.lock();

  /* ------------------------------------------------------------------ lock */
  async function lockNow() {
    if (!(await MT.store.lock())) return;
    $('app').hidden = true;
    started = false;
    await MT.lock.show('locked');
    $('lock').innerHTML = '';
    $('app').hidden = false;
    started = true;
    render();
    MT.sms.autoSync();
  }

  /* ------------------------------------------------------------------- boot */
  function buildChrome() {
    const link = (n, cls) => '<a href="#/' + n.id + '" data-nav="' + n.id + '" class="' + cls + '">' + icon(n.icon, 20) + '<span>' + n.label + '</span></a>';
    $('sidebar-nav').innerHTML = NAV.map((n) => link(n, 'nav-link')).join('');
    $('bottom-nav').innerHTML = NAV.map((n) => link(n, 'bn-link')).join('');
    $('fab-menu').innerHTML = ['expense', 'income', 'given', 'received', 'transfer']
      .map((k) => '<button type="button" class="fab-item c-' + C.txTypes[k].color + '" data-action="add-tx" data-type="' + k + '">' + icon(C.txTypes[k].icon, 18) + '<span>' + (C.txTypes[k].long || C.txTypes[k].label) + '</span></button>')
      .join('');
    $('fab').innerHTML = icon('plus', 26);
    $('lock-now').innerHTML = icon('lock', 20);
    document.querySelector('[data-action=toggle-theme]').innerHTML = icon('moon', 20);
  }

  async function boot() {
    applyTheme();
    buildChrome();
    MT.store.onSaveError(() => ui.toast('Could not save — device storage may be full', 'error'));
    const status = await MT.store.init();
    if (status !== 'ready') await MT.lock.show(status);
    $('lock').hidden = true;
    $('lock').innerHTML = '';
    $('app').hidden = false;
    started = true;
    MT.store.subscribe(render);
    g.addEventListener('hashchange', () => {
      closeFab();
      render();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (MT.store.encrypted && hiddenAt && Date.now() - hiddenAt > C.autoLockSeconds * 1000) lockNow();
      else if (!document.hidden) MT.sms.autoSync().then((r) => r && r.imported && ui.toast('Imported ' + r.imported + ' bank transaction' + (r.imported === 1 ? '' : 's'), 'ok'));
    });
    render();
    MT.sms.autoSync().then((r) => r && r.imported && ui.toast('Imported ' + r.imported + ' bank transaction' + (r.imported === 1 ? '' : 's'), 'ok'));
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !g.Capacitor) navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  MT.app = {
    render: render,
    lock: lockNow,
    setTheme(t) {
      MT.storage.setPrefs({ theme: t });
      applyTheme();
    },
    boot: boot,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
