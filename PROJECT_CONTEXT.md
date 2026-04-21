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
- 2026-04-21: Cosmic intro v2 — replaces SVG star with **Three.js r160 plasma sphere** (custom ShaderMaterial + 5-color tulip ring + 1500-particle GPU ejecta). Pacing extended to **5.0 s** total (collapse 0.28s → flash 0.17s → ejecta 1.10s → universe-settle 1.55s → hold 0.70s → scatterboard enter 0.75s → arrived 0.45s). Aurora backdrop expanded to 5 orbs (one per deck accent) with breathing pulse + gust-rhythm flow-field ("living universe"). Shader uses 5 accent hexes verbatim (blue/violet/plum/forest/ink), with ink treated as a brightness modulator rather than a dominant fill color to prevent periodic blackouts.
- 2026-04-21: Full audit (log `022-ai-pe-deck-audit-2026-04-21`) → added `package-lock.json`, pinned Node 20.18, SRI-hashed PeerJS, tightened stale voice-refs. `CLAUDE.md` initialized at project root.
