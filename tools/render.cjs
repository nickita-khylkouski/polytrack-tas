// Draw the images in docs/img/: one top-down map per track (TAS line vs the in-game WR line) with a
// caption (tracks/, for the README) and without (maps/, for the website), plus the banner. Also writes
// docs/replay/<track>.json: both cars' paths in map pixels and the TAS lead over time, for the website's replays. Uses headless Chromium (playwright) for the canvas.
//   npm run render
const fs = require('node:fs');
const path = require('node:path');
const { TRACKS, ENGINE } = require('./tracks.cjs');
const { loadTrack, decodeRecording } = require('./engine.cjs');
const { topDown } = require('./geometry.cjs');
const { ROOT, listRuns, readRun, standings } = require('./runs.cjs');

const IMG = path.join(ROOT, 'docs', 'img');
const every = (P, n) => P.filter((_, i) => i % n === 0 || i === P.length - 1).map(p => p.map(v => Math.round(v * 10) / 10));

// How far ahead the TAS is (ms) at each sampled frame of its path: find where the in-game #1 car was closest to
// the same spot (searching forward only, so crossings don't confuse it) and compare the times. P[i] is the
// position after frame i + 1. The last value is the exact finish difference.
function leadCurve(A, B, n) {
  const d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  const out = [];
  let j = 0;
  for (let k = 0; k < A.length; k++) {
    if (k % n && k !== A.length - 1) continue;
    let best = Infinity, bj = j;
    for (let m = j; m < Math.min(B.length, j + 1500); m++) { const d = d2(A[k], B[m]); if (d < best) { best = d; bj = m; } }
    let at = bj, bestSeg = Infinity;
    for (const [a, b] of [[bj - 1, bj], [bj, bj + 1]]) {
      if (a < 0 || b >= B.length) continue;
      const v = [0, 1, 2].map(i => B[b][i] - B[a][i]), w = [0, 1, 2].map(i => A[k][i] - B[a][i]);
      const vv = v[0] ** 2 + v[1] ** 2 + v[2] ** 2, u = vv ? Math.max(0, Math.min(1, (w[0] * v[0] + w[1] * v[1] + w[2] * v[2]) / vv)) : 0;
      const d = d2(A[k], B[a].map((x, i) => x + u * v[i]));
      if (d < bestSeg) { bestSeg = d; at = a + u; }
    }
    j = bj;
    out.push(Math.round((at - k) * 10) / 10);
  }
  out[out.length - 1] = B.length - A.length;
  return out;
}

async function trackData() {
  const board = standings(listRuns().map(readRun));
  const out = [];
  for (const t of TRACKS) {
    const rec = board[t.slug]?.[0];
    if (!rec) continue;
    const T = await loadTrack(t.slug);
    const tas = T.run(rec.keys, { path: true });
    const off = JSON.parse(fs.readFileSync(path.join(ENGINE, 'tracks', t.slug, 'official.json'), 'utf8')).top[0];
    const human = off?.recording ? T.run(decodeRecording(off.recording), { path: true }) : null;
    out.push({
      slug: t.slug, name: t.name,
      tris: Buffer.from(topDown(T.track).buffer).toString('base64'),
      tas: every(tas.path, 20), tasFrames: rec.run.frames, tasAuthor: rec.run.author, tasCp: tas.checkpoints,
      ...(human && {
        human: every(human.path, 20), humanFrames: off.frames, humanAuthor: off.nickname, humanCp: human.checkpoints,
        lead: leadCurve(tas.path, human.path, 20),
      }),
    });
  }
  return out;
}

async function render({ log = console.log } = {}) {
  const data = await trackData();
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, channel: process.env.PT_CHANNEL || undefined });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await page.goto('file://' + path.join(__dirname, 'render.html'));
    await page.evaluate(() => Promise.all(['400 16px Geist', '500 16px Geist', '800 16px Geist', '500 16px "Geist Mono"', '700 16px "Geist Mono"'].map(f => document.fonts.load(f))));
    fs.mkdirSync(path.join(IMG, 'tracks'), { recursive: true });
    fs.mkdirSync(path.join(IMG, 'maps'), { recursive: true });
    fs.mkdirSync(path.join(ROOT, 'docs', 'replay'), { recursive: true });
    const shot = async (file) => {
      const png = await page.evaluate(() => document.getElementById('c').toDataURL('image/png'));
      fs.writeFileSync(file, Buffer.from(png.split(',')[1], 'base64'));
      log(`image  ${path.relative(ROOT, file)}`);
    };
    for (const t of data) {
      await page.evaluate(t => window.trackCard(t), t);
      await shot(path.join(IMG, 'tracks', `${t.slug}.png`));
      const xy = await page.evaluate(t => window.mapOnly(t), t);
      await shot(path.join(IMG, 'maps', `${t.slug}.png`));
      const replay = {
        step: 20,
        tas: { frames: t.tasFrames, name: t.tasAuthor, cp: t.tasCp, xy: xy.tas },
        human: t.human ? { frames: t.humanFrames, name: t.humanAuthor, cp: t.humanCp, xy: xy.human } : null,
        lead: t.lead || null,
      };
      fs.writeFileSync(path.join(ROOT, 'docs', 'replay', `${t.slug}.json`), JSON.stringify(replay) + '\n');
    }
    const ahead = data.filter(t => t.human && t.tasFrames < t.humanFrames).length;
    const saved = data.reduce((s, t) => s + (t.human ? t.humanFrames - t.tasFrames : 0), 0);
    await page.evaluate(([d, s]) => window.banner(d, s), [data, [`${ahead}/${data.length} beat the in-game WR`, `${(saved / 1000).toFixed(3)} s faster in total`]]);
    await shot(path.join(IMG, 'banner.png'));
  } finally {
    await browser.close();
  }
}

module.exports = { render };
if (require.main === module) render().catch(e => { console.error(e.stack || e); process.exit(1); });
