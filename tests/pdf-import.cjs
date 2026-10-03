const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Run against a disposable browser profile: no user library or cloud writes.
const [modules, pdfPath, pdfJsPath, workerPath, outputDir] = process.argv.slice(2);
const { chromium } = require(path.join(modules, 'playwright'));
const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.endsWith('/pdf.min.js')) return route.fulfill({ path: pdfJsPath, contentType: 'application/javascript' });
      if (url.endsWith('/pdf.worker.min.js')) return route.fulfill({ path: workerPath, contentType: 'application/javascript' });
      if (url === 'http://localhost:18765/') return route.fulfill({ body: source, contentType: 'text/html' });
      return route.abort();
    });
    await page.goto('http://localhost:18765/');
    const bytes = Array.from(fs.readFileSync(pdfPath));
    const result = await page.evaluate(async ({ bytes, name }) => {
      const file = new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
      const first = await importPdf(file);
      const duplicate = await importPdf(file);
      flushSave();
      filter = 'all';
      for (const b of data.books) openBooks.add(b.id);
      for (const r of allRules()) expanded.add(r.uid);
      renderAll();
      const rules = JSON.parse(JSON.stringify(data.books[0].rules));
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
      const pdfPage = await pdf.getPage(2);
      const viewport = pdfPage.getViewport({ scale: 1 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      return { first, duplicate, rules, lines: await extractPageLines(pdfPage), sourceImage: canvas.toDataURL('image/png'), bookCount: data.books.length };
    }, { bytes, name: path.basename(pdfPath) });
    assert.equal(result.first.status, 'added');
    assert.equal(result.first.count, 20);
    assert.equal(result.duplicate.status, 'uptodate');
    assert.equal(result.bookCount, 1);
    assert.deepEqual(result.rules.map(r => r.n), Array.from({ length: 20 }, (_, i) => i + 1));
    for (const r of result.rules) {
      assert.equal(r.gain.length, 3, `Rule ${r.n} gains`);
      assert.equal(r.lose.length, 3, `Rule ${r.n} costs`);
      assert.ok(r.today && r.why && r.reality, JSON.stringify({ rule: r, lines: result.lines }));
      assert.equal(r.standard, r.today);
      assert.ok(!/PRINCIPLE|WHY IT WORKS|IF YOU IGNORE THIS|STAYING HEALTHY BENEFITS/.test(JSON.stringify(r)));
    }
    assert.equal(result.rules[18].title, 'STAY HEALTHY TO HAVE MORE GOOD YEARS - NOT JUST MORE YEARS');
    assert.ok(result.rules[5].today.endsWith('mindless snacking.'));
    assert.ok(result.rules[19].why.endsWith('disease risk, mood, and function.'));
    await page.screenshot({ path: path.join(outputDir, 'health-mobile.png') });
    await page.locator('.card').first().screenshot({ path: path.join(outputDir, 'health-card.png') });
    fs.writeFileSync(path.join(outputDir, 'source-page.png'), Buffer.from(result.sourceImage.split(',')[1], 'base64'));
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => [...document.querySelectorAll('.card, .spotlight')].every(el => el.scrollWidth <= el.clientWidth + 1)), `No card overflow at ${width}px`);
    }
    await page.screenshot({ path: path.join(outputDir, 'health-desktop.png') });
    const legacy = await page.evaluate(() => {
      const sections = ['WHAT YOU GAIN', '+ Gain', 'WHAT YOU LOSE IF YOU IGNORE THIS', '- Cost', 'REALITY CHECK', 'Reality', 'THE CHOICE', 'Choice', 'THE STANDARD', 'Standard'];
      const inline = parseAllRules(['RULE 1', 'Legacy title', 'Subtitle', ...sections]);
      const split = parseAllRules(['RULE', '2', 'Split title', ...sections, '3 RULE Reverse title', ...sections]);
      const fallback = parseByPage([['04 of 50', 'Page title', ...sections]]);
      const both = parseAllRules(['RULE 5 Both', 'TODAY', 'Action', ...sections, 'WHY IT WORKS', 'Explanation']);
      const todayTitle = parseAllRules(['RULE 6', 'Today matters', ...sections]);
      return { inline, split, fallback, both, todayTitle, html: bodyHtml(both[0]) };
    });
    assert.equal(legacy.inline[0].title, 'Legacy title');
    assert.equal(legacy.inline[0].standard, 'Standard');
    assert.equal(legacy.inline[0].choice, 'Choice');
    assert.equal(legacy.inline[0].today, undefined);
    assert.deepEqual(legacy.split.map(r => r.n), [2, 3]);
    assert.equal(legacy.fallback[0].n, 4);
    assert.equal(legacy.both[0].today, 'Action');
    assert.equal(legacy.both[0].standard, 'Standard');
    assert.equal(legacy.todayTitle[0].title, 'Today matters');
    assert.ok(legacy.html.includes('Today</h4>') && legacy.html.includes('The Standard</h4>') && legacy.html.includes('Why it works</h4>'));
    await page.reload();
    const restored = await page.evaluate(() => data.books[0].rules);
    assert.deepEqual(restored, result.rules, 'All fields survive a reload');
    const { PDFDocument, StandardFonts } = require(path.join(modules, 'pdf-lib'));
    const reExport = await PDFDocument.load(new Uint8Array(bytes));
    reExport.setTitle('Same principles with different PDF metadata');
    const reExportBytes = Array.from(await reExport.save());
    const different = await PDFDocument.create();
    const font = await different.embedFont(StandardFonts.Helvetica);
    const differentPage = different.addPage();
    ['RULE 1', 'A distinct principle from another book', 'WHAT YOU GAIN', 'A different benefit',
      'THE STANDARD', 'A different action'].forEach((line, i) => differentPage.drawText(line, { x: 40, y: 750 - i * 25, size: 12, font }));
    const differentBytes = Array.from(await different.save());
    const duplicates = await page.evaluate(async ({ bytes, reExportBytes, differentBytes, name }) => {
      const file = (content, filename = name) => new File([new Uint8Array(content)], filename, { type: 'application/pdf' });
      const retainedHash = data.books[0].pdfHashes[0];
      const baseline = JSON.stringify(data);
      const renamed = await importPdf(file(bytes, 'renamed-copy.pdf'));
      const noChanges = baseline === JSON.stringify(data);
      const reexported = await importPdf(file(reExportBytes));
      const hashesAfterReexport = data.books[0].pdfHashes.length;
      delete data.books[0].pdfHashes; // Library imported before file hashes existed.
      data.books[0].rules.reverse(); // Page order must not affect duplicate detection.
      const legacyCopy = await importPdf(file(bytes));
      const retainedId = data.books[0].id;
      await importFiles([file(bytes), file(bytes, 'another-copy.pdf')]);
      const notice = document.getElementById('toast').textContent;
      const stillOne = data.books.length === 1 && data.books[0].id === retainedId;
      const differentResult = await importPdf(file(differentBytes));
      const differentCount = data.books.length;
      data.books = []; // New, disposable library for simultaneous first imports.
      const concurrent = await Promise.all([importPdf(file(bytes)), importPdf(file(bytes, 'parallel.pdf'))]);
      const concurrentCount = data.books.length;
      data.books = [];
      await importFiles([file(bytes), file(bytes, 'batch-copy.pdf')]);
      const batchCount = data.books.length;
      const hashFn = pdfFileHash;
      pdfFileHash = async () => null;
      data.books = [];
      const noCrypto = [await importPdf(file(bytes)), await importPdf(file(bytes, 'no-crypto-copy.pdf'))];
      const noCryptoCount = data.books.length;
      pdfFileHash = hashFn;
      return { retainedHash, noChanges, renamed, reexported, hashesAfterReexport, legacyCopy,
        notice, stillOne, differentResult, differentCount, concurrent, concurrentCount, batchCount, noCrypto, noCryptoCount };
    }, { bytes, reExportBytes, differentBytes, name: path.basename(pdfPath) });
    assert.match(duplicates.retainedHash, /^[0-9a-f]{64}$/);
    assert.equal(duplicates.renamed.status, 'uptodate');
    assert.ok(duplicates.noChanges, 'A known duplicate does not alter library or progress');
    assert.equal(duplicates.reexported.status, 'uptodate');
    assert.equal(duplicates.hashesAfterReexport, 2);
    assert.equal(duplicates.legacyCopy.status, 'uptodate');
    assert.ok(duplicates.stillOne);
    assert.match(duplicates.notice, /Already in your library.*skipped/);
    assert.equal(duplicates.differentResult.status, 'added');
    assert.equal(duplicates.differentCount, 2, 'A different PDF with the same filename is accepted');
    assert.deepEqual(duplicates.concurrent.map(r => r.status).sort(), ['added', 'uptodate']);
    assert.equal(duplicates.concurrentCount, 1);
    assert.equal(duplicates.batchCount, 1);
    assert.deepEqual(duplicates.noCrypto.map(r => r.status), ['added', 'uptodate']);
    assert.equal(duplicates.noCryptoCount, 1);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ imported: result.first.count, duplicate: result.duplicate.status, persisted: restored.length, legacy: 'passed', duplicateCases: 'renamed, re-exported, legacy, reordered, concurrent, batch, no-crypto, different same-name PDF: passed', widths: [320, 390, 768, 1280], outputDir }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
