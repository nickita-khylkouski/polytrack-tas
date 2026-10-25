// Import a run from the official PolyTrack leaderboard (e.g. a TAS you already uploaded in the game).
//   npm run import -- <track> --rank 1 [--author "name"] [--github user] [--tool ".."]
// --rank counts on the full leaderboard (verified and unverified runs). The author defaults to the in-game nickname.
const { BY_SLUG, VERSION } = require('./tracks.cjs');
const { get, API } = require('./setup.cjs');
const { addRun } = require('./add.cjs');

(async () => {
  const a = process.argv.slice(2), o = {};
  for (let i = 1; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[++i];
  const track = a[0], rank = +(o.rank || 0);
  if (!BY_SLUG[track] || !(rank >= 1)) { console.error('usage: npm run import -- <track> --rank N [--author "name"] [--github user]'); process.exit(1); }
  const lb = await get(`${API}/leaderboard?version=${VERSION}&trackId=${BY_SLUG[track].id}&skip=${rank - 1}&amount=1&onlyVerified=false`);
  const e = lb.entries[0];
  if (!e) throw new Error(`no entry at rank ${rank}`);
  const [rec] = await get(`${API}/recordings?version=${VERSION}&ids=${e.id}`);
  console.log(`rank ${rank}: ${e.nickname} ${(e.frames / 1000).toFixed(3)} s (leaderboard id ${e.id})`);
  await addRun({ track, recording: rec.recording, author: o.author || e.nickname, github: o.github, tool: o.tool, notes: o.notes || `official leaderboard id ${e.id}`, date: o.date || String(e.time).slice(0, 10) });
})().catch(e => { console.error(e.message); process.exit(1); });
