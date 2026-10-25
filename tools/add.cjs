// Make a run file from a recording string: replays it to find the finish frame, writes runs/<track>/<frames>-<author>.json.
//   npm run add -- <track> <recording or file containing it> --author "name" [--github user] [--tool "..."] [--notes "..."] [--date YYYY-MM-DD]
const fs = require('node:fs');
const path = require('node:path');
const { BY_SLUG } = require('./tracks.cjs');
const { loadTrack, decodeRecording } = require('./engine.cjs');
const { RUNS, fileName } = require('./runs.cjs');

function opts(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) argv[i].startsWith('--') ? (o[argv[i].slice(2)] = argv[++i]) : o._.push(argv[i]);
  return o;
}

async function addRun({ track, recording, author, github, tool, notes, date, log = console.log }) {
  if (!BY_SLUG[track]) throw new Error(`unknown track "${track}" (one of ${Object.keys(BY_SLUG).join(', ')})`);
  if (!author) throw new Error('--author is required');
  const T = await loadTrack(track);
  const r = T.run(decodeRecording(recording));
  if (r.frames == null) throw new Error(`the recording does not finish ${BY_SLUG[track].name} (${r.checkpoints.length} checkpoints taken)`);
  const run = { track, frames: r.frames, time: (r.frames / 1000).toFixed(3), author, ...(github && { github }), date: date || new Date().toISOString().slice(0, 10), ...(tool && { tool }), ...(notes && { notes }), recording };
  const out = path.join(RUNS, track, fileName(run));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(run, null, 2) + '\n');
  log(`${BY_SLUG[track].name} ${run.time} s -> ${path.relative(process.cwd(), out)}`);
  return out;
}

module.exports = { addRun };
if (require.main === module) {
  const o = opts(process.argv.slice(2));
  const [track, rec] = o._;
  if (!track || !rec) { console.error('usage: npm run add -- <track> <recording | file> --author "name" [--github user] [--tool ".."] [--notes ".."]'); process.exit(1); }
  const recording = fs.existsSync(rec) ? fs.readFileSync(rec, 'utf8').trim() : rec.trim();
  addRun({ track, recording, ...o }).catch(e => { console.error(e.message); process.exit(1); });
}
