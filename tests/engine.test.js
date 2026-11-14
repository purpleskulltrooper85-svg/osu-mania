global.window = global;
let fakeNow = 0;
global.performance = { now: () => fakeNow };
const path = require('path').join(__dirname,'../js')+'/';
['utils.js','config.js','songs.js','beatmap.js'].forEach(f => require(path + f));
const { Config:C, Songs:S, Beatmap:B } = window.Mania;
window.Mania.Audio = { hit(){}, currentSong(){return null;}, isReady(){return false;}, stopSong(){}, playSong(){return null;} };
require(path + 'engine.js');
const { Engine } = window.Mania;

let fail = 0;
function check(n, c, x) { if (!c) { fail++; console.log('  FAIL ' + n + (x !== undefined ? ' :: ' + x : '')); } }

const STEP = 1000/120;
function mkEngine(chart, eff, auto) {
  return Engine.create(chart, {
    effective: Object.assign({ speed: 1.35, od: chart.od, drain: 0, hidden: false, autoPlay: auto, noFail: true }, eff),
    offset: 0, scrollDir: 'up', hitsound: 'none', hitsoundVolume: 0, particles: false
  });
}

const spec = S.byId('neon-pulse');

/* ---------- 1. autoplay must be a flawless 1,000,000 ---------- */
console.log('=== autoplay ===');
for (const d of [0, 2, 4]) {
  const chart = B.generate(spec, d, 4);
  const eng = mkEngine(chart, {}, true);
  let ok = null;
  eng.onEnd = (v) => { ok = v; };
  eng.start(true);
  let frames = 0;
  const limit = Math.ceil((chart.lengthMs + 4000) / STEP);
  while (eng.state === 'running' && frames < limit) { fakeNow += STEP; eng.update(fakeNow); frames++; }
  console.log('  ' + chart.difficulty.name.padEnd(9) + ' judged=' + eng.judged + '/' + chart.noteCount +
    ' score=' + eng.score + ' acc=' + eng.accuracy.toFixed(3) + ' maxCombo=' + eng.maxCombo +
    ' counts=' + JSON.stringify(eng.counts) + ' end=' + ok);
  check(chart.difficulty.name + ' finished', eng.state === 'finished', eng.state);
  check(chart.difficulty.name + ' all judged', eng.judged === chart.noteCount, eng.judged + '/' + chart.noteCount);
  check(chart.difficulty.name + ' no miss', eng.counts.miss === 0, eng.counts.miss);
  check(chart.difficulty.name + ' perfect score', eng.score === 1000000, eng.score);
  check(chart.difficulty.name + ' acc 100', Math.abs(eng.accuracy - 100) < 1e-6, eng.accuracy);
  check(chart.difficulty.name + ' combo', eng.maxCombo === chart.noteCount, eng.maxCombo);
  check(chart.difficulty.name + ' ended true', ok === true, ok);
}

/* ---------- 2. miss everything ---------- */
console.log('=== miss everything ===');
{
  const chart = B.generate(spec, 2, 4);
  const eng = mkEngine(chart, {}, false);
  eng.onEnd = () => {};
  eng.start(true);
  let frames = 0;
  const limit = Math.ceil((chart.lengthMs + 4000) / STEP);
  while (eng.state === 'running' && frames < limit) { fakeNow += STEP; eng.update(fakeNow); frames++; }
  console.log('  judged=' + eng.judged + '/' + chart.noteCount + ' score=' + eng.score + ' miss=' + eng.counts.miss + ' acc=' + eng.accuracy.toFixed(2));
  check('all missed', eng.counts.miss === chart.noteCount, eng.counts.miss + '/' + chart.noteCount);
  check('score zero', eng.score === 0, eng.score);
  check('combo zero', eng.maxCombo === 0, eng.maxCombo);
}

/* ---------- 3. hit every note 20ms late -> all 300s ---------- */
console.log('=== hit all +20ms ===');
{
  const chart = B.generate(spec, 2, 4);
  const eng = mkEngine(chart, {}, false);
  eng.onEnd = () => {};
  eng.start(true);
  const byCol = [];
  for (let c = 0; c < 4; c++) byCol.push(eng.notes.filter(n => n.col === c).sort((a,b)=>a.t-b.t));
  const idx = [0,0,0,0];
  let frames = 0;
  const limit = Math.ceil((chart.lengthMs + 4000) / STEP);
  while (eng.state === 'running' && frames < limit) {
    fakeNow += STEP; eng.update(fakeNow); frames++;
    const now = eng.time;
    for (let c = 0; c < 4; c++) {
      const list = byCol[c];
      while (idx[c] < list.length && list[idx[c]].t + 20 <= now) {
        const n = list[idx[c]];
        eng.press(c);
        if (!n.ln) idx[c]++;
        else { idx[c]++; setTimeout(()=>{},0); }
      }
    }
  }
  console.log('  counts=' + JSON.stringify(eng.counts) + ' score=' + eng.score + ' acc=' + eng.accuracy.toFixed(2));
  check('+20ms -> mostly 300s', eng.counts.p300 + eng.counts.max > chart.noteCount * 0.9, JSON.stringify(eng.counts));
  check('+20ms few misses', eng.counts.miss <= 2, eng.counts.miss);
}

/* ---------- 4. long notes: hold correctly vs release early ---------- */
console.log('=== long notes ===');
{
  const chart = B.generate(spec, 2, 4);
  const eng = mkEngine(chart, {}, false);
  const lns = eng.notes.filter(n => n.ln);
  console.log('  chart has ' + lns.length + ' LNs');
  check('chart has LNs', lns.length > 0, lns.length);

  // (a) full holds via autoplay already covered. (b) release immediately -> miss
  eng.onEnd = () => {};
  eng.start(true);
  const byCol = [];
  for (let c = 0; c < 4; c++) byCol.push(eng.notes.filter(n => n.col === c).sort((a,b)=>a.t-b.t));
  const idx = [0,0,0,0];
  let frames = 0, lnJudged = 0, lnMiss = 0;
  const limit = Math.ceil((chart.lengthMs + 4000) / STEP);
  while (eng.state === 'running' && frames < limit) {
    fakeNow += STEP; eng.update(fakeNow); frames++;
    const now = eng.time;
    for (let c = 0; c < 4; c++) {
      const list = byCol[c];
      while (idx[c] < list.length && list[idx[c]].t + 10 <= now) {
        const n = list[idx[c]];
        eng.press(c);
        if (n.ln) eng.release(c);   // let go instantly
        idx[c]++;
      }
    }
  }
  lns.forEach(n => { if (n.state === 2) { lnJudged++; if (n.judgement === 'miss') lnMiss++; } });
  console.log('  released instantly: LNs judged=' + lnJudged + ' missed=' + lnMiss + '/' + lns.length);
  check('dropped LNs count as miss', lnMiss >= lns.length * 0.9, lnMiss + '/' + lns.length);
}

/* ---------- 5. fail on health drain ---------- */
console.log('=== fail condition ===');
{
  const chart = B.generate(spec, 2, 4);
  const eng = mkEngine(chart, { drain: 2, noFail: false }, false);
  let ok = null;
  eng.onEnd = (v) => { ok = v; };
  eng.start(true);
  eng.health = 0.05;
  let frames = 0;
  while (eng.state === 'running' && frames < 2000) { fakeNow += STEP; eng.update(fakeNow); frames++; }
  console.log('  state=' + eng.state + ' end=' + ok + ' health=' + eng.health.toFixed(3));
  check('failed', eng.state === 'failed', eng.state);
  check('end false', ok === false, ok);
}

/* ---------- 6. noFail never fails ---------- */
console.log('=== no fail ===');
{
  const chart = B.generate(spec, 2, 4);
  const eng = mkEngine(chart, { drain: 2, noFail: true }, false);
  eng.onEnd = () => {};
  eng.start(true);
  eng.health = 0.01;
  let frames = 0;
  while (eng.state === 'running' && frames < 400) { fakeNow += STEP; eng.update(fakeNow); frames++; }
  console.log('  state=' + eng.state + ' health=' + eng.health.toFixed(3));
  check('did not fail', eng.state === 'running', eng.state);
}

/* ---------- 7. mirror / random mods keep the chart valid ---------- */
console.log('=== mods ===');
{
  const chart = B.generate(spec, 2, 4);
  const m = mkEngine(chart, { mirror: true }, true);
  m.start(true);
  let frames = 0;
  while (m.state === 'running' && frames < Math.ceil((chart.lengthMs + 4000)/STEP)) { fakeNow += STEP; m.update(fakeNow); frames++; }
  console.log('  mirror: score=' + m.score + ' miss=' + m.counts.miss);
  check('mirror plays clean', m.score === 1000000, m.score);
  check('mirror columns valid', chart.notes.every(n => n.col >= 0 && n.col < 4));
}

/* ---------- 8. pause / resume preserves the clock ---------- */
console.log('=== pause / resume ===');
{
  const chart = B.generate(spec, 2, 4);
  const eng = mkEngine(chart, {}, false);
  eng.onEnd = () => {};
  eng.start(true);
  for (let i = 0; i < 600; i++) { fakeNow += STEP; eng.update(fakeNow); }
  const tBefore = eng.time;
  eng.pause();
  check('state paused', eng.state === 'paused', eng.state);
  // time passes while paused
  for (let i = 0; i < 300; i++) fakeNow += STEP;
  eng.resume();
  fakeNow += STEP; eng.update(fakeNow);
  const tAfter = eng.time;
  console.log('  tBefore=' + tBefore.toFixed(1) + ' tAfter=' + tAfter.toFixed(1) + ' drift=' + (tAfter - tBefore).toFixed(1) + 'ms');
  check('clock preserved through pause', Math.abs((tAfter - tBefore) - STEP) < 2, (tAfter - tBefore).toFixed(2));
}

console.log(fail === 0 ? '\nALL ENGINE TESTS PASSED' : '\n' + fail + ' ENGINE TEST(S) FAILED');
process.exit(fail ? 1 : 0);
