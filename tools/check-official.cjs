// Engine self-test: replay the official in-game top 10 of every track (fetched by setup) and check each run
// finishes on the frame the leaderboard says. If these pass, the engine here is the game's.
//   npm run check-official
const fs = require('node:fs');
const path = require('node:path');
const { TRACKS, ENGINE } = require('./tracks.cjs');
const { loadTrack, decodeRecording } = require('./engine.cjs');

(async () => {
  let ok = 0, bad = 0;
  for (const t of TRACKS) {
    const off = JSON.parse(fs.readFileSync(path.join(ENGINE, 'tracks', t.slug, 'official.json'), 'utf8'));
    const T = await loadTrack(t.slug);
    const res = off.top.filter(e => e.recording).map(e => {
      const r = T.run(decodeRecording(e.recording), { limit: e.frames + 1000 });
      r.frames === e.frames ? ok++ : bad++;
      return r.frames === e.frames ? '✓' : `✗ #${e.rank} ${e.nickname} ${e.frames} -> ${r.frames}`;
    });
    console.log(t.name.padEnd(9), res.filter(x => x === '✓').length + '/' + res.length, res.filter(x => x !== '✓').join('  '));
  }
  console.log(`${ok} official runs replay exactly, ${bad} do not`);
  process.exit(bad ? 1 : 0);
})();
