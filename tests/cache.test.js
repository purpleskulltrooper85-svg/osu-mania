/* Prove that mirror/random mods no longer corrupt the shared cached chart. */
global.window = global;
global.performance = { now: () => 0 };
global.document = { hidden: false, addEventListener(){}, removeEventListener(){}, createElement(){return{getContext(){return null}}}, getElementById(){return null} };
global.AudioContext = function(){ throw new Error('no audio in test'); };
global.window.AudioContext = global.AudioContext;
const path = require('path').join(__dirname,'../js')+'/';
['utils','config','songs','audio','beatmap','engine'].forEach(m => require(path+m+'.js'));
const { Beatmap:B, Engine:E, Songs:S, Options:O } = window.Mania;

const spec = S.byId('neon-pulse');
const chart = B.cached(spec, 2, 4);
const original = chart.notes.map(n => n.col).join(',');

// Play once WITH mirror
const e1 = E.create(chart, { mirror: true, effective: {} });
const mirrored = e1.notes.map(n => n.col).join(',');
e1.update(0);

// Play again WITHOUT mirror, same cached chart
const e2 = E.create(chart, { effective: {} });
const plain = e2.notes.map(n => n.col).join(',');

console.log('cached chart cols unchanged:', chart.notes.map(n=>n.col).join(',') === original);
console.log('mirrored run differs from plain:', mirrored !== plain);
console.log('plain run equals original:', plain === original);

// random should also be stable across runs (deterministic seed)
const r1 = E.create(chart, { random: true, effective: {} }).notes.map(n=>n.col).join(',');
const r2 = E.create(chart, { random: true, effective: {} }).notes.map(n=>n.col).join(',');
console.log('random deterministic across runs:', r1 === r2);
console.log('random differs from plain:', r1 !== plain);

const ok = chart.notes.map(n=>n.col).join(',') === original && mirrored !== plain && plain === original && r1 === r2 && r1 !== plain;
console.log(ok ? '\nCACHE INTEGRITY OK' : '\nCACHE INTEGRITY FAILED');
process.exit(ok ? 0 : 1);
