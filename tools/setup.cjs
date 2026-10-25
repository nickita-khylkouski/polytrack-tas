// Download the official PolyTrack engine and the 17 official tracks from kodub.com into .engine/<version>/.
// Nothing from the game is stored in this repository: the verifier always runs the files Kodub serves.
//
//   npm run setup            (once; ~20 s, needs Chromium: `npx playwright install chromium`)
//   npm run setup -- --official   also re-download the official leaderboard top 10s
//
// What it fetches:
//   simulation_worker.bundle.js, lib/polytrack_physics.js, polytrack_physics.wasm   the game's physics worker
//   main.bundle.js                                  read for the mountain table the worker is given at start
//   capture.json                                    the worker's init message (track part + car collision
//                                                   meshes), taken from the real game in headless Chromium
//   tracks/<slug>/track.track, official.json        the track and its verified official top 10
const fs = require('node:fs');
const path = require('node:path');
const { VERSION, ENGINE, TRACKS } = require('./tracks.cjs');

const SITE = `https://app-polytrack.kodub.com/${VERSION}/`;
const API = 'https://vps.kodub.com/v6';
const HEADERS = { Origin: 'https://app-polytrack.kodub.com', Referer: 'https://app-polytrack.kodub.com/' };

async function get(url, binary) {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: HEADERS });
    if (r.ok) return binary ? Buffer.from(await r.arrayBuffer()) : r.json();
    if (i === 4) throw new Error(`${r.status} ${url}`);
    await new Promise(s => setTimeout(s, 1500 * (i + 1)));
  }
}

// The worker is created when the game loads; its first message (messageType 0) carries every track part's
// collision mesh and the car's collision shape. Record it in a throwaway headless browser (all non-GET
// requests blocked, no account).
async function captureInit() {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, channel: process.env.PT_CHANNEL || undefined });
  try {
    const page = await browser.newPage();
    await page.route('**/*', r => (r.request().method() === 'GET' ? r.continue() : r.abort()));
    await page.addInitScript(() => {
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (m, ...rest) {
        if (m && m.messageType === 0 && m.trackParts && !window.__ptInit) {
          window.__ptInit = JSON.stringify({
            ...m,
            isRealtime: false,
            trackParts: m.trackParts.map(p => ({ ...p, vertices: Array.from(p.vertices) })),
            carCollisionShapeVertices: Array.from(m.carCollisionShapeVertices),
          });
        }
        return post.call(this, m, ...rest);
      };
    });
    await page.goto(SITE, { waitUntil: 'load' });
    for (let i = 0; i < 90; i++) {
      const s = await page.evaluate(() => window.__ptInit);
      if (s) return JSON.parse(s);
      await page.waitForTimeout(1000);
    }
    throw new Error('the game never started its simulation worker');
  } finally {
    await browser.close();
  }
}

async function setup({ force = false, official = false, log = console.log } = {}) {
  fs.mkdirSync(path.join(ENGINE, 'lib'), { recursive: true });
  for (const f of ['simulation_worker.bundle.js', 'lib/polytrack_physics.js', 'polytrack_physics.wasm', 'main.bundle.js']) {
    const out = path.join(ENGINE, f);
    if (force || !fs.existsSync(out)) { fs.writeFileSync(out, await get(SITE + f, true)); log(`engine  ${f}`); }
  }
  const cap = path.join(ENGINE, 'capture.json');
  if (force || !fs.existsSync(cap)) {
    const init = await captureInit();
    if (init.version !== VERSION) throw new Error(`game reports version ${init.version}, expected ${VERSION}`);
    fs.writeFileSync(cap, JSON.stringify({ init }));
    log(`engine  capture.json (${init.trackParts.length} track parts)`);
  }
  for (const t of TRACKS) {
    const dir = path.join(ENGINE, 'tracks', t.slug);
    fs.mkdirSync(dir, { recursive: true });
    const tf = path.join(dir, 'track.track');
    if (force || !fs.existsSync(tf)) fs.writeFileSync(tf, await get(SITE + t.url, true));
    const of = path.join(dir, 'official.json');
    if (force || official || !fs.existsSync(of)) {
      const lb = await get(`${API}/leaderboard?version=${VERSION}&trackId=${t.id}&skip=0&amount=10&onlyVerified=true`);
      const ids = lb.entries.map(e => e.id);
      const recs = ids.length ? await get(`${API}/recordings?version=${VERSION}&ids=${ids.join(',')}`) : [];
      const top = lb.entries.map((e, i) => ({ rank: i + 1, id: e.id, nickname: e.nickname, frames: e.frames, time: e.time, recording: recs[i]?.recording ?? null }));
      fs.writeFileSync(of, JSON.stringify({ fetched: new Date().toISOString(), total: lb.total, top }, null, 1));
    }
    log(`track   ${t.name}`);
  }
}

module.exports = { setup, get, API, HEADERS };
if (require.main === module) setup({ force: process.argv.includes('--force'), official: process.argv.includes('--official') }).catch(e => { console.error(e.message); process.exit(1); });
