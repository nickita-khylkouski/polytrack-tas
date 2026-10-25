// Verify run files: replay each one twice from a fresh car in the official engine and check that it crosses
// the finish on exactly the claimed frame (the game only counts a finish after every checkpoint).
//   npm run verify -- runs/summer1/22035-nickita.org.json [more files]
//   npm run verify -- --all
// Exit code 0 = every file passed. In GitHub Actions a results table goes to the job summary.
const fs = require('node:fs');
const path = require('node:path');
const { loadTrack } = require('./engine.cjs');
const { BY_SLUG } = require('./tracks.cjs');
const { listRuns, readRun, standings } = require('./runs.cjs');

const tracks = new Map();
const track = async slug => { if (!tracks.has(slug)) tracks.set(slug, await loadTrack(slug)); return tracks.get(slug); };

async function verifyFile(file) {
  let r;
  try { r = readRun(file); } catch (e) { return { file, ok: false, reason: e.message }; }
  const T = await track(r.run.track);
  const a = T.run(r.keys, { limit: r.run.frames + 1000 }), b = T.run(r.keys, { limit: r.run.frames + 1000 });
  const base = { ...r, checkpoints: a.checkpoints };
  if (a.frames !== b.frames) return { ...base, ok: false, reason: `replays disagree (${a.frames} vs ${b.frames})` };
  if (a.frames == null) return { ...base, ok: false, reason: `does not finish (${a.checkpoints.length} checkpoints taken)` };
  if (a.frames !== r.run.frames) return { ...base, ok: false, reason: `finishes at frame ${a.frames}, file claims ${r.run.frames}` };
  return { ...base, ok: true, frames: a.frames };
}

async function main(argv) {
  const files = argv.includes('--all') ? listRuns() : argv.filter(a => !a.startsWith('--'));
  if (!files.length) { console.log('no run files to verify'); return 0; }
  const results = [];
  for (const f of files) {
    if (!fs.existsSync(f)) { results.push({ file: f, ok: false, reason: 'file not found (deleted?)' }); continue; }
    const v = await verifyFile(f);
    results.push(v);
    console.log(`${v.ok ? 'PASS' : 'FAIL'}  ${v.file || f}${v.ok ? `  ${BY_SLUG[v.run.track].name} ${v.run.time} s by ${v.run.author}` : `  ${v.reason}`}`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary(results));
  return results.every(r => r.ok) ? 0 : 1;
}

// Markdown for the PR checks page: each run against the current record (runs other than the ones checked).
function summary(results) {
  const checked = new Set(results.map(r => path.resolve(r.file)));
  const others = listRuns().filter(f => !checked.has(path.resolve(f))).flatMap(f => { try { return [readRun(f)]; } catch { return []; } });
  const board = standings(others);
  const rows = results.map(r => {
    if (!r.ok) return `| ❌ | \`${r.file}\` | | | ${r.reason.replace(/\|/g, '\\|')} |`;
    const rec = board[r.run.track]?.[0];
    const vs = !rec ? 'first run on this track' : r.run.frames < rec.run.frames ? `**new record**, ${rec.run.frames - r.run.frames} ms faster than ${rec.run.author}` : r.run.frames === rec.run.frames ? `ties the record (${rec.run.author})` : `${r.run.frames - rec.run.frames} ms behind the record`;
    return `| ✅ | \`${r.file}\` | ${BY_SLUG[r.run.track].name} | ${r.run.time} s | ${vs} |`;
  });
  return `## Run verification\n\nEach run was replayed twice in the official PolyTrack 0.6.3 engine.\n\n| | File | Track | Time | Result |\n|---|---|---|---|---|\n${rows.join('\n')}\n`;
}

module.exports = { verifyFile };
if (require.main === module) main(process.argv.slice(2)).then(code => process.exit(code), e => { console.error(e.stack || e); process.exit(1); });
