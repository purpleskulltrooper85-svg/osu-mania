global.window = global;
global.performance = { now: () => Date.now() };
const path = require('path').join(__dirname,'../js')+'/';
['utils.js','config.js','songs.js','beatmap.js'].forEach(f => require(path + f));
const { Songs:S, Beatmap:B } = window.Mania;
console.log('song              diff       notes   nps   stars   ln%');
for (const spec of S.LIST) {
  const dl = B.difficulties(spec);
  dl.forEach((d, i) => {
    const m = B.generate(spec, i, 4);
    const lnPct = Math.round(100 * m.notes.filter(n=>n.ln).length / m.noteCount);
    console.log(spec.title.padEnd(17) + d.name.padEnd(11) +
      String(m.noteCount).padStart(5) + '  ' + m.nps.toFixed(2).padStart(5) +
      '  ' + m.rating.toFixed(2).padStart(5) + '   ' + String(lnPct).padStart(3) + '%');
  });
  console.log('');
}
