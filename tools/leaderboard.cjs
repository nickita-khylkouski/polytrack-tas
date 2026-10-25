// Rebuild everything generated from runs/: the table in README.md, LEADERBOARD.md, and the website in docs/.
// Every run is replayed first; a run that fails is left off (and the command exits 1).
//   npm run leaderboard
const fs = require('node:fs');
const path = require('node:path');
const { TRACKS, ENGINE, VERSION } = require('./tracks.cjs');
const { ROOT, listRuns, standings } = require('./runs.cjs');
const { verifyFile } = require('./verify.cjs');

const REPO = 'nickita-khylkouski/polytrack-tas';
const SITE = 'https://nickita.org/polytrack-tas/';
const fmt = f => (f / 1000).toFixed(3);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const mdEsc = s => String(s).replace(/([|\\`*_[\]<>])/g, '\\$1');
const who = r => (r.github ? `[${mdEsc(r.author)}](https://github.com/${r.github})` : mdEsc(r.author));
const official = slug => {
  const f = path.join(ENGINE, 'tracks', slug, 'official.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
};

function replaceBetween(text, tag, body) {
  const a = `<!-- ${tag}:START -->`, b = `<!-- ${tag}:END -->`;
  const i = text.indexOf(a), j = text.indexOf(b);
  if (i < 0 || j < i) throw new Error(`README.md is missing the ${tag} markers`);
  return text.slice(0, i + a.length) + '\n' + body + '\n' + text.slice(j);
}

async function build({ log = console.log } = {}) {
  const ok = [], failed = [];
  for (const f of listRuns()) {
    const v = await verifyFile(f);
    (v.ok ? ok : failed).push(v);
    if (!v.ok) log(`FAIL ${v.file || f}: ${v.reason}`);
  }
  const board = standings(ok);
  const rows = TRACKS.map(t => {
    const list = board[t.slug] || [], rec = list[0], off = official(t.slug)?.top?.[0];
    return { t, list, rec, off };
  });

  // README: record table + map gallery
  const table = [
    '| Track | TAS record | Holder | Official #1 (verified) | TAS gain |',
    '|:--|--:|:--|:--|--:|',
    ...rows.map(({ t, rec, off }) => `| [${t.name}](LEADERBOARD.md#${t.slug}) | ${rec ? `**${rec.run.time}**` : '–'} | ${rec ? who(rec.run) : '–'} | ${off ? `${fmt(off.frames)} ${mdEsc(off.nickname)}` : '–'} | ${rec && off ? `${off.frames - rec.run.frames > 0 ? '−' : '+'}${Math.abs(off.frames - rec.run.frames)} ms` : ''} |`),
  ].join('\n');
  const total = rows.reduce((s, r) => s + (r.rec && r.off ? r.off.frames - r.rec.run.frames : 0), 0);
  const fetched = rows.map(r => official(r.t.slug)?.fetched).filter(Boolean).sort().pop();
  const lead = `${table}\n\n<sub>Times in seconds (1 frame = 1 ms). Official #1 = top verified run on the in-game leaderboard${fetched ? `, as of ${fetched.slice(0, 10)}` : ''}. Total TAS gain: ${fmt(total)} s. Full standings: [LEADERBOARD.md](LEADERBOARD.md).</sub>`;
  const cells = rows.filter(r => r.rec).map(({ t }) => `<td align="center"><a href="LEADERBOARD.md#${t.slug}"><img src="docs/img/tracks/${t.slug}.png" width="260" alt="PolyTrack ${t.name} TAS racing line, top-down map"></a><br><sub>${t.name}</sub></td>`);
  const gallery = '<table>\n' + Array.from({ length: Math.ceil(cells.length / 3) }, (_, i) => `<tr>${cells.slice(i * 3, i * 3 + 3).join('')}</tr>`).join('\n') + '\n</table>';
  let readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  readme = replaceBetween(readme, 'LEADERBOARD', lead);
  readme = replaceBetween(readme, 'GALLERY', gallery);
  fs.writeFileSync(path.join(ROOT, 'README.md'), readme);

  // LEADERBOARD.md: every track's full standings
  const md = [
    '# PolyTrack TAS leaderboard: full standings',
    '',
    `Generated from [\`runs/\`](runs) by \`npm run leaderboard\`. Every run below was replayed in the official PolyTrack ${VERSION} engine. One entry per author (their fastest run); ties go to the earlier date. [How to submit a run](CONTRIBUTING.md).`,
    '',
    ...rows.flatMap(({ t, list, off }) => [
      `<a id="${t.slug}"></a>`,
      `## ${t.name}`,
      '',
      list.length ? `<img src="docs/img/tracks/${t.slug}.png" width="720" alt="PolyTrack ${t.name} top-down map with the TAS record line and the official #1 line">` : '',
      '',
      '| # | Time | Author | Date | Made with | Run file |',
      '|--:|--:|:--|:--|:--|:--|',
      ...list.map((e, i) => `| ${i + 1} | **${e.run.time}** | ${who(e.run)} | ${e.run.date} | ${mdEsc(e.run.tool || '')} | [${path.basename(e.file)}](${e.file}) |`),
      ...(list.length ? [] : ['| | | no runs yet: [be the first](CONTRIBUTING.md) | | | |']),
      '',
      off ? `Official in-game #1 (verified): ${fmt(off.frames)} by ${mdEsc(off.nickname)}.` : '',
      '',
    ]),
  ].join('\n');
  fs.writeFileSync(path.join(ROOT, 'LEADERBOARD.md'), md);

  // website
  const data = rows.map(({ t, list, off }) => ({
    slug: t.slug, name: t.name,
    official: off ? { frames: off.frames, nickname: off.nickname } : null,
    runs: list.map(e => ({ frames: e.run.frames, author: e.run.author, github: e.run.github || null, date: e.run.date, tool: e.run.tool || null, file: e.file })),
  }));
  fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs', 'data.json'), JSON.stringify({ version: VERSION, updated: new Date().toISOString().slice(0, 10), tracks: data }, null, 1) + '\n');
  fs.writeFileSync(path.join(ROOT, 'docs', 'index.html'), site(data, total));
  fs.writeFileSync(path.join(ROOT, 'docs', 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE}</loc><changefreq>weekly</changefreq></url></urlset>\n`);
  fs.writeFileSync(path.join(ROOT, 'docs', 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`);
  log(`leaderboard: ${ok.length} runs verified, ${failed.length} failed`);
  return failed.length ? 1 : 0;
}

function site(data, total) {
  const desc = `Tool-assisted speedrun (TAS) world records for all ${data.length} official PolyTrack tracks, each run replayed frame-exact in the real game engine. Open to everyone: submit a faster run with a pull request.`;
  const rows = data.map(t => {
    const r = t.runs[0], o = t.official;
    const name = r ? (r.github ? `<a href="https://github.com/${esc(r.github)}">${esc(r.author)}</a>` : esc(r.author)) : '–';
    return `<tr><td><a href="#${t.slug}">${t.name}</a></td><td class="t">${r ? fmt(r.frames) : '–'}</td><td>${name}</td><td class="o">${o ? `${fmt(o.frames)} <span>${esc(o.nickname)}</span>` : '–'}</td><td class="g">${r && o ? `${o.frames - r.frames >= 0 ? '−' : '+'}${Math.abs(o.frames - r.frames)} ms` : ''}</td></tr>`;
  }).join('\n');
  const cards = data.filter(t => t.runs.length).map(t => `<section id="${t.slug}"><h2>${t.name}</h2><img loading="lazy" src="img/tracks/${t.slug}.png" alt="PolyTrack ${t.name} TAS line, top-down map"><ol>${t.runs.map(r => `<li><b>${fmt(r.frames)}</b> ${r.github ? `<a href="https://github.com/${esc(r.github)}">${esc(r.author)}</a>` : esc(r.author)} <span>${esc(r.date)}</span></li>`).join('')}</ol></section>`).join('\n');
  const ld = { '@context': 'https://schema.org', '@type': 'Dataset', name: 'PolyTrack TAS Leaderboard', description: desc, url: SITE, license: 'https://opensource.org/licenses/MIT', creator: { '@type': 'Person', name: 'Nickita Khylkouski', url: 'https://nickita.org' }, keywords: ['PolyTrack', 'TAS', 'tool-assisted speedrun', 'speedrun', 'world record', 'leaderboard'] };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PolyTrack TAS Leaderboard: tool-assisted speedrun world records</title>
<meta name="description" content="${esc(desc)}">
<meta name="keywords" content="PolyTrack, PolyTrack TAS, tool-assisted speedrun, PolyTrack world record, PolyTrack leaderboard, PolyTrack speedrun, Kodub">
<link rel="canonical" href="${SITE}">
<meta property="og:type" content="website">
<meta property="og:title" content="PolyTrack TAS Leaderboard">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}">
<meta property="og:image" content="${SITE}img/banner.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE}img/banner.png">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
  :root { --bg:#0e1117; --panel:#151a23; --text:#e8ecf3; --dim:#8b95a7; --tas:#ff3d6e; --human:#36d1f4; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:16px/1.5 Inter, system-ui, -apple-system, sans-serif; }
  main { max-width: 1040px; margin: 0 auto; padding: 32px 20px 80px; }
  a { color: var(--text); }
  .hero { width:100%; border-radius:14px; display:block; }
  h1 { font-size: 40px; margin: 28px 0 4px; letter-spacing: -0.02em; }
  p.lead { color: var(--dim); margin: 0 0 28px; max-width: 720px; }
  .cta { display:inline-block; background:var(--tas); color:#fff; text-decoration:none; padding:10px 16px; border-radius:8px; font-weight:600; margin-right:8px; }
  .cta.alt { background: var(--panel); }
  table { width:100%; border-collapse: collapse; margin: 28px 0; font-variant-numeric: tabular-nums; }
  th, td { text-align:left; padding: 9px 10px; border-bottom: 1px solid #222a36; }
  th { color: var(--dim); font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; }
  td.t { color: var(--tas); font-weight: 700; font-family: ui-monospace, "JetBrains Mono", monospace; }
  td.o { color: var(--human); font-family: ui-monospace, monospace; } td.o span { color: var(--dim); font-family: Inter, system-ui, sans-serif; }
  td.g { color: var(--dim); font-family: ui-monospace, monospace; text-align:right; }
  .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
  section { background: var(--panel); border-radius: 12px; padding: 14px; }
  section h2 { margin: 0 0 8px; font-size: 18px; } section img { width:100%; border-radius: 8px; display:block; }
  section ol { margin: 10px 0 0; padding-left: 22px; } section li b { color: var(--tas); font-family: ui-monospace, monospace; } section li span { color: var(--dim); font-size: 13px; }
  footer { color: var(--dim); font-size: 14px; margin-top: 48px; }
</style>
</head>
<body>
<main>
<img class="hero" src="img/banner.png" alt="PolyTrack TAS leaderboard: top-down maps of all 17 official tracks with their TAS racing lines">
<h1>PolyTrack TAS Leaderboard</h1>
<p class="lead">${esc(desc)} Total gain over the official #1 times: ${fmt(total)} s.</p>
<a class="cta" href="https://github.com/${REPO}/blob/main/CONTRIBUTING.md">Submit a run</a><a class="cta alt" href="https://github.com/${REPO}">GitHub repo</a>
<table>
<thead><tr><th>Track</th><th>TAS record</th><th>Holder</th><th>Official #1 (verified)</th><th></th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<div class="grid">
${cards}
</div>
<footer>Unofficial community project, not affiliated with Kodub. Play PolyTrack at <a href="https://www.kodub.com/apps/polytrack">kodub.com</a>. Data: <a href="data.json">data.json</a>.</footer>
</main>
</body>
</html>
`;
}

module.exports = { build };
if (require.main === module) build().then(code => process.exit(code), e => { console.error(e.stack || e); process.exit(1); });
