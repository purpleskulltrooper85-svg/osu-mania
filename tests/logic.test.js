global.window = global;
global.performance = { now: () => Date.now() };
const path = require('path').join(__dirname,'../js')+'/';
['utils.js','config.js','songs.js','beatmap.js'].forEach(f => require(path + f));
const { Utils:U, Config:C, Songs:S, Beatmap:B } = window.Mania;

let fail = 0;
function check(name, cond, extra) {
  if (!cond) { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

console.log('--- music generation ---');
for (const spec of S.LIST) {
  const built = S.build(spec);
  check(spec.id + ' events', built.events.length > 100, built.events.length);
  check(spec.id + ' chart', built.chart.length > 50, built.chart.length);
  check(spec.id + ' length', built.lengthMs > 20000, built.lengthMs);
  // events sorted
  let sorted = true;
  for (let i = 1; i < built.events.length; i++) if (built.events[i].t < built.events[i-1].t) sorted = false;
  check(spec.id + ' sorted events', sorted);
  const dur = U.msToClock(built.lengthMs);
  console.log('  ' + spec.title.padEnd(16) + ' ' + spec.bpm + 'bpm  ' + dur + '  ' + built.events.length + ' events  ' + built.chart.length + ' chart pts');
}

console.log('--- beatmap generation (all songs x diffs x keymodes) ---');
let totalNotes = 0, charts = 0;
for (const spec of S.LIST) {
  for (let d = 0; d < B.difficulties(spec).length; d++) {
    for (const keys of [4,5,6,7]) {
      const m = B.generate(spec, d, keys);
      charts++;
      totalNotes += m.noteCount;
      check('notes>0', m.noteCount > 0, spec.id+' d'+d+' '+keys+'K');
      check('keys match', m.keys === keys);
      check('cols in range', m.notes.every(n => n.col >= 0 && n.col < keys), spec.id+' d'+d+' '+keys+'K');
      check('od range', m.od >= 0 && m.od <= 10, m.od);
      check('rating', m.rating > 0 && m.rating < 10, m.rating);
      check('endMs', m.endMs > 0);
      // notes sorted by time
      let s2 = true;
      for (let i = 1; i < m.notes.length; i++) if (m.notes[i].t < m.notes[i-1].t) s2 = false;
      check('sorted notes', s2, spec.id+' d'+d+' '+keys+'K');
      // no LN overlap in a column
      const byCol = {};
      m.notes.forEach(n => (byCol[n.col] = byCol[n.col] || []).push(n));
      for (const c in byCol) {
        const list = byCol[c];
        for (let i = 0; i < list.length - 1; i++) {
          if (list[i].ln && list[i].end > list[i+1].t) check('no LN overlap', false, spec.id+' d'+d+' '+keys+'K col'+c);
        }
      }
      // determinism
      const m2 = B.generate(spec, d, keys);
      check('deterministic', m2.noteCount === m.noteCount && m2.notes.every((n,i) => n.t === m.notes[i].t && n.col === m.notes[i].col));
    }
  }
}
console.log('  generated ' + charts + ' charts, ' + totalNotes + ' notes total');

console.log('--- difficulty progression (neon-pulse 4K) ---');
const spec = S.byId('neon-pulse');
const dl = B.difficulties(spec);
let prevNps = 0;
dl.forEach((d, i) => {
  const m = B.generate(spec, i, 4);
  console.log('  ' + d.name.padEnd(9) + ' notes=' + String(m.noteCount).padStart(5) +
    ' nps=' + m.nps.toFixed(2) + ' stars=' + m.rating.toFixed(2) + ' ln=' + m.notes.filter(n=>n.ln).length);
  check(d.name + ' nps increases', m.nps > prevNps * 0.85, prevNps.toFixed(2) + ' -> ' + m.nps.toFixed(2));
  prevNps = m.nps;
});

console.log('--- keymode sanity (insane) ---');
[4,5,6,7].forEach(k => {
  const m = B.generate(spec, dl.length-1, k);
  const used = new Set(m.notes.map(n=>n.col));
  check(k+'K uses columns', used.size === k, 'used ' + used.size);
  console.log('  ' + k + 'K  notes=' + m.noteCount + '  columns used=' + used.size + '/' + k);
});

console.log('--- windows ---');
[0, 5, 8, 10].forEach(od => {
  const w = C.windowsFor(od);
  console.log('  OD' + od + '  max=' + w.max + ' 300=' + w.p300.toFixed(1) + ' 200=' + w.p200.toFixed(1) + ' 100=' + w.p100.toFixed(1) + ' 50=' + w.p50.toFixed(1));
  check('windows ordered', w.max < w.p300 && w.p300 < w.p200 && w.p200 < w.p100 && w.p100 < w.p50);
});

console.log('--- grades ---');
[['100',100],['99.5',99.5],['96',96],['92',92],['85',85],['75',75],['50',50]].forEach(([n,a]) => console.log('  ' + n + '% -> ' + C.GRADE(a,false)));
check('100 = SS', C.GRADE(100,false) === 'SS');
check('failed = F', C.GRADE(100,true) === 'F');

console.log(fail === 0 ? '\nALL TESTS PASSED' : '\n' + fail + ' TEST(S) FAILED');
process.exit(fail === 0 ? 0 : 1);
