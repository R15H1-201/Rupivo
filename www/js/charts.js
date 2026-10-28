/**
 * charts.js — dependency-free charts that return HTML/SVG strings.
 * Colours come from CSS variables (--c1 … --c8, --income, --expense) so dark mode just works.
 */
(function (g) {
  'use strict';
  const MT = (g.MT = g.MT || {});
  const U = MT.util;
  const esc = U.esc;

  const colorAt = (i) => 'var(--c' + ((i % 8) + 1) + ')';

  MT.charts = {
    colorAt: colorAt,

    /** Donut. items: [{label, value}] */
    donut(items, opts) {
      opts = opts || {};
      const size = 168;
      const th = 24;
      const r = (size - th) / 2;
      const circ = 2 * Math.PI * r;
      const total = items.reduce((s, i) => s + i.value, 0);
      let offset = 0;
      let rings = '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="var(--surface-2)" stroke-width="' + th + '"/>';
      if (total > 0) {
        items.forEach((it, i) => {
          const len = (it.value / total) * circ;
          rings +=
            '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + colorAt(i) + '" stroke-width="' + th +
            '" stroke-dasharray="' + len.toFixed(2) + ' ' + (circ - len).toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) +
            '"><title>' + esc(it.label) + ': ' + esc(U.money(it.value)) + '</title></circle>';
          offset += len;
        });
      }
      return (
        '<svg class="donut" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="' + esc(opts.label || 'Breakdown') + '">' +
        '<g transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')">' + rings + '</g>' +
        '<text x="50%" y="47%" text-anchor="middle" class="donut-v">' + esc(U.compact(total)) + '</text>' +
        '<text x="50%" y="60%" text-anchor="middle" class="donut-l">' + esc(opts.center || 'Total') + '</text></svg>'
      );
    },

    /** Legend list matching donut colours. items: [{label,value}] */
    legend(items) {
      const total = items.reduce((s, i) => s + i.value, 0) || 1;
      return (
        '<ul class="legend">' +
        items
          .map(
            (it, i) =>
              '<li><span class="dot" style="background:' + colorAt(i) + '"></span><span class="lg-name">' + esc(it.label) +
              '</span><span class="lg-pct">' + Math.round((it.value / total) * 100) + '%</span><b>' + esc(U.money(it.value)) + '</b></li>'
          )
          .join('') +
        '</ul>'
      );
    },

    /** Grouped bars: income vs expense per month. data: [{label,income,expense}] */
    bars(data) {
      const pl = 44;
      const pt = 10;
      const pb = 26;
      const H = 200;
      const slot = 62;
      const W = pl + data.length * slot + 8;
      const max = Math.max.apply(null, [1].concat(data.map((d) => Math.max(d.income, d.expense))));
      const ch = H - pt - pb;
      const y = (v) => pt + ch - (v / max) * ch;
      let s = '<svg class="barchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Income and expenses by month">';
      [0, 0.5, 1].forEach((f) => {
        const yy = y(max * f);
        s += '<line x1="' + pl + '" x2="' + (W - 4) + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--border)" stroke-width="1"/>' +
          '<text x="' + (pl - 6) + '" y="' + (yy + 4) + '" text-anchor="end" class="axis">' + esc(U.compact(max * f)) + '</text>';
      });
      data.forEach((d, i) => {
        const x = pl + i * slot + 12;
        const bw = 16;
        s += '<rect x="' + x + '" y="' + y(d.income) + '" width="' + bw + '" height="' + Math.max(0, pt + ch - y(d.income)) + '" rx="3" fill="var(--income)"><title>' + esc(d.label) + ' income: ' + esc(U.money(d.income)) + '</title></rect>';
        s += '<rect x="' + (x + bw + 4) + '" y="' + y(d.expense) + '" width="' + bw + '" height="' + Math.max(0, pt + ch - y(d.expense)) + '" rx="3" fill="var(--expense)"><title>' + esc(d.label) + ' expenses: ' + esc(U.money(d.expense)) + '</title></rect>';
        s += '<text x="' + (x + bw + 2) + '" y="' + (H - 8) + '" text-anchor="middle" class="axis">' + esc(d.label) + '</text>';
      });
      return '<div class="chart-scroll">' + s + '</svg></div>';
    },

    /** Horizontal bars. items: [{label, value, sub?}] */
    hbars(items, colorVar) {
      const max = Math.max.apply(null, [1].concat(items.map((i) => i.value)));
      return (
        '<ul class="hbars">' +
        items
          .map(
            (it) =>
              '<li><div class="hb-top"><span>' + esc(it.label) + '</span><b>' + esc(U.money(it.value)) + '</b></div>' +
              '<div class="hb-track"><div class="hb-fill" style="width:' + Math.max(2, (it.value / max) * 100).toFixed(1) + '%;background:' + (colorVar || 'var(--primary)') + '"></div></div>' +
              (it.sub ? '<small class="muted">' + esc(it.sub) + '</small>' : '') + '</li>'
          )
          .join('') +
        '</ul>'
      );
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
