/**
 * view-settings.js — Settings (#/settings): appearance, currency, security (passcode),
 * bank-SMS import, data export/import, and reset.
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

  const row = (title, desc, control) =>
    '<div class="set-row"><div class="set-text"><b>' + esc(title) + '</b>' + (desc ? '<small class="muted">' + desc + '</small>' : '') + '</div><div class="set-ctl">' + control + '</div></div>';

  function smsSection() {
    const st = MT.store;
    const s = st.state.settings;
    const native = MT.sms.isNative();
    const accOpts = '<option value="">Ask me / skip</option>' + st.state.accounts.map((a) => '<option value="' + esc(a.id) + '"' + (s.smsDefaultAccountId === a.id ? ' selected' : '') + '>' + esc(a.name) + '</option>').join('');
    return (
      '<section class="card"><h3 class="sec-title">' + icon('message', 18) + ' Bank SMS auto-import</h3>' +
      '<p class="muted">Reads <b>only bank/UPI transaction messages</b> on your phone and adds them as transactions. Everything is processed on this device; nothing is uploaded. ' +
      '<a href="terms.html#sms">How it works</a></p>' +
      (native
        ? row('Auto-import', s.smsEnabled ? 'On — new bank SMS are imported when you open the app.' : 'Off', '<button class="btn ' + (s.smsEnabled ? 'ghost' : 'primary') + ' sm" data-action="sms-toggle">' + (s.smsEnabled ? 'Turn off' : 'Turn on') + '</button>') +
          (s.smsEnabled
            ? row('Import now', s.smsLastSync ? 'Last sync: ' + esc(new Date(s.smsLastSync).toLocaleString()) : 'Never synced', '<button class="btn ghost sm" data-action="sms-sync">Sync now</button>') +
              row('Default account', 'Used when an SMS doesn’t match any account’s keys.', '<select data-change="sms-default" aria-label="Default account">' + accOpts + '</select>')
            : '')
        : '<div class="note">' + icon('shield', 16) + '<span>SMS reading works only in the Android app — web browsers are not allowed to read SMS. You can still try the parser below.</span></div>') +
      '<details class="adv"><summary>Paste a bank SMS to test the parser</summary><label class="field"><span>SMS text</span><textarea id="sms-paste" rows="3" placeholder="Rs.500.00 debited from A/c XX1234 on 25-10-26 to VPA shop@ybl (UPI Ref 123456789012)"></textarea></label>' +
      '<button class="btn ghost sm" data-action="sms-test">Parse &amp; review</button></details></section>'
    );
  }

  MT.views.settings = {
    title: 'Settings',
    render() {
      const st = MT.store;
      const prefs = MT.storage.getPrefs();
      const theme = prefs.theme || 'system';
      const cur = st.state.settings.currency;
      const enc = st.encrypted;
      return (
        '<div class="page-head"><div><h2 class="page-title">Settings</h2><p class="muted">Rupivo v' + esc(C.version) + '</p></div></div>' +

        '<section class="card"><h3 class="sec-title">Appearance & currency</h3>' +
        row('Theme', 'Light, dark, or follow your device', ui.seg('set-theme', [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'Auto' }], theme)) +
        row('Currency', '', '<select data-change="currency" aria-label="Currency">' + Object.keys(C.currencies).map((k) => '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + k + ' (' + C.currencies[k] + ')</option>').join('') + '</select>') +
        '</section>' +

        '<section class="card"><h3 class="sec-title">' + icon('lock', 18) + ' Security</h3>' +
        row('Passcode encryption', enc ? 'Your data is encrypted on this device (AES-256). If you forget the passcode it <b>cannot</b> be recovered.' : 'Data is saved on this device without a passcode. Add one to encrypt it.',
          '<span class="pill ' + (enc ? 'ok' : 'warn') + '">' + (enc ? 'Encrypted' : 'Not encrypted') + '</span>') +
        '<div class="btn-row">' +
        (enc
          ? '<button class="btn ghost sm" data-action="pass-change">Change passcode</button><button class="btn ghost sm" data-action="pass-lock">Lock now</button><button class="btn ghost danger sm" data-action="pass-remove">Remove passcode</button>'
          : '<button class="btn primary sm" data-action="pass-set"' + (MT.crypto.available() ? '' : ' disabled') + '>Set passcode</button>') +
        '</div>' + (MT.crypto.available() ? '' : '<p class="muted">Encryption needs a secure context (https or localhost).</p>') + '</section>' +

        smsSection() +

        '<section class="card"><h3 class="sec-title">' + icon('download', 18) + ' Your data</h3>' +
        '<p class="muted">All data stays in this browser/app. Export regularly — clearing app data or uninstalling deletes it.</p>' +
        '<div class="btn-grid">' +
        '<button class="btn ghost" data-action="export-json">' + icon('download', 16) + ' Backup (JSON)</button>' +
        '<button class="btn ghost" data-action="export-enc">' + icon('lock', 16) + ' Encrypted backup</button>' +
        '<button class="btn ghost" data-action="export-csv">' + icon('download', 16) + ' Transactions (CSV)</button>' +
        '<label class="btn ghost file-btn">' + icon('upload', 16) + ' Restore backup<input type="file" accept=".json,application/json" data-change="import-file" hidden></label></div></section>' +

        '<section class="card danger-zone"><h3 class="sec-title">Danger zone</h3>' +
        row('Reset all data', 'Deletes every account, person, transaction and your passcode from this device.', '<button class="btn danger sm" data-action="reset-all">Reset…</button>') + '</section>' +

        '<section class="card"><h3 class="sec-title">About</h3><p class="muted">Rupivo is a private, offline money tracker. No accounts, no servers, no analytics.</p>' +
        '<p><a href="terms.html">Terms &amp; Privacy Policy</a></p></section>'
      );
    },
  };

  /* ---------------------------------------------------------------- appearance */
  A['set-theme'] = (el) => {
    MT.app.setTheme(el.dataset.value);
    MT.app.render();
  };
  MT.changes['currency'] = (el) => MT.store.updateSettings({ currency: el.value });

  /* ----------------------------------------------------------------- passcode */
  function passDialog(title, fields, submitText, onSubmit) {
    const el = ui.modal(
      title,
      '<form class="form" novalidate>' +
        fields.map((f) => '<label class="field"><span>' + esc(f[1]) + '</span><input type="password" name="' + f[0] + '" autocomplete="' + (f[0] === 'current' ? 'current-password' : 'new-password') + '"></label>').join('') +
        '<p class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="btn ghost" data-close>Cancel</button><button type="submit" class="btn primary">' + esc(submitText) + '</button></div></form>'
    );
    const form = el.querySelector('form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = form.querySelector('.form-error');
      err.hidden = true;
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        await onSubmit(Object.fromEntries(new FormData(form).entries()));
        ui.closeModal(el);
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
        btn.disabled = false;
      }
    });
    return el;
  }
  const newPassFields = [['pass', 'New passcode (min ' + C.minPasscodeLength + ' characters)'], ['pass2', 'Repeat passcode']];
  function checkNew(d) {
    if (d.pass !== d.pass2) throw new Error('The two passcodes don’t match');
  }

  A['pass-set'] = () =>
    passDialog('Set passcode', newPassFields, 'Encrypt my data', async (d) => {
      checkNew(d);
      await MT.store.setPasscode(d.pass);
      ui.toast('Data is now encrypted', 'ok');
      MT.app.render();
    });
  A['pass-change'] = () =>
    passDialog('Change passcode', [['current', 'Current passcode']].concat(newPassFields), 'Change passcode', async (d) => {
      if (!(await MT.store.verifyPasscode(d.current))) throw new Error('Current passcode is wrong');
      checkNew(d);
      await MT.store.setPasscode(d.pass);
      ui.toast('Passcode changed', 'ok');
    });
  A['pass-remove'] = () =>
    passDialog('Remove passcode', [['current', 'Current passcode']], 'Remove encryption', async (d) => {
      if (!(await MT.store.verifyPasscode(d.current))) throw new Error('Passcode is wrong');
      await MT.store.removePasscode();
      ui.toast('Passcode removed — data is no longer encrypted');
      MT.app.render();
    });
  A['pass-lock'] = () => MT.app.lock();

  /* --------------------------------------------------------------------- data */
  const stamp = () => U.today();
  A['export-json'] = async () => {
    const ok = MT.store.encrypted
      ? await ui.confirm({ title: 'Export without encryption?', message: 'This backup file will be readable by anyone who gets it. Use “Encrypted backup” to protect it with a passphrase.', confirmText: 'Export anyway' })
      : true;
    if (ok) await U.saveFile('rupivo-backup-' + stamp() + '.json', MT.store.exportJSON(), 'application/json');
  };
  A['export-enc'] = () =>
    passDialog('Encrypted backup', [['pass', 'Backup passphrase (min ' + C.minPasscodeLength + ' characters)'], ['pass2', 'Repeat passphrase']], 'Create backup', async (d) => {
      checkNew(d);
      await U.saveFile('rupivo-backup-' + stamp() + '.enc.json', await MT.store.exportEncrypted(d.pass), 'application/json');
      ui.toast('Encrypted backup created', 'ok');
    });
  A['export-csv'] = async () => {
    if (!MT.store.state.transactions.length) return ui.toast('No transactions to export');
    await U.saveFile('rupivo-transactions-' + stamp() + '.csv', MT.store.exportCSV(), 'text/csv');
  };

  async function doImport(text, pass) {
    const r = await MT.store.importBackup(text, pass);
    ui.toast('Restored ' + r.transactions + ' transactions, ' + r.accounts + ' accounts', 'ok');
    MT.app.render();
  }
  MT.changes['import-file'] = async (el) => {
    const file = el.files && el.files[0];
    el.value = '';
    if (!file) return;
    const ok = await ui.confirm({ title: 'Restore this backup?', message: 'This replaces ALL current data on this device with the contents of “' + file.name + '”.', confirmText: 'Replace my data', danger: true });
    if (!ok) return;
    try {
      const text = await U.readFileText(file);
      try {
        await doImport(text);
      } catch (e) {
        if (e.message !== 'NEEDS_PASSPHRASE') throw e;
        passDialog('Encrypted backup', [['current', 'Backup passphrase']], 'Restore', (d) => doImport(text, d.current));
      }
    } catch (e) {
      ui.toast(e.message, 'error');
    }
  };

  A['reset-all'] = async () => {
    const ok = await ui.confirm({
      title: 'Reset all data?',
      message: 'Every account, person and transaction — and your passcode — will be permanently deleted from this device. Export a backup first if you might need it.',
      confirmText: 'Delete everything',
      danger: true,
      typeToConfirm: 'RESET',
    });
    if (!ok) return;
    MT.store.resetAll();
    location.hash = '#/dashboard';
    location.reload();
  };

  /* ---------------------------------------------------------------------- SMS */
  A['sms-toggle'] = async () => {
    const st = MT.store;
    if (st.state.settings.smsEnabled) {
      st.updateSettings({ smsEnabled: false });
      ui.toast('SMS auto-import turned off');
      return MT.app.render();
    }
    const el = ui.modal(
      'Allow reading bank SMS?',
      '<div class="consent"><p>To add transactions automatically, Rupivo needs Android’s <b>SMS permission</b>.</p><ul class="ticks">' +
        '<li>Android has no “bank SMS only” permission, so Rupivo filters on your phone: only messages from <b>bank sender IDs</b> that look like transactions are used. Personal messages, OTPs and contacts are ignored and never stored.</li>' +
        '<li>Only the amount, date, category and a short note are saved — <b>not the SMS text</b>.</li>' +
        '<li>Nothing is uploaded or shared with anyone, including the app’s developer.</li>' +
        '<li>You can turn this off here, or revoke the permission in Android settings, any time.</li></ul>' +
        '<label class="check"><input type="checkbox" id="sms-agree"> <span>I have read and agree to the <a href="terms.html#sms" target="_blank" rel="noopener">Terms &amp; Privacy Policy</a>.</span></label>' +
        '<div class="modal-actions"><button type="button" class="btn ghost" data-close>Not now</button><button type="button" class="btn primary" id="sms-go" disabled>Allow &amp; turn on</button></div></div>',
      { noFocus: true }
    );
    const agree = el.querySelector('#sms-agree');
    const go = el.querySelector('#sms-go');
    agree.addEventListener('change', () => (go.disabled = !agree.checked));
    go.addEventListener('click', async () => {
      go.disabled = true;
      try {
        const granted = (await MT.sms.hasPermission()) || (await MT.sms.requestPermission());
        if (!granted) {
          ui.toast('Permission was not granted', 'error');
          return (go.disabled = false);
        }
        st.updateSettings({ smsEnabled: true, smsConsentAt: new Date().toISOString() });
        ui.closeModal(el);
        const r = await MT.sms.sync();
        ui.toast('Imported ' + r.imported + ' bank transaction' + (r.imported === 1 ? '' : 's'), 'ok');
        MT.app.render();
      } catch (e) {
        ui.toast(e.message, 'error');
        go.disabled = false;
      }
    });
  };
  A['sms-sync'] = async () => {
    try {
      const r = await MT.sms.sync();
      ui.toast(r.imported ? 'Imported ' + r.imported + ' new transaction' + (r.imported === 1 ? '' : 's') : 'No new bank transactions' + (r.unassigned ? ' (' + r.unassigned + ' need an account — set a default)' : ''), 'ok');
      MT.app.render();
    } catch (e) {
      ui.toast(e.message, 'error');
    }
  };
  MT.changes['sms-default'] = (el) => MT.store.updateSettings({ smsDefaultAccountId: el.value || null });

  A['sms-test'] = () => {
    const text = (document.getElementById('sms-paste') || {}).value || '';
    const p = MT.sms.parse(text, {});
    if (!p) return ui.toast('Not recognised as a bank transaction SMS', 'error');
    const st = MT.store;
    const acc = st.state.accounts.find((a) => String(a.smsKey || '').split(',').map((k) => k.trim()).filter(Boolean).some((k) => k === p.last4 || (p.bank && k.toLowerCase() === p.bank.toLowerCase()))) || null;
    MT.forms.openTx({ type: p.type, amount: p.amount, date: p.date, category: p.category, note: p.note, accountId: acc && acc.id });
  };
})(typeof window !== 'undefined' ? window : globalThis);
