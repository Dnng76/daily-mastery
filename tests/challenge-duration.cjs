const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const [modules, output] = process.argv.slice(2);
const { chromium } = require(path.join(modules, 'playwright'));
const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const seed = { books: [{ id: 'test', name: 'Personal Mastery', color: '#1D9E75', importedAt: '2026-10-01', rules: [
  { id: 1, n: 1, title: 'Make time for the things that matter most', gain: [], lose: [], standard: 'Practice one useful action each day.' },
  { id: 2, n: 2, title: 'Protect your attention', gain: [], lose: [], standard: 'Remove one unnecessary distraction.' }
] }] };

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const pages = [], errors = [];
    for (let i = 0; i < 2; i++) {
      const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
      await context.route('**/*', route => {
        const url = route.request().url();
        if (url === 'http://localhost:18765/') return route.fulfill({ body: source, contentType: 'text/html' });
        if (url.endsWith('/pdf.min.js')) return route.fulfill({ body: 'window.pdfjsLib={GlobalWorkerOptions:{}};', contentType: 'application/javascript' });
        return route.abort();
      });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://localhost:18765/');
      await page.evaluate(seed => {
        data = structuredClone(seed); invalidateRules(); booksChanged('test');
        filter = 'all'; openBooks.add('test'); expanded.add('test:1'); flushSave(); renderAll();
      }, seed);
      pages.push(page);
    }
    const [a, b] = pages;
    await a.locator('[data-challenge="test:1"]').click();
    assert.equal(await a.locator('#challenge-duration').inputValue(), '7');
    await a.keyboard.press('Shift+Tab');
    assert.equal(await a.evaluate(() => document.activeElement.id), 'challenge-submit', 'Focus stays in the duration dialog');
    await a.keyboard.press('Tab');
    assert.equal(await a.evaluate(() => document.activeElement.id), 'challenge-duration');
    for (const invalid of ['', '0', '-1', '1.5', '366']) {
      await a.locator('#challenge-duration').fill(invalid);
      await a.locator('#challenge-submit').click();
      assert.match(await a.locator('#duration-error').textContent(), /whole number/);
      assert.equal(await a.evaluate(() => plan().challenge), null, 'Invalid duration does not start a challenge');
    }
    await a.locator('#challenge-duration').fill('21');
    await a.screenshot({ path: path.join(output, 'duration-picker.png') });
    await a.locator('#challenge-submit').click();
    const initial = await a.evaluate(() => structuredClone(plan().challenge));
    assert.equal(initial.duration, 21);
    assert.equal(await a.locator('.ch-dots .ch-dot').count(), 7);
    assert.match(await a.locator('.challenge .kicker').textContent(), /21-day challenge/);
    await a.locator('#ch-lived').click();
    assert.equal(await a.locator('.ch-progress').getAttribute('value'), '1');
    await a.locator('#ch-edit').click();
    await a.locator('#challenge-duration').fill('30');
    await a.keyboard.press('Escape');
    assert.equal(await a.evaluate(() => plan().challenge.duration), 21, 'Cancel preserves current duration');
    await a.locator('#ch-edit').click();
    await a.locator('#challenge-duration').fill('30');
    await a.locator('#challenge-submit').click();
    const edited = await a.evaluate(() => ({ ...plan().challenge, count: activeChallenge().doneCount }));
    assert.equal(edited.start, initial.start);
    assert.equal(edited.id, initial.id);
    assert.equal(edited.count, 1);
    assert.equal(edited.duration, 30);
    const payload = await a.evaluate(() => { flushSave(); return JSON.parse(tickPayload()); });
    await b.evaluate(remote => { mergeTicks(remote); flushSave(); renderAll(); }, payload);
    await a.reload();
    await b.reload();
    for (const page of [a, b]) {
      assert.equal(await page.evaluate(() => activeChallenge().duration), 30);
      assert.equal(await page.evaluate(() => activeChallenge().doneCount), 1);
    }
    await a.evaluate(() => startChallenge('test:2'));
    await a.locator('#challenge-duration').fill('14');
    a.once('dialog', dialog => dialog.dismiss());
    await a.locator('#challenge-submit').click();
    assert.equal(await a.evaluate(() => plan().challenge.uid), 'test:1', 'Declining replacement preserves challenge');
    a.once('dialog', dialog => dialog.accept());
    await a.locator('#challenge-submit').click();
    assert.equal(await a.evaluate(() => plan().challenge.uid), 'test:2');
    assert.equal(await a.evaluate(() => plan().challenge.duration), 14);
    // Legacy records without duration still resolve to seven days.
    await a.evaluate(() => { plan().challenge = { uid: 'test:1', start: currentDay, at: Date.now() }; renderToday(); });
    assert.equal(await a.evaluate(() => activeChallenge().duration), 7);
    // A one-day challenge finishes only once today's action is completed.
    await a.evaluate(() => { plan().challenge = { id: 'one', uid: 'test:2', start: currentDay, duration: 1, at: Date.now() }; renderToday(); });
    assert.equal(await a.evaluate(() => activeChallenge().finished), false);
    await a.locator('#ch-lived').click();
    assert.equal(await a.evaluate(() => activeChallenge().finished), true);
    assert.match(await a.locator('.challenge.finished h3').textContent(), /1\/1 days/);
    await a.locator('#ch-again').click();
    await a.locator('#challenge-cancel').click();
    assert.equal(await a.evaluate(() => plan().challenge.id), 'one', 'Canceling restart preserves the finished challenge');
    // Ninety-day history survives the normal sixty-day tick cleanup.
    const long = await a.evaluate(() => {
      const start = addDays(currentDay, -89);
      plan().challenge = { id: 'ninety', uid: 'test:1', start, duration: 90, at: Date.now() + 100 };
      for (let i = 0; i < 89; i++) data['ticks_' + addDays(start, i)] = ['test:1'];
      setTicks(['test:1']); renderToday(); flushSave();
      return { done: activeChallenge().doneCount, archived: plan().challenge.livedDays.length, firstTick: data['ticks_' + start] };
    });
    assert.equal(long.done, 90);
    assert.ok(long.archived > 0);
    assert.equal(long.firstTick, undefined);
    await a.reload();
    assert.equal(await a.evaluate(() => activeChallenge().doneCount), 90);
    const longPayload = await a.evaluate(() => JSON.parse(tickPayload()));
    await b.evaluate(remote => { mergeTicks(remote); flushSave(); }, longPayload);
    assert.equal(await b.evaluate(() => activeChallenge().doneCount), 90, 'Long progress syncs');
    await b.evaluate(() => { plan().challenge.duration = 120; plan().challenge.at += 1; delete plan().challenge.livedDays; });
    const editPayload = await b.evaluate(() => JSON.parse(tickPayload()));
    await a.evaluate(remote => mergeTicks(remote), editPayload);
    assert.equal(await a.evaluate(() => activeChallenge().duration), 120);
    assert.equal(await a.evaluate(() => activeChallenge().doneCount), 90, 'Duration changes cannot discard archived progress');
    assert.equal(await a.evaluate(remote => remoteMissingOurPlan(remote.plan), editPayload), true);
    await a.evaluate(() => { plan().challenge.duration = 365; renderToday(); });
    for (const width of [320, 390, 768, 1280]) {
      await a.setViewportSize({ width, height: 900 });
      assert.equal(await a.locator('.ch-dots .ch-dot').count(), 7);
      assert.ok(await a.locator('.challenge').evaluate(el => el.scrollWidth <= el.clientWidth + 1), `365-day challenge fits ${width}px`);
    }
    await a.setViewportSize({ width: 390, height: 844 });
    await a.locator('.challenge').screenshot({ path: path.join(output, 'long-challenge.png') });
    await a.evaluate(() => {
      plan().challengeLog = [
        { uid: 'a', start: currentDay, days: 7 },
        { uid: 'b', start: currentDay, days: 7, duration: 14 },
        { uid: 'c', start: currentDay, days: 1, duration: 1 },
        { uid: 'd', start: currentDay, days: 30, duration: 30 }
      ];
    });
    assert.equal(await a.evaluate(() => completedChallenges()), 3, 'Completion uses each challenge target, with legacy fallback');
    assert.deepEqual(errors, []);
    console.log('PASS: duration validation, start/edit/cancel/restart, replacement confirmation, persistence, sync, legacy seven-day data, one-day completion, long-history retention, compact layouts.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
