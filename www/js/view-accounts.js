/**
 * view-accounts.js — Accounts list (#/accounts) and a single account's detail (#/accounts/<id>).
 */
(function (g) {
  'use strict';
  const MT = (g.MT = g.MT || {});
  const U = MT.util;
  const C = MT.config;
  const ui = MT.ui;
  const esc = U.esc;
  const icon = MT.icon;

  function subtitle(a) {
    const parts = [C.accountTypes[a.type].label];
    if (a.provider) parts.push(a.provider + (a.type === 'upi' && a.providerKind ? (a.providerKind === 'app' ? ' (app)' : ' (bank)') : ''));
    return parts.join(' • ');
  }

  function list() {
    const st = MT.store;
    const bal = st.balances();
    const bt = st.balancesByType();
    return (
      '<div class="page-head"><div><h2 class="page-title">Accounts</h2><p class="muted">Cash, UPI and other accounts</p></div>' +
      '<button class="btn primary" data-action="add-account">' + icon('plus', 16) + ' Add account</button></div>' +
      '<section class="hero card compact"><span class="hero-l">Total across all accounts</span><div class="hero-v">' + esc(U.money(st.totalBalance())) + '</div>' +
      '<div class="chips">' + Object.keys(C.accountTypes).map((k) => '<span class="chip">' + icon(C.accountTypes[k].icon, 14) + esc(C.accountTypes[k].label) + ' <b>' + esc(U.money(bt[k])) + '</b></span>').join('') + '</div></section>' +
      (st.state.accounts.length
        ? '<section class="grid-accounts">' +
          st.state.accounts
            .map(
              (a) =>
                '<article class="acc card"><a class="acc-link" href="#/accounts/' + esc(a.id) + '"><span class="acc-ic t-' + a.type + '">' + icon(C.accountTypes[a.type].icon, 22) + '</span>' +
                '<span class="acc-name"><b>' + esc(a.name) + '</b><small>' + esc(subtitle(a)) + '</small></span><span class="acc-bal ' + (bal[a.id] < 0 ? 'neg' : '') + '">' + esc(U.money(bal[a.id])) + '</span></a>' +
                '<div class="acc-actions"><button type="button" class="icon-btn subtle" data-action="edit-account" data-id="' + esc(a.id) + '" aria-label="Edit ' + esc(a.name) + '">' + icon('edit', 17) + '</button>' +
                '<button type="button" class="icon-btn subtle" data-action="delete-account" data-id="' + esc(a.id) + '" aria-label="Delete ' + esc(a.name) + '">' + icon('trash', 17) + '</button></div></article>'
            )
            .join('') + '</section>'
        : ui.empty('wallet', 'No accounts yet', 'Create an account to start recording money in and out.', '<button class="btn primary" data-action="add-account">Add your first account</button>'))
    );
  }

  function detail(id) {
    const st = MT.store;
    const a = st.getAccount(id);
    if (!a) return ui.empty('wallet', 'Account not found', 'It may have been deleted.', '<a class="btn primary" href="#/accounts">Back to accounts</a>');
    const bal = st.balances()[a.id];
    const m = U.monthRange(U.today());
    const s = st.accountStats(m.from, m.to).find((x) => x.account.id === a.id);
    const txs = st.queryTx({ accountId: a.id });
    return (
      '<div class="page-head"><div><a class="back" href="#/accounts">' + icon('back', 16) + ' Accounts</a><h2 class="page-title">' + esc(a.name) + '</h2><p class="muted">' + esc(subtitle(a)) + '</p></div>' +
      '<div class="btn-row"><button class="btn ghost" data-action="edit-account" data-id="' + esc(a.id) + '">' + icon('edit', 16) + ' Edit</button>' +
      '<button class="btn primary" data-action="add-tx" data-account="' + esc(a.id) + '">' + icon('plus', 16) + ' Add</button></div></div>' +
      '<section class="cards three"><div class="stat card"><span class="stat-l">Balance</span><b class="stat-v ' + (bal < 0 ? 'neg' : '') + '">' + esc(U.money(bal)) + '</b></div>' +
      '<div class="stat card"><span class="stat-l">Money in · this month</span><b class="stat-v c-income">' + esc(U.money(s.inflow)) + '</b></div>' +
      '<div class="stat card"><span class="stat-l">Money out · this month</span><b class="stat-v c-expense">' + esc(U.money(s.outflow)) + '</b></div></section>' +
      '<section><h3 class="sec-title">Transactions</h3><div class="card flush">' +
      ui.txList(txs, { group: true, ctx: { accountId: a.id }, empty: ui.empty('list', 'No transactions in this account', 'Add one to see it here.') }) + '</div></section>'
    );
  }

  MT.views.accounts = {
    title: 'Accounts',
    render(param) {
      return param ? detail(param) : list();
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
