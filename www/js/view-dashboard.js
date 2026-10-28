/**
 * view-dashboard.js — Dashboard (#/dashboard) and full transaction history (#/transactions).
 */
(function (g) {
  'use strict';
  const MT = (g.MT = g.MT || {});
  const U = MT.util;
  const C = MT.config;
  const ui = MT.ui;
  const esc = U.esc;
  const icon = MT.icon;
  const V = MT.views;

  /* ================================================================ DASHBOARD */
  function dashRange() {
    return MT.storage.getPrefs().dashRange === 'all' ? 'all' : 'month';
  }

  V.dashboard = {
    title: 'Dashboard',
    render() {
      const st = MT.store;
      const range = dashRange();
      const r = range === 'month' ? U.monthRange(U.today()) : { from: null, to: null };
      const tot = st.totals(r.from, r.to);
      const bt = st.balancesByType();
      const bal = st.balances();
      const pt = st.peopleTotals();
      const when = range === 'month' ? 'This month' : 'All time';
      const recent = st.queryTx({}).slice(0, 8);

      const stat = (ic, color, label, value, href) =>
        '<' + (href ? 'a href="' + href + '"' : 'div') + ' class="stat card' + (href ? ' link' : '') + '"><span class="stat-ic c-' + color + '">' + icon(ic, 18) + '</span>' +
        '<span class="stat-l">' + esc(label) + '</span><b class="stat-v">' + esc(value) + '</b></' + (href ? 'a' : 'div') + '>';

      return (
        '<div class="page-head"><div><h2 class="page-title">Dashboard</h2><p class="muted">Your money at a glance</p></div>' +
        ui.seg('dash-range', [{ value: 'month', label: 'This month' }, { value: 'all', label: 'All time' }], range) + '</div>' +

        '<section class="hero card"><span class="hero-l">Total balance</span><div class="hero-v">' + esc(U.money(st.totalBalance())) + '</div>' +
        '<div class="chips">' +
        Object.keys(C.accountTypes).map((k) => '<span class="chip">' + icon(C.accountTypes[k].icon, 14) + esc(C.accountTypes[k].label) + ' <b>' + esc(U.money(bt[k])) + '</b></span>').join('') +
        '</div></section>' +

        '<section class="cards">' +
        stat('arrowDown', 'income', 'Income · ' + when, U.money(tot.income)) +
        stat('arrowUp', 'expense', 'Expenses · ' + when, U.money(tot.expense)) +
        stat('send', 'given', 'Money given · ' + when, U.money(tot.given)) +
        stat('inbox', 'received', 'Money received · ' + when, U.money(tot.received)) +
        stat('users', 'income', 'To collect from people', U.money(pt.toCollect), '#/people') +
        stat('users', 'expense', 'You owe people', U.money(pt.toPay), '#/people') +
        '</section>' +

        '<section><h3 class="sec-title">Quick entry</h3><div class="quick">' +
        ['expense', 'income', 'given', 'received', 'transfer']
          .map((k) => '<button type="button" class="quick-btn c-' + C.txTypes[k].color + '" data-action="add-tx" data-type="' + k + '"><span>' + icon(C.txTypes[k].icon, 20) + '</span>' + esc(C.txTypes[k].long || C.txTypes[k].label) + '</button>')
          .join('') + '</div></section>' +

        '<section><div class="sec-head"><h3 class="sec-title">Accounts</h3><a class="link-btn" href="#/accounts">Manage</a></div>' +
        (st.state.accounts.length
          ? '<div class="acc-strip">' +
            st.state.accounts
              .map((a) => '<a class="mini-acc card link" href="#/accounts/' + esc(a.id) + '"><span class="mini-ic">' + icon(C.accountTypes[a.type].icon, 18) + '</span><small>' + esc(a.name) + '</small><b>' + esc(U.money(bal[a.id])) + '</b></a>').join('') +
            '</div>'
          : ui.empty('wallet', 'No accounts yet', 'Add your cash, UPI or bank accounts to start tracking.', '<button class="btn primary" data-action="add-account">Add account</button>')) +
        '</section>' +

        '<section><div class="sec-head"><h3 class="sec-title">Recent transactions</h3>' + (recent.length ? '<a class="link-btn" href="#/transactions">View all</a>' : '') + '</div><div class="card flush">' +
        ui.txList(recent, { empty: ui.empty('list', 'No transactions yet', 'Tap the + button to record your first income or expense.', '<button class="btn primary" data-action="add-tx" data-type="expense">Add transaction</button>') }) +
        '</div></section>'
      );
    },
  };

  MT.actions['dash-range'] = (el) => {
    MT.storage.setPrefs({ dashRange: el.dataset.value });
    MT.app.render();
  };

  /* ============================================================== TRANSACTIONS */
  const filt = { q: '', type: '', accountId: '', from: '', to: '' };
  let limit = 100;

  function results() {
    const st = MT.store;
    const all = st.queryTx(filt);
    const shown = all.slice(0, limit);
    const out = all.reduce((s, t) => s + (t.type === 'expense' ? t.amount : 0), 0);
    const inn = all.reduce((s, t) => s + (t.type === 'income' ? t.amount : 0), 0);
    return (
      '<p class="muted result-sum">' + all.length + ' transaction' + (all.length === 1 ? '' : 's') +
      (all.length ? ' · Income ' + esc(U.money(inn)) + ' · Expenses ' + esc(U.money(out)) : '') + '</p>' +
      '<div class="card flush">' +
      ui.txList(shown, { group: true, empty: ui.empty('search', st.state.transactions.length ? 'Nothing matches' : 'No transactions yet', st.state.transactions.length ? 'Try changing or clearing the filters.' : 'Tap + to add your first one.') }) +
      '</div>' +
      (all.length > shown.length ? '<div class="center"><button class="btn ghost" data-action="more-tx">Show more (' + (all.length - shown.length) + ' left)</button></div>' : '')
    );
  }

  V.transactions = {
    title: 'Transactions',
    render() {
      const st = MT.store;
      return (
        '<div class="page-head"><div><a class="back" href="#/dashboard">' + icon('back', 16) + ' Dashboard</a><h2 class="page-title">Transaction history</h2></div>' +
        '<button class="btn primary" data-action="add-tx">' + icon('plus', 16) + ' Add</button></div>' +
        '<div class="filters card">' +
        '<label class="search">' + icon('search', 16) + '<input type="search" data-change="tx-filter" data-key="q" placeholder="Search notes, categories, people…" value="' + esc(filt.q) + '"></label>' +
        '<select data-change="tx-filter" data-key="type" aria-label="Type"><option value="">All types</option>' +
        Object.keys(C.txTypes).map((k) => '<option value="' + k + '"' + (filt.type === k ? ' selected' : '') + '>' + esc(C.txTypes[k].long || C.txTypes[k].label) + '</option>').join('') + '</select>' +
        '<select data-change="tx-filter" data-key="accountId" aria-label="Account"><option value="">All accounts</option>' +
        st.state.accounts.map((a) => '<option value="' + esc(a.id) + '"' + (filt.accountId === a.id ? ' selected' : '') + '>' + esc(a.name) + '</option>').join('') + '</select>' +
        '<label class="date-f"><small>From</small><input type="date" data-change="tx-filter" data-key="from" value="' + esc(filt.from) + '"></label>' +
        '<label class="date-f"><small>To</small><input type="date" data-change="tx-filter" data-key="to" value="' + esc(filt.to) + '"></label>' +
        '<button type="button" class="btn ghost sm" data-action="tx-clear">Clear</button></div>' +
        '<div id="tx-results">' + results() + '</div>'
      );
    },
  };

  MT.changes['tx-filter'] = (el) => {
    filt[el.dataset.key] = el.value;
    limit = 100;
    document.getElementById('tx-results').innerHTML = results();
  };
  MT.actions['more-tx'] = () => {
    limit += 100;
    document.getElementById('tx-results').innerHTML = results();
  };
  MT.actions['tx-clear'] = () => {
    filt.q = filt.type = filt.accountId = filt.from = filt.to = '';
    limit = 100;
    MT.app.render();
  };
})(typeof window !== 'undefined' ? window : globalThis);
