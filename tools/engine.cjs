// Runs the official PolyTrack simulation worker + WASM physics (downloaded by setup.cjs) inside a Node VM.
// The physics is not modified. Two text hooks in the worker only (1) hand it the WASM bytes from disk and
// (2) expose its car create/step functions so a run can be replayed one frame (= 1 ms) at a time.
const fs = require('node:fs');
const vm = require('node:vm');
const zlib = require('node:zlib');
const path = require('node:path');
const { ENGINE, BY_SLUG } = require('./tracks.cjs');

const KEYS = ['up', 'right', 'down', 'left', 'reset'];
const file = f => {
  const p = path.join(ENGINE, f);
  if (!fs.existsSync(p)) throw new Error(`missing ${p}: run \`npm run setup\` first`);
  return p;
};

function hook(source, pattern, replace) {
  const n = source.split(pattern).length - 1;
  if (n !== 1) throw new Error(`engine hook ${pattern} found ${n} times (different game build?)`);
  return source.replace(pattern, replace);
}

function makeWorker() {
  const context = vm.createContext({
    onmessage: null, console, performance, URL, TextDecoder, TextEncoder, WebAssembly,
    Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array,
    ArrayBuffer, DataView, Map, Set, Math: Object.create(Math), atob, btoa, setTimeout, clearTimeout,
    setInterval: () => 0, clearInterval: () => {}, postMessage: () => {}, addEventListener: () => {},
    location: { href: 'https://app-polytrack.kodub.com/0.6.3/simulation_worker.bundle.js' },
    wasmBinary: fs.readFileSync(file('polytrack_physics.wasm')),
  });
  context.self = context;
  context.importScripts = () => vm.runInContext(fs.readFileSync(file('lib/polytrack_physics.js'), 'utf8'), context);
  let src = fs.readFileSync(file('simulation_worker.bundle.js'), 'utf8');
  src = hook(src, 'PolyTrackPhysics().then((async t=>{', 'PolyTrackPhysics({wasmBinary}).then((async t=>{');
  src = hook(src, 'let a=performance.now(),', 'self.sim={physics:t,create:s,Track:Ko,statePointer:i};let a=performance.now(),');
  vm.runInContext(src, context);
  return context;
}

// The game's recording format (also used by the leaderboard API): for each key, a 3-byte count and then
// 3-byte frame deltas of its press/release toggles; deflated, base64url.
function decodeRecording(str) {
  const b = zlib.inflateSync(Buffer.from(str, 'base64url'));
  const keys = {};
  let pos = 0;
  for (const k of KEYS) {
    const n = b.readUIntLE(pos, 3); pos += 3;
    keys[k] = [];
    for (let j = 0, f = 0; j < n; j++) { f += b.readUIntLE(pos, 3); pos += 3; keys[k].push(f); }
  }
  if (pos !== b.length) throw new Error('recording has trailing bytes');
  return keys;
}
function encodeRecording(keys) {
  const parts = KEYS.map(k => {
    const list = keys[k] || [], b = Buffer.alloc(3 + 3 * list.length);
    b.writeUIntLE(list.length, 0, 3);
    list.forEach((f, j) => b.writeUIntLE(f - (j ? list[j - 1] : 0), 3 + 3 * j, 3));
    return b;
  });
  return zlib.deflateSync(Buffer.concat(parts), { level: 9 }).toString('base64url');
}

// One input bitmask per frame (up=1 right=2 down=4 left=8 reset=16).
function keysToMasks(keys, len) {
  const m = new Uint8Array(len), idx = [0, 0, 0, 0, 0], lists = KEYS.map(k => keys[k] || []);
  let mask = 0;
  for (let f = 0; f < len; f++) {
    for (let j = 0; j < 5; j++) while (idx[j] < lists[j].length && f >= lists[j][idx[j]]) { mask ^= 1 << j; idx[j]++; }
    m[f] = mask;
  }
  return m;
}

// The worker also gets the mountain ring around the track; the game builds it from a fixed random table.
function mountain(bounds) {
  const src = fs.readFileSync(file('main.bundle.js'), 'utf8');
  const m = src.match(/\{value:\[((?:-?[\d.]+(?:e-?\d+)?,){127}-?[\d.]+(?:e-?\d+)?)\]\}/);
  if (!m) throw new Error('mountain table not found in main.bundle.js (different game build?)');
  const T = m[1].split(',').map(Number), PART = 5;
  let r = 0;
  const next = () => { r = (r + 1) % T.length; return T[r]; };
  const n = Math.max(200, 160 + Math.max(Math.abs(bounds.max.x - bounds.min.x), Math.abs(bounds.max.y - bounds.min.y)) * PART / 2 * Math.SQRT2);
  const offset = { x: (bounds.min.x + (bounds.max.x - bounds.min.x) / 2) * PART, y: 0, z: (bounds.min.y + (bounds.max.y - bounds.min.y) / 2) * PART };
  if (n > 4500) return { vertices: [], offset: { x: 0, y: 0, z: 0 } };
  const rows = [];
  for (let e = 0; e < Math.floor(n / 10); e++) {
    const row = [];
    for (let k = 0; k < 8; k++) row.push(k === 0 || k === 7 || (k === 1 && next() < 0.5) ? 0 : next());
    rows.push(row);
  }
  const v = [];
  for (let e = 0; e < rows.length; e++) {
    const t = e / rows.length * Math.PI * 2, i = (e + 1) / rows.length * Math.PI * 2, R = rows[e], o = rows[(e + 1) % rows.length];
    for (let k = 0; k < 7; k++) {
      const A = n + 100 * k, c = n + 100 * (k + 1);
      v.push(Math.cos(t) * A, R[k] * 100, Math.sin(t) * A, Math.cos(i) * A, o[k] * 100, Math.sin(i) * A, Math.cos(i) * c, o[k + 1] * 100, Math.sin(i) * c,
        Math.cos(t) * A, R[k] * 100, Math.sin(t) * A, Math.cos(i) * c, o[k + 1] * 100, Math.sin(i) * c, Math.cos(t) * c, R[k + 1] * 100, Math.sin(t) * c);
    }
  }
  return { vertices: v, offset };
}

let capture = null;
// Load one official track. run(keys) replays from a fresh car and returns the finish frame (or null),
// the frames at which each checkpoint was taken, and optionally the car path.
async function loadTrack(slug) {
  if (!BY_SLUG[slug]) throw new Error(`unknown track ${slug}`);
  const ctx = makeWorker();
  capture ||= JSON.parse(fs.readFileSync(file('capture.json'), 'utf8')).init;
  for (let i = 0; !ctx.sim; i++) { if (i > 500) throw new Error('worker did not start'); await new Promise(r => setTimeout(r, 10)); }
  ctx.onmessage({ data: { ...capture, isRealtime: false, trackParts: capture.trackParts.map(p => ({ ...p, vertices: new Float32Array(p.vertices) })) } });
  const sim = ctx.sim;
  const track = sim.Track.fromExportString(fs.readFileSync(file(`tracks/${slug}/track.track`), 'utf8')).trackData;
  const mv = mountain(track.getBounds()), start = track.getStartTransform();
  let created = false;
  function run(keys, { limit = 300000, path: wantPath = false } = {}) {
    if (created) sim.physics.ccall('deleteCarModel', 'void', ['number'], [999]);
    sim.create(999, mv.vertices, mv.offset, track, start);
    created = true;
    const masks = keysToMasks(keys, limit), checkpoints = [], P = [];
    for (let f = 0, cp = 0; f < limit; f++) {
      const k = masks[f];
      sim.physics._updateCarModel(999, !!(k & 1), !!(k & 2), !!(k & 4), !!(k & 8), !!(k & 16), sim.statePointer);
      const dv = new DataView(sim.physics.HEAPU8.buffer, sim.statePointer, 227);
      const done = !!(dv.getUint8(11) & 2), count = dv.getUint16(done ? 15 : 12, true);
      if (wantPath) { const o = done ? 17 : 14; P.push([dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)]); }
      if (count > cp) { cp = count; checkpoints.push(f + 1); }
      if (done) return { frames: f + 1, checkpoints, path: wantPath ? P : undefined };
    }
    return { frames: null, checkpoints, path: wantPath ? P : undefined };
  }
  return { slug, track, start, run };
}

module.exports = { loadTrack, decodeRecording, encodeRecording, keysToMasks, KEYS };
