# CLAUDE.md — `ai-pe-deck` (AI in Power Electronics)

**Last refreshed:** 2026-04-21 (post-Zed crash, after full audit)
**Repo:** `github.com/Aswin-Ram-K/ai-pe-deck` · branch `main` · tracked HEAD `917d10a`
**Also read:** `PROJECT_CONTEXT.md` (design-decision log — partially stale, see §Pitfalls) · `README.md` (user-facing run guide)

---

## What this is

A 13-slide interactive web deck for a **15-minute graduate paper review** of
Zhao, Blaabjerg & Wang (2021), *"An Overview of Artificial Intelligence
Applications for Power Electronics,"* IEEE TPEL 36(4): 4633–4658.

Presenter: **Aswin Ram Kalugasala Moorthy** · ECE-563 Smart Grid · Spring 2026.

Built as a self-contained Node app that runs locally and deploys its
`public/` folder to GitHub Pages. No bundler, no framework scaffold —
React+Babel load from CDN and `deck.jsx` is transpiled in-browser at boot.

---

## Current state (2026-04-21)

| Status | Item |
|---|---|
| ✅ Committed + deployed | 13 slides (s1–s13), PE visual library, scatterboard transitions, aurora+flow-field backdrop, PPTX export pipeline, GitHub Pages workflow |
| ✅ Committed | Phone-remote subsystem (`remote-host.js` + `remote.html`/`.js`) via PeerJS, static peer ID `ai-pe-deck-aswin-ram-k-ece563`, auto-pair on load |
| ✅ Committed | Voice control and reveal-group systems **removed** in `138f0b3` (superseded by phone remote) |
| 🚧 **Uncommitted** (405 insertions, 4 deletions across 6 files) | Pre-show **Intro slide (s0)** — revolving pink/purple SVG star, 5 drifting hue orbs, 34-particle explosion on Start, dispatches `deck-explode` CustomEvent, fades aurora/flow-field to black during intro-mode |

**Branch state:** clean ahead/behind vs origin; six files modified in working tree
(`deck.jsx`, `index.html`, `remote-host.js`, `remote.html`, `remote.js`,
`styles.css`). The intro-slide feature is cohesive and reviewable — commit
it when you're satisfied with the visual.

---

## Run it

```bash
cd ~/Desktop/app
npm install        # generates node_modules/ (lockfile currently missing — see Pitfalls)
npm start          # Express auto-picks free port starting at 3000
```

Open the URL printed to stdout (typically `http://localhost:3000`). Dev mode
with autowatch: `npm run dev`. Docker: `docker compose up --build`.

**Phone remote:** open `http://<your-laptop-ip>:3000/remote.html` on phone,
bookmark it; auto-pairs to the deck the moment both are open. No QR.

**Exports:** `npm run export:pptx` → `exports/ai-pe-deck.pptx` (reads
`_shots/pptx/s01..s13.png` — 13 PNGs at 3840×2132 — and attaches speaker
notes per slide). `npm run export:notes-pdf` for a speaker-notes PDF.

---

## File layout

```
app/
├── public/                        ← served static; the only thing on GH Pages
│   ├── index.html                 ← shell; loads React/Babel, boots deck.jsx → engine.js → remote-host.js
│   ├── deck.jsx         (2,788L*) ← all slides (s0..s13) + PE visual lib + scatterboard transition orchestration
│   ├── deck-stage.js      (646L)  ← <deck-stage> web component (keyboard nav, URL-fragment persistence)
│   ├── engine.js          (225L)  ← aurora backdrop + flow-field canvas (voice system REMOVED)
│   ├── styles.css         (856L*) ← theme tokens + animation primitives + intro-slide CSS*
│   ├── speaker-notes.json         ← 13 narration strings (s1..s13; intro s0 has no narration by design)
│   ├── remote-host.js     (244L*) ← deck-side PeerJS peer, static peer ID, handles next/prev/goto/start
│   ├── remote.html        (269L*) ← phone UI: status dot, slide-num display, big prev/next buttons, swipe nav
│   └── remote.js          (211L*) ← phone-side PeerJS client, auto-reconnect, intro-mode morphs Next→START
├── server/
│   ├── index.js           (162L)  ← Express: static serve + /api/claude proxy + /api/save-notes + /healthz + port auto-detect
│   └── scripts/
│       ├── export-pptx.js (105L)  ← builds 16:9 full-bleed PPTX from _shots/pptx/*.png
│       └── export-notes-pdf.js (41L)
├── _shots/                        ← gitignored; ~34 dev screenshots + pptx/s01..s13.png (the 13 used for export)
├── exports/                       ← gitignored *.pptx / *.pdf outputs
├── Dockerfile                     ← node:20-alpine, npm install --omit=dev (no lockfile!), expose 3000
├── docker-compose.yml             ← bind-mounts public/ and exports/ for live edits
├── .github/workflows/pages.yml    ← deploys public/ to GH Pages on push to main
├── PROJECT_CONTEXT.md             ← design decisions + rationale (§4 stale on voice — see Pitfalls)
├── README.md                      ← user-facing run guide (L16 stale — refs voice)
├── package.json                   ← deps: express 4.19.2, pdfkit 0.15.0, pptxgenjs 3.12.0; engines node>=18
├── .env.example                   ← PORT + CLAUDE_BIN (no secrets)
├── .gitignore                     ← ignores node_modules, *.pptx/*.pdf, _shots, .claude*, .env
└── .claude-logs/                  ← Zed agent session logs (gitignored despite README claiming "committed")
```

*\*Counts include uncommitted diff.*

---

## Architecture notes you'll want before editing

- **No build step.** `public/index.html` fetches `deck.jsx` as text, transpiles with in-browser Babel, and `new Function(transpiled)()`-evaluates it. Boot order is deliberate: speaker-notes JSON → deck.jsx → `requestAnimationFrame` chain → engine.js (backdrops) → remote-host.js. Every edit is a one-file save + reload.

- **Scatterboard slide transitions** have three phases: exit (0–460 ms) → priming paint buffer (~215 ms with all CSS animations paused) → enter (215–775 ms) → settle pin (`.deck-arrived`). Timings live in `styles.css`; `deck.jsx` controller enforces them and MUST agree with CSS. If you bump one duration, bump both.

- **`data-anim` descendants** on a slide get per-type exit/enter variants (H1→slide-left, tiles→scale, edges→slide-up/down). `.deck-arrived` pins elements to `animation:none; opacity:1; transform:none; filter:none` so the native rule doesn't replay and cause jitter.

- **Phone remote protocol** (PeerJS DataChannel, WebRTC):
  - Phone → Deck: `{action: 'next'|'prev'|'home'|'end'|'goto'|'start', index?}`
  - Deck → Phone: `{type:'state', index, total, label}`
  - `total` includes the intro (s0..s13 = 14). Phone subtracts 1 to display `N/13`.
  - Static peer ID is **not private** — the PeerJS public broker is signaling-only. Anyone who knows the exact string could connect. Acceptable risk for a 15-min classroom demo; change the suffix if you reuse the engine.

- **Intro slide (s0)** is a pre-show cover outside the numbered sequence:
  - Body gets `.intro-mode` class while active → aurora + flow-field fade to `opacity:0`; star sits on pure black.
  - Phone's Next button morphs to "START" when `label === 'Intro'`; tapping sends `{action:'start'}`.
  - `remote-host.js` dispatches `window.CustomEvent('deck-explode')` → `SlideIntro`'s `useEffect` listener adds `.intro-star--exploding` to the root → 900 ms CSS burst animation fires in parallel with scatterboard transition to s1.
  - Fallback: if user presses ArrowRight/Space to leave intro, `deck.jsx`'s slidechange handler also dispatches `deck-explode`. The handler is idempotent.

- **`TOTAL = 13`** (in `deck.jsx` line 2260) is the number of numbered slides shown in the chrome (01/13..13/13). Do not change when adding intro-style pre/post-show slides — they sit outside the numbered sequence.

- **GitHub Pages scope:** only `public/` ships. `server/`, Docker, PPTX scripts are dev-time. On Pages, `/api/claude` is absent (static hosting); the deck degrades gracefully (it never calls `/api/claude` on its own — you'd have to build an in-browser UI that does).

---

## Pitfalls & gotchas (the things that will bite next session)

1. **`PROJECT_CONTEXT.md` §4 is stale.** It still describes Web Speech API voice control as a live feature. Voice was removed in commit `138f0b3` on 2026-04-20. Multiple files carry similar stale references: `README.md:16`, `.github/workflows/pages.yml:5`, `package.json:4` (description field), `PROJECT_CONTEXT.md` §1 table, §4 entirety, §5 boilerplate, file map line 99, updates log line 113. Don't believe voice-control references in prose until each is reconciled.

2. **No `package-lock.json`.** `npm install --omit=dev` in `Dockerfile` resolves floating minor/patch versions at build time. Express, pdfkit, or pptxgenjs could silently update between builds. For a timed presentation, this is a live Murphy's-Law hazard. Generate one with `npm install` and commit it; switch Dockerfile to `npm ci`.

3. **PeerJS is loaded without Subresource Integrity** (`remote.html:229`, `remote-host.js:106`). React and Babel have `integrity=` hashes in `index.html`; PeerJS does not. If unpkg.com served a tampered PeerJS at presentation time, attacker code would execute in both deck and phone contexts. Low likelihood, 30-second fix.

4. **`/api/claude` + `/api/save-notes` bind on `0.0.0.0`** with no auth. On a classroom LAN, a peer on the same network could POST arbitrary prompts to your local Claude CLI (billable) or overwrite `speaker-notes.json`. Either bind to `127.0.0.1` or require a localhost-only token. The deck itself doesn't use these endpoints, so disabling them on hot-path has zero user-facing impact.

5. **`.claude-logs/README.md` contradicts `.gitignore`.** README line 11–12 says logs are committed "for version-controlled history and are pulled by the portal"; `.gitignore:16` ignores the whole directory. Either remove the gitignore (if the Claude Master Portal activity dashboard needs them) or fix the README.

6. **Node version is unpinned in three places with three different values:** `package.json` engines `>=18`, `Dockerfile` `node:20-alpine`, dev machine `v24.8.0`. Pick one LTS, pin in both places.

7. **Zed IDE has been crashing during long sessions** on this project (the 2026-04-21 session ran 8.3 hours at 1.24M output tokens / 593M cache-read tokens per `.claude-logs/2026-04-21-*.json`). The session log captures tool events but only `/model`-switch hooks as user messages, so prompt history isn't recoverable from logs. Commit more frequently or use the CLI directly for heavy iteration.

8. **`_shots/` has ~34 scattered dev screenshots** plus the 13-file `pptx/` subdir. Only `pptx/s01.png..s13.png` feed `export-pptx.js`; the rest is archeology. Gitignored so won't ship, but regular pruning would shrink the folder.

---

## Conventions

- **Commits:** lowercase subject, colon-separated scope, terse imperative — `slide 11: lock trend-projection endpoint dots in place`. Follow existing log style.
- **Comments:** existing files use vertical separator blocks (`/* ─── section ─── */`) and ASCII-art box comments in `server/index.js` boot banner. Match that when editing.
- **No emojis in source files** (user preference — global). Only in chat/docs if explicitly requested.
- **Speaker notes:** 27 lines total JSON array, one paragraph per slide s1..s13. Edits go through `public/speaker-notes.json` directly; `/api/save-notes` also accepts a POSTed array.
- **Accent color single source of truth:** `TWEAK_DEFAULTS.accent` in `deck.jsx` (EDITMODE-BEGIN/END markers). Change there; flows to `--accent` CSS var via runtime `applyTweaks()`.

---

## Active work / next steps (as of 2026-04-21)

1. Review and commit the intro-slide feature (6 uncommitted files, 405 insertions — reviewed, cohesive, ready).
2. Decide on the stale-prose cleanup (PROJECT_CONTEXT.md §4 rewrite + 5 peripheral files).
3. Decide on the reproducibility + security fixes listed in Pitfalls §2–§5.
4. (Optional) Paint a real screenshot of slide s0 into `_shots/pptx/s00.png` if you want the intro in the PPTX export — currently excluded by design.

Audit log for this session: `~/Desktop/audit-logs/022-ai-pe-deck-audit-2026-04-21/`.
