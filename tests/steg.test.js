// Tester för uppskattade steg i löppass och gång på band.
// Kör: python src/build.py && node tests/steg.test.js
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');

function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const srv = http.createServer((q, s) => {
    const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s);
  });
  return new Promise(r => srv.listen(0, () => r(srv)));
}

(async () => {
  const srv = await serve(), browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route(/supabase\.co/, r => r.fulfill({ json: [] }));
  await page.goto(`http://localhost:${srv.address().port}/`);
  await page.waitForTimeout(300);
  const out = [], ok = (c, m) => out.push([!!c, m]);

  // 1. Ren funktion
  const unit = await page.evaluate(() => {
    const o = [], ok = (c, m) => o.push([!!c, m]);
    const E = (v, m, h, inc) => estimateSteps([{ speedKmh: v, minutes: m, inclinePct: inc || 0 }], h);
    ok(E(5, 10, 180, 0) === 1100, `5 km/h, 10 min, 180 cm, 0 % → ${E(5, 10, 180, 0)} (ca 1 100)`);
    ok(E(10, 10, 175) === 1600, `10 km/h, 10 min, 175 cm → ${E(10, 10, 175)}`);
    const prog = [[8.5, 5], [9, 5], [9.5, 5], [10, 5], [10.5, 5]].map(([v, m]) => ({ speedKmh: v, minutes: m, inclinePct: 1 })).concat([{ speedKmh: 5, minutes: 3, inclinePct: 15 }]);
    const p = estimateSteps(prog, 175);
    ok(p === 4200, `progressivt 8,5–10,5 à 5 min + 3 min 5 km/h 15 %, 175 cm → ${p} (exakt summa 4 203)`);
    // Clamp-gränser, gång
    ok(E(3, 10, 175) === 900, `gång 3 km/h: kadens 69 → golv 90 → ${E(3, 10, 175)}`);
    ok(E(6.9, 10, 150) === 1300, `gång 6,9 km/h, 150 cm: kadens 185 → tak 130 → ${E(6.9, 10, 150)}`);
    ok(E(3, 10, 175, 9) === 1000 && E(3, 10, 175, 8) === 900, 'lutning > 8 % ger +5 (9 %: 950 → 1 000), 8 % ger inget');
    // Clamp-gränser, löpning
    ok(E(7, 10, 175) === 1500, `löpning 7 km/h: 147,5 → golv 150 → ${E(7, 10, 175)}`);
    ok(E(25, 10, 175) === 1900, `löpning 25 km/h: 192,5 → tak 185 → ${E(25, 10, 175)} (1 850 avrundat)`);
    ok(E(20, 10, 175) === 1800, `löpning 20 km/h: 180 inom gränserna → ${E(20, 10, 175)}`);
    ok(estimateSteps([{ speedKmh: 7, minutes: 100, inclinePct: 0 }], 175) === 15000, '7 km/h är löpning (150 spm × 100 min)');
    // Längdjustering vid löpning
    ok(E(10, 10, 185) === 1500, `10 km/h, 185 cm: 155 − 6 = 149 → ${E(10, 10, 185)}`);
    ok(E(10, 10, 160) === 1600, `10 km/h, 160 cm: 155 + 9 = 164 → ${E(10, 10, 160)}`);
    // Tom längd → 175
    const ref = E(10, 10, 175), refW = E(5, 10, 175);
    ok([null, undefined, '', 0, 'abc'].every(h => E(10, 10, h) === ref && E(5, 10, h) === refW), 'tom/ogiltig längd använder 175 cm');
    ok(estimateSteps([], 175) === 0 && estimateSteps(null, 175) === 0 && estimateSteps([{ speedKmh: 0, minutes: 10 }, { speedKmh: 10, minutes: 0 }], 175) === 0, 'tomma eller ogiltiga delar ger 0');
    // Riktig data ersätts aldrig
    const hk = applySteps({ steps: 4321, stepsSource: 'healthkit' }, [{ speedKmh: 10, minutes: 30 }]);
    ok(hk.steps === 4321 && hk.stepsSource === 'healthkit', 'stepsSource healthkit skrivs inte över');
    ok(/4\s321 steg/.test(stepsHTML(hk)) && !/≈/.test(stepsHTML(hk)) && /Från Hälsa/.test(stepsHTML(hk)) && !/Uppskattat/.test(stepsHTML(hk)), 'healthkit-värdet visas i stället för uppskattningen');
    return o;
  });
  out.push(...unit);

  // 2. I appen
  const txt = () => page.textContent('#sheetBody');
  await page.evaluate(() => { S.settings.comebackUntil = null; S.settings.v10 = 11.5; S.settings.heightCm = null; showRunLog('r-prog') });
  await page.click('[data-rpe="6"]'); await page.click('[data-saverun]'); await page.waitForTimeout(200);
  let t = await txt();
  ok(/≈ 4\s200 steg/.test(t) && /Uppskattat utifrån fart, tid och längd/.test(t), 'sammanfattning efter löppass: ≈ 4 200 steg + förklaring');
  ok(/Ange din längd för bättre uppskattning/.test(t), 'hint när längd saknas');
  let L = await page.evaluate(() => S.log.filter(l => l.type === 'löpning').pop());
  ok(L.steps === 4200 && L.stepsSource === 'estimated', `sparat på passet: steps ${L.steps}, stepsSource ${L.stepsSource}`);
  // Längd under Jag
  await page.click('[data-gojag]'); await page.waitForTimeout(200);
  const inp = await page.$('[data-setin="heightCm"]');
  if (inp && !(await inp.isVisible())) await page.evaluate(() => { const d = document.querySelector('[data-setin="heightCm"]').closest('details'); if (d) d.open = true });
  await page.fill('[data-setin="heightCm"]', '185'); await page.press('[data-setin="heightCm"]', 'Tab'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => S.settings.heightCm) === 185, 'Längd (cm) sparas från Jag');
  // Justerad fart i timern → faktiska delar
  await page.evaluate(() => { closeSheet(); showRunLog('r-prog', null, [{ typ: 's', kmh: 10, inc: 1, sec: 600, adj: 0.5 }, { typ: 's', kmh: 10, inc: 1, sec: 600 }]) });
  await page.click('[data-rpe="6"]'); await page.click('[data-saverun]'); await page.waitForTimeout(200);
  L = await page.evaluate(() => S.log.filter(l => l.type === 'löpning').pop());
  ok(L.steps === 3000 && !/Ange din längd/.test(await txt()), `justerad fart: faktiska delar (20 min i 10 km/h, 185 cm → ${L.steps}), ingen hint med längd`);
  await page.evaluate(() => { closeSheet(); showRunLog('r-prog', null, [{ typ: 's', kmh: 10, inc: 1, sec: 600 }]) });
  await page.click('[data-rpe="6"]'); await page.click('[data-saverun]'); await page.waitForTimeout(200);
  L = await page.evaluate(() => S.log.filter(l => l.type === 'löpning').pop());
  const planSteps = await page.evaluate(() => estimateSteps(RUNS.find(r => r.id === 'r-prog').seg.map((sg, i) => { const p = segPlan(RUNS.find(r => r.id === 'r-prog'), sg, i); return { speedKmh: p.kmh, minutes: sg[0], inclinePct: p.inc } }), 185));
  ok(L.steps === planSteps, `timer utan justering: planens delar används (${L.steps})`);
  // Fritt loggat pass: snittfart × tid
  await page.evaluate(() => { closeSheet(); S.settings.heightCm = null; showQuickLog('löpning', today()) });
  await page.fill('#qlMin', '30'); await page.fill('#qlKm', '5'); await page.click('[data-qlsave]'); await page.waitForTimeout(200);
  L = await page.evaluate(() => S.log.filter(l => l.type === 'löpning').pop());
  ok(L.steps === 4700 && /≈ 4\s700 steg/.test(await txt()), `fritt loggat 5 km på 30 min → ${L.steps} (155 spm × 30 min)`);
  await page.evaluate(() => { closeSheet(); showQuickLog('löpning', today()) });
  await page.fill('#qlMin', '30'); await page.click('[data-qlsave]'); await page.waitForTimeout(200);
  L = await page.evaluate(() => S.log.filter(l => l.type === 'löpning').pop());
  ok(!L.steps && !(await page.isVisible('#sheet.open')), 'fritt loggat utan distans: ingen uppskattning, inget extra ark');
  // Lutande gång som extraövning
  await page.evaluate(() => { showMoreAfter(today()) }); await page.click('[data-othquick^="20|"]'); await page.waitForTimeout(150);
  await page.click('[data-othsave]'); await page.waitForTimeout(200);
  L = await page.evaluate(() => S.log.filter(l => l.type === 'annat').pop());
  t = await txt();
  ok(L.steps === 2400 && L.stepsSource === 'estimated' && /≈ 2\s400 steg/.test(t), `lutande gång 20 min, 5 km/h, 10 % → ${L.steps} och sammanfattning`);
  await page.screenshot({ path: path.join(process.env.SHOT_DIR || '/tmp', 'steg-gang.png') });
  // Gammal data utan steg
  await page.evaluate(() => { closeSheet(); S.log.push({ type: 'löpning', date: today(), title: 'Gammalt', min: 30, ts: 1 }) });
  for (const tb of ['idag', 'vecka', 'framsteg', 'jag']) { await page.click(`.tab[data-tab="${tb}"]`); await page.waitForTimeout(120); ok(!/kunde inte visas/.test(await page.textContent('#view')), 'flik ' + tb + ' med gammal data') }

  let fail = 0;
  for (const [c, m] of out) { console.log((c ? 'OK  ' : 'FEL ') + m); if (!c) fail++ }
  if (errs.length) { fail++; console.log('JS-fel: ' + errs.join(' | ')) }
  await browser.close(); srv.close();
  console.log(fail ? `${fail} FEL` : `ALLA OK (${out.length} kontroller)`);
  process.exit(fail ? 1 : 0);
})();
