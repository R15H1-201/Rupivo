/**
 * forms.js — the add/edit dialogs (transaction, account, person) and their delete confirmations.
 * Registers the matching actions: add-tx, edit-tx, delete-tx, add-account, edit-account,
 * delete-account, add-person, edit-person, delete-person, settle-person.
 */
(function (g) {
  'use strict';
  const MT = (g.MT = g.MT || {});
  const U = MT.util;
  const C = MT.config;
  const ui = MT.ui;
  const esc = U.esc;
  const icon = MT.icon;
  const A = MT.actions;

  const opt = (v, label, sel) => '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(label) + '</option>';
  const accountLabel = (a) => a.name + (a.type === 'upi' && a.provider && a.provider !== a.name ? ' (' + a.provider + ')' : '');
  const fieldsOf = (form) => Object.fromEntries(new FormData(form).entries());
  const showError = (form, msg) => {
    const p = form.querySelector('.form-error');
    p.textContent = msg;
    p.hidden = !msg;
  };

  /* =============================================================== TRANSACTION */
  function openTx(o) {
    o = o || {};
    const st = MT.store;
    if (!st.state.accounts.length) {
      ui.toast('Add an account first');
      return openAccount();
    }
    const prefs = MT.storage.getPrefs();
    const editing = o.tx || null;
    const accounts = st.state.accounts;
    const lastAcc = st.getAccount(prefs.lastAccountId) ? prefs.lastAccountId : accounts[0].id;
    const init = editing
      ? Object.assign({}, editing)
      : { type: o.type || 'expense', amount: o.amount || '', date: o.date || U.today(), accountId: o.accountId || lastAcc, toAccountId: '', personId: o.personId || '', category: o.category || '', note: o.note || '' };
    if (!init.toAccountId) {
      const other = accounts.find((a) => a.id !== init.accountId);
      init.toAccountId = other ? other.id : '';
    }
    const types = ['expense', 'income', 'given', 'received', 'transfer'];

    const html =
      '<form class="form" novalidate>' +
      '<div class="seg seg-types" role="group" aria-label="Transaction type">' +
      types.map((k) => '<button type="button" class="seg-btn" data-type="' + k + '">' + esc(C.txTypes[k].label) + '</button>').join('') + '</div>' +
      '<input type="hidden" name="type" value="' + init.type + '">' +
      '<label class="field amount-field"><span>Amount</span><div class="amount-input"><b>' + esc(U.symbol()) + '</b>' +
      '<input name="amount" inputmode="decimal" autocomplete="off" placeholder="0" value="' + esc(init.amount) + '" required></div></label>' +
      '<div class="row2"><label class="field"><span data-account-label>Account</span><select name="accountId">' +
      accounts.map((a) => opt(a.id, accountLabel(a), a.id === init.accountId)).join('') + '</select></label>' +
      '<label class="field" data-show="transfer"><span>To account</span><select name="toAccountId">' +
      accounts.map((a) => opt(a.id, accountLabel(a), a.id === init.toAccountId)).join('') + '</select></label></div>' +
      '<div data-show="given,received"><label class="field"><span>Person</span><select name="personId">' +
      opt('', 'Select person…', !init.personId) + st.state.people.map((p) => opt(p.id, p.name, p.id === init.personId)).join('') + opt('__new__', '+ New person…', false) +
      '</select></label><label class="field" data-newperson hidden><span>New person’s name</span><input name="newPerson" maxlength="60" autocomplete="off"></label></div>' +
      '<div class="row2"><label class="field" data-hide="transfer"><span>Category</span><select name="category"></select></label>' +
      '<label class="field"><span>Date</span><input type="date" name="date" value="' + esc(init.date) + '" required></label></div>' +
      '<label class="field"><span>Note <small class="muted">(optional)</small></span><input name="note" maxlength="200" autocomplete="off" placeholder="What was this for?" value="' + esc(init.note) + '"></label>' +
      '<p class="form-error" role="alert" hidden></p>' +
      '<div class="modal-actions">' + (editing ? '<button type="button" class="btn danger ghost" data-del>Delete</button><span class="grow"></span>' : '') +
      '<button type="button" class="btn ghost" data-close>Cancel</button><button type="submit" class="btn primary">' + (editing ? 'Save changes' : 'Add') + '</button></div></form>';

    const el = ui.modal(editing ? 'Edit transaction' : 'New transaction', html, { noFocus: true });
    const form = el.querySelector('form');
    const f = form.elements;

    function sync() {
      const type = f.type.value;
      form.querySelectorAll('.seg-btn[data-type]').forEach((b) => {
        const on = b.dataset.type === type;
        b.classList.toggle('active', on);
        b.dataset.c = C.txTypes[b.dataset.type].color;
        b.setAttribute('aria-pressed', on);
      });
      form.querySelectorAll('[data-show]').forEach((n) => (n.hidden = n.dataset.show.split(',').indexOf(type) === -1));
      form.querySelectorAll('[data-hide]').forEach((n) => (n.hidden = n.dataset.hide.split(',').indexOf(type) !== -1));
      form.querySelector('[data-account-label]').textContent = type === 'transfer' ? 'From account' : type === 'income' || type === 'received' ? 'Deposit to' : 'Paid from';
      const list = C.categories[type].slice();
      const keep = f.category.value || (init.type === type ? init.category : '');
      if (keep && list.indexOf(keep) === -1 && init.type === type) list.push(keep);
      const sel = list.indexOf(keep) !== -1 ? keep : list.indexOf('Other') !== -1 ? 'Other' : list[0];
      f.category.innerHTML = list.map((c) => opt(c, c, c === sel)).join('');
      form.querySelector('[data-newperson]').hidden = !(f.personId.value === '__new__' && (type === 'given' || type === 'received'));
    }
    form.querySelectorAll('.seg-btn[data-type]').forEach((b) =>
      b.addEventListener('click', () => {
        f.category.value = '';
        f.type.value = b.dataset.type;
        sync();
      })
    );
    f.personId.addEventListener('change', () => {
      sync();
      if (f.personId.value === '__new__') f.newPerson.focus();
    });
    sync();
    setTimeout(() => f.amount.focus(), 60);

    if (editing)
      form.querySelector('[data-del]').addEventListener('click', async () => {
        if (await A['delete-tx']({ dataset: { id: editing.id } })) ui.closeModal(el);
      });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      showError(form, '');
      const d = fieldsOf(form);
      let created = null;
      try {
        if ((d.type === 'given' || d.type === 'received') && d.personId === '__new__') {
          created = st.addPerson({ name: d.newPerson });
          d.personId = created.id;
        }
        if (editing) st.updateTransaction(editing.id, d);
        else st.addTransaction(d);
      } catch (err) {
        if (created) st.deletePerson(created.id); // undo the helper person
        return showError(form, err.message);
      }
      MT.storage.setPrefs({ lastAccountId: d.accountId });
      ui.closeModal(el);
      ui.toast(editing ? 'Transaction updated' : 'Transaction added', 'ok');
    });
  }

  /* ================================================================== ACCOUNT */
  function openAccount(acc) {
    const st = MT.store;
    const a = acc || { name: '', type: 'cash', providerKind: 'bank', provider: '', openingBalance: '', smsKey: '' };
    const html =
      '<form class="form" novalidate>' +
      '<div class="seg seg-types" role="group" aria-label="Account type">' +
      Object.keys(C.accountTypes).map((k) => '<button type="button" class="seg-btn" data-atype="' + k + '">' + icon(C.accountTypes[k].icon, 16) + ' ' + esc(C.accountTypes[k].label) + '</button>').join('') + '</div>' +
      '<input type="hidden" name="type" value="' + esc(a.type) + '">' +
      '<div data-ashow="upi"><div class="seg" role="group" aria-label="UPI source">' +
      '<button type="button" class="seg-btn" data-kind="bank">Bank</button><button type="button" class="seg-btn" data-kind="app">Online app</button></div>' +
      '<input type="hidden" name="providerKind" value="' + esc(a.providerKind || 'bank') + '">' +
      '<label class="field"><span data-prov-label>Bank name</span><select name="providerSel"></select></label></div>' +
      '<label class="field" data-prov-custom hidden><span data-custom-label>Name</span><input name="providerCustom" maxlength="40" autocomplete="off"></label>' +
      '<label class="field"><span>Account name</span><input name="name" maxlength="40" autocomplete="off" placeholder="e.g. Kotak UPI, Wallet cash" value="' + esc(a.name) + '"></label>' +
      '<label class="field"><span>' + (acc ? 'Opening balance' : 'Current balance') + '</span><input name="openingBalance" inputmode="decimal" autocomplete="off" placeholder="0" value="' + esc(a.openingBalance === 0 && !acc ? '' : a.openingBalance) + '"></label>' +
      '<details class="adv"' + (a.smsKey ? ' open' : '') + '><summary>Bank SMS auto-import (optional)</summary>' +
      '<label class="field"><span>SMS match keys</span><input name="smsKey" maxlength="60" autocomplete="off" placeholder="e.g. 1234, KOTAK" value="' + esc(a.smsKey) + '"><small class="muted">Last 4 digits of the account/card, or the bank name, separated by commas. Imported bank SMS with these keys are filed under this account.</small></label></details>' +
      '<p class="form-error" role="alert" hidden></p>' +
      '<div class="modal-actions"><button type="button" class="btn ghost" data-close>Cancel</button><button type="submit" class="btn primary">' + (acc ? 'Save changes' : 'Add account') + '</button></div></form>';

    const el = ui.modal(acc ? 'Edit account' : 'New account', html);
    const form = el.querySelector('form');
    const f = form.elements;

    function fillProviders() {
      const kind = f.providerKind.value;
      const list = kind === 'app' ? C.upiApps : C.banks;
      const cur = a.provider;
      const known = list.indexOf(cur) !== -1;
      f.providerSel.innerHTML = list.map((n) => opt(n, n, n === cur)).join('') + opt('__other__', 'Other…', !!cur && !known && f.type.value === 'upi');
      form.querySelector('[data-prov-label]').textContent = kind === 'app' ? 'App name' : 'Bank name';
      form.querySelectorAll('[data-kind]').forEach((b) => b.classList.toggle('active', b.dataset.kind === kind));
    }
    function sync() {
      const type = f.type.value;
      form.querySelectorAll('[data-atype]').forEach((b) => b.classList.toggle('active', b.dataset.atype === type));
      form.querySelectorAll('[data-ashow]').forEach((n) => (n.hidden = n.dataset.ashow !== type));
      const custom = form.querySelector('[data-prov-custom]');
      const needCustom = type === 'other' || (type === 'upi' && f.providerSel.value === '__other__');
      custom.hidden = !needCustom;
      form.querySelector('[data-custom-label]').textContent = type === 'other' ? 'Bank / wallet / card name (optional)' : 'Name';
    }
    fillProviders();
    if (a.provider && (a.type === 'other' || f.providerSel.value === '__other__')) f.providerCustom.value = a.provider;
    sync();

    form.querySelectorAll('[data-atype]').forEach((b) => b.addEventListener('click', () => ((f.type.value = b.dataset.atype), sync())));
    form.querySelectorAll('[data-kind]').forEach((b) =>
      b.addEventListener('click', () => {
        f.providerKind.value = b.dataset.kind;
        a.provider = '';
        fillProviders();
        sync();
      })
    );
    f.providerSel.addEventListener('change', sync);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      showError(form, '');
      const d = fieldsOf(form);
      d.provider = d.type === 'upi' ? (d.providerSel === '__other__' ? d.providerCustom : d.providerSel) : d.type === 'other' ? d.providerCustom : '';
      try {
        if (acc) st.updateAccount(acc.id, d);
        else st.addAccount(d);
      } catch (err) {
        return showError(form, err.message);
      }
      ui.closeModal(el);
      ui.toast(acc ? 'Account updated' : 'Account added', 'ok');
    });
  }

  /* ================================================================== PERSON */
  function openPerson(p) {
    const st = MT.store;
    const el = ui.modal(
      p ? 'Edit person' : 'New person',
      '<form class="form" novalidate><label class="field"><span>Name</span><input name="name" maxlength="60" autocomplete="off" value="' + esc(p ? p.name : '') + '" required></label>' +
        '<label class="field"><span>Phone <small class="muted">(optional)</small></span><input name="phone" inputmode="tel" maxlength="20" autocomplete="off" value="' + esc(p ? p.phone : '') + '"></label>' +
        '<label class="field"><span>Note <small class="muted">(optional)</small></span><input name="note" maxlength="200" autocomplete="off" value="' + esc(p ? p.note : '') + '"></label>' +
        '<p class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="btn ghost" data-close>Cancel</button>' +
        '<button type="submit" class="btn primary">' + (p ? 'Save changes' : 'Add person') + '</button></div></form>'
    );
    const form = el.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        if (p) st.updatePerson(p.id, fieldsOf(form));
        else st.addPerson(fieldsOf(form));
      } catch (err) {
        return showError(form, err.message);
      }
      ui.closeModal(el);
      ui.toast(p ? 'Person updated' : 'Person added', 'ok');
    });
  }

  /* ================================================================= ACTIONS */
  A['add-tx'] = (el) => openTx({ type: el.dataset.type, accountId: el.dataset.account, personId: el.dataset.person });
  A['edit-tx'] = (el) => {
    const tx = MT.store.getTransaction(el.dataset.id);
    if (tx) openTx({ tx: tx });
  };
  A['delete-tx'] = async (el) => {
    const ok = await ui.confirm({ title: 'Delete transaction?', message: 'This will remove the transaction and update your balances. It can’t be undone.', confirmText: 'Delete', danger: true });
    if (ok) {
      MT.store.deleteTransaction(el.dataset.id);
      ui.toast('Transaction deleted');
    }
    return ok;
  };

  A['add-account'] = () => openAccount();
  A['edit-account'] = (el) => openAccount(MT.store.getAccount(el.dataset.id));
  A['delete-account'] = async (el) => {
    const st = MT.store;
    const a = st.getAccount(el.dataset.id);
    if (!a) return;
    const n = st.countAccountTx(a.id);
    const ok = await ui.confirm({
      title: 'Delete account?',
      message: '“' + a.name + '” will be removed together with its ' + n + ' transaction' + (n === 1 ? '' : 's') + '. This can’t be undone.',
      confirmText: 'Delete account',
      danger: true,
    });
    if (ok) {
      st.deleteAccount(a.id);
      ui.toast('Account deleted');
      if (/^#\/accounts\//.test(location.hash)) ui.go('#/accounts');
    }
  };

  A['add-person'] = () => openPerson();
  A['edit-person'] = (el) => openPerson(MT.store.getPerson(el.dataset.id));
  A['delete-person'] = async (el) => {
    const st = MT.store;
    const p = st.getPerson(el.dataset.id);
    if (!p) return;
    const ok = await ui.confirm({
      title: 'Delete person?',
      message: '“' + p.name + '” will be removed. Their transactions stay in your accounts but will no longer be linked to anyone, so the amount they owe will be forgotten.',
      confirmText: 'Delete person',
      danger: true,
    });
    if (ok) {
      st.deletePerson(p.id);
      ui.toast('Person deleted');
      if (/^#\/people\//.test(location.hash)) ui.go('#/people');
    }
  };
  /** Pre-fills a repayment so the balance goes back to zero. */
  A['settle-person'] = (el) => {
    const net = MT.store.personNet(el.dataset.id);
    if (!net) return ui.toast('Already settled');
    openTx({ type: net > 0 ? 'received' : 'given', personId: el.dataset.id, amount: Math.abs(net), category: 'Repayment' });
  };

  MT.forms = { openTx: openTx, openAccount: openAccount, openPerson: openPerson };
})(typeof window !== 'undefined' ? window : globalThis);
