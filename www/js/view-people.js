/**
 * view-people.js — People list (#/people) and a person's ledger (#/people/<id>).
 *   balance > 0  : they owe you      balance < 0 : you owe them
 */
(function (g) {
  'use strict';
  const MT = (g.MT = g.MT || {});
  const U = MT.util;
  const ui = MT.ui;
  const esc = U.esc;
  const icon = MT.icon;

  const initials = (n) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const status = (net) =>
    net > 0 ? { cls: 'c-income', text: 'Owes you ' + U.money(net) } : net < 0 ? { cls: 'c-expense', text: 'You owe ' + U.money(-net) } : { cls: 'muted', text: 'Settled' };

  function list() {
    const st = MT.store;
    const people = st.peopleList();
    const t = st.peopleTotals();
    return (
      '<div class="page-head"><div><h2 class="page-title">People</h2><p class="muted">Who owes you, and who you owe</p></div>' +
      '<button class="btn primary" data-action="add-person">' + icon('plus', 16) + ' Add person</button></div>' +
      '<section class="cards three"><div class="stat card"><span class="stat-l">To collect</span><b class="stat-v c-income">' + esc(U.money(t.toCollect)) + '</b></div>' +
      '<div class="stat card"><span class="stat-l">You owe</span><b class="stat-v c-expense">' + esc(U.money(t.toPay)) + '</b></div>' +
      '<div class="stat card"><span class="stat-l">People</span><b class="stat-v">' + people.length + '</b></div></section>' +
      (people.length
        ? '<section class="card flush"><ul class="people">' +
          people
            .map((p) => {
              const s = status(p.net);
              return (
                '<li class="person"><a class="person-main" href="#/people/' + esc(p.id) + '"><span class="avatar">' + esc(initials(p.name)) + '</span>' +
                '<span class="person-name"><b>' + esc(p.name) + '</b><small>' + p.count + ' transaction' + (p.count === 1 ? '' : 's') + (p.last ? ' • last ' + esc(U.fmtDate(p.last)) : '') + '</small></span>' +
                '<span class="person-bal ' + s.cls + '">' + esc(s.text) + '</span></a></li>'
              );
            })
            .join('') + '</ul></section>'
        : ui.empty('users', 'No people yet', 'Add someone to track money you lend, borrow or get back.', '<button class="btn primary" data-action="add-person">Add person</button>'))
    );
  }

  function detail(id) {
    const st = MT.store;
    const p = st.getPerson(id);
    if (!p) return ui.empty('users', 'Person not found', 'They may have been deleted.', '<a class="btn primary" href="#/people">Back to people</a>');
    const rec = st.peopleList().find((x) => x.id === id);
    const s = status(rec.net);
    const txs = st.queryTx({ personId: id });
    return (
      '<div class="page-head"><div><a class="back" href="#/people">' + icon('back', 16) + ' People</a><h2 class="page-title">' + esc(p.name) + '</h2>' +
      '<p class="muted">' + esc([p.phone, p.note].filter(Boolean).join(' • ') || 'No contact details') + '</p></div>' +
      '<div class="btn-row"><button class="btn ghost" data-action="edit-person" data-id="' + esc(id) + '">' + icon('edit', 16) + ' Edit</button>' +
      '<button class="btn ghost danger" data-action="delete-person" data-id="' + esc(id) + '">' + icon('trash', 16) + '</button></div></div>' +
      '<section class="hero card compact"><span class="hero-l">Outstanding balance</span><div class="hero-v ' + s.cls + '">' + esc(s.text) + '</div>' +
      '<div class="chips"><span class="chip">Given <b>' + esc(U.money(rec.given)) + '</b></span><span class="chip">Received <b>' + esc(U.money(rec.received)) + '</b></span></div></section>' +
      '<div class="quick three"><button class="quick-btn c-given" data-action="add-tx" data-type="given" data-person="' + esc(id) + '"><span>' + icon('send', 20) + '</span>I gave money</button>' +
      '<button class="quick-btn c-received" data-action="add-tx" data-type="received" data-person="' + esc(id) + '"><span>' + icon('inbox', 20) + '</span>I received money</button>' +
      '<button class="quick-btn c-income" data-action="settle-person" data-id="' + esc(id) + '"' + (rec.net ? '' : ' disabled') + '><span>' + icon('check', 20) + '</span>Settle up</button></div>' +
      '<section><h3 class="sec-title">Ledger</h3><div class="card flush">' + ui.txList(txs, { group: true, empty: ui.empty('list', 'No transactions with ' + p.name, 'Record money given or received to build the ledger.') }) + '</div></section>'
    );
  }

  MT.views.people = {
    title: 'People',
    render(param) {
      return param ? detail(param) : list();
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
