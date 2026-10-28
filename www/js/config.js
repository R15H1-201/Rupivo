/**
 * config.js — every constant the app uses lives here.
 * Want a new category, bank, or currency? Edit this file only.
 */
(function (g) {
  'use strict';
  const MT = (g.MT = g.MT || {});

  MT.config = {
    appName: 'Rupivo',
    version: '1.0.0',
    schemaVersion: 1,

    storageKeys: { data: 'rupivo.data.v1', prefs: 'rupivo.prefs.v1' },

    // Encryption (see crypto.js)
    kdfIterations: 310000,
    minPasscodeLength: 6,
    autoLockSeconds: 120, // lock again after the app was in background this long

    currencies: { INR: '₹', USD: '$', EUR: '€', GBP: '£' },

    accountTypes: {
      cash: { label: 'Cash', icon: 'wallet' },
      upi: { label: 'UPI', icon: 'phone' },
      other: { label: 'Other', icon: 'bank' },
    },
    banks: ['BOB', 'Kotak', 'SBI', 'HDFC', 'ICICI', 'Axis', 'PNB', 'Canara', 'Union Bank', 'IDFC First', 'Yes Bank', 'IndusInd'],
    upiApps: ['GPay', 'PhonePe', 'Paytm', 'Kotak', 'BOB', 'SuperMoney', 'CRED', 'Amazon Pay', 'BHIM'],

    // sign: effect on the account balance (+1 adds money, -1 removes, 0 = moves between accounts)
    txTypes: {
      expense: { label: 'Expense', sign: -1, icon: 'arrowUp', color: 'expense' },
      income: { label: 'Income', sign: 1, icon: 'arrowDown', color: 'income' },
      given: { label: 'Given', long: 'Money Given', sign: -1, icon: 'send', color: 'given' },
      received: { label: 'Received', long: 'Money Received', sign: 1, icon: 'inbox', color: 'received' },
      transfer: { label: 'Transfer', sign: 0, icon: 'swap', color: 'transfer' },
    },

    categories: {
      expense: ['Food', 'Groceries', 'Transport', 'Fuel', 'Shopping', 'Bills', 'Rent', 'Recharge', 'Health', 'Education', 'Entertainment', 'Travel', 'Other'],
      income: ['Salary', 'Business', 'Freelance', 'Interest', 'Gift', 'Refund', 'Other'],
      given: ['Loan', 'Advance', 'Repayment', 'Personal', 'Other'],
      received: ['Repayment', 'Loan', 'Advance', 'Personal', 'Other'],
      transfer: ['Transfer'],
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
