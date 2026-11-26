// Tester för visningen av löppass: fartprofil, grupperad segmentlista, sammanfattning och passvyn.
// Kör: python src/build.py && node tests/lopvy.test.js
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
  const srv = await serve(), browser = await chromium.launch(), out = [], ok = (c, m) => out.push([!!c, m]), errs = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { const real = Date.now.bind(Date); let off = 0; Date.now = () => real() + off; window.__adv = ms => { off += ms } });
  await ctx.route(/supabase\.co/, r => r.fulfill({ json: [] }));
  const page = await ctx.newPage(); page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${srv.address().port}/`); await page.waitForTimeout(400);

  const unit = await page.evaluate(() => {
    const o = [], ok = (c, m) => o.push([!!c, m]);
    S.settings.v10 = 12; S.settings.comebackUntil = null; S.settings.runPref = 'band'; S.settings.noSteep = false;
    const R = id => RUNS.find(r => r.id === id);
    // Intensitet
    const k = runSegs(R('r-6x3')).map(x => x.kind);
    ok(k[0] === 'easy' && k[1] === 'hard' && k[2] === 'easy' && k[k.length - 1] === 'cool', `intensitet: uppvärmning dämpad, hårt accent, nedvarvning grå (${k.slice(0, 3).join(',')}…${k[k.length - 1]})`);
    // Gruppering
    let g = runGroups(runSegs(R('r-6x3')));
    ok(g.length === 3 && g[1].k === 6 && g[1].segs.length === 11, `6 × 3 min grupperas: ${g.map(x => x.seg ? 1 : x.k + '×').join(' | ')} (sista varvet utan jogg räknas)`);
    const html = runListHTML(runSegs(R('r-6x3')), true);
    ok(/6 × \(3 min 12,0 \/ 1,5 min 8,4\)/.test(html), 'etikett "6 × (3 min 12,0 / 1,5 min 8,4)"');
    ok(/<details class="rgrp">/.test(html) && (html.match(/class="rseg k-/g) || []).length === 2 + 1 + 11, 'gruppen kan fällas ut och innehåller alla 11 delar');
    g = runGroups(runSegs(R('r-10x1')));
    ok(g[1].k === 10 && g[1].segs.length === 20, '10 × (1 min / 1 min)');
    ok(runGroups(runSegs(R('r-pyr'))).every(x => x.seg), 'pyramid: inga upprepningar, en rad per del');
    ok(runGroups(runSegs(R('r-prog'))).every(x => x.seg), 'progressivt: olika farter grupperas inte');
    g = runGroups(runSegs(R('r-backe')));
    ok(g[1].k === 5 && /5 × \(2 min [\d,]+ · 5,5 % \/ 2 min [\d,]+ · 1 %\)/.test(runListHTML(runSegs(R('r-backe')), true)), 'backe: lutningen syns i gruppen när den skiljer sig');
    // Sammanfattning
    const sm = runSummaryHTML(R('r-6x3'), runSegs(R('r-6x3'))).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const km = runSegs(R('r-6x3')).reduce((a, x) => a + x.kmh * x.sec / 3600, 0);
    ok(/41 min totalt/.test(sm) && sm.includes('≈ ' + fmtK(km) + ' km') && /18 min hårt/.test(sm) && /7\/10 ansträngning/.test(sm), `sammanfattning: ${sm.trim()}`);
    // Fartprofil
    const pf = runProfileHTML(runSegs(R('r-6x3')), { band: true });
    ok((pf.match(/<rect class="rp-/g) || []).length === 13 && /rp-hard/.test(pf) && /rp-cool/.test(pf), 'profil: en stapel per del, färg efter intensitet');
    const hs = [...pf.matchAll(/class="rp-(\w+)"[^>]*height="([\d.]+)"/g)].map(m => [m[1], +m[2]]);
    ok(hs.find(x => x[0] === 'hard')[1] > hs.find(x => x[0] === 'easy')[1] && hs.find(x => x[0] === 'easy')[1] > hs.find(x => x[0] === 'cool')[1], 'profil: höjd efter fart (hårt > jogg > nedvarvning)');
    const pb = runProfileHTML(runSegs(R('r-backe')), { band: true });
    ok((pb.match(/% <\/span>|% <\/span>|%<\/span>/g) || []).length >= 2 && /polyline/.test(pb), 'profil: lutningen som linje och siffror där den ändras');
    ok(!/polyline/.test(runProfileHTML(runSegs(R('r-lugn')), { band: false })), 'utomhus: ingen lutning');
    const live = runProfileHTML(runSegs(R('r-6x3')), { live: true, el: 1215, band: true });
    ok(/id="rpMark" style="left:50\.00%"/.test(live) && /id="rpClipR"[^>]*width="500\.0"/.test(live), 'tidslinje: markör och fyllt avklarat vid 50 %');
    return o;
  });
  out.push(...unit);

  // Passvyn
  await page.evaluate(() => { S.settings.v10 = 12; startRun('r-6x3') }); await page.click('[data-runplay]');
  const txt = s => page.textContent(s);
  ok(await page.textContent('[data-runplay]') === 'Paus', 'knappen heter Paus medan passet går');
  ok(/8,4/.test(await txt('.rv-big')) && /1 %/.test(await txt('.rv-inc')) && /Uppvärmning/.test(await txt('.rv-name')), 'stort: fart och nedräkning, mindre: lutning och delnamn');
  ok(/Nästa/.test(await txt('#runNext')) && /12,0/.test(await txt('#runNext')) && /om 10:00/.test(await txt('#runNextIn')), `Nästa: fart, lutning och när ("${(await txt('#runNextIn')).trim()}")`);
  await page.evaluate(() => window.__adv((10 * 60 - 9) * 1000)); await page.waitForTimeout(350);
  let cls = await page.getAttribute('#runNext', 'class');
  ok(/soon/.test(cls) && !/now/.test(cls), 'sista 10 s: Nästa markeras');
  await page.evaluate(() => window.__adv(5000)); await page.waitForTimeout(350);
  cls = await page.getAttribute('#runNext', 'class');
  ok(/now/.test(cls) && /Byt fart nu/.test(await txt('#runNext')) && /byt nu/.test(await txt('#runNextIn')), 'sista 5 s: "Byt fart nu"');
  const mk = await page.evaluate(() => parseFloat(document.getElementById('rpMark').style.left));
  ok(mk > 24 && mk < 25, `tidslinjens markör följer passet (${mk.toFixed(1)} %)`);
  await page.evaluate(() => window.__adv(5000)); await page.waitForTimeout(350);
  ok(/Del 2 av 13/.test(await txt('#sheetBody')) && /12,0/.test(await txt('.rv-big')) && !/soon/.test(await page.getAttribute('#runNext', 'class')), 'ny del: hård fart stort, markeringen nollställd');
  await page.click('[data-adj="0.5"]'); await page.click('[data-adj="0.5"]');
  ok(/13,0/.test(await txt('.rv-big')) && /justerat \+1,0/.test(await txt('.rv-inc')), '+0,5 två gånger: 13,0 km/h, justeringen visas');
  await page.evaluate(() => window.__adv(60000)); await page.waitForTimeout(300);
  const act = await page.evaluate(() => runActual(runState, runR(), Date.now()));
  ok(act[1] && act[1].kmh === 13 && act[1].adj === 1, `faktisk fart loggas per del: ${act.map(a => a.kmh + ' km/h' + (a.adj ? ' (' + a.adj + ')' : '')).join(', ')}`);
  await page.click('[data-runskip]'); await page.waitForTimeout(100);
  ok(await page.isVisible('[data-skipmode="drop"]'), 'Hoppa till nästa: frågar om resten när mycket tid är kvar');
  await page.click('[data-skipmode="drop"]'); await page.waitForTimeout(200);
  ok(/Del 3 av 13/.test(await txt('#sheetBody')), 'hoppar till nästa del');
  // Liggande
  await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(200);
  const lay = await page.evaluate(() => { const g = e => document.querySelector(e).getBoundingClientRect(); const st = document.querySelector('.sticky').getBoundingClientRect();
    return { w: g('.rv-line').width, big: parseFloat(getComputedStyle(document.querySelector('.rv-big')).fontSize), lineBottom: g('.rv-line').bottom, sticky: st.top, timeRight: g('#runT').right, mainRight: g('.runmain').right } });
  ok(lay.w > 780, `liggande: tidslinjen i full bredd (${Math.round(lay.w)} px)`);
  ok(lay.lineBottom <= lay.sticky + 1, 'liggande: tidslinjen syns ovanför knapparna');
  ok(lay.timeRight <= lay.mainRight, 'liggande: nedräkningen ryms i kortet');
  ok(lay.big >= 80, `liggande: stora siffror (${lay.big} px)`);
  // Översikten på Idag
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { runFinish(Date.now()); closeSheet(); S.days[today()] = { ...(S.days[today()] || {}), plan: 'r', moves: [] }; render() }); await page.waitForTimeout(200);
  ok(await page.isVisible('#view .rover .rprof') && await page.isVisible('#view .rover .rsum') && await page.isVisible('#view .rover .rlist'), 'översikt på Idag: profil, sammanfattning och lista');
  for (const tb of ['vecka', 'framsteg', 'jag', 'idag']) { await page.click(`.tab[data-tab="${tb}"]`); await page.waitForTimeout(100); ok(!/kunde inte visas/.test(await page.textContent('#view')), 'flik ' + tb) }

  let fail = 0;
  for (const [c, m] of out) { console.log((c ? 'OK  ' : 'FEL ') + m); if (!c) fail++ }
  if (errs.length) { fail++; console.log('JS-fel: ' + errs.join(' | ')) }
  await browser.close(); srv.close();
  console.log(fail ? `${fail} FEL` : `ALLA OK (${out.length} kontroller)`);
  process.exit(fail ? 1 : 0);
})();
