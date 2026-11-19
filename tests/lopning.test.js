// Enhetstester för löppassens farter, etiketter och beskrivningar.
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

  let fail = 0;
  for (const [c, m] of res) { if (!c) { fail++; console.log('FEL ' + m) } }
  console.log(`${res.length - fail}/${res.length} kontroller OK`);
  if (errs.length) { fail++; console.log('JS-fel: ' + errs.join(' | ')) }
  await browser.close(); srv.close();
  console.log(fail ? `${fail} FEL` : 'ALLA OK');
  process.exit(fail ? 1 : 0);
})();
