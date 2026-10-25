// Run files: runs/<track>/<frames>-<author>.json
//   {
//     "track": "summer1",            one of the 17 official track slugs (tools/tracks.cjs)
//     "frames": 22035,               finish frame = time in ms; must match the replay exactly
//     "time": "22.035",              frames / 1000, for people reading the file
//     "author": "nickita.org",       the name shown on the leaderboard
//     "github": "nickita-khylkouski",  optional, links the name
//     "date": "2026-10-25",          when the run was made (YYYY-MM-DD); breaks ties
//     "tool": "...",                 optional: how it was made (your TAS tool, optimizer, by hand...)
//     "notes": "...",                optional
//     "recording": "eNo..."          the game's own recording string (base64url), as the leaderboard API stores it
//   }
const fs = require('node:fs');
const path = require('node:path');
const { BY_SLUG } = require('./tracks.cjs');
const { decodeRecording } = require('./engine.cjs');

const ROOT = path.join(__dirname, '..');
const RUNS = path.join(ROOT, 'runs');
const FIELDS = ['track', 'frames', 'time', 'author', 'github', 'date', 'tool', 'notes', 'recording'];
const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '') || 'anon';
const fileName = r => `${r.frames}-${slugify(r.author)}.json`;

function listRuns() {
  if (!fs.existsSync(RUNS)) return [];
  return fs.readdirSync(RUNS).filter(d => fs.statSync(path.join(RUNS, d)).isDirectory())
    .flatMap(d => fs.readdirSync(path.join(RUNS, d)).filter(f => f.endsWith('.json')).map(f => path.join(RUNS, d, f)));
}

// Parse and check a run file without replaying it. Returns {run, keys} or throws with a readable reason.
function readRun(file) {
  const rel = path.relative(ROOT, path.resolve(file));
  let run;
  try { run = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${rel}: not valid JSON (${e.message})`); }
  const bad = msg => { throw new Error(`${rel}: ${msg}`); };
  if (!run || typeof run !== 'object' || Array.isArray(run)) bad('must be a JSON object');
  for (const k of Object.keys(run)) if (!FIELDS.includes(k)) bad(`unknown field "${k}"`);
  if (!BY_SLUG[run.track]) bad(`unknown track "${run.track}" (one of ${Object.keys(BY_SLUG).join(', ')})`);
  const parts = rel.split(path.sep);
  if (parts.length !== 3 || parts[0] !== 'runs' || parts[1] !== run.track) bad(`must live in runs/${run.track}/`);
  if (!Number.isInteger(run.frames) || run.frames <= 0) bad('"frames" must be a positive integer');
  if (run.time !== (run.frames / 1000).toFixed(3)) bad(`"time" must be "${(run.frames / 1000).toFixed(3)}"`);
  if (typeof run.author !== 'string' || !run.author.trim() || run.author.length > 40) bad('"author" must be a name of 1-40 characters');
  if (run.github != null && !/^[A-Za-z0-9-]{1,39}$/.test(run.github)) bad('"github" must be a GitHub username');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(run.date || '')) bad('"date" must be YYYY-MM-DD');
  for (const k of ['tool', 'notes']) if (run[k] != null && (typeof run[k] !== 'string' || run[k].length > 300)) bad(`"${k}" must be text up to 300 characters`);
  if (parts[2] !== fileName(run)) bad(`file name must be ${fileName(run)}`);
  if (typeof run.recording !== 'string' || !/^[A-Za-z0-9_-]+$/.test(run.recording)) bad('"recording" must be a base64url string');
  let keys;
  try { keys = decodeRecording(run.recording); } catch (e) { bad(`"recording" does not decode (${e.message})`); }
  return { run, keys, file: rel };
}

// Leaderboard order: fewer frames first, then the earlier date, then the file name. One entry per author.
function standings(entries) {
  const byTrack = {};
  for (const e of entries) (byTrack[e.run.track] ||= []).push(e);
  for (const k of Object.keys(byTrack)) {
    byTrack[k].sort((a, b) => a.run.frames - b.run.frames || a.run.date.localeCompare(b.run.date) || a.file.localeCompare(b.file));
    const seen = new Set();
    byTrack[k] = byTrack[k].filter(e => { const id = slugify(e.run.author); if (seen.has(id)) return false; seen.add(id); return true; });
  }
  return byTrack;
}

module.exports = { ROOT, RUNS, listRuns, readRun, standings, fileName, slugify };
