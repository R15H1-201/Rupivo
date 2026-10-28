/**
 * lock.js — the first-run welcome, the passcode lock screen, and the "data unreadable" screen.
 * MT.lock.show(mode) returns a Promise that resolves once the store is ready.
 *   mode: 'new' | 'locked' | 'corrupt'
 */
(function (g) {
  'use strict';
  const MT = (g.MT = g.MT || {});
  const C = MT.config;
  const U = MT.util;
  const esc = U.esc;
  const icon = MT.icon;

  const logo = '<img class="lock-logo" src="assets/logo.svg" alt="" width="72" height="72">';

  function shell(inner) {
    const el = document.getElementById('lock');
    el.innerHTML = '<div class="lock-card">' + logo + inner + '</div>';
    el.hidden = false;
    return el;
  }
  const setErr = (el, msg) => {
    const p = el.querySelector('.form-error');
    p.textContent = msg;
    p.hidden = !msg;
  };

  function welcome(resolve) {
    const canEncrypt = MT.crypto.available();
    const el = shell(
      '<h1>Welcome to ' + esc(C.appName) + '</h1><p class="muted">A private money tracker. Your data stays on this device — no accounts, no servers.</p>' +
        (canEncrypt
          ? '<form class="form" novalidate><p class="lock-sub">' + icon('lock', 16) + ' Protect it with a passcode <span class="muted">(recommended)</span></p>' +
            '<label class="field"><span>Passcode (min ' + C.minPasscodeLength + ' characters)</span><input type="password" name="pass" autocomplete="new-password"></label>' +
            '<label class="field"><span>Repeat passcode</span><input type="password" name="pass2" autocomplete="new-password"></label>' +
            '<p class="muted small">Your data is encrypted with this passcode. There is <b>no way to recover it</b> if you forget it — write it down somewhere safe.</p>' +
            '<p class="form-error" role="alert" hidden></p><button class="btn primary block" type="submit">Create passcode &amp; start</button>' +
            '<button class="btn ghost block" type="button" data-skip>Skip for now</button></form>'
          : '<div class="form"><p class="muted small">Encryption is unavailable here (it needs https or localhost).</p><button class="btn primary block" data-skip>Start without passcode</button></div>') +
        '<p class="muted small center"><a href="terms.html">Terms &amp; Privacy Policy</a></p>'
    );
    const start = async (pass) => {
      try {
        await MT.store.startFresh(pass);
        el.hidden = true;
        resolve();
      } catch (e) {
        setErr(el, e.message);
      }
    };
    const skip = el.querySelector('[data-skip]');
    if (skip) skip.addEventListener('click', () => start(null));
    const form = el.querySelector('form');
    if (form)
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const f = form.elements;
        if (f.pass.value.length < C.minPasscodeLength) return setErr(el, 'Use at least ' + C.minPasscodeLength + ' characters');
        if (f.pass.value !== f.pass2.value) return setErr(el, 'The two passcodes don’t match');
        start(f.pass.value);
      });
  }

  function locked(resolve) {
    const el = shell(
      '<h1>' + esc(C.appName) + ' is locked</h1><p class="muted">Enter your passcode to unlock.</p>' +
        '<form class="form" novalidate><label class="field"><span>Passcode</span><input type="password" name="pass" autocomplete="current-password"></label>' +
        '<p class="form-error" role="alert" hidden></p><button class="btn primary block" type="submit">Unlock</button>' +
        '<button class="btn ghost block" type="button" data-forgot>Forgot passcode?</button></form>'
    );
    const form = el.querySelector('form');
    setTimeout(() => form.elements.pass.focus(), 50);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      btn.textContent = 'Unlocking…';
      setErr(el, '');
      try {
        await MT.store.unlock(form.elements.pass.value);
        el.hidden = true;
        resolve();
      } catch (err) {
        setErr(el, err.message);
        btn.disabled = false;
        btn.textContent = 'Unlock';
        form.elements.pass.select();
      }
    });
    el.querySelector('[data-forgot]').addEventListener('click', async () => {
      const ok = await MT.ui.confirm({
        title: 'Forgot your passcode?',
        message: 'Your data is encrypted and cannot be recovered without the passcode. The only option is to erase everything and start over. If you have a backup file, you can restore it afterwards.',
        confirmText: 'Erase & start over',
        danger: true,
        typeToConfirm: 'ERASE',
      });
      if (ok) {
        MT.store.resetAll();
        location.reload();
      }
    });
  }

  function corrupt() {
    const el = shell(
      '<h1>Data can’t be read</h1><p class="muted">The saved data looks damaged. You can erase it and start fresh (restore a backup afterwards if you have one).</p>' +
        '<button class="btn danger block" data-erase>Erase and start over</button>'
    );
    el.querySelector('[data-erase]').addEventListener('click', () => {
      MT.store.resetAll();
      location.reload();
    });
  }

  MT.lock = {
    show(mode) {
      return new Promise((resolve) => {
        if (mode === 'new') welcome(resolve);
        else if (mode === 'locked') locked(resolve);
        else corrupt();
      });
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
