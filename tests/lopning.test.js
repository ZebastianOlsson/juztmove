// Enhetstester för löppassens farter, etiketter, beskrivningar och loggningsformulär.
// Kör: python src/build.py && node tests/lopning.test.js
// Laddar den byggda index.html i headless Chromium (Supabase mockas bort) och anropar appens egna funktioner.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');

const V10S = [10.0, 11.5, 12.0, 13.3];
const EXPECT_PROG = { 10: [7.5, 8, 8.5, 9, 9.5], 11.5: [8.5, 9, 9.5, 10, 10.5], 12: [9, 9.5, 10, 10.5, 11], 13.3: [10, 10.5, 11, 11.5, 12] };

function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
  const srv = http.createServer((q, s) => {
    const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s);
  });
  return new Promise(r => srv.listen(0, () => r(srv)));
}

(async () => {
  const srv = await serve(), browser = await chromium.launch();
  const page = await browser.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route(/supabase\.co/, r => r.fulfill({ json: [] }));
  await page.goto(`http://localhost:${srv.address().port}/`);
  await page.waitForTimeout(300);

  const res = await page.evaluate(({ V10S, EXPECT_PROG }) => {
    const out = [], ok = (c, m) => out.push([!!c, m]);
    const sv = x => String(x).replace('.', ',');
    const num = t => parseFloat(String(t).replace(',', '.').replace('−', '-'));
    S.settings.comebackUntil = null; S.settings.noSteep = false;
    for (const V of V10S) {
      S.settings.v10 = V;
      ok(Math.abs(v10() - V) < 1e-9, `V10 = ${sv(V)} är satt`);
      for (const r of RUNS) {
        const kmh = r.seg.map((sg, i) => segPlan(r, sg, i).kmh);
        const sIdx = r.seg.map((sg, i) => sg[1] === 's' ? i : -1).filter(i => i >= 0);
        // 1. Etikett med km/h-delta == skillnaden mot föregående jämna del (efter avrundning)
        r.seg.forEach((sg, i) => {
          const lab = segText(r, i), m = lab.match(/^([+−-])(\d+,\d) km\/h$/);
          if (/km\/h/.test(lab) || /^[+−-]\s*$/.test(lab)) ok(!!m, `${r.id} V${sv(V)} del ${i + 1}: etiketten "${lab}" är genererad`);
          if (!m) return;
          const prev = sIdx.filter(j => j < i).pop();
          ok(prev != null, `${r.id} V${sv(V)} del ${i + 1}: har en föregående del`);
          const d = Math.round((kmh[i] - kmh[prev]) * 10) / 10, lv = num(m[2]) * (m[1] === '+' ? 1 : -1);
          ok(Math.abs(d - lv) < 1e-9, `${r.id} V${sv(V)} del ${i + 1}: etikett ${lab} == ${sv(kmh[prev])} → ${sv(kmh[i])}`);
        });
        // Statiska etiketter får inte påstå en fartändring som inte räknas fram
        r.seg.forEach(sg => { if (/[+−-]\s*\d+([.,]\d+)?\s*km\/h/.test(sg[2])) ok(false, `${r.id}: hårdkodad fartetikett "${sg[2]}"`) });
        // 2. Beskrivningens steg och tid matchar segmenten
        const desc = runDesc(r);
        ok(!/null|undefined|NaN/.test(desc), `${r.id} V${sv(V)}: beskrivningen är hel ("${desc}")`);
        const ds = desc.match(/(\d+,\d) km\/h/), dt = desc.match(/var (\d+):[ae] minut/);
        if (ds && RUN_PROG.includes(r.id)) {
          const steps = sIdx.slice(1).map((i, k) => Math.round((kmh[i] - kmh[sIdx[k]]) * 10) / 10);
          ok(steps.length && steps.every(x => Math.abs(x - num(ds[1])) < 1e-9), `${r.id} V${sv(V)}: beskrivningens steg ${ds[1]} km/h == stegen ${steps.map(sv).join('/')}`);
        }
        if (dt) {
          const work = r.seg.filter(sg => sg[1] === 's' || sg[1] === 'h').map(sg => sg[0]);
          ok(work.length && work.every(x => x === +dt[1]), `${r.id}: beskrivningens "var ${dt[1]}" min == delarnas längd ${[...new Set(work)].join('/')}`);
        }
      }
      // 3. Exakta farter för det progressiva bandpasset
      const rp = RUNS.find(r => r.id === 'r-prog');
      const got = rp.seg.map((sg, i) => sg[1] === 's' ? segPlan(rp, sg, i).kmh : null).filter(x => x != null);
      ok(JSON.stringify(got) === JSON.stringify(EXPECT_PROG[V]), `r-prog V${sv(V)}: ${got.map(sv).join(' → ')} (väntat ${EXPECT_PROG[V].map(sv).join(' → ')})`);
      ok(got[0] === Math.round(V * 0.75 * 2) / 2, `r-prog V${sv(V)}: start = V10 × 0,75 avrundat till 0,5`);
      ok(Math.abs(got[got.length - 1] - V * 0.9) <= 0.5, `r-prog V${sv(V)}: slutfart ${sv(got[got.length - 1])} nära V10 × 0,9 = ${sv(Math.round(V * 0.9 * 100) / 100)}`);
      ok(rp.seg.filter(sg => sg[1] === 's').every(sg => sg[0] === 5) && rp.seg.filter(sg => sg[1] === 's').length === 5, 'r-prog: 5 steg à 5 min som tidigare');
      ok(runDesc(rp) === 'Öka farten 0,5 km/h var 5:e minut. Det händer hela tiden något.', `r-prog: beskrivning "${runDesc(rp)}"`);
      ok(rp.seg.map((_, i) => segText(rp, i)).slice(1, 5).every(t => t === '+0,5 km/h'), 'r-prog: etiketterna är +0,5 km/h');
    }
    return out;
  }, { V10S, EXPECT_PROG });

  // Loggningsformuläret: parseDecimal, snittfart/distans och förifylld distans från passplanen
  const res2 = await page.evaluate(() => {
    const out = [], ok = (c, m) => out.push([!!c, m]);
    ok(parseDecimal('5,2') === 5.2, 'parseDecimal("5,2") === 5.2');
    ok(parseDecimal('5.2') === 5.2, 'parseDecimal("5.2") === 5.2');
    ok(parseDecimal('') === null, 'parseDecimal("") === null');
    ok(parseDecimal(' 28 ') === 28 && parseDecimal('abc') === null && parseDecimal(null) === null, 'parseDecimal: mellanslag, text och null');
    ok(runCalc('28', '4,5', '', 'km').avg === '9,6', `tid 28 + distans "4,5" → snittfart ${runCalc('28', '4,5', '', 'km').avg}`);
    ok(runCalc('30', '', '10', 'avg').km === '5', 'tid 30 + snittfart 10 → distans 5');
    ok(runCalc('30', '', '9,6', 'avg').km === '4,8', 'tid 30 + snittfart "9,6" → distans 4,8');
    S.settings.comebackUntil = null; S.settings.noSteep = false; S.settings.v10 = 11.5;
    const rp = RUNS.find(r => r.id === 'r-prog');
    const sp = rp.seg.map((sg, i) => [segPlan(rp, sg, i).kmh, sg[0]]);
    ok(JSON.stringify(sp) === JSON.stringify([[8.5, 5], [9, 5], [9.5, 5], [10, 5], [10.5, 5], [5, 3]]), 'progressivt pass: 8,5/9,0/9,5/10,0/10,5 à 5 min + 3 min i 5 km/h');
    const d = planDistance(rp), hand = (8.5 + 9 + 9.5 + 10 + 10.5) * 5 / 60 + 5 * 3 / 60;
    ok(Math.abs(d - hand) < 1e-9, `planerad distans = Σ fart × min/60 = ${d.toFixed(3)} km`);
    ok(fmtK(d) === '4,2', `förifylld distans visas som ${fmtK(d)} km`);
    return out;
  });
  res.push(...res2);
  // Formuläret i iPhone-storlek
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p2 = await ctx.newPage(); p2.on('pageerror', e => errs.push(e.message));
  await p2.route(/supabase\.co/, r => r.fulfill({ json: [] }));
  await p2.goto(`http://localhost:${srv.address().port}/`); await p2.waitForTimeout(300);
  const val = id => p2.inputValue(id), hintVis = () => p2.isVisible('#runKmEst');
  const type = async (id, v) => { await p2.fill(id, ''); await p2.type(id, v); };
  const ui = [], uok = (c, m) => ui.push([!!c, m]);
  await p2.evaluate(() => { S.settings.comebackUntil = null; S.settings.v10 = 11.5; showRunLog('r-prog') });
  uok(await val('#runKm') === '4,2' && await hintVis(), `planerat pass: distans förifylld ${await val('#runKm')} med texten "Uppskattat från passet"`);
  uok(/Uppskattat från passet – ändra till bandets värde/.test(await p2.textContent('#sheetBody')), 'hjälptexten står under fältet');
  uok(await val('#runAvg') === '9,0', `snittfart räknas direkt: ${await val('#runAvg')} (4,2 km på 28 min)`);
  await type('#runMin', '30');
  uok(await val('#runKm') === '4,2' && await hintVis() && await val('#runAvg') === '8,4', `ändrad tid: distansen skalas inte och är fortfarande uppskattad, snittfart ${await val('#runAvg')}`);
  await type('#runMin', '28'); await type('#runKm', '4,5');
  uok(await val('#runAvg') === '9,6' && !(await hintVis()), `tid 28 + distans 4,5 → ${await val('#runAvg')} live, markeringen försvinner`);
  await type('#runAvg', '10');
  uok(await val('#runKm') === '4,67', `snittfart 10 skriven → distans ${await val('#runKm')} (28 × 10 / 60)`);
  await type('#runMin', '30');
  uok(await val('#runKm') === '5' && await val('#runAvg') === '10', 'senast ändrade fältet (snittfart) vinner när tiden ändras');
  await type('#runKm', '6');
  uok(await val('#runAvg') === '12,0', 'distans ändras igen → snittfart räknas om');
  await p2.click('[data-rpe="6"]'); await p2.click('[data-saverun]'); await p2.waitForTimeout(200);
  const L = await p2.evaluate(() => S.log.filter(l => l.type === 'löpning').pop());
  uok(L && L.km === 6 && L.min === 30 && L.avg === 12, `sparat: ${L && L.min} min, ${L && L.km} km, ${L && L.avg} km/h`);
  await p2.evaluate(() => { closeSheet(); showRunLog('r-prog', null, [{ typ: 'w', sec: 600, kmh: 8, f: 0.7 }]) });
  uok(await val('#runKm') === '1,33' && !(await p2.$('#runKmEst')), 'pass från timern: distans från faktisk fart, ingen uppskattning');
  await p2.evaluate(() => { closeSheet(); showQuickLog('löpning', today()) });
  uok(await val('#qlKm') === '', 'fritt loggat pass förifylls inte');
  await ctx.close();
  res.push(...ui);

  let fail = 0;
  for (const [c, m] of res) { if (!c) { fail++; console.log('FEL ' + m) } }
  for (const [c, m] of [...res2, ...ui]) if (c) console.log('OK  ' + m);
  console.log(`${res.length - fail}/${res.length} kontroller OK`);
  if (errs.length) { fail++; console.log('JS-fel: ' + errs.join(' | ')) }
  await browser.close(); srv.close();
  console.log(fail ? `${fail} FEL` : 'ALLA OK');
  process.exit(fail ? 1 : 0);
})();
