/**
 * ui.js — shared UI building blocks: modals, confirm dialog, toasts,
 * transaction rows, empty states, and the action registries.
 *
 * Event wiring convention (see app.js):
 *   <button data-action="add-tx" data-type="income">   -> MT.actions['add-tx'](element, event)
 *   <select data-change="currency">                     -> MT.changes['currency'](element, event)
 * Each module registers its own handlers in MT.actions / MT.changes.
 */
(function (g) {
  'use strict';
  const MT = (g.MT = g.MT || {});
  const U = MT.util;
  const C = MT.config;
  const esc = U.esc;
  const icon = MT.icon;

  MT.actions = {};
  MT.changes = {};
  MT.views = {};
  const ui = (MT.ui = {});
  const stack = [];

  /* ------------------------------------------------------------------ modal */
  ui.modal = function (title, bodyHtml, opts) {
    opts = opts || {};
    const wrap = document.createElement('div');
    wrap.className = 'overlay';
    wrap.innerHTML =
      '<div class="modal ' + (opts.size || '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<div class="modal-head"><h3>' + esc(title) + '</h3><button type="button" class="icon-btn" data-close aria-label="Close">' + icon('x') + '</button></div>' +
      '<div class="modal-body">' + bodyHtml + '</div></div>';
    wrap.addEventListener('mousedown', (e) => {
      if (e.target === wrap) ui.closeModal(wrap);
    });
    document.getElementById('modal-root').appendChild(wrap);
    stack.push(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    if (!opts.noFocus) {
      const first = wrap.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=file]),textarea,select');
      if (first) setTimeout(() => first.focus(), 60);
    }
    return wrap;
  };

  ui.closeModal = function (el) {
    const w = el || stack[stack.length - 1];
    if (!w) return;
    const i = stack.indexOf(w);
    if (i === -1) return;
    stack.splice(i, 1);
    w.classList.remove('open');
    setTimeout(() => w.remove(), 180);
    if (w._onClose) w._onClose();
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') ui.closeModal();
  });
  document.addEventListener('click', (e) => {
    const c = e.target.closest && e.target.closest('[data-close]');
    if (c) ui.closeModal(c.closest('.overlay'));
  });

  /**
   * Promise<boolean>. opts: {title, message, confirmText, danger, typeToConfirm}
   * typeToConfirm: user must type that word before the button enables (used for reset).
   */
  ui.confirm = function (opts) {
    return new Promise((resolve) => {
      const typed = opts.typeToConfirm;
      const el = ui.modal(
        opts.title || 'Are you sure?',
        '<p class="confirm-msg">' + esc(opts.message || '') + '</p>' +
          (typed ? '<label class="field"><span>Type <b>' + esc(typed) + '</b> to confirm</span><input data-typed autocomplete="off"></label>' : '') +
          '<div class="modal-actions"><button type="button" class="btn ghost" data-close>Cancel</button>' +
          '<button type="button" class="btn ' + (opts.danger ? 'danger' : 'primary') + '" data-ok' + (typed ? ' disabled' : '') + '>' + esc(opts.confirmText || 'Confirm') + '</button></div>',
        { size: 'sm', noFocus: !!typed }
      );
      let done = false;
      const finish = (v) => {
        if (!done) {
          done = true;
          resolve(v);
        }
      };
      el._onClose = () => finish(false);
      const ok = el.querySelector('[data-ok]');
      if (typed) {
        const inp = el.querySelector('[data-typed]');
        inp.addEventListener('input', () => (ok.disabled = inp.value.trim() !== typed));
        setTimeout(() => inp.focus(), 60);
      }
      ok.addEventListener('click', () => {
        finish(true);
        ui.closeModal(el);
      });
    });
  };

  /* ------------------------------------------------------------------ toast */
  ui.toast = function (msg, kind) {
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.getElementById('toast-root').appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 250);
    }, kind === 'error' ? 4500 : 2600);
  };

  /* ----------------------------------------------------------- shared pieces */
  ui.empty = function (iconName, title, text, actionHtml) {
    return (
      '<div class="empty"><div class="empty-ic">' + icon(iconName, 28) + '</div><h4>' + esc(title) + '</h4><p>' + esc(text) + '</p>' + (actionHtml || '') + '</div>'
    );
  };

  /** One transaction row. ctx.accountId makes transfers show +/- relative to that account. */
  ui.txRow = function (t, ctx) {
    const st = MT.store;
    const meta = C.txTypes[t.type];
    const acc = st.getAccount(t.accountId);
    const to = st.getAccount(t.toAccountId);
    const per = st.getPerson(t.personId);
    let title;
    if (t.type === 'transfer') title = (acc ? acc.name : 'Deleted account') + ' → ' + (to ? to.name : 'Deleted account');
    else if (t.type === 'given') title = 'Given to ' + (per ? per.name : 'someone');
    else if (t.type === 'received') title = 'Received from ' + (per ? per.name : 'someone');
    else title = t.category || meta.label;
    const sub = [];
    if (t.type === 'given' || t.type === 'received') if (t.category) sub.push(t.category);
    if (t.type !== 'transfer' && acc) sub.push(acc.name);
    sub.push(U.fmtDate(t.date));
    if (t.note) sub.push(t.note);
    let amount;
    if (t.type === 'transfer' && ctx && ctx.accountId) {
      const e = st.effect(t, ctx.accountId);
      amount = U.money(e, { sign: true });
    } else if (t.type === 'transfer') amount = U.money(t.amount);
    else amount = U.money(meta.sign * t.amount, { sign: true });
    return (
      '<li class="tx"><button type="button" class="tx-main" data-action="edit-tx" data-id="' + esc(t.id) + '">' +
      '<span class="tx-ic c-' + meta.color + '">' + icon(meta.icon, 18) + '</span>' +
      '<span class="tx-text"><b>' + esc(title) + (t.source === 'sms' ? ' <em class="badge">SMS</em>' : '') + '</b><small>' + esc(sub.join(' • ')) + '</small></span>' +
      '<span class="amt c-' + meta.color + '">' + esc(amount) + '</span></button>' +
      '<button type="button" class="icon-btn subtle" data-action="delete-tx" data-id="' + esc(t.id) + '" aria-label="Delete transaction">' + icon('trash', 17) + '</button></li>'
    );
  };

  /** List of rows, optionally grouped under date headings. */
  ui.txList = function (list, o) {
    o = o || {};
    if (!list.length) return o.empty || '';
    if (!o.group) return '<ul class="tx-list">' + list.map((t) => ui.txRow(t, o.ctx)).join('') + '</ul>';
    let html = '';
    let day = null;
    list.forEach((t) => {
      if (t.date !== day) {
        if (day !== null) html += '</ul>';
        day = t.date;
        html += '<h4 class="day">' + esc(U.fmtDate(t.date)) + '</h4><ul class="tx-list">';
      }
      html += ui.txRow(t, o.ctx);
    });
    return html + '</ul>';
  };

  ui.seg = function (name, items, current, attr) {
    return (
      '<div class="seg" role="group">' +
      items
        .map((it) => '<button type="button" class="seg-btn' + (it.value === current ? ' active' : '') + '" data-action="' + name + '" data-value="' + esc(it.value) + '"' + (attr || '') + '>' + esc(it.label) + '</button>')
        .join('') +
      '</div>'
    );
  };

  ui.go = (hash) => {
    if (location.hash === hash) MT.app.render();
    else location.hash = hash;
  };
})(typeof window !== 'undefined' ? window : globalThis);
