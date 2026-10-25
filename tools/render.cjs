// Draw the images in docs/img/: one top-down map per track (TAS record line vs the official #1 line) with a
// caption (tracks/, for the README) and without (maps/, for the website), plus the banner. Uses headless Chromium (playwright) for the canvas.
//   npm run render
const fs = require('node:fs');
const path = require('node:path');
const { TRACKS, ENGINE } = require('./tracks.cjs');
const { loadTrack, decodeRecording } = require('./engine.cjs');
const { topDown } = require('./geometry.cjs');
const { ROOT, listRuns, readRun, standings } = require('./runs.cjs');

const IMG = path.join(ROOT, 'docs', 'img');
const every = (P, n) => P.filter((_, i) => i % n === 0 || i === P.length - 1).map(p => p.map(v => Math.round(v * 10) / 10));

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
      tas: every(tas.path, 20), tasFrames: rec.run.frames, tasAuthor: rec.run.author,
      ...(human && { human: every(human.path, 20), humanFrames: off.frames, humanAuthor: off.nickname }),
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
    const shot = async (file) => {
      const png = await page.evaluate(() => document.getElementById('c').toDataURL('image/png'));
      fs.writeFileSync(file, Buffer.from(png.split(',')[1], 'base64'));
      log(`image  ${path.relative(ROOT, file)}`);
    };
    for (const t of data) {
      await page.evaluate(t => window.trackCard(t), t);
      await shot(path.join(IMG, 'tracks', `${t.slug}.png`));
      await page.evaluate(t => window.mapOnly(t), t);
      await shot(path.join(IMG, 'maps', `${t.slug}.png`));
    }
    const ahead = data.filter(t => t.human && t.tasFrames < t.humanFrames).length;
    const saved = data.reduce((s, t) => s + (t.human ? t.humanFrames - t.tasFrames : 0), 0);
    await page.evaluate(([d, s]) => window.banner(d, s), [data, [`${ahead}/${data.length} tracks faster than the official #1`, `${(saved / 1000).toFixed(3)} s saved in total`]]);
    await shot(path.join(IMG, 'banner.png'));
  } finally {
    await browser.close();
  }
}

module.exports = { render };
if (require.main === module) render().catch(e => { console.error(e.stack || e); process.exit(1); });
