// Tester för löptimerns tidsmodell (tidsstämplar, paus, bakgrund, rotation och omladdning).
// Kör: python src/build.py && node tests/lopetimer.test.js
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
  const srv = await serve(), browser = await chromium.launch(), url = `http://localhost:${srv.address().port}/`;
  const out = [], ok = (c, m) => out.push([!!c, m]), errs = [];
  // Fejkad klocka: Date.now() styrs av testet, så att "90 s i bakgrunden" går på millisekunder.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { const real = Date.now.bind(Date); let off = +sessionStorage.getItem('__off') || 0; Date.now = () => real() + off; window.__adv = ms => { off += ms; sessionStorage.setItem('__off', off) }; });
  await ctx.route(/supabase\.co/, r => r.fulfill({ json: [] }));
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.waitForTimeout(400);

  // 1. Enhetstester på de rena funktionerna (fast klocka)
  const unit = await page.evaluate(() => {
    const o = [], ok = (c, m) => o.push([!!c, m]);
    const r = { id: 'x', seg: [[1, 'w', 'A'], [2, 'h', 'B'], [1, 'c', 'C']] };   // 60 s, 120 s, 60 s
    const T0 = 1_000_000;
    let st = { v: 1, rid: 'x', durs: r.seg.map(x => x[0] * 60000), startedAt: null, pausedAt: null, pausedTotalMs: 0, adj: {}, lastIdx: 0, pre: -1 };
    ok(runElapsed(st, T0 + 5000) === 0, 'före start: elapsed 0');
    runPlay(st, T0);
    ok(runElapsed(st, T0 + 30000) === 30000, 'elapsed 30 s efter 30 s');
    // 90 s i bakgrunden: inget händer i appen, men tiden går
    const el = runElapsed(st, T0 + 30000 + 90000);
    ok(el === 120000, `efter simulerad 90 s bakgrund: elapsed ${el / 1000} s`);
    let p = runPos(st.durs, el);
    ok(p.i === 1 && p.inSeg === 60000 && p.left === 60000, `rätt del efter att ha hoppat över ett delbyte: del ${p.i + 1}, ${p.left / 1000} s kvar`);
    p = runPos(st.durs, 200000);
    ok(p.i === 2 && p.left === 40000, 'två delbyten missade → del 3, 40 s kvar');
    ok(runPos(st.durs, 240000).done && runPos(st.durs, 999999).done, 'efter sista delen: klart');
    ok(runPos(st.durs, 59999).i === 0 && runPos(st.durs, 60000).i === 1, 'delgräns exakt vid 60 s');
    // Paus/återuppta
    st = { durs: [60000, 120000, 60000], startedAt: null, pausedAt: null, pausedTotalMs: 0, adj: {} };
    runPlay(st, T0); runPauseAt(st, T0 + 20000);
    ok(runElapsed(st, T0 + 20000 + 300000) === 20000, 'pausad: elapsed står still i 5 min');
    ok(!runRunning(st), 'pausad: går inte');
    runPlay(st, T0 + 320000);
    ok(st.pausedTotalMs === 300000 && runElapsed(st, T0 + 330000) === 30000, 'återupptagen: pausad tid räknas inte (30 s)');
    runPauseAt(st, T0 + 340000); runPlay(st, T0 + 350000);
    ok(runElapsed(st, T0 + 360000) === 50000 && st.pausedTotalMs === 310000, 'två pauser summeras');
    ok(runPauseAt({ ...st, pausedAt: T0 + 1 }, T0 + 5).pausedAt === T0 + 1, 'paus när redan pausad ändrar inget');
    // Nästa del: hoppa över resten / lägg resten på nästa
    st = { durs: [60000, 120000, 60000], startedAt: T0, pausedAt: null, pausedTotalMs: 0, adj: {} };
    runSkip(st, T0 + 20000, 'drop');
    ok(st.durs[0] === 20000 && runPos(st.durs, runElapsed(st, T0 + 20000)).i === 1, 'hoppa över resten: del 1 slutar nu');
    st = { durs: [60000, 120000, 60000], startedAt: T0, pausedAt: null, pausedTotalMs: 0, adj: {} };
    runSkip(st, T0 + 20000, 'carry');
    ok(st.durs[0] === 20000 && st.durs[1] === 160000, 'lägg resten på nästa: 40 s flyttas till del 2');
    // Faktiska delar för loggen
    S.settings.v10 = 11.5; S.settings.comebackUntil = null;
    const rr = RUNS.find(x => x.id === 'r-prog');
    st = runNew(rr, T0); runPlay(st, T0); st.adj[1] = 0.5;
    const act = runActual(st, rr, T0 + 7 * 60000);
    ok(act.length === 2 && act[0].sec === 300 && act[1].sec === 120 && act[1].adj === 0.5 && act[1].kmh === 9.5, `faktiska delar: ${act.map(a => a.sec + ' s @ ' + a.kmh).join(', ')}`);
    ok(JSON.stringify(JSON.parse(JSON.stringify(st))) === JSON.stringify(st), 'state är ren JSON');
    return o;
  });
  out.push(...unit);

  // 2. I appen: bakgrund, rotation, omladdning
  await page.evaluate(() => { S.settings.v10 = 11.5; S.settings.comebackUntil = null; S.settings.runPref = 'band'; startRun('r-prog') });
  await page.click('[data-runplay]'); await page.waitForTimeout(300);
  ok(await page.textContent('[data-runplay]') === 'Pausa', 'Starta → Pausa');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('rs-run')));
  ok(saved && saved.rid === 'r-prog' && saved.startedAt && saved.pausedAt === null, 'state sparas i localStorage vid start');
  // Bakgrund: 5 min 30 s utan att intervallet hinner köra
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); window.__adv(330000); Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')) });
  await page.waitForTimeout(300);
  let t = await page.textContent('#sheetBody'), toastT = await page.evaluate(() => document.querySelector('#toast')?.textContent || '');
  ok(/Del 2 av 6/.test(t), 'tillbaka från bakgrunden: hoppar till del 2');
  ok(/Du är nu i: \+0,5 km\/h – 9,0 km\/h/.test(toastT), `toast om missat delbyte: "${toastT}"`);
  ok(/^4:[23]\d$/.test(await page.textContent('#runT')), `nedräkning härledd från elapsed: ${await page.textContent('#runT')}`);
  ok(await page.textContent('[data-runplay]') === 'Pausa', 'passet pausades inte automatiskt i bakgrunden');
  // Rotation: samma DOM-nod, timern fortsätter
  await page.evaluate(() => { document.getElementById('runT').dataset.mark = '1' });
  const before = await page.textContent('#runT');
  await page.setViewportSize({ width: 844, height: 390 }); await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.evaluate(() => window.__adv(3000)); await page.waitForTimeout(400);
  ok(await page.evaluate(() => document.getElementById('runT').dataset.mark === '1'), 'rotation: passvyn ritas inte om (samma element)');
  ok(await page.textContent('#runT') !== before && await page.textContent('[data-runplay]') === 'Pausa', `rotation: timern fortsätter (${before} → ${await page.textContent('#runT')})`);
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.runmain')).display === 'grid' && getComputedStyle(document.querySelector('.runmain')).gridTemplateColumns.split(' ').length === 2), 'liggande layout med CSS (två kolumner i samma vy)');
  await page.screenshot({ path: path.join(process.env.SHOT_DIR || '/tmp', 'lopetimer-liggande.png') });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(200);
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.runmain')).display !== 'grid'), 'stående layout igen');
  // Paus och omladdning
  await page.click('[data-runplay]'); await page.waitForTimeout(150);
  const frozen = await page.textContent('#runT');
  await page.evaluate(() => window.__adv(120000)); await page.waitForTimeout(400);
  ok(await page.textContent('#runT') === frozen, 'pausad: nedräkningen står still');
  await page.click('[data-runplay]'); await page.waitForTimeout(150);
  const st1 = await page.evaluate(() => ({ ...runState }));
  ok(st1.pausedTotalMs >= 120000 && st1.pausedAt === null, 'återupptagen: pausad tid sparas i pausedTotalMs');
  // Ladda om sidan mitt i passet, och låt en minut gå (den fejkade klockan följer med via sessionStorage)
  await page.evaluate(() => window.__adv(60000));
  await page.reload(); await page.waitForTimeout(700);
  t = await page.textContent('#sheetBody');
  const st2 = await page.evaluate(() => runState && ({ rid: runState.rid, startedAt: runState.startedAt, pausedTotalMs: runState.pausedTotalMs, lastIdx: runState.lastIdx }));
  ok(st2 && st2.rid === 'r-prog' && st2.startedAt === st1.startedAt && st2.pausedTotalMs === st1.pausedTotalMs, 'state återställs från localStorage efter omladdning');
  ok(/Progressivt pass/.test(t) && /Del 2 av 6/.test(t) && await page.textContent('[data-runplay]') === 'Pausa', `passvyn öppnas igen och går vidare (${await page.textContent('#runT')} kvar av del 2)`);
  ok(/^3:2\d$/.test(await page.textContent('#runT')), 'minuten under omladdningen räknas med');
  // Hela passet går klart i bakgrunden → loggformuläret
  await page.evaluate(() => { window.__adv(40 * 60000); document.dispatchEvent(new Event('visibilitychange')) }); await page.waitForTimeout(300);
  t = await page.textContent('#sheetBody');
  ok(/Hur jobbigt var det/.test(t) && await page.evaluate(() => !runState && !localStorage.getItem('rs-run')), 'passet klart under bakgrund: loggformuläret visas och state rensas');
  // Avsluta före start
  await page.evaluate(() => { closeSheet(); startRun('r-prog') }); await page.click('[data-runclose]'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => !runState && !localStorage.getItem('rs-run') && !document.querySelector('#sheet.open')), 'avsluta före start: inget sparas');
  // Trasig data i localStorage ignoreras
  await page.evaluate(() => localStorage.setItem('rs-run', '{"v":1,"rid":"finns-inte","durs":[1]}')); await page.reload(); await page.waitForTimeout(500);
  ok(await page.evaluate(() => !runState), 'okänt pass i localStorage ignoreras');

  // 3. Wake lock: begärs vid start, släpps vid paus/slut, begärs igen när appen blir synlig
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await c2.addInitScript(() => { window.__wl = []; Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { window.__wl.push('req'); const l = new EventTarget(); l.release = async () => { window.__wl.push('rel'); l.dispatchEvent(new Event('release')) }; return l } } }) });
  await c2.route(/supabase\.co/, r => r.fulfill({ json: [] }));
  const p2 = await c2.newPage(); p2.on('pageerror', e => errs.push(e.message));
  await p2.goto(url); await p2.waitForTimeout(400);
  const wl = () => p2.evaluate(() => window.__wl.join(','));
  await p2.evaluate(() => startRun('r-prog')); await p2.waitForTimeout(100);
  ok(await wl() === '', 'wake lock: inte före start');
  ok(!/Håll skärmen tänd/.test(await p2.textContent('#sheetBody')), 'ingen fallbacktext när wake lock stöds');
  await p2.click('[data-runplay]'); await p2.waitForTimeout(150);
  ok(await wl() === 'req', 'wake lock begärs vid start');
  await p2.click('[data-runplay]'); await p2.waitForTimeout(150);
  ok(await wl() === 'req,rel', 'wake lock släpps vid paus');
  await p2.click('[data-runplay]'); await p2.waitForTimeout(150);
  await p2.evaluate(() => { window.__wl.push('ios'); document.dispatchEvent(new Event('visibilitychange')) }); await p2.waitForTimeout(150);
  ok(await wl() === 'req,rel,req,ios', 'wake lock hålls medan passet går');
  await p2.evaluate(async () => { await wakeL.release() }); await p2.waitForTimeout(50);
  await p2.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await p2.waitForTimeout(150);
  ok(/rel,req$/.test(await wl()), 'wake lock begärs igen vid visibilitychange efter att systemet släppt den');
  await p2.click('[data-runclose]'); await p2.waitForTimeout(200);
  ok(/rel$/.test(await wl()), 'wake lock släpps när passet avslutas');
  await c2.close();
  const c3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await c3.addInitScript(() => { delete Navigator.prototype.wakeLock });
  await c3.route(/supabase\.co/, r => r.fulfill({ json: [] }));
  const p3 = await c3.newPage(); p3.on('pageerror', e => errs.push(e.message));
  await p3.goto(url); await p3.waitForTimeout(400); await p3.evaluate(() => startRun('r-prog')); await p3.waitForTimeout(100);
  ok(/Håll skärmen tänd under passet/.test(await p3.textContent('#sheetBody')), 'fallbacktext när wake lock saknas');
  await c3.close();

  let fail = 0;
  for (const [c, m] of out) { console.log((c ? 'OK  ' : 'FEL ') + m); if (!c) fail++ }
  if (errs.length) { fail++; console.log('JS-fel: ' + errs.join(' | ')) }
  await browser.close(); srv.close();
  console.log(fail ? `${fail} FEL` : `ALLA OK (${out.length} kontroller)`);
  process.exit(fail ? 1 : 0);
})();
