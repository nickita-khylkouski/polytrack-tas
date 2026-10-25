// Top-down geometry of an official track for the map images: every track part's collision mesh placed on
// the grid (1 grid unit = 5 m), plus the car path of a run.
const fs = require('node:fs');
const path = require('node:path');
const { ENGINE } = require('./tracks.cjs');

let meshes = null;
function partMeshes() {
  if (!meshes) {
    const init = JSON.parse(fs.readFileSync(path.join(ENGINE, 'capture.json'), 'utf8')).init;
    meshes = new Map(init.trackParts.map(p => [p.id, p]));
  }
  return meshes;
}

// Same convention as the game's tile rotation: turn r quarter-turns around the part's up axis, then tilt that
// axis (0 = +Y, 1 = -Y, 2 = +X, 3 = -X, 4 = +Z, 5 = -Z).
function place([x, y, z], r, axis) {
  const neg = axis === 1 || axis === 3 || axis === 5;
  for (let i = 0; i < r; i++) [x, z] = neg ? [z, -x] : [-z, x];
  if (axis === 1) [x, y] = [-x, -y];
  else if (axis === 2) [x, y] = [-y, x];
  else if (axis === 3) [x, y] = [y, -x];
  else if (axis === 4) [y, z] = [z, -y];
  else if (axis === 5) [y, z] = [-z, y];
  return [x, y, z];
}

// Triangles seen from above, as a flat Float32Array of [x1, z1, x2, z2, x3, z3, top, light, kind] records
// sorted by height. kind: 0 road, 1 checkpoint, 2 start, 3 finish.
function topDown(track) {
  const M = partMeshes(), tris = [];
  track.forEachPart((px, py, pz, id, r, axis) => {
    const p = M.get(id);
    if (!p) return;
    const kind = p.startOffset ? 2 : p.detector ? (p.detector.type === 1 ? 3 : 1) : 0;
    const v = p.vertices;
    for (let i = 0; i + 8 < v.length; i += 9) {
      const a = place([v[i], v[i + 1], v[i + 2]], r, axis), b = place([v[i + 3], v[i + 4], v[i + 5]], r, axis), c = place([v[i + 6], v[i + 7], v[i + 8]], r, axis);
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, len = Math.hypot(nx, ny, nz);
      if (!len || Math.abs(ny / len) < 0.05) continue; // vertical faces have no area from above
      const top = Math.max(a[1], b[1], c[1]) + py * 5;
      tris.push([a[0] + px * 5, a[2] + pz * 5, b[0] + px * 5, b[2] + pz * 5, c[0] + px * 5, c[2] + pz * 5, top, Math.abs(ny / len), kind]);
    }
  });
  tris.sort((p, q) => p[6] - q[6]);
  return Float32Array.from(tris.flat());
}

module.exports = { topDown, place };
