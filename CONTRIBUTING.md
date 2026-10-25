# Submitting a run

Faster runs, first runs on a track, and runs that tie or trail the record are all welcome. Every run that passes verification goes on the board under your name.

## 1. Get your recording

A run is the game's own **recording string**: the base64url text PolyTrack stores for replays and leaderboard ghosts (it starts with `eN`). Where to get it:

- **From the in-game leaderboard.** If your run is already uploaded, `npm run import -- <track> --rank <N>` fetches it by its rank on the full leaderboard.
- **From your TAS tool.** Most PolyTrack TAS tools and scripts can export a recording.
- **From key frames.** `tools/engine.cjs` has `encodeRecording({up:[...], right:[...], down:[...], left:[...], reset:[...]})`. Each list holds the frames where that key toggles (press, release, press, ...).

## 2. Make the run file

```bash
npm install && npx playwright install chromium
npm run setup        # engine + tracks from kodub.com, once
npm run add -- winter4 "eNo..." --author "your name" --github your-github --tool "what you used"
```

`add` replays the recording, finds the finish frame, and writes `runs/winter4/<frames>-<your-name>.json`:

```json
{
  "track": "winter4",
  "frames": 19294,
  "time": "19.294",
  "author": "your name",
  "github": "your-github",
  "date": "2026-10-25",
  "tool": "what you used",
  "recording": "eNo..."
}
```

`github`, `tool` and `notes` are optional. Don't edit `frames`/`time` by hand: they have to match the replay.

## 3. Check it and open a PR

```bash
npm run verify -- runs/winter4/19294-your-name.json
```

Commit only the new file(s) in `runs/` and open a pull request. The **verify** workflow replays every changed run in the official engine and posts a results table on the PR's checks page: new record, tie, or the gap to the record. Once it's green and merged, the leaderboard, README and maps rebuild themselves.

## Rules

1. Official tracks only (Summer 1–7, Winter 1–5, Desert 1–5), PolyTrack **0.6.3**.
2. The run must replay in the unchanged official engine, take every checkpoint, and finish on exactly the claimed frame. Any input on any frame is allowed, including `reset`.
3. Time = the finish frame (ms). Ties go to the earlier `date`, and maintainers may ask about dates that look off.
4. Submit as yourself. Runs taken from someone else (for example an in-game leaderboard ghost) need their permission, and their name goes in `author`.
5. One entry per author per track counts on the board (your fastest). Older files stay as history.

## Changing the tools

Pull requests that touch `tools/` or `.github/` are reviewed by hand. The PR check always verifies runs with the tools from `main`, not the PR's copy. Run `npm test` (verifies every run) before you send one.
