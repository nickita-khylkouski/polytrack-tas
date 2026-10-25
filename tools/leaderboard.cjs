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
    '| Track | Time | Holder | In-game WR | Faster by |',
    '|:--|--:|:--|:--|--:|',
    ...rows.map(({ t, rec, off }) => `| [${t.name}](LEADERBOARD.md#${t.slug}) | ${rec ? `**${rec.run.time}**` : '–'} | ${rec ? who(rec.run) : '–'} | ${off ? `${fmt(off.frames)} ${mdEsc(off.nickname)}` : '–'} | ${rec && off ? (off.frames > rec.run.frames ? `${off.frames - rec.run.frames} ms` : off.frames < rec.run.frames ? `slower by ${rec.run.frames - off.frames} ms` : 'tie') : ''} |`),
  ].join('\n');
  const total = rows.reduce((s, r) => s + (r.rec && r.off ? r.off.frames - r.rec.run.frames : 0), 0);
  const fetched = rows.map(r => official(r.t.slug)?.fetched).filter(Boolean).sort().pop();
  const lead = `${table}\n\n<sub>In-game WR as of ${fetched ? fetched.slice(0, 10) : 'the last update'}, checked weekly. ${fmt(total)} s faster in total. Full standings: [LEADERBOARD.md](LEADERBOARD.md).</sub>`;
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
    `Built from [\`runs/\`](runs). One entry per author (their fastest). Ties go to the earlier date. [Submit a run](CONTRIBUTING.md).`,
    '',
    ...rows.flatMap(({ t, list, off }) => [
      `<a id="${t.slug}"></a>`,
      `## ${t.name}`,
      '',
      list.length ? `<img src="docs/img/tracks/${t.slug}.png" width="720" alt="PolyTrack ${t.name} top-down map with the TAS line and the in-game WR line">` : '',
      '',
      '| # | Time | Author | Date | Made with | Run file |',
      '|--:|--:|:--|:--|:--|:--|',
      ...list.map((e, i) => `| ${i + 1} | **${e.run.time}** | ${who(e.run)} | ${e.run.date} | ${mdEsc(e.run.tool || '')} | [${path.basename(e.file)}](${e.file}) |`),
      ...(list.length ? [] : ['| | | no runs yet: [be the first](CONTRIBUTING.md) | | | |']),
      '',
      off ? `In-game WR: ${fmt(off.frames)} by ${mdEsc(off.nickname)}.` : '',
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
  const desc = `Tool-assisted speedrun (TAS) records for all ${data.length} official PolyTrack tracks, with replays against the in-game world records. Beat a time and submit it on GitHub.`;
  const person = r => (r.github ? `<a href="https://github.com/${esc(r.github)}">${esc(r.author)}</a>` : esc(r.author));
  const gains = data.map(t => (t.runs[0] && t.official ? t.official.frames - t.runs[0].frames : 0));
  const maxGain = Math.max(1, ...gains.map(Math.abs));
  const held = data.filter(t => t.runs.length).length, ahead = gains.filter(g => g > 0).length;
  const contrib = `https://github.com/${REPO}/blob/main/CONTRIBUTING.md`;
  const lead = ahead === data.length
    ? `All ${data.length} beat the in-game world record, by ${fmt(total)} s combined.`
    : `${ahead} of ${data.length} beat the in-game world record.`;
  const rows = data.map((t, i) => {
    const r = t.runs[0], o = t.official, g = gains[i];
    const gain = r && o ? `<span class="bar"><i style="width:${(100 * Math.max(0, g) / maxGain).toFixed(1)}%"></i></span><span class="gv">${g > 0 ? `${g} ms` : g < 0 ? `+${-g} ms` : 'tie'}</span>` : '';
    return `<tr><td><a href="#${t.slug}">${t.name}</a></td><td class="t">${r ? fmt(r.frames) : '–'}</td><td>${r ? person(r) : `<a href="${contrib}">open</a>`}</td><td class="o">${o ? `${fmt(o.frames)}<span>${esc(o.nickname)}</span>` : '–'}</td><td class="g">${gain}</td></tr>`;
  }).join('\n');
  const cards = data.map(t => {
    const r = t.runs[0], o = t.official;
    return `<article id="${t.slug}">
<header><h3>${t.name}</h3><span>${r ? fmt(r.frames) : 'no run yet'}</span></header>
${r ? `<div class="replay" data-slug="${t.slug}">
<div class="stage"><img loading="lazy" width="900" height="600" src="img/maps/${t.slug}.png" alt="PolyTrack ${t.name} top-down map with the TAS racing line"><canvas class="cars"></canvas></div>
<div class="hud"><button class="play" aria-label="Play ${t.name} replay"><svg viewBox="0 0 16 16"><path d="M4 2.5v11l9-5.5z"/></svg></button><span class="clock">0.000</span><span class="ahead"></span><button class="speed" aria-label="Playback speed">1×</button></div>
<canvas class="chart" aria-label="TAS lead over the run"></canvas>
<div class="splits"></div>
</div>` : ''}
<ol>${t.runs.map(e => `<li><b>${fmt(e.frames)}</b>${person(e)}<span>${esc(e.date)}</span></li>`).join('')}${o ? `<li class="off"><b>${fmt(o.frames)}</b>${esc(o.nickname)}<span>in-game WR</span></li>` : ''}</ol>
</article>`;
  }).join('\n');
  const ld = { '@context': 'https://schema.org', '@type': 'Dataset', name: 'PolyTrack TAS Leaderboard', description: desc, url: SITE, license: 'https://opensource.org/licenses/MIT', creator: { '@type': 'Person', name: 'Nickita Khylkouski', url: 'https://nickita.org' }, keywords: ['PolyTrack', 'TAS', 'tool-assisted speedrun', 'speedrun', 'world record', 'leaderboard'] };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PolyTrack TAS Leaderboard: tool-assisted speedrun records</title>
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
  :root { --ink:#000; --sub:#555; --mute:#8a8a8a; --rule:#e6e6e6; --wash:#f4f4f4; --mono:"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; background: #fff; color: var(--ink); font: 16px/1.55 Geist, system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; }
  a { color: inherit; text-decoration: underline; text-decoration-color: #c4c4c4; text-underline-offset: 3px; }
  a:hover { text-decoration-color: var(--ink); }
  button { font: inherit; color: inherit; cursor: pointer; }
  .wrap { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
  nav { position: sticky; top: 0; z-index: 5; background: rgba(255,255,255,.92); backdrop-filter: blur(8px); border-bottom: 1px solid var(--rule); }
  nav .wrap { display: flex; align-items: center; height: 56px; gap: 28px; }
  nav .home { font-weight: 600; text-decoration: none; margin-right: auto; letter-spacing: -.01em; }
  nav a:not(.home) { font-size: 14px; color: var(--sub); text-decoration: none; } nav a:not(.home):hover { color: var(--ink); }
  .hero { padding: 88px 0 64px; border-bottom: 1px solid var(--ink); }
  h1 { font-size: clamp(56px, 9vw, 112px); line-height: .9; letter-spacing: -.05em; font-weight: 800; margin: 0 0 28px; }
  .lead { font-size: 20px; line-height: 1.5; color: var(--sub); max-width: 560px; margin: 0 0 32px; }
  .lead b { color: var(--ink); font-weight: 500; }
  .btn { display: inline-flex; align-items: center; height: 44px; padding: 0 20px; border: 1px solid var(--ink); border-radius: 999px; font-weight: 500; font-size: 15px; text-decoration: none; margin: 0 10px 10px 0; transition: background .15s, color .15s; }
  .btn.solid { background: var(--ink); color: #fff; } .btn.solid:hover { background: #262626; }
  .btn:not(.solid):hover { background: var(--ink); color: #fff; }
  section { padding: 72px 0 0; scroll-margin-top: 40px; }
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 24px; margin-bottom: 18px; }
  h2 { font-size: 32px; line-height: 1.1; letter-spacing: -.03em; font-weight: 700; margin: 0; }
  .key { font: 400 13px var(--mono); color: var(--sub); display: flex; gap: 18px; align-items: center; }
  .key i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 7px; vertical-align: -1px; }
  .key .k-tas { background: var(--ink); } .key .k-wr { border: 2px solid var(--mute); background: #fff; }
  .table { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; white-space: nowrap; }
  th { text-align: left; font: 500 11px var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--mute); padding: 0 12px 10px 0; border-bottom: 1px solid var(--ink); }
  td { padding: 13px 12px 13px 0; border-bottom: 1px solid var(--rule); }
  tbody tr:hover { background: var(--wash); }
  td:first-child a { text-decoration: none; font-weight: 500; }
  td.t { font: 700 16px var(--mono); }
  td.o { font: 400 14px var(--mono); color: var(--sub); } td.o span { font: 400 14px Geist, sans-serif; color: var(--mute); margin-left: 10px; }
  td.g { font: 400 13px var(--mono); color: var(--sub); text-align: right; padding-right: 0; }
  th:last-child { text-align: right; padding-right: 0; }
  .bar { display: inline-block; vertical-align: middle; width: 90px; height: 6px; background: var(--wash); margin-right: 12px; }
  .bar i { display: block; height: 100%; background: var(--ink); }
  .gv { display: inline-block; min-width: 56px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); column-gap: 32px; border-top: 1px solid var(--ink); }
  article { padding: 20px 0 24px; border-bottom: 1px solid var(--rule); scroll-margin-top: 72px; }
  article header { display: flex; justify-content: space-between; align-items: baseline; }
  article h3 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -.01em; }
  article header span { font: 700 15px var(--mono); }
  .stage { position: relative; margin: 12px 0 0; border: 1px solid var(--rule); }
  .stage img { display: block; width: 100%; height: auto; }
  .stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  .hud { display: flex; align-items: center; gap: 12px; margin-top: 10px; font: 400 13px var(--mono); }
  .hud .play { width: 32px; height: 32px; border-radius: 50%; border: 0; background: var(--ink); display: grid; place-items: center; padding: 0; flex: none; }
  .hud .play svg { width: 13px; height: 13px; fill: #fff; }
  .hud .play:hover { background: #333; }
  .hud .clock { min-width: 52px; }
  .hud .ahead { margin-left: auto; color: var(--sub); }
  .hud .ahead b { color: var(--ink); font-weight: 700; }
  .hud .speed { border: 1px solid var(--rule); background: #fff; border-radius: 999px; height: 26px; padding: 0 10px; font: 500 12px var(--mono); min-width: 44px; }
  .hud .speed:hover { border-color: var(--ink); }
  .chart { display: block; width: 100%; height: 44px; margin-top: 10px; cursor: pointer; touch-action: none; }
  .splits { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 8px; font: 400 12px var(--mono); color: var(--mute); }
  .splits b { color: var(--ink); font-weight: 500; margin-left: 4px; }
  article ol { list-style: none; margin: 14px 0 0; padding: 12px 0 0; border-top: 1px solid var(--rule); font-size: 14px; }
  article li { display: flex; gap: 12px; padding: 3px 0; }
  article li b { font: 500 14px var(--mono); min-width: 58px; }
  article li span { margin-left: auto; color: var(--mute); font: 400 12px var(--mono); }
  article li.off { color: var(--mute); } article li.off b { font-weight: 400; }
  .steps { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--ink); }
  .steps div { padding: 24px 24px 0 0; }
  .steps div + div { padding-left: 24px; border-left: 1px solid var(--rule); }
  .steps .num { font: 500 12px var(--mono); color: var(--mute); }
  .steps h3 { font-size: 17px; margin: 10px 0 6px; font-weight: 600; }
  .steps p { margin: 0; color: var(--sub); font-size: 15px; }
  code { font: 13px var(--mono); background: var(--wash); padding: 2px 6px; border-radius: 4px; }
  .cta { margin: 96px 0 0; padding: 56px 40px; background: var(--ink); color: #fff; display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
  .cta h2 { color: #fff; } .cta p { margin: 8px 0 0; color: #a3a3a3; }
  .cta .btn { border-color: #fff; background: #fff; color: #000; margin: 0; } .cta .btn:hover { background: #e5e5e5; }
  footer.wrap { padding-top: 32px; padding-bottom: 48px; color: var(--mute); font-size: 13px; display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  @media (max-width: 760px) {
    nav a.opt { display: none; }
    .hero { padding: 56px 0 48px; }
    .lead { font-size: 18px; }
    .head { display: block; } .key { margin-top: 10px; }
    td.o, th.o, .bar { display: none; }
    td, th { padding-right: 10px; }
    .steps { grid-template-columns: 1fr; } .steps div + div { padding-left: 0; border-left: 0; }
    .cta { padding: 36px 24px; }
  }
</style>
</head>
<body>
<nav><div class="wrap">
  <a class="home" href="./">PolyTrack TAS</a>
  <a class="opt" href="#records">Records</a><a class="opt" href="#replays">Replays</a><a class="opt" href="#submit">Submit</a>
  <a href="https://github.com/${REPO}">GitHub ↗</a>
</div></nav>
<main class="wrap">
<div class="hero">
  <h1>PolyTrack<br>TAS</h1>
  <p class="lead">Tool-assisted runs of every official PolyTrack track. <b>${lead}</b> Got a faster one? Send a pull request.</p>
  <a class="btn solid" href="${contrib}">Submit a run</a><a class="btn" href="#replays">Watch replays</a>
</div>

<section id="records">
  <div class="head"><h2>Records</h2></div>
  <div class="table"><table>
  <thead><tr><th>Track</th><th>Time</th><th>Holder</th><th class="o">In-game WR</th><th>Faster by</th></tr></thead>
  <tbody>
${rows}
  </tbody>
  </table></div>
</section>

<section id="replays">
  <div class="head"><h2>Replays</h2><div class="key"><span><i class="k-tas"></i>TAS</span><span><i class="k-wr"></i>In-game WR</span></div></div>
  <div class="grid">
${cards}
  </div>
</section>

<section id="submit">
  <div class="head"><h2>Submit a run</h2></div>
  <div class="steps">
    <div><div class="num">01</div><h3>Make a run</h3><p>Use a TAS tool, a script, a search program, or your hands. Any input on any frame counts. The game can't be modified.</p></div>
    <div><div class="num">02</div><h3>Open a pull request</h3><p><code>npm run add</code> turns your recording into a run file. Commit it and open a PR. <a href="${contrib}">Guide</a></p></div>
    <div><div class="num">03</div><h3>A bot replays it</h3><p>It downloads PolyTrack from kodub.com, replays your inputs, and checks the finish frame. Merge it and you're on the board.</p></div>
  </div>
</section>

<div class="cta">
  <div><h2>Beat a time?</h2><p>Ties go to whoever got there first.</p></div>
  <a class="btn" href="${contrib}">Submit a run</a>
</div>
</main>
<footer class="wrap">
  <span>Fan project, not affiliated with Kodub. Play PolyTrack at <a href="https://www.kodub.com/apps/polytrack">kodub.com</a>.</span>
  <span><a href="https://nickita.org">nickita.org</a> · <a href="https://github.com/${REPO}">source</a> · <a href="data.json">data.json</a></span>
</footer>
<script>
${REPLAY_JS}
</script>
</body>
</html>
`;
}

// Replay player for the website: both cars on the map, a clock, the TAS lead, and a lead-over-time chart.
const REPLAY_JS = String.raw`
(() => {
  const fmt = t => (t / 1000).toFixed(3);
  const ms = v => (Math.abs(v) < 0.5 ? 'even' : v > 0 ? '<b>' + Math.round(v) + ' ms</b> ahead' : '<b>' + Math.round(-v) + ' ms</b> behind');
  const PLAY = '<svg viewBox="0 0 16 16"><path d="M4 2.5v11l9-5.5z"/></svg>';
  const PAUSE = '<svg viewBox="0 0 16 16"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z"/></svg>';
  const SPEEDS = [1, 0.25, 4];
  // Path sample k is the car after frame min(20k, frames - 1) + 1.
  const times = (n, step, frames) => Array.from({ length: n }, (_, k) => Math.min(k * step, frames - 1) + 1);
  function at(T, t) {
    if (t <= T[0]) return [0, 0];
    const n = T.length;
    if (t >= T[n - 1]) return [n - 1, 0];
    let k = Math.min(n - 2, Math.floor((t - 1) / (T[1] - T[0])));
    while (k > 0 && T[k] > t) k--;
    while (k < n - 2 && T[k + 1] <= t) k++;
    return [k, (t - T[k]) / (T[k + 1] - T[k])];
  }
  const lerp = (A, k, u) => (u && k + 1 < A.length ? A[k] + (A[k + 1] - A[k]) * u : A[k]);

  function player(el) {
    const cars = el.querySelector('.cars'), chart = el.querySelector('.chart');
    const btn = el.querySelector('.play'), speedBtn = el.querySelector('.speed');
    const clock = el.querySelector('.clock'), leadEl = el.querySelector('.ahead'), splits = el.querySelector('.splits');
    let D = null, t = 0, playing = false, last = 0, speed = 1, end = 0, loading = null;

    const load = () => loading ||= fetch('replay/' + el.dataset.slug + '.json').then(r => r.json()).then(d => {
      D = d;
      const n = xy => xy.length / 2;
      D.tas.T = times(n(D.tas.xy), D.step, D.tas.frames);
      if (D.human) D.human.T = times(n(D.human.xy), D.step, D.human.frames);
      end = Math.max(D.tas.frames, D.human ? D.human.frames : 0);
      if (D.human) {
        const cps = D.tas.cp.map((c, i) => [c, D.human.cp[i] - c]);
        splits.innerHTML = '<span>Lead</span>' + cps.map(([, g], i) => '<span>CP' + (i + 1) + '<b>' + sign(g) + '</b></span>').join('') +
          '<span>Finish<b>' + sign(D.human.frames - D.tas.frames) + ' ms</b></span>';
      }
      draw();
    });
    const sign = g => (g > 0 ? '+' + g : g < 0 ? '−' + -g : '0');

    function size(cv, w, h) {
      const r = devicePixelRatio || 1;
      if (cv.width !== Math.round(w * r) || cv.height !== Math.round(h * r)) { cv.width = Math.round(w * r); cv.height = Math.round(h * r); }
      const c = cv.getContext('2d'); c.setTransform(r, 0, 0, r, 0, 0); return c;
    }
    function dot(c, x, y, rad, fill, line) {
      c.beginPath(); c.arc(x, y, rad, 0, 7); c.fillStyle = fill; c.fill(); c.lineWidth = 2.5; c.strokeStyle = line; c.stroke();
    }
    function carAt(P, s) {
      const [k, u] = at(P.T, t), j = Math.min(k + 1, P.T.length - 1), xy = P.xy;
      return [(xy[2 * k] + (xy[2 * j] - xy[2 * k]) * u) / 10 * s, (xy[2 * k + 1] + (xy[2 * j + 1] - xy[2 * k + 1]) * u) / 10 * s];
    }
    function draw() {
      if (!D) return;
      const W = cars.clientWidth, H = cars.clientHeight, s = W / 900;
      const c = size(cars, W, H);
      c.clearRect(0, 0, W, H);
      if (D.human) { const [x, y] = carAt(D.human, s); dot(c, x, y, 5.5, '#fff', '#8a8a8a'); }
      const [x, y] = carAt(D.tas, s); dot(c, x, y, 5.5, '#000', '#fff');
      clock.textContent = fmt(Math.min(t, end));
      if (D.lead) {
        const [k, u] = at(D.tas.T, t);
        leadEl.innerHTML = 'TAS ' + ms(lerp(D.lead, k, u));
      }
      drawChart();
    }
    function drawChart() {
      const W = chart.clientWidth, H = chart.clientHeight, c = size(chart, W, H);
      c.clearRect(0, 0, W, H);
      c.fillStyle = '#f4f4f4'; c.fillRect(0, 0, W, H);
      if (!D.lead) return;
      const L = D.lead, T = D.tas.T, lo = Math.min(0, ...L), hi = Math.max(1, ...L);
      const X = v => (v / end) * W, Y = v => H - 4 - ((v - lo) / (hi - lo)) * (H - 10);
      c.fillStyle = '#d6d6d6';
      c.beginPath(); c.moveTo(X(T[0]), Y(0));
      L.forEach((v, i) => c.lineTo(X(T[i]), Y(v)));
      c.lineTo(X(T[T.length - 1]), Y(0)); c.closePath(); c.fill();
      c.strokeStyle = '#000'; c.lineWidth = 1.5; c.beginPath();
      L.forEach((v, i) => (i ? c.lineTo(X(T[i]), Y(v)) : c.moveTo(X(T[i]), Y(v)))); c.stroke();
      c.fillStyle = '#8a8a8a';
      D.tas.cp.forEach(f => c.fillRect(Math.round(X(f)), H - 6, 1, 6));
      c.fillStyle = '#000'; c.fillRect(Math.round(X(Math.min(t, end))) - 1, 0, 2, H);
    }
    function frame(now) {
      if (!playing) return;
      t += (now - last) * speed; last = now;
      if (t >= end) { t = end; setPlaying(false); }
      draw();
      if (playing) requestAnimationFrame(frame);
    }
    function setPlaying(p) {
      playing = p; btn.innerHTML = p ? PAUSE : PLAY; btn.setAttribute('aria-label', p ? 'Pause' : 'Play');
      if (p) { if (t >= end) t = 0; last = performance.now(); requestAnimationFrame(frame); }
    }
    btn.onclick = async () => { await load(); setPlaying(!playing); };
    speedBtn.onclick = () => { speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]; speedBtn.textContent = (speed === 0.25 ? '¼' : speed) + '×'; };
    const seek = e => { if (!D) return; const r = chart.getBoundingClientRect(); t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * end; draw(); };
    chart.addEventListener('pointerdown', e => { chart.setPointerCapture(e.pointerId); if (D) seek(e); else load().then(() => seek(e)); });
    chart.addEventListener('pointermove', e => { if (e.buttons) seek(e); });
    new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { load(); o.disconnect(); } }, { rootMargin: '400px' }).observe(el);
    addEventListener('resize', () => draw());
  }
  document.querySelectorAll('.replay').forEach(player);
})();
`;

module.exports = { build };
if (require.main === module) build().then(code => process.exit(code), e => { console.error(e.stack || e); process.exit(1); });
