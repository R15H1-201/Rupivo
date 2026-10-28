/**
 * Logic tests (no browser needed):  node tests/logic.test.js
 * Loads the same script files the website uses, with a fake localStorage.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { webcrypto } = require('crypto');

const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => (mem[k] = String(v)),
  removeItem: (k) => delete mem[k],
};
if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

['config', 'utils', 'crypto', 'storage', 'store', 'sms'].forEach((f) => {
  const file = path.join(__dirname, '..', 'www', 'js', f + '.js');
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
});
const { store, sms, util: U } = MT;
let passed = 0;
const t = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    console.error('FAIL  ' + name + '\n      ' + (e.stack || e));
    process.exitCode = 1;
  }
};

(async () => {
  await t('fresh start creates Cash account, plain storage', async () => {
    assert.strictEqual(await store.init(), 'new');
    await store.startFresh(null);
    assert.strictEqual(store.state.accounts.length, 1);
    assert.strictEqual(JSON.parse(MT.storage.read()).enc, false);
  });

  let cash, upi, ravi;
  await t('accounts, people, balances', async () => {
    cash = store.state.accounts[0];
    store.updateAccount(cash.id, { name: 'Cash', type: 'cash', openingBalance: '1,000' });
    upi = store.addAccount({ name: 'Kotak UPI', type: 'upi', providerKind: 'bank', provider: 'Kotak', openingBalance: 5000 });
    ravi = store.addPerson({ name: 'Ravi' });
    assert.strictEqual(store.totalBalance(), 6000);
  });

  await t('each transaction type moves money correctly', async () => {
    const d = '2026-10-10';
    store.addTransaction({ type: 'income', amount: 20000, date: d, accountId: upi.id, category: 'Salary' });
    store.addTransaction({ type: 'expense', amount: 450.5, date: d, accountId: cash.id, category: 'Food' });
    store.addTransaction({ type: 'given', amount: 2000, date: d, accountId: upi.id, personId: ravi.id, category: 'Loan' });
    store.addTransaction({ type: 'received', amount: 500, date: d, accountId: cash.id, personId: ravi.id, category: 'Repayment' });
    store.addTransaction({ type: 'transfer', amount: 300, date: d, accountId: upi.id, toAccountId: cash.id });
    const b = store.balances();
    assert.strictEqual(b[cash.id], 1000 - 450.5 + 500 + 300); // 1349.5
    assert.strictEqual(b[upi.id], 5000 + 20000 - 2000 - 300); // 22700
    assert.strictEqual(store.totalBalance(), 1349.5 + 22700); // transfers don't change the total
    assert.strictEqual(store.personNet(ravi.id), 1500);
    assert.deepStrictEqual(store.peopleTotals(), { toCollect: 1500, toPay: 0 });
    const tot = store.totals('2026-10-01', '2026-10-31');
    assert.strictEqual(tot.income, 20000);
    assert.strictEqual(tot.expense, 450.5);
    assert.strictEqual(store.balancesByType().cash, 1349.5);
  });

  await t('validation rejects bad input', async () => {
    assert.throws(() => store.addTransaction({ type: 'expense', amount: 0, date: '2026-10-10', accountId: cash.id }), /greater than 0/);
    assert.throws(() => store.addTransaction({ type: 'given', amount: 5, date: '2026-10-10', accountId: cash.id }), /person/i);
    assert.throws(() => store.addTransaction({ type: 'transfer', amount: 5, date: '2026-10-10', accountId: cash.id, toAccountId: cash.id }), /different/);
    assert.throws(() => store.addTransaction({ type: 'expense', amount: 5, date: 'nope', accountId: cash.id }), /date/i);
  });

  await t('edit and delete transaction, delete person/account cascade', async () => {
    const tx = store.queryTx({ type: 'expense' })[0];
    store.updateTransaction(tx.id, Object.assign({}, tx, { amount: 100 }));
    assert.strictEqual(store.balances()[cash.id], 1000 - 100 + 500 + 300);
    store.deleteTransaction(tx.id);
    assert.strictEqual(store.queryTx({ type: 'expense' }).length, 0);
    store.deletePerson(ravi.id);
    assert.ok(store.queryTx({}).every((x) => !x.personId));
    const n = store.deleteAccount(upi.id);
    assert.ok(n >= 3);
    assert.strictEqual(store.state.accounts.length, 1);
  });

  await t('passcode encryption round-trip, wrong passcode, lock/unlock', async () => {
    store.addTransaction({ type: 'income', amount: 10, date: '2026-10-11', accountId: cash.id, category: 'Gift' });
    await store.setPasscode('correct horse');
    await store.addTransaction({ type: 'income', amount: 5, date: '2026-10-12', accountId: cash.id, category: 'Gift' });
    await store.verifyPasscode('x'); // flush saves
    const raw = JSON.parse(MT.storage.read());
    assert.strictEqual(raw.enc, true);
    assert.ok(!MT.storage.read().includes('Gift'), 'plaintext must not be in storage');
    assert.strictEqual(await store.verifyPasscode('wrong pass'), false);
    assert.strictEqual(await store.verifyPasscode('correct horse'), true);
    const balBefore = store.totalBalance();
    await store.lock();
    assert.strictEqual(store.state.accounts.length, 0);
    assert.strictEqual(await store.init(), 'locked');
    await assert.rejects(store.unlock('nope nope'), /Wrong passcode/);
    await store.unlock('correct horse');
    assert.strictEqual(store.totalBalance(), balBefore);
  });

  await t('passcode too short is rejected', async () => {
    await assert.rejects(store.setPasscode('abc'), /at least/);
  });

  await t('encrypted export / import restores data', async () => {
    const enc = await store.exportEncrypted('backup-pass');
    assert.ok(!enc.includes('Gift'));
    const json = store.exportJSON();
    store.state.transactions.length = 0;
    await assert.rejects(store.importBackup(enc), /NEEDS_PASSPHRASE/);
    await assert.rejects(store.importBackup(enc, 'bad-pass'), /Wrong passcode/);
    const r = await store.importBackup(enc, 'backup-pass');
    assert.ok(r.transactions >= 2);
    const r2 = await store.importBackup(json);
    assert.strictEqual(r2.transactions, r.transactions);
    await assert.rejects(store.importBackup('not json'), /valid JSON/);
  });

  await t('CSV export has header + rows and escapes commas', async () => {
    store.addTransaction({ type: 'expense', amount: 12, date: '2026-10-13', accountId: cash.id, category: 'Food', note: 'tea, biscuits "yum"' });
    const csv = store.exportCSV().split('\r\n');
    assert.strictEqual(csv[0].split(',')[0], 'Date');
    assert.ok(csv.some((l) => l.includes('"tea, biscuits ""yum"""')));
  });

  await t('monthly series and category totals', async () => {
    const m = store.monthly(3, '2026-10-20');
    assert.deepStrictEqual(m.map((x) => x.key), ['2026-08', '2026-09', '2026-10']);
    assert.ok(m[2].income > 0);
    assert.strictEqual(store.byCategory('expense')[0].label, 'Food');
  });

  /* ------------------------------ SMS parser ------------------------------ */
  const cases = [
    ['VM-HDFCBK-S', 'Rs.500.00 debited from A/c XX1234 on 25-10-26 to VPA shop@ybl (UPI Ref 123456789012). Avl Bal Rs 9,500.00', { type: 'expense', amount: 500, date: '2026-10-25', last4: '1234', bank: 'HDFC', ref: '123456789012' }],
    ['AD-KOTAKB', 'INR 1,200.50 credited to A/c XXXX5678 on 24-Oct-26. Info: UPI/Ravi Kumar. Avl Bal INR 10,000.00', { type: 'income', amount: 1200.5, date: '2026-10-24', last4: '5678', bank: 'Kotak' }],
    ['JD-SBIUPI-S', 'Dear UPI user A/C X4321 debited by 100.0 on date 25Oct26 trf to SWIGGY Refno 987654321098', { type: 'expense', amount: 100, date: '2026-10-25', last4: '4321', bank: 'SBI' }],
    ['VK-BOBTXN', 'Sent Rs.250.00 From BOB A/c *9876 To rahul@okaxis On 25/10/2026. Ref No 5566778899', { type: 'expense', amount: 250, bank: 'BOB' }],
    ['AX-AXISBK', 'Rs 3,000 spent on your credit card XX2222 at AMAZON on 2026-10-20. Avl limit Rs 50,000', { type: 'expense', amount: 3000, date: '2026-10-20', last4: '2222', category: 'Shopping' }],
    ['VM-HDFCBK', 'Your salary of Rs 55,000.00 has been credited to a/c XX1234 on 01-10-26', { type: 'income', amount: 55000, category: 'Salary' }],
  ];
  cases.forEach(([sender, body, exp], i) =>
    t('sms parse #' + (i + 1) + ' ' + sender, async () => {
      const p = sms.parse(body, { sender });
      assert.ok(p, 'should parse');
      Object.keys(exp).forEach((k) => assert.strictEqual(p[k], exp[k], k + ' expected ' + exp[k] + ' got ' + p[k]));
    })
  );
  ['Your OTP is 123456. Do not share it.', 'Get pre-approved loan up to Rs 5,00,000. Apply now!', 'Rs 500 will be debited on 5th for your mandate', 'UPI payment of Rs 100 failed. Not debited.', 'Hello, lunch tomorrow?'].forEach((b, i) =>
    t('sms ignores non-transaction #' + (i + 1), async () => assert.strictEqual(sms.parse(b, { sender: 'VM-HDFCBK' }), null))
  );

  await t('sender filter: banks yes, personal numbers no', async () => {
    ['VM-HDFCBK-S', 'AD-KOTAKB', 'SBIUPI', 'JD-SBIUPI-S'].forEach((s) => assert.ok(sms.isBankSender(s), s));
    ['+919876543210', '9876543210', '', 'Mom'].forEach((s) => assert.ok(!sms.isBankSender(s), s));
  });

  await t('sms import: account match by last4, dedupe, skips personal', async () => {
    const acc = store.addAccount({ name: 'HDFC Bank', type: 'upi', providerKind: 'bank', provider: 'HDFC', smsKey: '1234' });
    const before = store.state.transactions.length;
    const msgs = [
      { id: 1, address: 'VM-HDFCBK-S', body: 'Rs.500.00 debited from A/c XX1234 on 25-10-26 to VPA shop@ybl (UPI Ref 123456789012)', date: Date.UTC(2026, 9, 25) },
      { id: 2, address: 'AD-HDFCBK', body: 'Rs.500.00 debited from A/c XX1234 on 25-10-26 UPI Ref 123456789012', date: Date.UTC(2026, 9, 25) }, // same UPI ref -> duplicate
      { id: 3, address: '+919999999999', body: 'Rs 100 debited from A/c XX1234', date: Date.now() }, // personal number
      { id: 4, address: 'VM-HDFCBK-S', body: 'Your OTP is 1234', date: Date.now() },
    ];
    const r1 = sms.importMessages(msgs);
    assert.deepStrictEqual([r1.imported, r1.duplicates, r1.skipped], [1, 1, 2]);
    const r2 = sms.importMessages(msgs);
    assert.strictEqual(r2.imported, 0);
    assert.strictEqual(store.state.transactions.length, before + 1);
    const tx = store.state.transactions[store.state.transactions.length - 1];
    assert.strictEqual(tx.accountId, acc.id);
    assert.strictEqual(tx.source, 'sms');
    assert.ok(!JSON.stringify(tx).includes('Rs.500.00 debited'), 'raw SMS text must not be stored');
  });

  console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
})();
