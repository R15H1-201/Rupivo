/**
 * sms.js — turns bank SMS into transactions.
 *
 *  1. parse()           Pure function: SMS text -> {type, amount, date, ...} or null.
 *                       Works everywhere (also used by the "paste an SMS" tool in Settings).
 *  2. importMessages()  Adds parsed messages as transactions (skips duplicates).
 *  3. Native bridge     A browser can NEVER read SMS. Inside the Android app the
 *                       Capacitor plugin "SmsInbox" (native/android/SmsInboxPlugin.java)
 *                       supplies the messages. If that plugin is absent, isNative() is false
 *                       and the UI explains it.
 *
 * Privacy: only messages from bank-style sender IDs are ever parsed. The raw SMS
 * text is NOT stored — only amount, date, category and a short note.
 */
(function (g) {
  'use strict';
  const MT = (g.MT = g.MT || {});
  const U = MT.util;

  /* ----------------------------------------------------------- sender check */
  /** Indian bank/DLT sender IDs look like "VM-HDFCBK-S", "AD-KOTAKB", "SBIUPI". Personal numbers never match. */
  function isBankSender(addr) {
    const a = String(addr || '').trim();
    if (!a || /^\+?[\d\s-]{6,}$/.test(a)) return false;
    return /^[A-Za-z]{2}-[A-Za-z0-9]{3,9}(-[A-Za-z])?$/.test(a) || /^[A-Za-z][A-Za-z0-9]{4,10}$/.test(a);
  }

  /* ---------------------------------------------------------------- parsing */
  const SKIP = /\b(otp|one[- ]time password|verification code|cvv|do not share|offer|cashback up to|pre-?approved|apply now|click here|congratulations|loan up to|statement is ready|due date|minimum amount due|will be debited|collect request|requested money|failed|declined|unsuccessful|insufficient)\b/i;
  const DEBIT = /\b(debited|debit|spent|withdrawn|paid|sent|purchase[d]?|deducted)\b/i;
  const CREDIT = /\b(credited|credit|received|deposited|refund(?:ed)?)\b/i;
  const AMOUNT = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/gi;
  const BALANCE_BEFORE = /(avl|avail\w*|bal\w*|limit|outstanding)(?:\s+(?:bal\w*|is|of|amt|amount))?[^a-z0-9]{0,12}$/i;
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

  function findAmount(text) {
    let m;
    AMOUNT.lastIndex = 0;
    while ((m = AMOUNT.exec(text))) {
      const before = text.slice(Math.max(0, m.index - 24), m.index);
      if (BALANCE_BEFORE.test(before)) continue; // "Avl Bal Rs 5,000" is not the transaction
      const v = U.parseAmount(m[1]);
      if (v > 0) return v;
    }
    const f = /(?:debited|credited)\s+(?:by|with|for)?\s*([\d,]+(?:\.\d{1,2})?)/i.exec(text);
    if (f) {
      const v = U.parseAmount(f[1]);
      if (v > 0) return v;
    }
    return 0;
  }

  function findDate(text, fallbackISO) {
    let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
    const ok = (y, mo, d) => {
      y = +y < 100 ? 2000 + +y : +y;
      return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? y + '-' + U.pad(mo) + '-' + U.pad(d) : null;
    };
    if (m) return ok(m[1], +m[2], +m[3]) || fallbackISO;
    m = /\b(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})\b/.exec(text);
    if (m) return ok(m[3], +m[2], +m[1]) || fallbackISO;
    m = /\b(\d{1,2})[-\s]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-\s,]*(\d{2,4})\b/i.exec(text);
    if (m) return ok(m[3], MONTHS[m[2].toLowerCase()], +m[1]) || fallbackISO;
    return fallbackISO;
  }

  const BANKS = [
    [/hdfc/i, 'HDFC'], [/kotak|\bkmb/i, 'Kotak'], [/\bsbi|state bank/i, 'SBI'], [/\bbob\b|baroda/i, 'BOB'],
    [/icici/i, 'ICICI'], [/axis/i, 'Axis'], [/\bpnb|punjab national/i, 'PNB'], [/canara/i, 'Canara'],
    [/union bank/i, 'Union Bank'], [/idfc/i, 'IDFC First'], [/yes bank/i, 'Yes Bank'], [/indusind/i, 'IndusInd'], [/paytm/i, 'Paytm'],
  ];
  function findBank(sender, body) {
    for (let i = 0; i < BANKS.length; i++) if (BANKS[i][0].test(sender || '')) return BANKS[i][1];
    for (let j = 0; j < BANKS.length; j++) if (BANKS[j][0].test(body)) return BANKS[j][1];
    return '';
  }

  function findCounterparty(text) {
    const vpa = /\b([a-z0-9][a-z0-9._-]{1,}@[a-z][a-z0-9]{1,})\b/i.exec(text);
    if (vpa) return vpa[1];
    const re = /\b(?:to|at|from|by)\s+([A-Za-z][A-Za-z0-9 &'._-]{2,30}?)(?=\s+(?:on|ref\w*|upi|via|avl|bal|txn|dated|using|\()|[.,;]|$)/gi;
    let m;
    while ((m = re.exec(text))) {
      const c = m[1].trim();
      if (!/^(your|a\/c|ac|acct|account|you|the|bank|vpa|upi|card)\b/i.test(c)) return c;
    }
    return '';
  }

  const CATS = [
    [/swiggy|zomato|restaurant|cafe|pizza|dominos|kfc|mcdonald/i, 'Food', 'expense'],
    [/uber|ola\b|rapido|irctc|metro|petrol|fuel|bpcl|hpcl|iocl|fastag/i, 'Transport', 'expense'],
    [/amazon|flipkart|myntra|ajio|meesho/i, 'Shopping', 'expense'],
    [/electricity|bescom|msedcl|recharge|jio|airtel|\bvi\b|broadband|gas bill|water bill/i, 'Bills', 'expense'],
    [/pharm|hospital|apollo|clinic|medic|1mg|netmeds/i, 'Health', 'expense'],
    [/netflix|spotify|hotstar|prime video|bookmyshow|youtube/i, 'Entertainment', 'expense'],
    [/bigbasket|blinkit|zepto|dmart|grocery|instamart/i, 'Groceries', 'expense'],
    [/salary/i, 'Salary', 'income'],
    [/interest/i, 'Interest', 'income'],
    [/refund|reversal/i, 'Refund', 'income'],
  ];

  /**
   * @param {string} body    SMS text
   * @param {{sender?:string, ts?:number}} [ctx]  sender id and message time (ms) for fallbacks
   * @returns {null | {type,amount,date,last4,bank,counterparty,ref,category,note}}
   */
  function parse(body, ctx) {
    ctx = ctx || {};
    const raw = String(body || '').replace(/\s+/g, ' ').trim();
    if (!raw || SKIP.test(raw)) return null;
    // "credit card" / "debit card" are not directions
    const t = raw.replace(/\b(credit|debit)\s+card\b/gi, 'card').replace(/\bcredit\s+limit\b/gi, 'limit');
    const d = DEBIT.exec(t);
    const c = CREDIT.exec(t);
    if (!d && !c) return null;
    const type = d && (!c || d.index < c.index) ? 'expense' : 'income';
    const amount = findAmount(t);
    if (!(amount > 0)) return null;

    const last4m = /(?:a\/c|acct?|account|card)(?:\s*(?:no\.?|number|ending|with))*\s*[:\-]?\s*(?:[xX*.•]+\s*)?(\d{3,4})\b/i.exec(t);
    const refm = /(?:ref(?:erence)?\.?\s*(?:no\.?)?|rrn|txn\s*id)[:\s#-]*([A-Za-z0-9]{6,})/i.exec(t);
    const who = findCounterparty(t);
    const fallbackDate = ctx.ts ? U.toISO(new Date(ctx.ts)) : U.today();
    let category = 'Other';
    for (let i = 0; i < CATS.length; i++) {
      if (CATS[i][1] && CATS[i][2] === type && CATS[i][0].test(t)) {
        category = CATS[i][1];
        break;
      }
    }
    return {
      type: type,
      amount: amount,
      date: findDate(t, fallbackDate),
      last4: last4m ? last4m[1] : '',
      bank: findBank(ctx.sender, t),
      counterparty: who,
      ref: refm ? refm[1] : '',
      category: category,
      note: ('SMS' + (who ? ': ' + who : '')).slice(0, 80),
    };
  }

  /* ----------------------------------------------------------------- import */
  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  function smsId(m, p) {
    if (p.ref) return 'ref:' + p.ref + '|' + p.amount + '|' + p.type; // same UPI ref from bank + app SMS = one transaction
    return 'msg:' + (m.id != null ? m.id : hash(String(m.body) + String(m.date)));
  }

  /** Which account does this SMS belong to? */
  function matchAccount(p, sender) {
    const st = MT.store;
    const accounts = st.state.accounts;
    const hay = (String(sender || '') + ' ' + p.bank).toLowerCase();
    for (let i = 0; i < accounts.length; i++) {
      const keys = String(accounts[i].smsKey || '').split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
      if (keys.some((k) => k === p.last4 || (k.length > 2 && hay.indexOf(k) !== -1))) return accounts[i];
    }
    const byBank = accounts.filter((a) => p.bank && String(a.provider).toLowerCase() === p.bank.toLowerCase());
    if (byBank.length === 1) return byBank[0];
    return st.getAccount(st.state.settings.smsDefaultAccountId) || null;
  }

  /** @param {{id?,address,body,date?}[]} list */
  function importMessages(list) {
    const st = MT.store;
    const res = { scanned: 0, imported: 0, duplicates: 0, skipped: 0, unassigned: 0 };
    const seen = new Set(st.state.transactions.map((t) => t.smsId).filter(Boolean));
    const add = [];
    list.slice().sort((a, b) => (a.date || 0) - (b.date || 0)).forEach((m) => {
      res.scanned++;
      if (!isBankSender(m.address)) return res.skipped++;
      const p = parse(m.body, { sender: m.address, ts: m.date });
      if (!p) return res.skipped++;
      const id = smsId(m, p);
      if (seen.has(id)) return res.duplicates++;
      const acc = matchAccount(p, m.address);
      if (!acc) return res.unassigned++;
      seen.add(id);
      add.push({ type: p.type, amount: p.amount, date: p.date, accountId: acc.id, category: p.category, note: p.note, source: 'sms', smsId: id });
    });
    res.imported = st.addTransactions(add);
    return res;
  }

  /* ---------------------------------------------------------- native bridge */
  const plugin = () => (g.Capacitor && g.Capacitor.Plugins && g.Capacitor.Plugins.SmsInbox) || null;
  let lastAuto = 0;

  MT.sms = {
    parse: parse,
    isBankSender: isBankSender,
    importMessages: importMessages,
    isNative: () => !!plugin(),

    async hasPermission() {
      const r = await plugin().checkPermission();
      return !!r.granted;
    },
    async requestPermission() {
      const r = await plugin().requestPermission();
      return !!r.granted;
    },
    /** Read new bank SMS from the phone and import them. First run looks back 90 days. */
    async sync() {
      if (!plugin()) throw new Error('SMS reading is only available in the Android app');
      const st = MT.store;
      const since = st.state.settings.smsLastSync || Date.now() - 90 * 86400000;
      const r = await plugin().readBankMessages({ since: since, limit: 500 });
      const res = importMessages(r.messages || []);
      st.updateSettings({ smsLastSync: Date.now() });
      return res;
    },
    /** Called on app open/resume. Silent when disabled; throttled to once a minute. */
    async autoSync() {
      const s = MT.store.state.settings;
      if (!plugin() || !s.smsEnabled || Date.now() - lastAuto < 60000) return null;
      lastAuto = Date.now();
      try {
        if (!(await MT.sms.hasPermission())) return null;
        return await MT.sms.sync();
      } catch (e) {
        console.warn('SMS sync failed', e);
        return null;
      }
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
