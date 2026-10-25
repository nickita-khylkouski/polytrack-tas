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
  const person = r => (r.github ? `<a href="https://github.com/${esc(r.github)}">${esc(r.author)}</a>` : esc(r.author));
  const gains = data.map(t => (t.runs[0] && t.official ? t.official.frames - t.runs[0].frames : 0));
  const maxGain = Math.max(1, ...gains.map(Math.abs));
  const ahead = gains.filter(g => g > 0).length, held = data.filter(t => t.runs.length).length;
  const rows = data.map((t, i) => {
    const r = t.runs[0], o = t.official, g = gains[i];
    const gain = r && o ? `<span class="bar"><i style="width:${(100 * Math.abs(g) / maxGain).toFixed(1)}%"></i></span><span class="gv">${g >= 0 ? '−' : '+'}${Math.abs(g)} ms</span>` : '';
    return `<tr><td class="n">${String(i + 1).padStart(2, '0')}</td><td><a href="#${t.slug}">${t.name}</a></td><td class="t">${r ? fmt(r.frames) : '–'}</td><td>${r ? person(r) : '<a href="https://github.com/' + REPO + '/blob/main/CONTRIBUTING.md">open</a>'}</td><td class="o">${o ? `${fmt(o.frames)}<span>${esc(o.nickname)}</span>` : '–'}</td><td class="g">${gain}</td></tr>`;
  }).join('\n');
  const cards = data.map(t => {
    const r = t.runs[0], o = t.official;
    return `<article id="${t.slug}">
<header><h3>${t.name}</h3><span>${r ? fmt(r.frames) : 'no run yet'}</span></header>
${r ? `<img loading="lazy" width="900" height="600" src="img/maps/${t.slug}.png" alt="PolyTrack ${t.name} top-down map with the TAS racing line">` : ''}
<ol>${t.runs.map(e => `<li><b>${fmt(e.frames)}</b>${person(e)}<span>${esc(e.date)}</span></li>`).join('')}${o ? `<li class="off"><b>${fmt(o.frames)}</b>${esc(o.nickname)}<span>official #1</span></li>` : ''}</ol>
</article>`;
  }).join('\n');
  const ld = { '@context': 'https://schema.org', '@type': 'Dataset', name: 'PolyTrack TAS Leaderboard', description: desc, url: SITE, license: 'https://opensource.org/licenses/MIT', creator: { '@type': 'Person', name: 'Nickita Khylkouski', url: 'https://nickita.org' }, keywords: ['PolyTrack', 'TAS', 'tool-assisted speedrun', 'speedrun', 'world record', 'leaderboard'] };
  const contrib = `https://github.com/${REPO}/blob/main/CONTRIBUTING.md`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PolyTrack TAS Leaderboard: tool-assisted speedrun world records</title>
<meta name="description" content="${esc(desc)}">
<meta name="keywords" content="PolyTrack, PolyTrack TAS, tool-assisted speedrun, PolyTrack world record, PolyTrack leaderboard, PolyTrack speedrun, Kodub">
<link rel="canonical" href="${SITE}">
<meta name="theme-color" content="#ffffff">
<meta property="og:type" content="website">
<meta property="og:title" content="PolyTrack TAS Leaderboard">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}">
<meta property="og:image" content="${SITE}img/banner.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE}img/banner.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;800&family=Geist+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
  :root { --ink:#000; --sub:#555; --mute:#8a8a8a; --rule:#e6e6e6; --wash:#f6f6f6; --mono:"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; background: #fff; color: var(--ink); font: 16px/1.55 Geist, system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; }
  a { color: inherit; text-decoration: underline; text-decoration-color: #c4c4c4; text-underline-offset: 3px; }
  a:hover { text-decoration-color: var(--ink); }
  .wrap { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
  nav { position: sticky; top: 0; z-index: 5; background: rgba(255,255,255,.92); backdrop-filter: blur(8px); border-bottom: 1px solid var(--rule); }
  nav .wrap { display: flex; align-items: center; height: 56px; gap: 28px; }
  nav .home { font-weight: 600; text-decoration: none; margin-right: auto; letter-spacing: -.01em; }
  nav .home span { color: var(--mute); font-weight: 400; }
  nav a:not(.home) { font-size: 14px; color: var(--sub); text-decoration: none; } nav a:not(.home):hover { color: var(--ink); }
  .eyebrow { font: 500 12px/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--mute); }
  .hero { padding: 88px 0 56px; }
  h1 { font-size: clamp(44px, 7.4vw, 92px); line-height: .95; letter-spacing: -.045em; font-weight: 800; margin: 18px 0 24px; }
  .lead { font-size: 19px; color: var(--sub); max-width: 640px; margin: 0 0 32px; }
  .btn { display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 20px; border: 1px solid var(--ink); border-radius: 999px; font-weight: 500; font-size: 15px; text-decoration: none; margin: 0 10px 10px 0; transition: background .15s, color .15s; }
  .btn.solid { background: var(--ink); color: #fff; } .btn.solid:hover { background: #262626; }
  .btn:not(.solid):hover { background: var(--ink); color: #fff; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid var(--ink); border-bottom: 1px solid var(--rule); }
  .stats div { padding: 22px 20px 22px 0; }
  .stats div + div { padding-left: 20px; border-left: 1px solid var(--rule); }
  .stats b { display: block; font: 500 34px/1.1 var(--mono); letter-spacing: -.03em; }
  .stats span { font-size: 14px; color: var(--sub); }
  section { padding: 80px 0 0; }
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 24px; margin-bottom: 20px; }
  h2 { font-size: 32px; line-height: 1.1; letter-spacing: -.03em; font-weight: 700; margin: 8px 0 0; }
  .head p { color: var(--sub); font-size: 14px; margin: 0; max-width: 420px; text-align: right; }
  .table { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; white-space: nowrap; }
  th { text-align: left; font: 500 11px var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--mute); padding: 0 12px 10px 0; border-bottom: 1px solid var(--ink); }
  td { padding: 13px 12px 13px 0; border-bottom: 1px solid var(--rule); }
  tbody tr:hover { background: var(--wash); }
  td.n { font: 400 13px var(--mono); color: var(--mute); width: 40px; }
  td:nth-child(2) a { text-decoration: none; font-weight: 500; }
  td.t { font: 700 16px var(--mono); }
  td.o { font: 400 14px var(--mono); color: var(--sub); } td.o span { font: 400 14px Geist, sans-serif; color: var(--mute); margin-left: 10px; }
  td.g { font: 400 13px var(--mono); color: var(--sub); text-align: right; padding-right: 0; }
  th:last-child { text-align: right; padding-right: 0; }
  .bar { display: inline-block; vertical-align: middle; width: 90px; height: 6px; background: var(--wash); margin-right: 12px; }
  .bar i { display: block; height: 100%; background: var(--ink); }
  .gv { display: inline-block; min-width: 64px; }
  .note { font-size: 13px; color: var(--mute); margin: 14px 0 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); column-gap: 32px; border-top: 1px solid var(--ink); }
  article { padding: 20px 0 24px; border-bottom: 1px solid var(--rule); scroll-margin-top: 72px; }
  article header { display: flex; justify-content: space-between; align-items: baseline; }
  article h3 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -.01em; }
  article header span { font: 700 15px var(--mono); }
  article img { display: block; width: 100%; height: auto; margin: 12px 0 10px; border: 1px solid var(--rule); }
  article ol { list-style: none; margin: 0; padding: 0; font-size: 14px; }
  article li { display: flex; gap: 12px; padding: 4px 0; }
  article li b { font: 500 14px var(--mono); min-width: 58px; }
  article li span { margin-left: auto; color: var(--mute); font: 400 12px var(--mono); }
  article li.off { color: var(--mute); } article li.off b { font-weight: 400; }
  .steps { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--ink); }
  .steps div { padding: 24px 24px 0 0; }
  .steps div + div { padding-left: 24px; border-left: 1px solid var(--rule); }
  .steps h3 { font-size: 17px; margin: 10px 0 6px; font-weight: 600; }
  .steps p { margin: 0; color: var(--sub); font-size: 15px; }
  code { font: 13px var(--mono); background: var(--wash); padding: 2px 6px; border-radius: 4px; }
  .cta { margin: 96px 0 0; padding: 56px 40px; background: var(--ink); color: #fff; display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
  .cta h2 { margin: 0; color: #fff; } .cta p { margin: 6px 0 0; color: #a3a3a3; }
  .cta .btn { border-color: #fff; background: #fff; color: #000; margin: 0; } .cta .btn:hover { background: #e5e5e5; }
  footer.wrap { padding-top: 32px; padding-bottom: 48px; color: var(--mute); font-size: 13px; display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  @media (max-width: 760px) {
    nav a.opt { display: none; }
    .hero { padding: 56px 0 40px; }
    .stats { grid-template-columns: 1fr 1fr; }
    .stats div:nth-child(3) { padding-left: 0; border-left: 0; }
    .stats div:nth-child(n+3) { border-top: 1px solid var(--rule); }
    .head { display: block; } .head p { text-align: left; margin-top: 8px; }
    td.o, th.o, .bar, td.n, th:first-child { display: none; }
    td, th { padding-right: 10px; }
    .steps { grid-template-columns: 1fr; } .steps div + div { padding-left: 0; border-left: 0; }
    .cta { padding: 36px 24px; }
  }
</style>
</head>
<body>
<nav><div class="wrap">
  <a class="home" href="./">PolyTrack TAS <span>Leaderboard</span></a>
  <a class="opt" href="#records">Records</a><a class="opt" href="#tracks">Tracks</a><a class="opt" href="#how">How it works</a>
  <a href="https://github.com/${REPO}">GitHub ↗</a>
</div></nav>
<main class="wrap">
<div class="hero">
  <div class="eyebrow">PolyTrack ${VERSION} · Tool-assisted speedruns</div>
  <h1>PolyTrack TAS<br>Leaderboard</h1>
  <p class="lead">${esc(desc)}</p>
  <a class="btn solid" href="${contrib}">Submit a run →</a><a class="btn" href="https://github.com/${REPO}">View on GitHub</a>
</div>
<div class="stats">
  <div><b>${held}/${data.length}</b><span>official tracks with a TAS record</span></div>
  <div><b>${ahead}/${data.length}</b><span>faster than the in-game #1</span></div>
  <div><b>${fmt(total)} s</b><span>saved over the in-game #1 times</span></div>
  <div><b>170/170</b><span>in-game top-10 runs replay exact in our verifier</span></div>
</div>

<section id="records">
  <div class="head"><div><div class="eyebrow">Records</div><h2>Fastest run on every track</h2></div><p>Every record is a normal PolyTrack recording, replayed by CI in the unmodified game engine before it goes on the board.</p></div>
  <div class="table"><table>
  <thead><tr><th></th><th>Track</th><th>TAS record</th><th>Holder</th><th class="o">In-game #1 (verified)</th><th>Gain</th></tr></thead>
  <tbody>
${rows}
  </tbody>
  </table></div>
  <p class="note">Times in seconds. The in-game #1 is the top verified run on PolyTrack's own leaderboard, refreshed weekly. Raw data: <a href="data.json">data.json</a>.</p>
</section>

<section id="tracks">
  <div class="head"><div><div class="eyebrow">Tracks</div><h2>Racing lines</h2></div><p>Top-down maps, darker = higher. Solid line = TAS record, dashed = in-game #1 (it shows where the two split).</p></div>
  <div class="grid">
${cards}
  </div>
</section>

<section id="how">
  <div class="head"><div><div class="eyebrow">Compete</div><h2>How it works</h2></div></div>
  <div class="steps">
    <div><div class="eyebrow">01</div><h3>Make a run</h3><p>Use any tool: savestate TAS tools, scripts, search, or patience. Any input on any frame is allowed. The game itself stays unchanged.</p></div>
    <div><div class="eyebrow">02</div><h3>Open a pull request</h3><p><code>npm run add</code> turns your recording into a run file. Commit it and open a pull request. <a href="${contrib}">Full guide</a>.</p></div>
    <div><div class="eyebrow">03</div><h3>CI replays it</h3><p>The bot downloads the official engine from kodub.com, replays your run, and checks every checkpoint and the exact finish frame. Merged runs go on the board.</p></div>
  </div>
</section>

<div class="cta">
  <div><h2>Think you can beat a time?</h2><p>Every record here is open. A tie goes to the earlier run.</p></div>
  <a class="btn" href="${contrib}">Submit a run →</a>
</div>
</main>
<footer class="wrap">
  <span>Unofficial community project, not affiliated with Kodub. Play PolyTrack at <a href="https://www.kodub.com/apps/polytrack">kodub.com</a>.</span>
  <span>By <a href="https://nickita.org">nickita.org</a> · <a href="https://github.com/${REPO}">source</a> · MIT</span>
</footer>
</body>
</html>
`;
}

module.exports = { build };
if (require.main === module) build().then(code => process.exit(code), e => { console.error(e.stack || e); process.exit(1); });
