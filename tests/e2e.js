// Browser smoke test: node tests/e2e.js  (needs the site served at http://localhost:8765)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errors = [];
  const run = async (label, vp) => {
    const ctx = await b.newContext({ viewport: vp });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(label + ' pageerror: ' + e.message));
    p.on('console', (m) => m.type() === 'error' && errors.push(label + ' console: ' + m.text()));
    await p.goto('http://localhost:8765/index.html');
    await p.click('[data-skip]');                       // start without passcode
    await p.waitForSelector('.hero-v');
    // add an expense via FAB
    await p.click('#fab'); await p.click('.fab-item[data-type=expense]');
    await p.fill('input[name=amount]', '250'); await p.fill('input[name=note]', 'lunch');
    await p.click('.modal form [type=submit]');
    await p.waitForSelector('.tx');
    // add person + given
    await p.click('#fab'); await p.click('.fab-item[data-type=given]');
    await p.selectOption('select[name=personId]', '__new__');
    await p.fill('input[name=newPerson]', 'Ravi'); await p.fill('input[name=amount]', '1000');
    await p.click('.modal form [type=submit]');
    await p.waitForTimeout(300);
    const hero = await p.textContent('.hero-v');
    for (const r of ['accounts', 'people', 'reports', 'settings', 'transactions']) {
      await p.goto('http://localhost:8765/index.html#/' + r); await p.waitForTimeout(250);
    }
    await p.goto('http://localhost:8765/index.html#/dashboard'); await p.reload(); await p.waitForSelector('.hero-v');
    const after = await p.textContent('.hero-v');
    await p.screenshot({ path: `/tmp/claude-0/-home-claude/d325c828-88f5-5391-8735-4dfb69047222/scratchpad/${label}.png`, fullPage: false });
    console.log(label, 'balance', hero, '-> after reload', after, hero === after && after.includes('−') ? 'FAIL?' : '');
    await ctx.close();
  };
  await run('desktop', { width: 1280, height: 800 });
  await run('mobile', { width: 390, height: 800 });
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no JS errors');
  await b.close();
})();
