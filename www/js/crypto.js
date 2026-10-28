/**
 * crypto.js — passcode-based encryption of the data file.
 *
 *   passcode --PBKDF2-SHA256 (310k rounds, random salt)--> 256-bit key
 *   key + random 12-byte IV --AES-GCM--> ciphertext (tamper-proof)
 *
 * The stored/exported file is plain JSON that contains ONLY the salt, IV and
 * ciphertext. The passcode is never stored. Without it the data is unreadable.
 * Uses the browser's built-in Web Crypto API (no libraries, nothing to install).
 */
(function (g) {
  'use strict';
  const MT = (g.MT = g.MT || {});
  const C = MT.config;

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const subtle = () => g.crypto && g.crypto.subtle;

  function b64(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(str) {
    const s = atob(str);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  async function deriveKey(pass, salt, iterations) {
    const base = await subtle().importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  MT.crypto = {
    available: () => !!(subtle() && g.crypto.getRandomValues),

    /** Create a new vault (key + salt) from a passcode. */
    async createVault(pass) {
      const salt = g.crypto.getRandomValues(new Uint8Array(16));
      const iter = C.kdfIterations;
      return { key: await deriveKey(pass, salt, iter), salt: b64(salt), iter: iter };
    },

    /** Encrypt a string with an unlocked vault -> envelope object (safe to save as JSON). */
    async encrypt(text, vault) {
      const iv = g.crypto.getRandomValues(new Uint8Array(12));
      const ct = await subtle().encrypt({ name: 'AES-GCM', iv: iv }, vault.key, enc.encode(text));
      return { enc: true, v: 1, alg: 'AES-GCM-256', kdf: 'PBKDF2-SHA256', iter: vault.iter, salt: vault.salt, iv: b64(iv), data: b64(ct) };
    },

    /** Decrypt an envelope with a passcode. Throws 'Wrong passcode' on failure. */
    async open(pass, env) {
      if (!env || !env.salt || !env.iv || !env.data) throw new Error('Encrypted file is damaged');
      const key = await deriveKey(pass, unb64(env.salt), env.iter || C.kdfIterations);
      let plain;
      try {
        plain = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, key, unb64(env.data));
      } catch (e) {
        throw new Error('Wrong passcode');
      }
      return { vault: { key: key, salt: env.salt, iter: env.iter || C.kdfIterations }, text: dec.decode(plain) };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
