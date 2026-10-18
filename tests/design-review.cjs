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
          for (const el of document.querySelectorAll('.card, .toolbar, header, .spotlight, .card-actions, .card-actions button, .card-actions .btn-label')) {
            if (el.scrollWidth > el.clientWidth + 1) bad.push('overflow: ' + el.className);
          }
          for (const row of document.querySelectorAll('.card-actions')) {
            const rects = [...row.querySelectorAll('button')].map(el => el.getBoundingClientRect());
            if (rects.some((a, i) => rects.slice(i + 1).some(b => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top))) bad.push('overlapping actions');
          }
          const luminance = color => {
            const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => n / 255);
            const linear = rgb.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
            return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
          };
          for (const el of document.querySelectorAll('.card.open .card-actions button')) {
            const style = getComputedStyle(el);
            const fg = luminance(style.color), bg = luminance(style.backgroundColor);
            if ((Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05) < 4.5) bad.push('Low text contrast: ' + el.textContent);
            if (el.offsetHeight < 56) bad.push('Small action target: ' + el.textContent);
          }
          for (const el of document.querySelectorAll('button .ui-icon')) {
            if (!el.getClientRects().length) continue;
            const ref = el.querySelector('use').getAttribute('href');
            if (!document.querySelector(ref) || el.getBBox().width === 0) bad.push('missing icon: ' + ref);
          }
          return bad;
        });
        assert.deepEqual(issues, [], `Layout at ${width}px`);
      }
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('[data-uid="book0:1"] .card-actions').screenshot({ path: path.join(output, 'desktop-actions.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-uid="book0:1"]').screenshot({ path: path.join(output, `${mode}-card.png`) });
    await page.locator('[data-uid="book0:1"] .card-actions').screenshot({ path: path.join(output, 'mobile-actions.png') });
    if (mode === 'verify') {
      assert.equal(await page.locator('[data-mission="book0:1"] .btn-label').textContent(), "Set today's mission");
      assert.equal(await page.locator('[data-mission="book0:1"] use').getAttribute('href'), '#ui-Flag');
      assert.equal(await page.locator('[data-challenge="book0:1"] .btn-label').textContent(), 'Start daily challenge');
      assert.equal(await page.locator('[data-challenge="book0:1"] use').getAttribute('href'), '#ui-CalendarDays');
      assert.equal(await page.locator('#mission-pick use').getAttribute('href'), '#ui-Flag');
    }
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
      assert.equal(await page.locator('[data-uid="book0:1"] .card-lived .ui-icon').count(), 1, 'Completion preserves the button icon');
      assert.equal(await page.locator('[data-uid="book0:1"] .card-lived').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('[data-uid="book0:1"] .card-lived .btn-label').textContent(), 'Completed today');
      assert.equal(await page.locator('[data-uid="book0:1"] .card-lived').getAttribute('title'), "Undo today's completion");
      await page.locator('[data-uid="book0:1"] .card-lived').click();
      assert.equal(await page.locator('[data-uid="book0:1"] .card-lived .btn-label').textContent(), 'I lived it today');
      assert.equal(await page.locator('[data-uid="book0:1"] .tick').getAttribute('aria-pressed'), 'false');
      await page.locator('[data-mission="book0:1"] .ui-icon').click();
      assert.equal(await page.evaluate(() => todaysMission().uid), 'book0:1', 'Flag icon sets the mission');
      await page.locator('#mission-change').click();
      await page.locator('[data-challenge="book0:1"] .ui-icon').click();
      assert.equal(await page.locator('#challenge-modal').evaluate(el => el.classList.contains('show')), true, 'Calendar icon opens duration picker');
      await page.locator('#challenge-cancel').click();
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
      const missionUid = await page.evaluate(() => todaysMission().uid);
      await page.evaluate(uid => { expanded.add(uid); renderGrid(); }, missionUid);
      assert.equal(await page.locator(`[data-mission="${missionUid}"] .btn-label`).textContent(), "Today's mission set");
      assert.equal(await page.locator('#mission-challenge use').getAttribute('href'), '#ui-CalendarDays');
      await page.locator('#mission-challenge').click();
      assert.equal(await page.locator('#challenge-submit use').getAttribute('href'), '#ui-CalendarDays');
      await page.locator('#challenge-submit').click();
      assert.equal(await page.locator('.challenge').count(), 1);
      const challengeButton = page.locator(`[data-challenge="${missionUid}"]`);
      assert.equal(await challengeButton.locator('.btn-label').textContent(), 'Edit 7-day challenge');
      await challengeButton.click();
      await page.locator('#challenge-duration').fill('30');
      await page.locator('#challenge-submit').click();
      assert.equal(await challengeButton.getAttribute('title'), 'Edit your 30-day challenge');
      assert.equal(await challengeButton.locator('.btn-label').textContent(), 'Edit 30-day challenge');
      await page.locator(`[data-uid="${missionUid}"] .card-actions`).screenshot({ path: path.join(output, 'mobile-active-actions.png') });
      await page.screenshot({ path: path.join(output, 'verify-mission-challenge.png') });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.locator('#mission-change').click();
      assert.equal(await page.locator(`[data-mission="${missionUid}"] .btn-label`).textContent(), "Set today's mission");
      page.once('dialog', d => d.accept());
      await page.locator('#ch-end').click();
      assert.equal(await challengeButton.locator('.btn-label').textContent(), 'Start daily challenge');
      await page.setViewportSize({ width: 320, height: 900 });
      await page.evaluate(() => document.documentElement.style.fontSize = '24px');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page reflows with enlarged text');
      assert.ok(await page.locator('.card.open .card-actions button').evaluateAll(buttons => buttons.every(el => el.scrollWidth <= el.clientWidth + 1)), 'Action labels fit with enlarged text');
      await page.evaluate(() => document.documentElement.style.fontSize = '');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await page.locator('html').evaluate(el => getComputedStyle(el).scrollBehavior), 'auto');
    }
    assert.deepEqual(errors, []);
    console.log(`PASS: ${mode} layout screenshots and checks.`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
