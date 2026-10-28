/**
 * store.js — the single source of truth.
 *
 * Holds all data in memory (`state`), validates every change, saves it
 * automatically (encrypted if a passcode is set) and notifies the UI.
 * Views never touch storage directly: they call MT.store.* only.
 *
 * Money rules (one place, easy to audit):
 *   income / received  -> account +amount
 *   expense / given    -> account -amount
 *   transfer           -> from-account -amount, to-account +amount
 *   Person balance     = given - received   (>0: they owe you, <0: you owe them)
 */
(function (g) {
  'use strict';
  const MT = (g.MT = g.MT || {});
  const C = MT.config;
  const U = MT.util;

  let state = emptyState();
  let vault = null; // unlocked encryption key (null = data stored unencrypted)
  let pending = null; // encrypted envelope waiting for unlock
  let saveChain = Promise.resolve();
  let onSaveError = null;
  const listeners = new Set();

  /* ------------------------------------------------------------------ setup */
  function emptyState() {
    return {
      schema: C.schemaVersion,
      createdAt: new Date().toISOString(),
      settings: { currency: 'INR', smsEnabled: false, smsConsentAt: null, smsLastSync: 0, smsDefaultAccountId: null },
      accounts: [],
      people: [],
      transactions: [],
    };
  }

  function newCash() {
    return { id: U.uid('acc'), name: 'Cash', type: 'cash', providerKind: '', provider: '', openingBalance: 0, smsKey: '', createdAt: new Date().toISOString() };
  }

  /** Make any loaded/imported object safe to use. */
  function migrate(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('This is not a valid Rupivo data file');
    const s = Object.assign(emptyState(), raw);
    s.settings = Object.assign(emptyState().settings, raw.settings || {});
    ['accounts', 'people', 'transactions'].forEach((k) => {
      if (!Array.isArray(s[k])) s[k] = [];
    });
    s.accounts = s.accounts
      .filter((a) => a && a.id && a.name)
      .map((a) => Object.assign({ type: 'other', providerKind: '', provider: '', smsKey: '' }, a, { openingBalance: Number(a.openingBalance) || 0 }));
    s.people = s.people.filter((p) => p && p.id && p.name);
    s.transactions = s.transactions
      .filter((t) => t && t.id && C.txTypes[t.type] && U.isISO(t.date) && Number(t.amount) > 0)
      .map((t) => Object.assign({}, t, { amount: Number(t.amount) }));
    s.schema = C.schemaVersion;
    return s;
  }

  function emit() {
    listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    });
  }

  /** Save the current state. Serialised so writes never overlap. */
  function persist() {
    const snapshot = JSON.stringify(state);
    const v = vault;
    saveChain = saveChain.then(async () => {
      try {
        if (v) MT.storage.write(JSON.stringify(await MT.crypto.encrypt(snapshot, v)));
        else MT.storage.write('{"enc":false,"state":' + snapshot + '}');
      } catch (e) {
        if (onSaveError) onSaveError(e);
      }
    });
    return saveChain;
  }
  function changed() {
    persist();
    emit();
  }

  /* ------------------------------------------------------------- validation */
  function cleanAccount(d) {
    const type = C.accountTypes[d.type] ? d.type : 'other';
    let name = String(d.name || '').trim();
    const provider = String(d.provider || '').trim().slice(0, 40);
    if (!name) name = provider || C.accountTypes[type].label;
    const ob = d.openingBalance === '' || d.openingBalance == null ? 0 : U.parseAmount(d.openingBalance);
    if (isNaN(ob)) throw new Error('Opening balance must be a number');
    return {
      name: name.slice(0, 40),
      type: type,
      providerKind: type === 'upi' && (d.providerKind === 'bank' || d.providerKind === 'app') ? d.providerKind : '',
      provider: provider,
      openingBalance: ob,
      smsKey: String(d.smsKey || '').trim().slice(0, 60),
    };
  }

  function cleanTx(d) {
    const type = d.type;
    if (!C.txTypes[type]) throw new Error('Choose a transaction type');
    const amount = U.parseAmount(d.amount);
    if (!(amount > 0)) throw new Error('Enter an amount greater than 0');
    if (!U.isISO(d.date)) throw new Error('Choose a valid date');
    if (!getAccount(d.accountId)) throw new Error('Choose an account');
    const out = { type: type, amount: amount, date: d.date, accountId: d.accountId, toAccountId: null, personId: null, category: '', note: String(d.note || '').trim().slice(0, 200) };
    if (type === 'transfer') {
      if (!getAccount(d.toAccountId)) throw new Error('Choose the account to transfer to');
      if (d.toAccountId === d.accountId) throw new Error('Pick two different accounts');
      out.toAccountId = d.toAccountId;
      out.category = 'Transfer';
    } else {
      out.category = String(d.category || 'Other').slice(0, 40);
    }
    if (type === 'given' || type === 'received') {
      if (!getPerson(d.personId)) throw new Error('Choose a person');
      out.personId = d.personId;
    }
    return out;
  }

  function cleanPerson(d) {
    const name = String(d.name || '').trim();
    if (!name) throw new Error('Enter a name');
    return { name: name.slice(0, 60), phone: String(d.phone || '').trim().slice(0, 20), note: String(d.note || '').trim().slice(0, 200) };
  }

  /* --------------------------------------------------------------- lookups */
  const getAccount = (id) => state.accounts.find((a) => a.id === id) || null;
  const getPerson = (id) => state.people.find((p) => p.id === id) || null;
  const getTransaction = (id) => state.transactions.find((t) => t.id === id) || null;

  function effect(t, accId) {
    const s = C.txTypes[t.type].sign;
    if (t.type === 'transfer') return (t.accountId === accId ? -t.amount : 0) + (t.toAccountId === accId ? t.amount : 0);
    return t.accountId === accId ? s * t.amount : 0;
  }

  const inRange = (t, from, to) => (!from || t.date >= from) && (!to || t.date <= to);

  /* ------------------------------------------------------------ public API */
  const store = {
    get state() {
      return state;
    },
    get encrypted() {
      return !!vault;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    onSaveError(fn) {
      onSaveError = fn;
    },
    getAccount,
    getPerson,
    getTransaction,
    effect,

    /* ---- lifecycle ---- */
    /** @returns 'new' | 'locked' | 'ready' | 'corrupt' */
    async init() {
      const raw = MT.storage.read();
      if (!raw) return 'new';
      let env;
      try {
        env = JSON.parse(raw);
      } catch (e) {
        return 'corrupt';
      }
      if (env && env.enc) {
        pending = env;
        return 'locked';
      }
      try {
        state = migrate(env && env.state);
      } catch (e) {
        return 'corrupt';
      }
      U.setCurrency(state.settings.currency);
      return 'ready';
    },

    /** First run: create empty data (optionally encrypted). */
    async startFresh(passcode) {
      state = emptyState();
      state.accounts.push(newCash());
      vault = passcode ? await MT.crypto.createVault(passcode) : null;
      U.setCurrency(state.settings.currency);
      await persist();
      emit();
    },

    async unlock(passcode) {
      if (!pending) throw new Error('Nothing to unlock');
      const res = await MT.crypto.open(passcode, pending);
      state = migrate(JSON.parse(res.text));
      vault = res.vault;
      pending = null;
      U.setCurrency(state.settings.currency);
      emit();
    },

    /** Wipe decrypted data from memory and require the passcode again. */
    async lock() {
      if (!vault) return false;
      await saveChain;
      pending = JSON.parse(MT.storage.read());
      state = emptyState();
      vault = null;
      return true;
    },

    async verifyPasscode(pass) {
      await saveChain;
      const raw = MT.storage.read();
      const env = raw && JSON.parse(raw);
      if (!env || !env.enc) return false;
      try {
        await MT.crypto.open(pass, env);
        return true;
      } catch (e) {
        return false;
      }
    },

    async setPasscode(pass) {
      if (String(pass).length < C.minPasscodeLength) throw new Error('Use at least ' + C.minPasscodeLength + ' characters');
      vault = await MT.crypto.createVault(pass);
      await persist();
      emit();
    },
    async removePasscode() {
      vault = null;
      await persist();
      emit();
    },

    /** Delete EVERYTHING (data + passcode). The page should reload afterwards. */
    resetAll() {
      MT.storage.clearData();
      state = emptyState();
      vault = null;
      pending = null;
    },

    updateSettings(patch) {
      Object.assign(state.settings, patch);
      if (patch.currency) U.setCurrency(patch.currency);
      changed();
    },

    /* ---- accounts ---- */
    addAccount(d) {
      const a = Object.assign({ id: U.uid('acc'), createdAt: new Date().toISOString() }, cleanAccount(d));
      state.accounts.push(a);
      changed();
      return a;
    },
    updateAccount(id, d) {
      const a = getAccount(id);
      if (!a) throw new Error('Account not found');
      Object.assign(a, cleanAccount(d));
      changed();
      return a;
    },
    /** Removes the account AND every transaction that touches it. */
    deleteAccount(id) {
      const n = state.transactions.filter((t) => t.accountId === id || t.toAccountId === id).length;
      state.transactions = state.transactions.filter((t) => t.accountId !== id && t.toAccountId !== id);
      state.accounts = state.accounts.filter((a) => a.id !== id);
      if (state.settings.smsDefaultAccountId === id) state.settings.smsDefaultAccountId = null;
      changed();
      return n;
    },
    countAccountTx(id) {
      return state.transactions.filter((t) => t.accountId === id || t.toAccountId === id).length;
    },

    /* ---- people ---- */
    addPerson(d) {
      const p = Object.assign({ id: U.uid('per'), createdAt: new Date().toISOString() }, cleanPerson(d));
      state.people.push(p);
      changed();
      return p;
    },
    updatePerson(id, d) {
      const p = getPerson(id);
      if (!p) throw new Error('Person not found');
      Object.assign(p, cleanPerson(d));
      changed();
      return p;
    },
    /** Removes the person; their transactions stay in the accounts, just unlinked. */
    deletePerson(id) {
      state.transactions.forEach((t) => {
        if (t.personId === id) t.personId = null;
      });
      state.people = state.people.filter((p) => p.id !== id);
      changed();
    },

    /* ---- transactions ---- */
    addTransaction(d) {
      const t = Object.assign({ id: U.uid('tx'), source: 'manual', createdAt: new Date().toISOString() }, cleanTx(d));
      state.transactions.push(t);
      changed();
      return t;
    },
    /** Bulk add (used by SMS import). Invalid rows are skipped. Returns number added. */
    addTransactions(list) {
      let n = 0;
      list.forEach((d) => {
        try {
          const t = Object.assign({ id: U.uid('tx'), source: d.source || 'manual', smsId: d.smsId, createdAt: new Date().toISOString() }, cleanTx(d));
          state.transactions.push(t);
          n++;
        } catch (e) {
          /* skip invalid */
        }
      });
      if (n) changed();
      return n;
    },
    updateTransaction(id, d) {
      const t = getTransaction(id);
      if (!t) throw new Error('Transaction not found');
      Object.assign(t, cleanTx(d));
      changed();
      return t;
    },
    deleteTransaction(id) {
      state.transactions = state.transactions.filter((t) => t.id !== id);
      changed();
    },

    /* ---------------------------------------------------------- selectors */
    /** { accountId: balance } */
    balances() {
      const m = {};
      state.accounts.forEach((a) => (m[a.id] = a.openingBalance));
      state.transactions.forEach((t) => {
        if (t.type === 'transfer') {
          if (t.accountId in m) m[t.accountId] -= t.amount;
          if (t.toAccountId in m) m[t.toAccountId] += t.amount;
        } else if (t.accountId in m) m[t.accountId] += C.txTypes[t.type].sign * t.amount;
      });
      Object.keys(m).forEach((k) => (m[k] = U.round2(m[k])));
      return m;
    },
    totalBalance() {
      const b = store.balances();
      return U.round2(Object.keys(b).reduce((s, k) => s + b[k], 0));
    },
    /** { cash, upi, other } */
    balancesByType() {
      const b = store.balances();
      const r = { cash: 0, upi: 0, other: 0 };
      state.accounts.forEach((a) => (r[a.type] = U.round2(r[a.type] + b[a.id])));
      return r;
    },
    totals(from, to) {
      const r = { income: 0, expense: 0, given: 0, received: 0, transfer: 0 };
      state.transactions.forEach((t) => {
        if (inRange(t, from, to)) r[t.type] += t.amount;
      });
      Object.keys(r).forEach((k) => (r[k] = U.round2(r[k])));
      r.net = U.round2(r.income - r.expense);
      return r;
    },
    /** [{label, amount}] biggest first, for one transaction type */
    byCategory(type, from, to) {
      const m = {};
      state.transactions.forEach((t) => {
        if (t.type === type && inRange(t, from, to)) m[t.category || 'Other'] = (m[t.category || 'Other'] || 0) + t.amount;
      });
      return Object.keys(m)
        .map((k) => ({ label: k, amount: U.round2(m[k]) }))
        .sort((a, b) => b.amount - a.amount);
    },
    /** Last `count` months ending at the month of `endISO`: [{key,label,income,expense}] */
    monthly(count, endISO) {
      const out = [];
      for (let i = count - 1; i >= 0; i--) {
        const key = U.shiftMonth(endISO, -i).slice(0, 7);
        out.push({ key: key, label: U.MON[+key.slice(5, 7) - 1], income: 0, expense: 0 });
      }
      const idx = {};
      out.forEach((o, i) => (idx[o.key] = i));
      state.transactions.forEach((t) => {
        const i = idx[t.date.slice(0, 7)];
        if (i == null) return;
        if (t.type === 'income') out[i].income += t.amount;
        else if (t.type === 'expense') out[i].expense += t.amount;
      });
      out.forEach((o) => {
        o.income = U.round2(o.income);
        o.expense = U.round2(o.expense);
      });
      return out;
    },
    /** Per account: balance now + money in / out inside the range */
    accountStats(from, to) {
      const bal = store.balances();
      return state.accounts.map((a) => {
        let inflow = 0;
        let outflow = 0;
        state.transactions.forEach((t) => {
          if (!inRange(t, from, to)) return;
          const e = effect(t, a.id);
          if (e > 0) inflow += e;
          else if (e < 0) outflow -= e;
        });
        return { account: a, balance: bal[a.id], inflow: U.round2(inflow), outflow: U.round2(outflow) };
      });
    },
    personNet(id) {
      let n = 0;
      state.transactions.forEach((t) => {
        if (t.personId === id) n += t.type === 'given' ? t.amount : t.type === 'received' ? -t.amount : 0;
      });
      return U.round2(n);
    },
    peopleList() {
      return state.people
        .map((p) => {
          let given = 0;
          let received = 0;
          let count = 0;
          let last = '';
          state.transactions.forEach((t) => {
            if (t.personId !== p.id) return;
            count++;
            if (t.date > last) last = t.date;
            if (t.type === 'given') given += t.amount;
            else if (t.type === 'received') received += t.amount;
          });
          return Object.assign({}, p, { given: U.round2(given), received: U.round2(received), net: U.round2(given - received), count: count, last: last });
        })
        .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name));
    },
    peopleTotals() {
      let toCollect = 0;
      let toPay = 0;
      store.peopleList().forEach((p) => {
        if (p.net > 0) toCollect += p.net;
        else if (p.net < 0) toPay -= p.net;
      });
      return { toCollect: U.round2(toCollect), toPay: U.round2(toPay) };
    },
    /** Filtered, newest first. filter: {q,type,accountId,personId,from,to} */
    queryTx(f) {
      f = f || {};
      const q = (f.q || '').trim().toLowerCase();
      return state.transactions
        .filter((t) => {
          if (f.type && t.type !== f.type) return false;
          if (f.accountId && t.accountId !== f.accountId && t.toAccountId !== f.accountId) return false;
          if (f.personId && t.personId !== f.personId) return false;
          if (!inRange(t, f.from, f.to)) return false;
          if (q) {
            const p = getPerson(t.personId);
            const a = getAccount(t.accountId);
            const hay = [t.note, t.category, p && p.name, a && a.name, String(t.amount)].join(' ').toLowerCase();
            if (hay.indexOf(q) === -1) return false;
          }
          return true;
        })
        .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
    },

    /* ------------------------------------------------------------ export */
    exportJSON() {
      return JSON.stringify({ app: 'Rupivo', exportedAt: new Date().toISOString(), enc: false, state: state }, null, 2);
    },
    /** Encrypted backup with its own passphrase (does not change your app passcode). */
    async exportEncrypted(passphrase) {
      if (String(passphrase).length < C.minPasscodeLength) throw new Error('Use at least ' + C.minPasscodeLength + ' characters');
      const v = await MT.crypto.createVault(passphrase);
      return JSON.stringify(await MT.crypto.encrypt(JSON.stringify(state), v), null, 2);
    },
    exportCSV() {
      const rows = [['Date', 'Type', 'Amount', 'Account', 'To account', 'Person', 'Category', 'Note', 'Source']];
      store.queryTx({}).forEach((t) => {
        const a = getAccount(t.accountId);
        const b = getAccount(t.toAccountId);
        const p = getPerson(t.personId);
        rows.push([t.date, C.txTypes[t.type].label, t.amount, a ? a.name : '', b ? b.name : '', p ? p.name : '', t.category, t.note, t.source || 'manual']);
      });
      return U.csv(rows);
    },
    /** Replace everything with a backup file. Returns {accounts,people,transactions}. */
    async importBackup(text, passphrase) {
      let env;
      try {
        env = JSON.parse(text);
      } catch (e) {
        throw new Error('This file is not valid JSON');
      }
      let next;
      if (env && env.enc) {
        if (!passphrase) throw new Error('NEEDS_PASSPHRASE');
        const res = await MT.crypto.open(passphrase, env);
        next = migrate(JSON.parse(res.text));
      } else {
        next = migrate(env && env.state ? env.state : env);
      }
      state = next;
      U.setCurrency(state.settings.currency);
      await persist();
      emit();
      return { accounts: state.accounts.length, people: state.people.length, transactions: state.transactions.length };
    },
  };

  MT.store = store;
})(typeof window !== 'undefined' ? window : globalThis);
