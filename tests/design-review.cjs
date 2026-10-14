const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const [modules, output, mode = 'verify', assets = path.join(__dirname, '..')] = process.argv.slice(2);
const { chromium } = require(path.join(modules, 'playwright'));
const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const titles = ['Do one thing that scares you a little', 'Protect the first hour of your day', 'Choose consistency over intensity', 'Make time for the things that matter most'];
const books = ['Personal Growth & Everyday Courage', 'Health & Energy', 'Trading Mindset'].map((name, b) => ({
  id: `book${b}`, name, color: ['#5c97ff', '#1D9E75', '#e0a53c'][b], importedAt: '2026-10-01',
  rules: titles.map((title, i) => ({ id: i + 1, n: i + 1, title,
    today: 'Choose one safe action today that makes you slightly nervous, and do it before you overthink it.',
    gain: ['Your comfort zone expands.', 'Fear becomes less controlling.', 'You build proof that discomfort is survivable.'],
    lose: ['You keep organizing life around avoidance.', 'Small fears become bigger through repetition.', 'Confidence stays theoretical.'],
    reality: 'Daring does not mean reckless. The goal is manageable discomfort, not unnecessary danger.',
    why: 'Repeated exposure to safe discomfort teaches your brain that fear does not always require escape.',
    standard: 'Choose one useful action and give it your full attention today.' }))
}));

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.href === 'http://localhost:18765/') return route.fulfill({ body: source, contentType: 'text/html' });
      if (url.pathname.endsWith('/pdf.min.js')) return route.fulfill({ body: 'window.pdfjsLib={GlobalWorkerOptions:{}};', contentType: 'application/javascript' });
      if (/\/icon-192\.png$/.test(url.pathname)) return route.fulfill({ path: path.join(assets, 'icon-192.png'), contentType: 'image/png' });
      return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://localhost:18765/');
    await page.evaluate(books => {
      data = { books }; invalidateRules(); booksChanged(...books.map(b => b.id));
      const yesterday = addDays(currentDay, -1);
      data['ticks_' + yesterday] = ['book0:1', 'book1:1'];
      setTicks(['book1:1']);
      plan().marks['book0:1'] = { v: 'star', at: Date.now() };
      filter = 'focus'; expanded.add('book0:1'); flushSave(); renderAll();
    }, books);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: path.join(output, `${mode}-${width}.png`), fullPage: true });
      await page.screenshot({ path: path.join(output, `${mode}-viewport-${width}.png`) });
      if (mode === 'verify') {
        const issues = await page.evaluate(() => {
          const bad = [];
          if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('page overflow');
          for (const el of document.querySelectorAll('.card, .toolbar, header, .spotlight, .card-actions button')) {
            if (el.scrollWidth > el.clientWidth + 1) bad.push('overflow: ' + el.className);
          }
          for (const row of document.querySelectorAll('.card-actions')) {
            const rects = [...row.querySelectorAll('button')].map(el => el.getBoundingClientRect());
            if (rects.some((a, i) => rects.slice(i + 1).some(b => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top))) bad.push('overlapping actions');
          }
          return bad;
        });
        assert.deepEqual(issues, [], `Layout at ${width}px`);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-uid="book0:1"]').screenshot({ path: path.join(output, `${mode}-card.png`) });
    await page.locator('#btn-library').click();
    await page.screenshot({ path: path.join(output, `${mode}-library.png`) });
    if (mode === 'verify') {
      assert.ok(await page.locator('#library-modal .modal').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Library fits phone');
    }
    await page.locator('#btn-modal-close').click();
    if (mode === 'verify') {
      assert.ok(await page.locator('.brand-icon').evaluate(el => el.complete && el.naturalWidth > 0), 'Brand asset renders');
      await page.locator('[data-uid="book0:1"] .card-expand').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('[data-uid="book0:1"] .card-expand').getAttribute('aria-expanded'), 'false');
      await page.keyboard.press('Space');
      assert.equal(await page.locator('[data-uid="book0:1"] .card-expand').getAttribute('aria-expanded'), 'true');
      await page.locator('[data-uid="book0:1"] .para').first().click();
      assert.equal(await page.locator('[data-uid="book0:1"] .card-expand').getAttribute('aria-expanded'), 'true', 'Reading text does not collapse the rule');
      await page.locator('[data-uid="book0:1"] .tick').click();
      assert.equal(await page.locator('[data-uid="book0:1"] .tick').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.ring-box').getAttribute('aria-valuenow'), '17');
      await page.locator('#btn-mix').click();
      assert.equal(await page.locator('#btn-order').isVisible(), true);
      await page.locator('#btn-order').click();
      await page.locator('#search').fill('nothing-matches-this-search');
      await page.locator('#clear-filters').waitFor();
      assert.equal(await page.locator('.card').count(), 0);
      await page.locator('#clear-filters').click();
      assert.equal(await page.locator('#search').inputValue(), '');
      await page.locator('[data-open-picker]').click();
      await page.locator('#picker-search').fill('Trading');
      assert.equal(await page.locator('.picker-row').count(), 1);
      await page.locator('.picker-row').click();
      assert.equal(await page.locator('.card').count(), 4);
      await page.locator('[data-filter="focus"]').click();
      await page.locator('#mission-pick').click();
      await page.locator('#mission-challenge').click();
      assert.equal(await page.locator('.challenge').count(), 1);
      await page.screenshot({ path: path.join(output, 'verify-mission-challenge.png') });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await page.locator('html').evaluate(el => getComputedStyle(el).scrollBehavior), 'auto');
    }
    assert.deepEqual(errors, []);
    console.log(`PASS: ${mode} layout screenshots and checks.`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
