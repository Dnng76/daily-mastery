const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const [modules, output] = process.argv.slice(2);
const { chromium } = require(path.join(modules, 'playwright'));
const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const rules = Array.from({ length: 20 }, (_, i) => ({ n: i + 1, id: i + 1,
  title: `Principle ${i + 1}: Make time for the things that matter most`,
  gain: ['More time for meaningful work.'], lose: ['Unnecessary distractions.'],
  standard: 'Choose one useful action and give it your full attention today.' }));
const seed = { books: [{ id: 'test', name: 'Personal Mastery and Everyday Principles', color: '#1D9E75', importedAt: '2026-10-01', rules }] };
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    fs.mkdirSync(output, { recursive: true });
    const pages = [];
    const errors = [];
    for (let i = 0; i < 2; i++) {
      const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
      await ctx.route('**/*', route => {
        const url = route.request().url();
        if (url === 'http://localhost:18765/') return route.fulfill({ body: source, contentType: 'text/html' });
        if (url.endsWith('/pdf.min.js')) return route.fulfill({ body: 'window.pdfjsLib={GlobalWorkerOptions:{}};', contentType: 'application/javascript' });
        return route.abort();
      });
      const page = await ctx.newPage();
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://localhost:18765/');
      await page.evaluate(seed => {
        data = structuredClone(seed); invalidateRules(); booksChanged('test'); flushSave();
        filter = 'all'; openBooks.add('test'); renderAll();
      }, seed);
      pages.push(page);
    }
    const [a, b] = pages;
    const tick = a.locator('[data-uid="test:1"] .tick');
    const sizes = await tick.evaluate(el => ({
      target: [el.offsetWidth, el.offsetHeight],
      circle: [getComputedStyle(el, '::before').width, getComputedStyle(el, '::before').height]
    }));
    assert.deepEqual(sizes, { target: [44, 44], circle: ['30px', '30px'] }, 'Small visible circle retains the full tap area');
    await tick.click({ position: { x: 3, y: 22 } });
    assert.equal(await tick.getAttribute('aria-pressed'), 'true', 'Outer invisible tap area completes the rule');
    await tick.click();
    assert.equal(await tick.getAttribute('aria-pressed'), 'false');
    assert.equal(await a.locator('.card-top [data-star], .card-top [data-hide]').count(), 0, 'Header only contains the completion control');
    await a.locator('[data-uid="test:1"] .card-title').click();
    assert.equal(await a.locator('.card-actions [data-star="test:1"]').count(), 1, 'Star is a footer action');
    assert.equal(await a.locator('.card-actions [data-hide="test:1"]').count(), 1, 'Hide is a footer action');
    assert.equal(await a.locator('[data-star="test:1"] .ui-icon').evaluate(el => getComputedStyle(el).color), 'rgb(250, 204, 21)', 'Star icon is yellow before selection');
    assert.equal(await a.locator('[data-hide="test:1"] .ui-icon').evaluate(el => getComputedStyle(el).color), 'rgb(255, 133, 133)', 'Hide icon is red without hover');
    assert.equal(await a.locator('[data-hide="test:1"] .btn-label').textContent(), 'Hide rule');
    await a.locator('[data-star="test:1"] .ui-icon').click();
    assert.equal(await a.locator('[data-star="test:1"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await a.locator('.card.open').count(), 1, 'Starring must keep the card expanded');
    await a.locator('[data-filter="starred"]').click();
    assert.equal(await a.locator('.card').count(), 1);
    assert.equal(await a.evaluate(() => spotlightRule().uid), 'test:1');
    await a.evaluate(() => localStorage.setItem(SPOT_OVERRIDE_KEY, JSON.stringify({ day: currentDay, uid: 'test:2' })));
    assert.equal(await a.evaluate(() => spotlightRule().uid), 'test:2', 'Manual shuffle can select an unstarred rule');
    await a.evaluate(() => smartSpotlight());
    await a.evaluate(() => { setMission('test:1'); plan().challenge = { uid: 'test:1', start: currentDay, at: Date.now() }; });
    await a.locator('[data-hide="test:1"]').click();
    assert.equal(await a.locator('.card').count(), 0);
    assert.ok(await a.evaluate(() => !getDailyFocus().has('test:1') && spotlightRule().uid !== 'test:1' && !todaysMission() && !activeChallenge()));
    await a.locator('#toast button').click();
    assert.equal(await a.locator('[data-star="test:1"]').getAttribute('aria-pressed'), 'true', 'Undo restores previous star');
    await a.locator('[data-hide="test:1"]').click();
    await a.locator('[data-filter="hidden"]').click();
    assert.equal(await a.locator('.card').count(), 1);
    assert.equal(await a.locator('[data-hide="test:1"] .btn-label').textContent(), 'Restore rule');
    await a.evaluate(() => { expanded.add('test:1'); renderGrid(); });
    assert.equal(await a.locator('.card [data-tick]').count(), 0);
    await a.screenshot({ path: path.join(output, 'hidden-mobile.png') });
    const payload = await a.evaluate(() => JSON.parse(tickPayload()));
    await b.evaluate(remote => { mergeTicks(remote); flushSave(); renderAll(); }, payload);
    assert.equal(await b.evaluate(() => isHidden('test:1')), true);
    await b.reload();
    assert.equal(await b.evaluate(() => isHidden('test:1')), true, 'Hidden mark persists');
    await b.evaluate(() => toggleMark('test:2', 'star'));
    const older = await b.evaluate(() => JSON.parse(tickPayload()));
    await a.locator('[data-hide="test:1"]').click();
    const restored = await a.evaluate(() => JSON.parse(tickPayload()));
    await b.evaluate(remote => mergeTicks(remote), restored);
    assert.ok(await b.evaluate(() => !isHidden('test:1') && isStarred('test:2')), 'Independent changes survive merge');
    await a.evaluate(remote => mergeTicks(remote), older);
    assert.ok(await a.evaluate(() => !isHidden('test:1') && isStarred('test:2')), 'Old hide does not undo restoration');
    assert.ok(await a.evaluate(remote => remoteMissingOurPlan(remote.plan), older), 'Offline restoration must be pushed');
    await a.evaluate(() => { rewriteUids(uid => uid === 'test:2' ? 'test:3' : uid); flushSave(); });
    assert.ok(await a.evaluate(() => isStarred('test:3') && !isStarred('test:2')), 'Book deduplication preserves marks');
    await a.reload();
    assert.ok(await a.evaluate(() => isStarred('test:3') && !isHidden('test:1')));
    await a.evaluate(() => { filter = 'starred'; renderAll(); });
    await a.locator('[data-uid="test:3"] .card-title').click();
    await a.locator('[data-star="test:3"]').click();
    assert.equal(await a.locator('.card').count(), 0, 'Unstar removes from starred filter');
    await a.evaluate(() => { for (const r of allRules()) setMark(r.uid, 'hide'); });
    assert.ok(await a.evaluate(() => getDailyFocus().size === 0 && spotlightRule() === null));
    await a.locator('[data-filter="hidden"]').click();
    assert.equal(await a.locator('.card').count(), 20, 'All hidden rules remain recoverable');
    await a.evaluate(() => { setMark('test:1', 'star'); filter = 'starred'; expanded.add('test:1'); renderAll(); });
    for (const width of [320, 390, 768, 1280]) {
      await a.setViewportSize({ width, height: 900 });
      assert.ok(await a.evaluate(() => [...document.querySelectorAll('.card')].every(el => el.scrollWidth <= el.clientWidth + 1)), `Card overflow at ${width}px`);
      assert.ok(await a.evaluate(() => {
        const buttons = [...document.querySelectorAll('.card-actions button')].map(el => el.getBoundingClientRect());
        return buttons.every((a, i) => buttons.slice(i + 1).every(b => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top));
      }), `Footer buttons overlap at ${width}px`);
    }
    await a.setViewportSize({ width: 390, height: 844 });
    await a.locator('.card').first().screenshot({ path: path.join(output, 'starred-card.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: star, unstar, hide, undo, restore, filters, focus/mission exclusion, persistence, two-device merge, stale updates, alias migration, all-hidden, mobile layouts.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
