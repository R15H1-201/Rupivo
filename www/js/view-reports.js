/**
 * view-reports.js — Reports & analysis (#/reports).
 * All numbers come from MT.store selectors; charts from MT.charts.
 */
(function (g) {
  'use strict';
  const MT = (g.MT = g.MT || {});
  const U = MT.util;
  const ui = MT.ui;
  const esc = U.esc;
  const icon = MT.icon;

  const rep = { preset: 'month', from: '', to: '' };
  const PRESETS = [
    { value: 'month', label: 'This month' },
    { value: 'last', label: 'Last month' },
    { value: '3m', label: '3 months' },
    { value: 'year', label: 'This year' },
    { value: 'all', label: 'All time' },
    { value: 'custom', label: 'Custom' },
  ];

  function range() {
    const t = U.today();
    switch (rep.preset) {
      case 'month': return U.monthRange(t);
      case 'last': return U.monthRange(U.shiftMonth(t, -1));
      case '3m': return { from: U.shiftMonth(t, -2), to: U.monthRange(t).to };
      case 'year': return { from: t.slice(0, 4) + '-01-01', to: t.slice(0, 4) + '-12-31' };
      case 'all': return { from: null, to: null };
      default: return { from: rep.from || null, to: rep.to || null };
    }
  }

  const noData = (text) => '<p class="muted pad">' + esc(text) + '</p>';

  function byPerson(type, r) {
    const st = MT.store;
    const m = {};
    st.queryTx({ type: type, from: r.from, to: r.to }).forEach((t) => {
      const p = st.getPerson(t.personId);
      const k = p ? p.name : 'Unlinked';
      m[k] = (m[k] || 0) + t.amount;
    });
    return Object.keys(m).map((k) => ({ label: k, value: U.round2(m[k]) })).sort((a, b) => b.value - a.value).slice(0, 8);
  }

  function categoryCard(title, type, centre, r) {
    const rows = MT.store.byCategory(type, r.from, r.to).slice(0, 8).map((x) => ({ label: x.label, value: x.amount }));
    return (
      '<section class="card"><h3 class="sec-title">' + esc(title) + '</h3>' +
      (rows.length ? '<div class="split">' + MT.charts.donut(rows, { center: centre, label: title }) + MT.charts.legend(rows) + '</div>' : noData('Nothing recorded in this period.')) + '</section>'
    );
  }

  MT.views.reports = {
    title: 'Reports',
    render() {
      const st = MT.store;
      const r = range();
      const tot = st.totals(r.from, r.to);
      const txs = st.queryTx({ from: r.from, to: r.to });
      const end = r.to && r.to < U.today() ? r.to : U.today();
      const trend = st.monthly(6, end);
      const stats = st.accountStats(r.from, r.to);
      const expenses = txs.filter((t) => t.type === 'expense');
      const incomes = txs.filter((t) => t.type === 'income');
      const maxExp = expenses.reduce((m, t) => (t.amount > m.amount ? t : m), { amount: 0 });
      const maxInc = incomes.reduce((m, t) => (t.amount > m.amount ? t : m), { amount: 0 });
      const gv = byPerson('given', r);
      const rc = byPerson('received', r);
      const cards = (items) => '<section class="cards">' + items.map((i) => '<div class="stat card"><span class="stat-l">' + esc(i[0]) + '</span><b class="stat-v ' + (i[2] || '') + '">' + esc(U.money(i[1])) + '</b></div>').join('') + '</section>';

      return (
        '<div class="page-head"><div><h2 class="page-title">Reports</h2><p class="muted">Where your money comes from and goes</p></div></div>' +
        '<div class="range-bar">' + ui.seg('rep-range', PRESETS, rep.preset) +
        (rep.preset === 'custom'
          ? '<div class="range-custom"><label class="date-f"><small>From</small><input type="date" data-change="rep-date" data-key="from" value="' + esc(rep.from) + '"></label>' +
            '<label class="date-f"><small>To</small><input type="date" data-change="rep-date" data-key="to" value="' + esc(rep.to) + '"></label></div>'
          : '') + '</div>' +
        cards([['Income', tot.income, 'c-income'], ['Expenses', tot.expense, 'c-expense'], ['Net savings', tot.net, tot.net < 0 ? 'c-expense' : 'c-income'], ['Money given', tot.given, 'c-given'], ['Money received', tot.received, 'c-received']]) +

        '<section class="card"><div class="sec-head"><h3 class="sec-title">Income vs expenses</h3><span class="legend-inline"><i class="dot" style="background:var(--income)"></i>Income <i class="dot" style="background:var(--expense)"></i>Expenses</span></div>' +
        (st.state.transactions.length ? MT.charts.bars(trend) : noData('Add transactions to see your monthly trend.')) + '<p class="muted pad-s">Last 6 months</p></section>' +

        '<div class="grid2">' + categoryCard('Expense analysis', 'expense', 'Spent', r) + categoryCard('Income analysis', 'income', 'Earned', r) + '</div>' +

        '<div class="grid2"><section class="card"><h3 class="sec-title">Given-money analysis</h3>' + (gv.length ? MT.charts.hbars(gv, 'var(--given)') : noData('No money given in this period.')) + '</section>' +
        '<section class="card"><h3 class="sec-title">Received-money analysis</h3>' + (rc.length ? MT.charts.hbars(rc, 'var(--received)') : noData('No money received in this period.')) + '</section></div>' +

        '<section class="card"><h3 class="sec-title">Account-wise overview</h3>' +
        (stats.length
          ? '<div class="table-wrap"><table class="table"><thead><tr><th>Account</th><th class="num">Balance now</th><th class="num">Money in</th><th class="num">Money out</th></tr></thead><tbody>' +
            stats.map((s) => '<tr><td>' + esc(s.account.name) + '</td><td class="num">' + esc(U.money(s.balance)) + '</td><td class="num c-income">' + esc(U.money(s.inflow)) + '</td><td class="num c-expense">' + esc(U.money(s.outflow)) + '</td></tr>').join('') +
            '</tbody></table></div>'
          : noData('No accounts yet.')) + '</section>' +

        '<section class="card"><h3 class="sec-title">Transaction overview</h3><ul class="kv">' +
        '<li><span>Transactions in period</span><b>' + txs.length + '</b></li>' +
        '<li><span>Average expense</span><b>' + esc(expenses.length ? U.money(tot.expense / expenses.length) : '—') + '</b></li>' +
        '<li><span>Largest expense</span><b>' + esc(maxExp.amount ? U.money(maxExp.amount) + ' · ' + maxExp.category : '—') + '</b></li>' +
        '<li><span>Largest income</span><b>' + esc(maxInc.amount ? U.money(maxInc.amount) + ' · ' + maxInc.category : '—') + '</b></li>' +
        '<li><span>Transfers between accounts</span><b>' + esc(U.money(tot.transfer)) + '</b></li></ul></section>'
      );
    },
  };

  MT.actions['rep-range'] = (el) => {
    rep.preset = el.dataset.value;
    MT.app.render();
  };
  MT.changes['rep-date'] = (el) => {
    rep[el.dataset.key] = el.value;
    MT.app.render();
  };
})(typeof window !== 'undefined' ? window : globalThis);
