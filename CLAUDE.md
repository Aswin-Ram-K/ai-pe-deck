# CLAUDE.md — `ai-pe-deck` (AI in Power Electronics)

**Last refreshed:** 2026-04-21 (post-presentation — audio + countdown + network resilience trio shipped; talk delivered)
**Repo:** `github.com/Aswin-Ram-K/ai-pe-deck` · branch `main` · tracked HEAD `614dccf`
**Also read:** `PROJECT_CONTEXT.md` (design-decision log) · `SESSION_STATE.md` (session handoff + last-prompts packet) · `SPEAKER_SCRIPT.md` (canonical teleprompter source, Stark-edition) · `UNDERSTANDING_NOTES.md` (per-slide Q&A preparation) · `README.md` (user-facing run guide)

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

## Current state (2026-04-21, post-teleprompter)

| Status | Item |
|---|---|
| ✅ Committed + deployed | 13 slides (s1–s13), PE visual library, scatterboard transitions, aurora+flow-field backdrop, PPTX export pipeline, GitHub Pages workflow |
| ✅ Committed | Phone-remote subsystem (`remote-host.js` + `remote.html`/`.js`) via PeerJS, static peer ID `ai-pe-deck-aswin-ram-k-ece563` |
| ✅ Committed | Cosmic intro v5 (SlideIntro): star-like orbital swirl + spiral-in collapse. Particles orbit Z-axis at 0.28-0.60 rad/s; collapse adds uCollapse²×8 rad spiral boost |
| ✅ Committed | **BIG BANG countdown** (10 s) — full-screen take-over overlay, SpeechSynthesis voice (ten…one, "go"), WebAudio 440 Hz ticks + 880 Hz GO tone |
| ✅ Committed | **Teleprompter subsystem** — top 3/4 of State B hosts scrolling speaker script (`SPEAKER_SCRIPT.md` → `speaker-script.json` via `build:script`); syllable-paced to 17 min (1020 s) across slides 1-12; accumulator-based scroll engine with 1 s breather on each slide start + end-of-slide pause |
| ✅ Committed | **Pause / scrub** — touch-and-drag on teleprompter both pauses AND scrubs (finger up = forward); pause button overlay at bottom-left; timer ticks independent of pause state |
| ✅ Committed | **Timers** — total (17:00 countdown) + per-slide countdown with red-flash + 1100 Hz beep on overtime; flex-sibling strip between tele-bar and teleprompter |
| ✅ Committed | **Launchpad legends** — format legend (4 in-style samples) + scrollable abbreviations panel (36 entries) below BIG BANG button |
| ✅ Committed | `UNDERSTANDING_NOTES.md` — per-slide conversational explanations + Q&A preparation (42 KB, repo root + Desktop mirror) |
| ✅ Committed | **Countdown-to-flash sync** — phone fires `{action:'start'}` at T+3.55 s so count=0 "GO" coincides with the visual big-bang flash at +6.45 s into cosmic (not the cosmic *start*) |
| ✅ Committed | **Deck-side cinematic audio** (classroom speakers): ambient bed (sub drone A1 + A3/E4/A4 pad with pulse-synced wobble LFO 0.8→18 Hz + decoupled dual-delay space reverb) + tension riser (noise 200→8000 Hz + saw 110→880 Hz) + A6 shimmer-bell anticipation + Tenet-style reverse swell (4500→300 Hz bandpass) + sidechain duck during held singularity + 5-layer broadband impact stack on the flash frame (sub kick / mid body / hi transient / FM tonal / roar). All procedural WebAudio, zero asset fetches. Gesture-unlock listener on deck window. |

**Branch state:** clean, HEAD `614dccf` pushed to `origin/main`. All Pages deploys green.

## Network-resilience features (built 2026-04-21 live troubleshooting)

Campus Wi-Fi blocked the PeerJS broker mid-setup, so three layered fallbacks shipped in rapid succession — retained permanently because any venue could re-trigger them:

1. **TURN relay fallback** — both `Peer()` instances now pass `config.iceServers` with Google STUN + OpenRelay TURN (UDP/80, UDP/443, TCP/443). TCP/443 is the critical port for firewall traversal because it's indistinguishable from HTTPS.
2. **Non-static peer ID history** — live PEER_ID is `ai-pe-deck-ece563-liveroom-2026a`. If you reuse this engine, bump the suffix every presentation — the PeerJS broker can hold ghost registrations 60+ s after disconnect, and stale IDs break the deck's re-registration on next boot.
3. **Standalone mode (`?standalone=1`)** — phone runs teleprompter + 17:00 timer + countdown with zero deck connection. `send()` branches to a local slide-index handler. Presenter drives deck slides with laptop keyboard (Right Arrow = next) and manually syncs by tapping Next on phone. **This is the ultimate bail-out** — works on any network, including ones that fully block PeerJS.

Launchpad URL remains `remote.html`; standalone variant is `remote.html?standalone=1`. Bookmark BOTH on the phone for future talks.

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
│   ├── remote-host.js     (244L)  ← deck-side PeerJS peer, static peer ID, handles next/prev/goto/start
│   ├── remote.html        (~550L) ← phone UI: States A/B/C, timer strip, pause button, legends, debug overlay
│   ├── remote.js          (~600L) ← phone-side PeerJS client + countdown engine + scroll accumulator + timers + scrub/pause + debug
│   └── speaker-script.json        ← generated; 13-slide structured script with per-slide timeBudgetSec (syllable-derived)
├── server/
│   ├── index.js           (162L)  ← Express: static serve + /api/claude proxy + /api/save-notes + /healthz + port auto-detect
│   └── scripts/
│       ├── export-pptx.js (105L)  ← builds 16:9 full-bleed PPTX from _shots/pptx/*.png
│       ├── export-notes-pdf.js (41L)
│       └── build-script-json.js   ← parses SPEAKER_SCRIPT.md, counts syllables, writes speaker-script.json (17 min / 1020 s / 4533 syll across s1-s12)
├── SPEAKER_SCRIPT.md              ← canonical teleprompter source (Stark-edition); edit here, rerun `npm run build:script`
├── UNDERSTANDING_NOTES.md         ← per-slide plain-English breakdown + Q&A prep (42 KB)
├── AI-PE-Speaker-Script.docx      ← legacy source (before markdown migration); kept for reference
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

- **Intro slide (s0) — cosmic particle cloud via Three.js r160**, outside the numbered sequence. For the authoritative, session-current spec including queued features, see `SESSION_STATE.md` at repo root.
  - Three.js r160 loaded from unpkg as ES module with SRI (modulepreload + inline `<script type="module">`), exposed as `window.THREE`. SlideIntro waits on `three-ready` event if mount races the load.
  - **Layer 1 — Plasma core sphere** (radius 0.5). `IcosahedronGeometry` + `ShaderMaterial`. Fragment blends a 5-color "tulip ring" (the deck's 5 accent hexes verbatim: blue `#0B3FB5` · violet `#5B21B6` · plum `#831843` · forest `#064E3B` · ink `#0A0A1F`) by fBm-noise phase + time. Ink treated as brightness modulator ("stellar shadow"), not a dominant fill — prevents periodic blackout bands. `uTension` uniform drives color warming + flicker frequency during tension phases.
  - **Layer 2 — Atmospheric corona** (radius 0.70, back-faces, additive). Noise-modulated Fresnel alpha so the halo reads as flowing gas, not a clean shell. Hue drifts between violet and plum on a 0.35 rad/s cycle. `uTension` intensifies corona brightness during build-up.
  - **Layer 3 — Gas particles** (1500 points in halo shell r=0.55–0.85). Same `ShaderMaterial` dual-modes via `uBurstTime`: pre-burst → idle drift (orbit around sphere, alpha breathes), post-burst → radial ejecta expansion. All motion GPU-side.
  - **FINAL tension → release state machine** (screen-wide particle field; sphere + corona hidden): tensioning 0.00–3.50s (pulse wave 0.8→2 Hz radial propagation from center) · intensifying 3.50–6.00s (2→18 Hz, past perceptual threshold) · imploding 6.00–6.35s (0.35s snappier convergence) · held 6.35–6.45s (0.10s flash beat only — NOT 1.10s) · flashing 6.45–6.70s (white-out) · ejecta-early 6.70–7.80s (explosion in vacuum) · erupt 7.80–10.50s (aurora overlaps tail of ejecta) · settled 10.50–10.80s · enter 10.80–12.60s (slow 1.8s first-slide enter).
  - **CRITICAL uBurstTime clock invariant**: `uBurstTime` uniform MUST be set via `clock.getElapsedTime()` (Three.js Clock), not `performance.now() / 1000`. Mismatched epochs between `uTime` (Clock) and `uBurstTime` (perf.now) caused a multi-second ejecta freeze previously. Do not regress.
  - **Keyboard/Next-button/phone all trigger cinematic**: monkey-patch on `deck._go(targetIndex, reason)` intercepts Intro → forward advances; `.intro-exploding` class guard prevents re-interception of the scheduled advance at t=10.8s.
  - Pacing constants at top of `remote-host.js`: `INTRO_EXPLODE_TO_NEXT_MS` (10800) + `INTRO_TOTAL_BUDGET_MS` (12600). `FIRST_SLIDE_ENTER_MS` (1800) in deck.jsx. Total cosmic budget: **12.6 seconds** from BIG BANG to slide 1 fully settled.
  - Normal inter-slide transitions are 25% slower than originals (scatterboard durations 1.25×; EXIT 460→575ms, ENTER 560→700ms).
  - **Countdown + teleprompter (built this session, see `SESSION_STATE.md` for details):** 10 s voice+tone countdown on BIG BANG tap, then cosmic intro (12.6 s), then teleprompter begins scrolling slide 1's script at its syllable-paced rate.
- **Cosmic intro v5 orbital update (2026-04-21):** particles now swirl around Z-axis at 0.28-0.60 rad/s in idle; collapse adds `uCollapse²×8` rad spiral boost. Per-particle `aTheta0`, `aInPlaneR`, `aOmega` precomputed in JS (no per-frame atan2/sqrt in shader). Replaces the v4 isotropic-drift idle.

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

## Teleprompter subsystem architecture (built 2026-04-21)

- **Source:** `SPEAKER_SCRIPT.md` (markdown, Stark-edition prose). Edit here.
- **Build:** `npm run build:script` parses the md with `mammoth`-independent regex splitters, strips stage directions, counts syllables via the `syllable` npm package, distributes 17 min (1020 s) across slides 1-12 by syllable ratio, writes `public/speaker-script.json`. Slide 13 (Q&A) gets `timeBudgetSec: null`.
- **Remote fetches** `/speaker-script.json?v=<BUILD_VERSION>` on boot and renders 13 sections into `#tele-scroller`. Offsets measured lazily — first `teleOnSlideChange` after State B becomes visible (spec behavior: descendants of `display:none` ancestor report `offsetTop/offsetHeight === 0`).
- **Scroll engine:** accumulator model. `currentOffsetPx += dt × pxPerSec` each rAF. Snap on slide change → `currentOffsetPx = slideOffsets[N]`. No race-prone `startTimeMs + elapsed × speed` math. Clamps at `maxOffsetPx = slideOffsets[N+1] - 12 px` so scroll stops at end of slide.
- **Breather:** 1 s hold after each snap before accumulator advances (`scrollStartAtMs` gate inside `scrollTick`).
- **Pause (two independent flags):** `manualPause` (touch on teleprompter) + `buttonPause` (pause icon overlay at bottom-left of teleprompter, above Next). Either freezes scroll. **Timers are independent of pause** (wall-clock accountability).
- **Scrub:** touchmove on teleprompter updates `currentOffsetPx = startOffset + (startY - currentY)`. Finger up = forward. Release resumes auto-scroll from wherever landed.
- **Timers:** total (17:00 → 0:00) + per-slide budget. Overtime fires 1100 Hz WebAudio beep + red flash (`body.slide-overtime`, 1.5 Hz pulse). Single-shot beep latched by `slideBeepedOver`.
- **Debug overlay:** append `?debug=1` to the URL. Shows build version, phase (`idle/breathing/scrolling/end-reached`), offsets, heights, pause flags, timer values. Refreshes at 400 ms.
- **Cache-bust:** `remote.html` loads `remote.js?v=<BUILD_VERSION>` and `remote.js` fetches `speaker-script.json?v=<BUILD_VERSION>`. Bump `BUILD_VERSION` on every behavioral change so iOS Safari re-fetches.

## Cinematic audio subsystem (built 2026-04-21, post-teleprompter)

All deck-side in `public/remote-host.js`. Orchestrated by `startCosmicBigBang()`, which schedules every layer relative to the explode moment using `AudioContext.currentTime` offsets (sample-accurate — no `setTimeout` jitter).

**Phase map (seconds from explode fire):**

| t (s) | Visual phase | Audio event |
|---|---|---|
| 0.00-3.50 | tensioning (pulse 0.8→2 Hz) | bed fades in over 5.5 s; pad wobble + 50 Hz sub pulse track visual freq |
| 3.50-6.00 | intensifying (pulse 2→18 Hz) | wobble + pulse race to 18 Hz; tension riser builds |
| 6.00-6.35 | imploding | reverse swell (bandpass 4500→300 Hz, env quadratic build) |
| 6.35-6.45 | held singularity | sidechain duck to 0.20 (bed drops ~14 dB) |
| 6.45 | flashing | **5-layer impact stack fires** on impactBus (direct to destination) |
| 6.45-10.5 | ejecta + erupt | impact roar tail decays through reverb; wobble subsides to 0.3 Hz |
| 10.80-12.6 | settled + enter | 1.8 s release |

**Critical design decisions:**

1. **Reverb topology is DECOUPLED dual-delay**, not shared-LPF. An earlier shared-LPF topology had total open-loop gain ≈ 0.88 at comb-filter eigenfrequencies and produced a slow-building "stuck whine." Each delay now has its own LPF + self-feedback (gain 0.40, safely stable). Do NOT revert to shared feedback.

2. **Impact layers bypass master+duck**, routing through their own `impactBus` direct to `ctx.destination`. If they went through the ducked master, the 50 ms duck release would attenuate the impact's first 4-8 ms of attack transients — killing the contrast the duck was designed to create.

3. **Pad wobble LFO frequency tracks the visual pulse wave** (0.8 → 18 Hz via `exponentialRampToValueAtTime`). This is the "fabric of spacetime wobbling" effect — audio and visual pulse are the same event from two sensory channels.

4. **Countdown-to-flash sync**: `send({action:'start'})` fires at `COUNTDOWN_SEC*1000 - VISUAL_FLASH_OFFSET_MS` ms, not at count=0. Keeps the 10 s composure window while aligning count=0 with the visual big bang.

5. **Audio unlock is a once-only listener** on pointerdown/keydown/touchstart. If presenter never interacts with the deck window, audio is silent but cosmic visuals still run. Document in user-facing notes: "click the deck window once before tapping BIG BANG on the phone."

6. **All synthesized, zero assets.** WebAudio primitives only — no `.mp3`/`.wav` fetches. This was a deliberate Murphy's-Law-first decision: venue Wi-Fi could be flaky at showtime, and a missed asset fetch would mute the whole cinematic.

**Tuning knobs (constants at top of `remote-host.js`):**
- `AMBIENT_SUSTAIN_GAIN = 0.16` — bed max volume
- `AMBIENT_FADE_IN_SEC = 5.5` — drawn-out transition
- `AMBIENT_WOBBLE_DEPTH_MAX = 0.14` — pad AM depth
- `AMBIENT_DUCK_DEPTH = 0.20` — held-singularity duck level
- Per-layer impact peak gains are inline in `_scheduleBigBangImpact`

## Active work / next steps (as of 2026-04-21, session end)

All stated user features implemented and pushed. Remaining items from prior session that the user explicitly deferred ("skip the maintenance part because this isn't going to be a recurring folder"):

1. Reproducibility fixes (Pitfalls §2-§6) — deferred by user as non-blocking for the Apr 21 presentation.
2. PPTX export still skips s0 by design (intro not in the numbered sequence).

Audit log (superseded): `~/Desktop/audit-logs/022-ai-pe-deck-audit-2026-04-21/`.
