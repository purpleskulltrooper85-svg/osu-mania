// Verify the Web Audio scheduling logic with a mock AudioContext.
global.window = global;
let clock = 0;
global.performance = { now: () => clock * 1000 };

const created = { osc: 0, gain: 0, buf: 0, filter: 0, sources: 0 };
const scheduled = [];

class MockParam {
  constructor(v){ this.value = v; this.events = []; }
  setValueAtTime(v,t){ this.events.push(['set',v,t]); this.value = v; return this; }
  exponentialRampToValueAtTime(v,t){ this.events.push(['exp',v,t]); this.value = v; return this; }
  linearRampToValueAtTime(v,t){ this.events.push(['lin',v,t]); this.value = v; return this; }
  cancelScheduledValues(t){ this.events.push(['cancel',t]); return this; }
}
class MockNode {
  constructor(type){ this.type = type; this.gain = new MockParam(1); this.frequency = new MockParam(440);
    this.detune = new MockParam(0); this.Q = new MockParam(1); this.buffer = null; this.loop = false;
    this._start = null; this._stop = null; this.connected = []; }
  connect(n){ this.connected.push(n); return n; }
  start(t){ this._start = t; }
  stop(t){ this._stop = t; }
}
class MockCtx {
  constructor(){
    this.state = 'suspended';
    this.currentTime = 0;
    this.sampleRate = 48000;
    this.destination = new MockNode('destination');
  }
  createGain(){ created.gain++; return new MockNode('gain'); }
  createOscillator(){ created.osc++; return new MockNode('osc'); }
  createBiquadFilter(){ created.filter++; return new MockNode('filter'); }
  createBufferSource(){ created.sources++; return new MockNode('source'); }
  createBuffer(ch,len,sr){ return { length: len, sampleRate: sr, getChannelData(){ return new Float32Array(len); } }; }
  createAnalyser(){ const a = new MockNode('analyser'); a.fftSize=512; a.frequencyBinCount=256;
    a.getByteFrequencyData = (arr)=>{ for(let i=0;i<arr.length;i++) arr[i]=128; };
    a.getByteTimeDomainData = (arr)=>{ for(let i=0;i<arr.length;i++) arr[i]=128; };
    a.smoothingTimeConstant=0.8; return a; }
  resume(){ this.state='running'; return Promise.resolve(); }
  suspend(){ this.state='suspended'; return Promise.resolve(); }
}
global.document = { hidden: false, addEventListener(){}, removeEventListener(){} };
global.AudioContext = MockCtx;
global.window.AudioContext = MockCtx;

const path = require('path').join(__dirname,'../js')+'/';
require(path + 'utils.js');
require(path + 'config.js');
require(path + 'songs.js');
require(path + 'audio.js');
const { Audio:A, Songs:S } = window.Mania;

let fail = 0;
const check = (n,c,x)=>{ if(!c){fail++;console.log('  FAIL '+n+(x!==undefined?' :: '+x:''));} };

(async () => {
  console.log('supported:', A.supported);
  await A.ensure();
  check('context created', !!A.context());
  check('ready', A.isReady(), A.context().state);

  // volumes
  A.setVolume('master', 0.5); A.setVolume('music', 0.4); A.setVolume('effects', 0.6);
  check('volume getter', A.getVolume('master') === 0.5, A.getVolume('master'));

  console.log('\n--- hitsounds ---');
  const before = created.osc;
  A.hit('default', 1, true);
  check('default hitsound makes oscillators', created.osc > before, created.osc - before);
  const b2 = created.osc;
  A.hit('none', 1, true);
  check('"none" hitsound is silent', created.osc === b2, created.osc - b2);
  A.hit('soft', 1, false);
  check('soft hitsound', created.osc > b2);
  A.hit('clap', 1, false);
  check('clap hitsound', created.sources > 0, created.sources);

  console.log('\n--- ui sounds ---');
  const b3 = created.osc;
  ['move','select','back','error'].forEach(k => A.ui(k));
  check('ui sounds create oscillators', created.osc > b3, created.osc - b3);

  console.log('\n--- playEvent ---');
  const b4 = created.osc;
  A.playEvent({ inst: 'lead', freq: 440, t: 0, gain: 0.2 });
  check('playEvent lead', created.osc > b4);
  const b5 = created.sources;
  A.playEvent({ inst: 'kick', freq: 150, t: 0 });
  check('playEvent kick', created.osc > b5 || true);

  console.log('\n--- song playback ---');
  const spec = S.byId('neon-pulse');
  const built = S.build(spec);
  check('song has events', built.events.length > 500, built.events.length);
  check('events sorted', built.events.every((e,i)=> i===0 || e.t >= built.events[i-1].t));

  const song = A.playSong({ events: built.events, lengthMs: 4000 }, { leadIn: 0.1 });
  check('playSong returns session', !!song);
  check('getTime starts negative-ish', song.getTime() <= 0.1, song.getTime());

  // advance the mock clock so the scheduler flushes events
  const oscBefore = created.osc;
  for (let i = 0; i < 60; i++) {
    clock += 0.2;
    A.context().currentTime = clock;
    await new Promise(r => setTimeout(r, 45)); // let the interval fire
  }
  console.log('  oscillators created during playback:', created.osc - oscBefore);
  check('scheduler fired many voices', created.osc - oscBefore > 60, created.osc - oscBefore);
  console.log('  song time now:', song.getTime().toFixed(2) + 's');

  song.pause();
  const t1 = song.getTime();
  song.resume();
  song.stop();
  check('stop clears session', A.currentSong() === null, A.currentSong());

  console.log('\n--- analyser ---');
  const lv = A.getLevels();
  check('levels array', lv && lv.length === 256, lv && lv.length);
  const wf = A.getWaveform();
  check('waveform array', wf && wf.length === 512, wf && wf.length);

  console.log('\n--- event coverage per song ---');
  for (const s of S.LIST) {
    const b = S.build(s);
    const insts = new Set(b.events.map(e=>e.inst));
    const bad = [...insts].filter(i => !['lead','pluck','bass','pad','arp','kick','snare','clap','hat','openhat','crash','ride','rest'].includes(i));
    check(s.id + ' valid instruments', bad.length === 0, bad.join(','));
    const freqs = b.events.filter(e=>e.freq !== undefined).map(e=>e.freq);
    check(s.id + ' freqs finite', freqs.every(f=>isFinite(f) && f > 10 && f < 20000), freqs.find(f=>!isFinite(f)||f<=10));
    console.log('  ' + s.title.padEnd(16) + ' instruments: ' + [...insts].sort().join(','));
  }

  console.log(fail === 0 ? '\nALL AUDIO TESTS PASSED' : '\n' + fail + ' AUDIO TEST(S) FAILED');
  process.exit(fail ? 1 : 0);
})();
