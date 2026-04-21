# Project context — AI in Power Electronics (paper-review deck)

A 13-slide interactive web deck for a 15-minute graduate paper review on
Zhao, Blaabjerg & Wang (2021), *An Overview of Artificial Intelligence
Applications for Power Electronics* — IEEE Transactions on Power
Electronics 36(4), pp. 4633–4658.

Presenter: Aswin Ram Kalugasala Moorthy · ECE-563 Smart Grid · Spring 2026.

---

## Design decisions

### 1 · Render in the browser, no build step
React + Babel load from CDN; `public/deck.jsx` is fetched and transpiled
at boot. Slides are light-DOM children of a custom `<deck-stage>` web
component.

| Alternative | Why not |
|---|---|
| Next.js / Vite | Overkill for a 13-slide deck; speaker iterates via CLI prompts, no dev-server complexity needed |
| reveal.js / Spectacle | Harder to inject domain-specific SVG visuals; opinionated slide grammar fights custom layouts |
| PowerPoint native | No animation granularity, no WebRTC remote, no live CLI editing |

**Why this won**: the deck is a single-purpose artifact — I wanted
direct control of the SVG visuals (Pareto scatter, control loop,
sparklines, RUL cone), the transition pipeline, and the voice
controller. Removing the build step makes every edit a one-file
change + refresh. Trade-off: in-browser Babel adds ~200 ms to first
paint, which we accept.

### 2 · Scatterboard transitions with priming buffer
Two-phase slide-to-slide choreography with a paint buffer in the middle.

- **Exit (0–460 ms)**: every top-level element + every `[data-anim]`
  descendant on the outgoing slide gets a per-type variant —
  `slide-left` for H1s, `scale` for tile/card elements,
  `slide-up` / `slide-down` for edge-anchored elements (chapter mark,
  footer), `fade-up` default.
- **Paint buffer (~215 ms)**: new slide activated with a `.deck-priming`
  class that pauses every CSS animation while the browser paints the
  new background. Double `requestAnimationFrame` + 180 ms visual hold.
- **Enter (215–775 ms)**: priming lifted, mirror-reversed enter
  variants run with stagger.
- **Settle**: `.deck-arrived` pin locks each element at `animation:
  none; opacity: 1; transform: none; filter: none` so the native
  `[data-anim]` rule doesn't replay and cause jitter when the enter
  class is removed.

**Why this won** over "simultaneous crossfade": on heavy slides
(sparklines, Pareto scatter), the paint of the new slide lags the JS
by 50-200 ms. Without the priming buffer the user misses the entrance
animations — first visible frame shows them mid-flight or complete.

### 3 · Body-level backdrop (aurora + flow field)
Aurora: four blurred radial gradients drifting on independent 28-44 s
cycles. Flow field: 220 particles ride a pseudo-Perlin vector field on
`bg-flowfield` canvas with `destination-out` alpha fading for trails.
Both live at `<body>` level so they don't move during slide
transitions — the "fixed deck, elements moving between slides" feel
the presenter wants.

### 4 · Phone remote (supersedes voice control)
Voice control (Web Speech API, interim-result dedup + fuzzy match)
was the original control plane and shipped in commits through
`e6c22f9`. It was removed in `138f0b3` (2026-04-20) in favor of a
**phone-remote subsystem** using WebRTC via PeerJS.

- **Static peer ID** `ai-pe-deck-aswin-ram-k-ece563` — baked into
  both `remote-host.js` (deck side) and `remote.js` (phone side), so
  no QR / room code / pairing ceremony. The phone bookmark auto-
  connects whenever the deck is open.
- **Protocol** over PeerJS DataChannel:
  - Phone → Deck: `{action: 'next'|'prev'|'home'|'end'|'goto'|'start', index?}`
  - Deck → Phone: `{type: 'state', index, total, label}`
- **Status dot** in the deck's bottom-right corner indicates peer
  state (ready / connected / busy / error) without visible chrome.
- **Intro-mode morph**: when the deck reports `label: 'Intro'`, the
  phone's Next button becomes a pulsing START. Tapping dispatches
  `{action: 'start'}` → deck fires `deck-explode` CustomEvent →
  SlideIntro's cosmic-intro state machine runs (collapse →
  flash → ejecta → universe-settle → hold → scatterboard enter)
  over a **5.0 s** pacing budget; `deck.next()` is delayed by
  `INTRO_EXPLODE_TO_NEXT_MS` (3800 ms) so the shader sequence
  plays before slide 1's scatterboard enter. Rendered via
  Three.js r160 (loaded from unpkg with SRI).

**Why this won** over voice control: voice required a single-device
mic on the laptop, fought presenter-to-audience speech, and needed
a silent room. The phone remote is a dedicated second-device control
plane — zero contention with the speaker's voice, works in any
lecture hall, and the static peer ID removes all on-stage pairing
friction. Trade-off: requires internet at the venue for PeerJS
broker signaling (acceptable — every venue has it).

**Not private**: anyone who guessed the PEER_ID string could connect
to the deck. The PeerJS public broker is signaling-only, so there's
no cryptographic barrier. Acceptable for a 15-minute classroom demo;
change the suffix if reusing this engine elsewhere.

### 5 · Docker for local runtime, GitHub Pages for public
Local dev: `docker compose up` serves via Express on port 3000 with
`/public` bind-mounted so edits appear live. Includes a `/api/claude`
proxy to shell out to a locally-installed Claude CLI (optional).

Public deploy: GitHub Actions workflow uploads `public/` as a Pages
artifact. The `/api/claude` endpoint is absent on Pages (static hosting);
all the deck needs is client-side — React/Babel + PeerJS from CDN,
local JSON fetch of `speaker-notes.json`.

---

## Key data / measurements

- Paper survey size: 500+ publications
- Phase publication share (from paper): Control 77.8%, Maintenance 12.4%, Design 9.8%
- Target venue: IEEE TPEL 36(4), April 2021
- Presenter projection (editorial): Maintenance grows to ~34% by 2030 (paper's "my take" slide)

---

## What lives where

| Path | Purpose |
|---|---|
| `public/index.html` | Shell — loads React/Babel, deck-stage, boots deck.jsx → engine.js |
| `public/deck.jsx` | All 13 slide React components + PE visual library (PWM, Pareto, neural net, sparklines, control loop, RUL cone, paper cluster, trend projection) + slide-change orchestration (exit → priming → enter) |
| `public/deck-stage.js` | Web component — keyboard nav, slide persistence via URL fragment, slot management |
| `public/engine.js` | Animated backdrop (aurora CSS + flow-field canvas). Voice/reveal systems removed. |
| `public/remote-host.js` | Deck-side PeerJS peer (static ID), handles phone commands, dispatches deck-explode on intro-start |
| `public/remote.html` / `public/remote.js` | Phone-side control surface — status dot, slide-num display, big prev/next, swipe gestures, intro-mode START morph |
| `public/styles.css` | Theme tokens, all animation primitives, transition variants, scatter + priming + arrived pins |
| `public/speaker-notes.json` | Per-slide narration — voice triggers auto-extracted from first sentence of each note |
| `server/index.js` | Express server for local dev (irrelevant on GH Pages) |
| `server/scripts/export-pptx.js` | Builds `exports/ai-pe-deck.pptx` from `_shots/pptx/*.png` screenshots (dev-time only) |
| `.github/workflows/pages.yml` | Deploys `public/` to GitHub Pages on every push to main |

---

## Updates log

- 2026-04-20: Initial build — 13 slides, interactive, local-only.
- 2026-04-20: PE visual library (PWM, Pareto, neural net, sparklines, control loop, RUL cone) + aurora backdrop + flow field.
- 2026-04-20: Scatterboard transitions (per-element variants) + priming paint buffer.
- 2026-04-20: Voice controller — interim-result dedup + fuzzy match + live progress meter.
- 2026-04-20: Speaker notes rewritten for graduate-level audience — semi-professional, engaging, technical depth retained.
- 2026-04-20: Published to GitHub (pending repo creation).
- 2026-04-20: Voice + reveal-group systems removed (`138f0b3`) in favor of a phone-remote control plane. PeerJS-based pairing via QR (`853172a`), then simplified to static peer ID + auto-start (`917d10a`).
- 2026-04-21: Pre-show intro slide (s0) added — revolving SVG star with drifting hue orbs, 34-particle explosion on phone-remote START. Aurora/flow-field fade to black during intro-mode.
- 2026-04-21: Cosmic intro v2 — replaces SVG star with **Three.js r160 plasma sphere** (custom ShaderMaterial + 5-color tulip ring + 1500-particle GPU ejecta). Pacing extended to **5.0 s** total. Aurora backdrop expanded to 5 orbs (one per deck accent) with breathing pulse + gust-rhythm flow-field ("living universe"). Shader uses 5 accent hexes verbatim (blue/violet/plum/forest/ink), with ink treated as a brightness modulator.
- 2026-04-21: Cosmic intro v3 — reworked into a **3-layer gas cloud with tension/release arc** per presenter preference for cinematic impact. Layers: (1) plasma core sphere, (2) noise-modulated atmospheric corona (flowing-gas feel, not clean shell), (3) 1500 gas particles in halo shell (visible pre-burst as orbiting internal gas, then released as ejecta). 10-phase state machine: tensioning (pulse freq ramps 0.5→2Hz) → intensifying (ramps 2→18Hz past perceptual threshold) → implosion → **held singularity** (1.1s dramatic pause) → flash → ejecta → **universe erupts** (CSS keyframe materialises aurora with over-saturation + over-brightness peak, then settles). Total cosmic budget **15.6 s**. Inter-slide transitions 25% slower (scatterboard durations ×1.25) across the whole deck.
- 2026-04-21: Cosmic intro v4 (FINAL) — multiple presenter-feedback-driven iterations converged to: **sphere + corona HIDDEN**, screen-wide **6000-particle cloud** as the sole visible intro surface. Radial pulse wave propagates from center outward through the cloud (`sin((t - d/2.5) * freq)`). Pulse frequency 0.8→18 Hz ramps across tensioning + intensifying. Held phase cut from 1.10s → 0.10s per presenter brief ("implosion to explosion immediate"). Aurora eruption moved to overlap the tail of ejecta (starts at t=7.80s while particles still finishing). Ejecta origin fixed to `aDir * dist` (not `aDir * (0.5 + dist)`) — eliminates the ~25× radial teleport that briefly showed an "intermediate cloud." `uBurstTime` now uses `clock.getElapsedTime()` matching `uTime` — this was the root cause of the earlier multi-second "static frame before ejecta" bug (`performance.now`/Clock epoch mismatch). Particle size during ejecta: 3.0 → 1.5px ("minute light-like specks" per brief). Alpha fades to zero during collapse so no visible 6000-particle clump at origin. Total cosmic budget **12.6 s** (was 15.6). Constants: `INTRO_EXPLODE_TO_NEXT_MS = 10800`, `INTRO_TOTAL_BUDGET_MS = 12600`, `FIRST_SLIDE_ENTER_MS = 1800`.
- 2026-04-21: Remote UI reshaped into **two-state design**. State A (deck on Intro): full-screen circular pink/purple "BIG BANG" button with pulsing glow. State B (any other slide): compact 52px slide number + italic label at top, full-width Prev button + Home/End/Rescan row in middle, edge-to-edge 25vh Next button at bottom (sized for blind thumb operation). Auto-transitions based on deck's `state` messages. On return to Intro, remote snaps back to State A.
- 2026-04-21: Desktop keyboard/Next-button/phone-START unified via monkey-patch on `deck._go()` — all three paths now trigger the cinematic cosmic sequence from Intro forward; `.intro-exploding` class guard prevents double-interception.
- 2026-04-21: Pushed to GitHub (`main` @ `d9a4b93`) + Pages deploy — static URLs replace LAN-IP dependency. Deck: `https://aswin-ram-k.github.io/ai-pe-deck/` · Remote: `.../remote.html`.
- 2026-04-21: Session paused with two features queued for next session (5-second countdown on BIG BANG + scrolling speaker-notes teleprompter on remote). See `SESSION_STATE.md` for handoff detail.
- 2026-04-21: Full audit (log `022-ai-pe-deck-audit-2026-04-21`) → added `package-lock.json`, pinned Node 20.18, SRI-hashed PeerJS, tightened stale voice-refs. `CLAUDE.md` initialized at project root.
- 2026-04-21 (afternoon): **Teleprompter session.** Shipped the full phone-remote teleprompter subsystem: Stark-edition script + syllable-paced 17 min distribution + accumulator scroll engine + breather + end-of-slide pause + hold-to-pause + pause button + scrub + independent timers + overtime red-flash + format legend + scrollable abbreviations + `UNDERSTANDING_NOTES.md` + cosmic-intro v5 orbital swirl + 10 s countdown. HEAD `d68e51b`. See §§ 6-10 below for decisions.

---

## Session-6 design decisions (teleprompter + related, 2026-04-21)

### 6 · Teleprompter pacing: syllables, not words

**What was decided:** per-slide scroll speed is derived from syllable count, distributed across a 17-minute total budget.

| Alternative | Why not |
|---|---|
| Flat WPM (140) | Ignores per-slide density — short slides would scroll unnecessarily slowly relative to dense ones |
| Word count per slide | Words include particles ("a", "the") that aren't load-bearing; syllables reflect actual spoken time more precisely |
| Author-authored per-slide `timeBudgetSec` in DOCX | Brittle — every script edit would require re-entering time values |

**Why this won:** syllables ≈ phonetic units, which map closely to actual spoken time regardless of word length. `syllable` npm package handles English irregulars (silent-e, tion/cial, vowel pairs) well enough for teleprompter pacing. Rate lands at 4.44 syll/s (≈267 syll/min) — natural for a technical talk.

**Key data:** 4,533 syllables across slides 1-12 → 1020.0 s total. Per-slide: s01 = 41.6 s, s07 = 171.7 s (peak slide), s12 = 34.2 s. Script's internal "Time budget: NN s" annotations were dropped in favor of syllable derivation.

### 7 · Scroll engine: per-frame accumulator, not baseline+elapsed

**What was decided:** `currentOffsetPx += dt × pxPerSec` each rAF. Snap on slide change = assign `currentOffsetPx = slideOffsets[N]`.

**Alternatives considered (and the bugs they caused):**
- `scroller.style.transform = translateY(-(baselineOffsetPx + elapsed × pxPerSec))`: original design. Next-button tap would reset `baselineOffsetPx` + `startTimeMs` with a 420 ms `setTimeout` between snap and new scrollTick. A leftover rAF from the PREVIOUS scrollTick could fire between snap and startScroll, read the NEW baselineOffsetPx with the OLD startTimeMs, and produce a jump back to near-zero scroll. **Unreliable — user reported "script starts freshly from the very beginning" on every Next tap.**
- CSS transition interpolation: too slow for responsive scrubbing (380 ms lag).

**Why this won:** per-frame accumulator has no time math to race. Any in-flight rAF just reads the updated `currentOffsetPx` and continues from there. Snap is a single assignment. Verified: 7 slide-change scenarios snap within 1.1 px of target.

**Separate issue, same fix:** end-of-slide pause (`maxOffsetPx = slideOffsets[N+1] - 12`) stops the rAF entirely when the clamp is reached. Saves CPU and removes any risk of the accumulator drifting past the slide.

### 8 · Hold-to-pause AND scrub on the same gesture

**What was decided:** touch on the teleprompter both pauses auto-scroll AND lets the user drag to scrub. Finger up = forward, finger down = backward. Release resumes auto-scroll from wherever they landed.

**Alternative rejected:** separate modes (a dedicated "scrub" toggle button that, when active, lets you drag). Rejected because a presenter on stage doesn't have thumb-glance-time to toggle modes. One-finger gesture is lower cognitive load.

**Second decision:** timers are **independent** of pause. Wall-clock accountability — pausing doesn't buy back stage time. Overtime alerts fire based on real elapsed time. This is explicit per user directive: "The timer should be independent as soon as the presentation starts."

### 9 · Launchpad legends (format + abbreviations)

**What was decided:** the BIG BANG screen now carries two legends below the button — a format legend (4 in-style samples: body / stage / quote / callback) + a scrollable abbreviations panel (36 entries: IGBT, SiC, MPC, TD3, PINN, etc.). BIG BANG button shrunk from 72 vw / 380 px → 52 vw / 240 px to make room.

**Alternative rejected:** a separate `?help=1` page or modal. Rejected because extra navigation = presenter loses pre-show focus. Everything on one screen, scroll to reference, tap to launch.

**Why each format renders in its teleprompter style:** presenters memorize visual → meaning, not verbal descriptions. Seeing `> Accent-bar italic — Signature line · weight` on the pre-show screen means during the talk, when they see the same accent bar, they know to deliver with weight without re-reading the label.

### 10 · Cosmic intro v5: orbital swirl replaces isotropic drift

**What was decided:** pre-BIG-BANG particles orbit the Z-axis at 0.28-0.60 rad/s. Collapse adds `uCollapse² × 8` rad spiral boost so particles spiral *inward* rather than radially collapse.

**Alternatives considered:**
- Each particle orbits its own random axis (galactic/chaotic feel): rejected for visual incoherence.
- Flat 2D disk (all particles in xy plane): rejected because it loses the volumetric feel the presenter asked for ("floating around like a star").

**Why Z-axis won:** camera faces -Z, so Z-axis orbits are visible face-on. Particles at higher `|z|` have smaller `aInPlaneR = sqrt(1-z²)` so they move less — natural latitude-like depth cue, like Earth's equator spinning faster than its poles.

**Performance:** `aTheta0`, `aInPlaneR`, `aOmega` precomputed in JS once per boot, stored as `BufferAttribute`s. Shader uses them directly — no per-frame atan2/sqrt across 6000 particles.

### 11 · Countdown extended 5 s → 10 s

Originally 5 s per presenter brief. Extended to 10 s at session end for a longer pre-presentation composure window. `numberWord` map expanded to cover 10-1 so SpeechSynthesis says words ("ten, nine, eight…") rather than digit strings.

---

## Files added / materially modified this session

| Path | Role |
|---|---|
| `SPEAKER_SCRIPT.md` | New — canonical teleprompter source, Stark-edition prose, replaces DOCX |
| `UNDERSTANDING_NOTES.md` | New — per-slide conversational Q&A prep (42 KB, mirrored to `~/Desktop/`) |
| `server/scripts/build-script-json.js` | New — mammoth-independent md parser + syllable counter + 17 min distributor |
| `public/speaker-script.json` | New — generated artifact, commits so Pages serves it |
| `public/remote.html` / `public/remote.js` | Heavy expansion — State C countdown, timer strip, pause/scrub, legends, debug overlay, cache-bust |
| `public/deck.jsx` | SlideIntro vertex shader: orbital attributes + spiral-collapse term |
| `package.json` | Added dev deps `mammoth` (legacy DOCX import path) and `syllable` |
