/* ═══════════════════════════════════════════════════════════════
 * Remote host — deck-side WebRTC peer that auto-registers on
 * load with a STATIC peer ID. The phone has a bookmarkable URL
 * (public/remote.html) that connects to this same fixed ID, so:
 *
 *   1. You open the deck.
 *   2. A few seconds later the peer is ready.
 *   3. You open the bookmarked remote URL on your phone.
 *   4. Connection established. Control works.
 *
 * No QR, no codes to read, no visible pairing ceremony. A tiny
 * status dot in the deck's bottom-right corner indicates state:
 *
 *   grey    → ready, waiting for phone
 *   accent  → phone connected (pulses)
 *   yellow  → room busy (another deck instance holds the ID;
 *              retrying in 4s)
 *   red     → other error
 *
 * Protocol (over the WebRTC DataChannel):
 *   Phone → Deck:   { action: 'next' | 'prev' | 'home' | 'end' | 'goto', index?: N }
 *   Deck  → Phone:  { type: 'state', index, total, label }
 * ═══════════════════════════════════════════════════════════════ */

/* ─── Pacing constants ─────────────────────────────────────────────
 * Retuneable at QA time without touching other files.
 * ───────────────────────────────────────────────────────────── */
const INTRO_EXPLODE_TO_NEXT_MS = 10800;  // start tap → deck.next() fires (end of settled hold)
const INTRO_TOTAL_BUDGET_MS    = 12600;  // start tap → slide 1 fully arrived (+1.8s first-slide enter)

/* Cosmic big-bang soundtrack (deck-side, classroom speakers) — a
 * multi-layer cinematic sequence synchronized to the visual phase
 * machine in SlideIntro. Times are seconds relative to the explode
 * moment (AudioContext.currentTime basis). Design references:
 *   · Pixflow / Motion Array / Ableton cinematic-impact guides —
 *     three-part structure (build-up → impact → tail), frequency
 *     layering (sub 40-120Hz + mid body + hi 2-5kHz transient).
 *   · "Tenet" (2020) reverse-swell technique — short reversed-noise
 *     cue ending AT the impact creates "negative attack."
 *   · MDN WebAudio "advanced techniques" — exponentialRampToValueAtTime
 *     on oscillator frequency for percussive descending sweeps
 *     (120 → 30 Hz pattern for sub-kicks), FM for tonal impacts.
 *
 * Phase map (seconds from explode):
 *   0.00 -  3.50  tensioning   — bed fades in; sub-bass pulse + pad
 *                                 wobble track visual pulse freq
 *   3.50 -  6.00  intensifying — pulse/wobble race 0.8 → 18 Hz;
 *                                 tension riser (noise+tone) builds
 *   6.00 -  6.35  imploding    — reverse swell (bandpass 4500→300Hz)
 *   6.35 -  6.45  held         — sidechain duck to 0.20; "held breath"
 *   6.45 -  6.70  flashing     — IMPACT STACK (5 layers) hits together
 *   6.70 -  7.80  ejecta       — impact roar tail continues
 *   7.80 - 10.50  erupt        — tail + reverb settle
 *  10.50 - 10.80  settled
 *  10.80 - 12.60  enter (slide 1) — release begins at 10.80, 1.8s fall
 */
const AMBIENT_FADE_IN_SEC          = 5.5;    // longer, softer fade
const AMBIENT_SUSTAIN_GAIN         = 0.16;   // lower bed loudness (was 0.26)
const AMBIENT_WOBBLE_END_SEC       = 6.0;    // 0.8 → 18 Hz ramp ends (matches SlideIntro pulse wave)
const AMBIENT_WOBBLE_DEPTH_MAX     = 0.14;   // pad AM depth at impact approach
const AMBIENT_RISER_START_SEC      = 3.5;    // intensifying phase begins
const AMBIENT_IMPLODE_START_SEC    = 6.0;    // reverse swell begins
const AMBIENT_DUCK_START_SEC       = 6.20;   // bed starts ducking before held
const AMBIENT_DUCK_HOLD_START_SEC  = 6.35;   // held phase begins (duck at depth)
const AMBIENT_DUCK_HOLD_END_SEC    = 6.40;
const AMBIENT_DUCK_DEPTH           = 0.20;   // -14dB duck during held singularity
const AMBIENT_SHIMMER_SEC          = 5.95;
const AMBIENT_IMPACT_SEC           = 6.45;   // flash frame — impact stack fires
const AMBIENT_RELEASE_AT_MS        = 10800;
const AMBIENT_RELEASE_DURATION_SEC = 1.8;

(() => {
  const deck = document.querySelector('deck-stage');
  if (!deck) return;

  /*  Static peer ID. Same every time → phone URL can be bookmarked
      with no room code. Not cryptographically private — PeerJS's
      public broker is signaling-only, but anyone who knew this
      specific long string could also connect. That's fine for a
      15-minute presentation. Change the suffix if you reuse this
      engine on a different deck. */
  const PEER_ID = 'ai-pe-deck-ece563-liveroom-2026a';

  let peer = null;
  let peerReady = false;
  const conns = new Set();

  /* ─── Cosmic big-bang audio (deck-side, classroom speakers) ──────
   * AudioContext can't be opened until a user gesture. We listen
   * once on pointer/key/touch and lazily create the ctx. Presenter
   * will typically click or press a key on the deck window before
   * tapping BIG BANG on the phone. Visual cosmic still runs if the
   * gesture was missed — only the audio is silent.
   *
   * All orchestration is triggered by `startCosmicBigBang()`, which
   * schedules every layer relative to the explode moment using
   * AudioContext.currentTime offsets (sample-accurate). See the
   * constants block above for the phase map. */
  let deckAudioCtx = null;
  const cosmicAmbient = {
    active: false,
    masterGain: null,   // global fade envelope (tracks fade-in + release)
    duckGain: null,     // sidechain-style duck engaged during "held" phase
    dryBus: null,
    revInput: null,
    nodes: [],          // every source + routing node — held for cleanup
    cleanupTimer: null,
  };

  function unlockDeckAudioOnce() {
    const tryUnlock = () => {
      if (deckAudioCtx) return;
      try {
        deckAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (deckAudioCtx.state === 'suspended') deckAudioCtx.resume();
      } catch (e) { deckAudioCtx = null; }
    };
    ['pointerdown','keydown','touchstart'].forEach((ev) => {
      window.addEventListener(ev, tryUnlock, { once: true, capture: true });
    });
  }

  /* ── Buses + reverb ──
   * Signal chain:   sources  →  dry/wet  →  master  →  duckGain  →  destination
   *                 impact   →  impactBus → destination  (bypasses duck for full volume)
   *
   * Reverb: two DECOUPLED delay lines, each with its own lowpass in
   * its OWN feedback loop. Previous design cross-coupled both delays
   * through a shared LPF (open-loop gain ≈ 0.88 — marginally stable
   * — which accumulated energy at comb-filter modes and produced a
   * slow-building "whine" that got stuck. Decoupled, each path has
   * self-feedback 0.40; safely under 1.0 at every frequency. */
  function _buildAmbientBuses(ctx, t0) {
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(AMBIENT_SUSTAIN_GAIN, t0 + AMBIENT_FADE_IN_SEC);

    const duck = ctx.createGain();
    duck.gain.value = 1.0;

    master.connect(duck);
    duck.connect(ctx.destination);

    const dryBus = ctx.createGain(); dryBus.gain.value = 1.0;  dryBus.connect(master);
    const wetBus = ctx.createGain(); wetBus.gain.value = 0.38; wetBus.connect(master);

    const revInput = ctx.createGain();

    // Delay 1 — 137ms tap with its OWN self-feedback + LPF
    const d1  = ctx.createDelay(1.0); d1.delayTime.value = 0.137;
    const fb1 = ctx.createGain();     fb1.gain.value = 0.40;
    const lp1 = ctx.createBiquadFilter();
    lp1.type = 'lowpass'; lp1.frequency.value = 2400;
    revInput.connect(d1); d1.connect(fb1); fb1.connect(lp1); lp1.connect(d1);
    d1.connect(wetBus);

    // Delay 2 — 197ms tap, independent self-feedback + LPF
    const d2  = ctx.createDelay(1.0); d2.delayTime.value = 0.197;
    const fb2 = ctx.createGain();     fb2.gain.value = 0.40;
    const lp2 = ctx.createBiquadFilter();
    lp2.type = 'lowpass'; lp2.frequency.value = 2400;
    revInput.connect(d2); d2.connect(fb2); fb2.connect(lp2); lp2.connect(d2);
    d2.connect(wetBus);

    cosmicAmbient.masterGain = master;
    cosmicAmbient.duckGain = duck;
    cosmicAmbient.dryBus = dryBus;
    cosmicAmbient.revInput = revInput;
    cosmicAmbient.nodes.push(master, duck, dryBus, wetBus, revInput,
                             d1, fb1, lp1, d2, fb2, lp2);
  }

  /* ── Ambient bed: A1 sub drone + A3/E4/A4 pad ──
   * The pad's AM LFO frequency tracks the visual pulse-wave: 0.8 Hz
   * at t0 ramping exponentially to 18 Hz at t0+6s. This makes the
   * pad "wobble with the fabric of spacetime" — the visual tremor
   * and the audio tremor ARE the same thing. LFO depth also grows
   * (0.04 → AMBIENT_WOBBLE_DEPTH_MAX) so the wobble becomes more
   * pronounced as the tension builds, then releases after impact. */
  function _buildCosmicBed(ctx, t0) {
    const dryBus = cosmicAmbient.dryBus;
    const revInput = cosmicAmbient.revInput;

    // Sub drone (A1) — dry only; reverb on low freq muddies
    const subLP  = ctx.createBiquadFilter();
    subLP.type = 'lowpass'; subLP.frequency.value = 180; subLP.Q.value = 0.5;
    const subSum = ctx.createGain(); subSum.gain.value = 0.55;
    subLP.connect(subSum); subSum.connect(dryBus);
    cosmicAmbient.nodes.push(subLP, subSum);
    [55.0, 55.5].forEach((hz) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = hz;
      osc.connect(subLP);
      osc.start(t0);
      cosmicAmbient.nodes.push(osc);
    });

    // Pad chord (A3 / E4 / A4)
    const padSum = ctx.createGain(); padSum.gain.value = 0.22;
    const padDry = ctx.createGain(); padDry.gain.value = 0.55;
    const padWet = ctx.createGain(); padWet.gain.value = 0.90;
    padSum.connect(padDry); padSum.connect(padWet);
    padDry.connect(dryBus);
    padWet.connect(revInput);
    cosmicAmbient.nodes.push(padSum, padDry, padWet);
    [
      { hz: 220.00, detune:  0 },
      { hz: 220.00, detune: +4 },
      { hz: 329.63, detune: -3 },
      { hz: 329.63, detune: +3 },
      { hz: 440.00, detune: -4 },
    ].forEach(({ hz, detune }) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = hz;
      osc.detune.value = detune;
      osc.connect(padSum);
      osc.start(t0);
      cosmicAmbient.nodes.push(osc);
    });

    // Wobble LFO — frequency ramps with the visual pulse wave
    const wobLFO = ctx.createOscillator();
    wobLFO.type = 'sine';
    wobLFO.frequency.setValueAtTime(0.8, t0);
    wobLFO.frequency.exponentialRampToValueAtTime(18.0, t0 + AMBIENT_WOBBLE_END_SEC);
    wobLFO.frequency.exponentialRampToValueAtTime(0.3, t0 + 8.5);  // calm post-impact

    const wobDepth = ctx.createGain();
    wobDepth.gain.setValueAtTime(0.04, t0);
    wobDepth.gain.exponentialRampToValueAtTime(AMBIENT_WOBBLE_DEPTH_MAX, t0 + 5.9);
    wobDepth.gain.exponentialRampToValueAtTime(0.03, t0 + 7.2);    // subsides post-impact

    wobLFO.connect(wobDepth);
    wobDepth.connect(padSum.gain);
    wobLFO.start(t0);
    cosmicAmbient.nodes.push(wobLFO, wobDepth);
  }

  /* ── Radial pulse bass — the audio equivalent of the visual pulse wave
   * A 50 Hz sub-sine amplitude-modulated by an LFO whose frequency
   * ramps 0.8 → 18 Hz in lockstep with the pad wobble and the visual.
   * Uses a ConstantSourceNode offset so the bipolar LFO sums into a
   * >= 0 AM envelope. Audience FEELS this in their chest. */
  function _scheduleRadialPulse(ctx, t0) {
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = 50;

    const vca = ctx.createGain();
    vca.gain.value = 0;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.8, t0);
    lfo.frequency.exponentialRampToValueAtTime(18.0, t0 + AMBIENT_WOBBLE_END_SEC);

    const lfoScale  = ctx.createGain();      lfoScale.gain.value = 0.35;
    const lfoOffset = ctx.createConstantSource(); lfoOffset.offset.value = 0.40;

    lfo.connect(lfoScale); lfoScale.connect(vca.gain);
    lfoOffset.connect(vca.gain);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(0.34, t0 + 2.0);
    env.gain.exponentialRampToValueAtTime(0.50, t0 + 6.2);    // build-up boosted
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 6.7);  // cut after impact

    carrier.connect(vca); vca.connect(env); env.connect(cosmicAmbient.dryBus);
    carrier.start(t0);   lfo.start(t0); lfoOffset.start(t0);
    carrier.stop(t0 + 7.0); lfo.stop(t0 + 7.0); lfoOffset.stop(t0 + 7.0);
    cosmicAmbient.nodes.push(carrier, vca, lfo, lfoScale, lfoOffset, env);
  }

  /* ── Tension riser — noise + tone, bandwidth opens toward impact ──
   * Build-up technique from Pixflow/Ableton guides. Bandpass sweeps
   * 200 → 8000 Hz across the intensifying+implode window (3.5 → 6.45s).
   * Tonal saw sweeps 110 → 880 Hz under a climbing lowpass. Both
   * ramp gain up and cut sharply AT impact to clear space for the
   * hit. */
  function _scheduleTensionRiser(ctx, t0) {
    const tStart = t0 + AMBIENT_RISER_START_SEC;
    const tPeak  = t0 + AMBIENT_IMPACT_SEC;
    const dur = tPeak - tStart;

    // Noise component
    const noiseBuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * (dur + 0.1)), ctx.sampleRate);
    const nData = noiseBuf.getChannelData(0);
    for (let i = 0; i < nData.length; i++) nData[i] = Math.random() * 2 - 1;
    const nSrc = ctx.createBufferSource(); nSrc.buffer = noiseBuf;
    const nBP = ctx.createBiquadFilter();
    nBP.type = 'bandpass'; nBP.Q.value = 2;
    nBP.frequency.setValueAtTime(200, tStart);
    nBP.frequency.exponentialRampToValueAtTime(8000, tPeak);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.0001, tStart);
    nGain.gain.exponentialRampToValueAtTime(0.42, tPeak - 0.05);  // build-up boosted
    nGain.gain.exponentialRampToValueAtTime(0.0001, tPeak + 0.03);
    const nWet = ctx.createGain(); nWet.gain.value = 0.55;
    nSrc.connect(nBP); nBP.connect(nGain);
    nGain.connect(cosmicAmbient.dryBus);
    nGain.connect(nWet); nWet.connect(cosmicAmbient.revInput);
    nSrc.start(tStart); nSrc.stop(tPeak + 0.1);

    // Tonal component
    const tOsc = ctx.createOscillator(); tOsc.type = 'sawtooth';
    tOsc.frequency.setValueAtTime(110, tStart);
    tOsc.frequency.exponentialRampToValueAtTime(880, tPeak);
    const tFilt = ctx.createBiquadFilter();
    tFilt.type = 'lowpass'; tFilt.Q.value = 3;
    tFilt.frequency.setValueAtTime(400, tStart);
    tFilt.frequency.exponentialRampToValueAtTime(6000, tPeak);
    const tGain = ctx.createGain();
    tGain.gain.setValueAtTime(0.0001, tStart);
    tGain.gain.exponentialRampToValueAtTime(0.22, tPeak - 0.05);  // build-up boosted
    tGain.gain.exponentialRampToValueAtTime(0.0001, tPeak + 0.02);
    tOsc.connect(tFilt); tFilt.connect(tGain); tGain.connect(cosmicAmbient.dryBus);
    tOsc.start(tStart); tOsc.stop(tPeak + 0.05);

    cosmicAmbient.nodes.push(nSrc, nBP, nGain, nWet, tOsc, tFilt, tGain);
  }

  /* ── A6 shimmer bell — 0.5s anticipation before impact ──
   * Classic film-score trick: high harmonic hitting BEFORE the peak
   * primes the ear so the impact lands harder. Heavy reverb wet. */
  function _scheduleShimmerBell(ctx, t0) {
    const tRing = t0 + AMBIENT_SHIMMER_SEC;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 1760;  // A6
    const g = ctx.createGain();
    const dryAmt = ctx.createGain(); dryAmt.gain.value = 0.30;
    const wetAmt = ctx.createGain(); wetAmt.gain.value = 0.80;
    osc.connect(g);
    g.connect(dryAmt); dryAmt.connect(cosmicAmbient.dryBus);
    g.connect(wetAmt); wetAmt.connect(cosmicAmbient.revInput);
    g.gain.setValueAtTime(0.0001, tRing);
    g.gain.exponentialRampToValueAtTime(0.09, tRing + 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, tRing + 0.90);
    osc.start(tRing); osc.stop(tRing + 0.95);
    cosmicAmbient.nodes.push(osc, g, dryAmt, wetAmt);
  }

  /* ── Reverse swell — "negative attack" resolving AT impact ──
   * Buffer filled with noise envelope ramping UP over the 0.45s
   * implosion window. Bandpass frequency DROPS 4500 → 300 Hz so
   * the sound feels like it's being sucked into a pinpoint.
   * Technique from Tenet's reversed sound design. */
  function _scheduleReverseSwell(ctx, t0) {
    const tStart = t0 + AMBIENT_IMPLODE_START_SEC;
    const tImpact = t0 + AMBIENT_IMPACT_SEC;
    const dur = tImpact - tStart;  // 0.45s
    const sampleCount = Math.ceil(ctx.sampleRate * dur);

    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      const t = i / sampleCount;  // 0 → 1 (quadratic build to end)
      data[i] = (Math.random() * 2 - 1) * (t * t);
    }

    const src = ctx.createBufferSource(); src.buffer = buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(4500, tStart);
    bp.frequency.exponentialRampToValueAtTime(300, tImpact);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, tStart);
    g.gain.exponentialRampToValueAtTime(0.44, tImpact - 0.01);    // build-up boosted
    const wet = ctx.createGain(); wet.gain.value = 0.8;
    src.connect(bp); bp.connect(g);
    g.connect(cosmicAmbient.dryBus);
    g.connect(wet); wet.connect(cosmicAmbient.revInput);
    src.start(tStart);
    cosmicAmbient.nodes.push(src, bp, g, wet);
  }

  /* ── Impact duck — sidechain-style "held breath" before impact ──
   * Bed ducks to AMBIENT_DUCK_DEPTH for the 100ms held-singularity
   * window, then releases exactly AT the impact frame. Max contrast
   * between quiet-before and hit. Impact layers bypass the duck so
   * THEY hit at full volume.  */
  function _scheduleImpactDuck(ctx, t0) {
    const g = cosmicAmbient.duckGain.gain;
    g.setValueAtTime(1.0, t0 + AMBIENT_DUCK_START_SEC);
    g.exponentialRampToValueAtTime(AMBIENT_DUCK_DEPTH, t0 + AMBIENT_DUCK_HOLD_START_SEC);
    g.setValueAtTime(AMBIENT_DUCK_DEPTH, t0 + AMBIENT_DUCK_HOLD_END_SEC);
    g.exponentialRampToValueAtTime(1.0, t0 + AMBIENT_IMPACT_SEC + 0.05);
  }

  /* ── Big-bang impact stack — 5-layer broadband hit ──
   * Each layer targets a different frequency band so they sum
   * cleanly rather than mud up one band. Connects to impactBus
   * (direct to destination) so the master fade/release envelope
   * doesn't attenuate the peak.
   *
   *   sub kick     90 → 30 Hz sine, 1.3s body         — "thump you feel"
   *   mid body     900 → 150 Hz bandpass noise, 0.45s — "boom"
   *   hi transient 2500+ Hz noise snap, 80ms          — "crack"
   *   FM tonal     FM sine (car 220 / mod 440), 0.5s  — "pitched impact"
   *   roar         800 → 40 Hz bandpass noise, 2.5s   — "sustained roar tail"
   */
  function _scheduleBigBangImpact(ctx, t0) {
    const t = t0 + AMBIENT_IMPACT_SEC;

    // impactBus bypasses master + duck — impact hits at synthesized level
    const impactBus = ctx.createGain(); impactBus.gain.value = 1.0;
    impactBus.connect(ctx.destination);
    cosmicAmbient.nodes.push(impactBus);

    // --- Sub kick: 90 → 30 Hz descending sine, 1.3s body ---
    {
      const osc = ctx.createOscillator(); osc.type = 'sine';
      osc.frequency.setValueAtTime(90, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.52, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      osc.connect(g); g.connect(impactBus);
      osc.start(t); osc.stop(t + 1.4);
      cosmicAmbient.nodes.push(osc, g);
    }

    // --- Mid body: filtered noise 900 → 150 Hz, 0.45s ---
    {
      const dur = 0.45;
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = 0.8;
      bp.frequency.setValueAtTime(900, t);
      bp.frequency.exponentialRampToValueAtTime(150, t + 0.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.38, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      const wet = ctx.createGain(); wet.gain.value = 0.7;
      src.connect(bp); bp.connect(g);
      g.connect(impactBus);
      g.connect(wet); wet.connect(cosmicAmbient.revInput);
      src.start(t);
      cosmicAmbient.nodes.push(src, bp, g, wet);
    }

    // --- Hi transient: 2.5+ kHz noise snap, 80ms ---
    {
      const dur = 0.10;
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 2500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.28, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      const wet = ctx.createGain(); wet.gain.value = 0.4;
      src.connect(hp); hp.connect(g);
      g.connect(impactBus);
      g.connect(wet); wet.connect(cosmicAmbient.revInput);
      src.start(t);
      cosmicAmbient.nodes.push(src, hp, g, wet);
    }

    // --- FM tonal: gives impact PITCH, not just noise ---
    {
      const car = ctx.createOscillator(); car.type = 'sine'; car.frequency.value = 220;
      const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = 440;
      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(800, t);
      modGain.gain.exponentialRampToValueAtTime(20, t + 0.18);
      mod.connect(modGain); modGain.connect(car.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
      const wet = ctx.createGain(); wet.gain.value = 0.9;
      car.connect(g);
      g.connect(impactBus);
      g.connect(wet); wet.connect(cosmicAmbient.revInput);
      car.start(t); mod.start(t);
      car.stop(t + 0.55); mod.stop(t + 0.55);
      cosmicAmbient.nodes.push(car, mod, modGain, g, wet);
    }

    // --- Roar: broadband tail 800 → 40 Hz, 2.5s ---
    {
      const dur = 2.5;
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(800, t);
      bp.frequency.exponentialRampToValueAtTime(40, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.20, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const wet = ctx.createGain(); wet.gain.value = 0.8;
      src.connect(bp); bp.connect(g);
      g.connect(impactBus);
      g.connect(wet); wet.connect(cosmicAmbient.revInput);
      src.start(t);
      cosmicAmbient.nodes.push(src, bp, g, wet);
    }
  }

  /* Entry point — schedules the entire 12.6s sequence in one call. */
  function startCosmicBigBang() {
    if (!deckAudioCtx || cosmicAmbient.active) return;
    cosmicAmbient.active = true;
    const ctx = deckAudioCtx;
    const t0 = ctx.currentTime;

    _buildAmbientBuses(ctx, t0);
    _buildCosmicBed(ctx, t0);
    _scheduleRadialPulse(ctx, t0);
    _scheduleTensionRiser(ctx, t0);
    _scheduleShimmerBell(ctx, t0);
    _scheduleReverseSwell(ctx, t0);
    _scheduleImpactDuck(ctx, t0);
    _scheduleBigBangImpact(ctx, t0);
  }

  function stopCosmicBigBang(fadeOutSec = AMBIENT_RELEASE_DURATION_SEC) {
    if (!deckAudioCtx || !cosmicAmbient.active) return;
    const ctx = deckAudioCtx;
    const now = ctx.currentTime;
    if (cosmicAmbient.masterGain) {
      const g = cosmicAmbient.masterGain.gain;
      const curVal = g.value;
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.max(curVal, 0.0001), now);
      g.exponentialRampToValueAtTime(0.0001, now + fadeOutSec);
    }
    if (cosmicAmbient.cleanupTimer) clearTimeout(cosmicAmbient.cleanupTimer);
    cosmicAmbient.cleanupTimer = setTimeout(() => {
      cosmicAmbient.nodes.forEach((n) => {
        try { n.stop && n.stop(); } catch (e) {}
        try { n.disconnect && n.disconnect(); } catch (e) {}
      });
      cosmicAmbient.nodes = [];
      cosmicAmbient.masterGain = null;
      cosmicAmbient.duckGain = null;
      cosmicAmbient.dryBus = null;
      cosmicAmbient.revInput = null;
      cosmicAmbient.active = false;
    }, Math.ceil((fadeOutSec + 0.3) * 1000));
  }

  /* ───────────────────────────── status dot UI ─────────────────── */

  function injectStatusUI() {
    if (document.getElementById('remote-dot-css')) return;
    const style = document.createElement('style');
    style.id = 'remote-dot-css';
    style.textContent = `
      #remote-dot {
        position: fixed; bottom: 14px; right: 14px;
        width: 9px; height: 9px; border-radius: 50%;
        background: rgba(255,255,255,0.25);
        z-index: 10200;
        pointer-events: none;
        transition: background 300ms, box-shadow 300ms;
      }
      #remote-dot.ready      { background: rgba(180,180,180,0.55); }
      #remote-dot.connected  {
        background: var(--accent, #c46e8f);
        box-shadow: 0 0 10px var(--accent, #c46e8f);
        animation: remoteDot 1.8s ease-in-out infinite;
      }
      #remote-dot.busy       { background: #c9a227; }
      #remote-dot.error      { background: #c23b3b; }
      @keyframes remoteDot {
        0%, 100% { opacity: 0.8; transform: scale(1); }
        50%      { opacity: 1;   transform: scale(1.25); }
      }
      @media print { #remote-dot { display: none !important; } }
    `;
    document.head.appendChild(style);

    const dot = document.createElement('div');
    dot.id = 'remote-dot';
    dot.title = 'Phone remote: initializing…';
    document.body.appendChild(dot);
  }

  function setStatus(state) {
    const dot = document.getElementById('remote-dot');
    if (!dot) return;
    dot.className = state;
    dot.title = {
      ready:     'Phone remote · ready (waiting for phone)',
      connected: 'Phone remote · connected',
      busy:      'Phone remote · room busy, retrying…',
      error:     'Phone remote · connection error',
    }[state] || 'Phone remote';
  }

  /* ───────────────────────────── peer lifecycle ─────────────────── */

  function loadScript(src, integrity) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      if (integrity) {
        s.integrity = integrity;
        s.crossOrigin = 'anonymous';
      }
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  /* PeerJS 1.5.5 SRI hash — must match remote.html's integrity attr.
     Regenerate if pinning a different PeerJS version:
       curl -s https://unpkg.com/peerjs@X.Y.Z/dist/peerjs.min.js \
         | openssl dgst -sha384 -binary | openssl base64 -A */
  const PEERJS_SRC = 'https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js';
  const PEERJS_SRI = 'sha384-x0YgkOr/3UOZP2CRDxGW9e0Q+2Qjyr3uJrm4xU32Y7ZCNAo7Cc7bjhrZMi/dwczu';

  async function startPeer() {
    if (peerReady) return;
    if (!window.Peer) {
      try {
        await loadScript(PEERJS_SRC, PEERJS_SRI);
      } catch (e) {
        setStatus('error');
        console.warn('[remote] PeerJS failed to load', e);
        return;
      }
    }
    /* ICE servers — see remote.js for rationale. Must match on both
     * sides or the relay candidate won't negotiate. */
    peer = new window.Peer(PEER_ID, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject',
          },
          {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject',
          },
          {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject',
          },
        ],
      },
    });

    peer.on('open', (id) => {
      peerReady = true;
      setStatus('ready');
      console.log('[remote] Deck peer ready as', id);
    });

    peer.on('connection', (conn) => {
      conns.add(conn);
      conn.on('open', () => {
        setStatus('connected');
        sendState();
      });
      conn.on('data', (msg) => handleCommand(msg));
      conn.on('close', () => {
        conns.delete(conn);
        setStatus(conns.size === 0 ? 'ready' : 'connected');
      });
      conn.on('error', (err) => {
        console.warn('[remote] connection error', err);
      });
    });

    peer.on('error', (err) => {
      console.warn('[remote] peer error', err && err.type, err);
      if (err && err.type === 'unavailable-id') {
        // Another copy of this deck (recently-refreshed tab, maybe)
        // still holds the ID on the broker. Wait for its session to
        // expire, then retry.
        setStatus('busy');
        peerReady = false;
        try { peer && peer.destroy(); } catch (e) {}
        peer = null;
        setTimeout(startPeer, 4000);
      } else {
        setStatus('error');
      }
    });

    peer.on('disconnected', () => {
      // Broker disconnected us but the peer object is still usable.
      // peer.reconnect() re-opens the signaling socket with the same ID.
      console.log('[remote] broker disconnected, reconnecting…');
      try { peer.reconnect(); } catch (e) {}
    });
  }

  /* ───────────────────────────── command handling ───────────────── */

  function handleCommand(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.action) {
      case 'next': deck.next && deck.next(); break;
      case 'prev': deck.prev && deck.prev(); break;
      case 'home': deck.reset && deck.reset(); break;
      case 'end':  deck.goTo && deck.goTo(deck.length - 1); break;
      case 'goto':
        if (typeof msg.index === 'number' && deck.goTo) deck.goTo(msg.index);
        break;
      case 'hello': sendState(); break;

      // Intro START — fire the cosmic-intro tension/release sequence
      // and delay the scatterboard transition until after universe
      // eruption + settle beat. Pacing grid (must match SlideIntro's
      // state machine in deck.jsx and aurora transitions in styles.css):
      //
      //   0.00 -  3.50s  tensioning   (pulse wave 0.8 → 2 Hz)
      //   3.50 -  6.00s  intensify    (pulse 2 → 18 Hz, past threshold)
      //   6.00 -  6.35s  implode      (snappier 0.35s, particles converge)
      //   6.35 -  6.45s  held         (0.10s singularity — flash beat only)
      //   6.45 -  6.70s  flash        (white-out; particles released)
      //   6.70 -  7.80s  ejecta-early (1.1s, particles expand in vacuum)
      //   7.80 - 10.50s  erupt        (aurora materialises WHILE outer
      //                                particles still finish their arc —
      //                                1.1s overlap with ejecta trailing)
      //  10.50 - 10.80s  settled      (brief hold before slide enters)
      //  10.80 - 12.60s  enter        (deck.next() fires; slow 1.8s enter)
      //
      // Total cosmic-intro budget: 12.6 seconds (under the 20s cap).
      case 'start': {
        // Only valid when we're on the intro (don't misfire from other slides)
        const active = document.querySelector('deck-stage > section[data-deck-active]');
        const onIntro = active?.getAttribute('data-label') === 'Intro';
        if (!onIntro) { deck.next && deck.next(); break; }

        /* Full cinematic sequence — all layers scheduled inside
         * startCosmicBigBang() relative to explode time. Release
         * begins at AMBIENT_RELEASE_AT_MS (deck.next fires). */
        if (deckAudioCtx) {
          startCosmicBigBang();
          setTimeout(() => stopCosmicBigBang(), AMBIENT_RELEASE_AT_MS);
        }

        window.dispatchEvent(new CustomEvent('deck-explode'));
        setTimeout(() => { deck.next && deck.next(); }, INTRO_EXPLODE_TO_NEXT_MS);
        break;
      }
    }
  }

  function broadcast(msg) {
    conns.forEach((c) => { try { c.open && c.send(msg); } catch (e) {} });
  }

  function sendState() {
    // Use deck's public getters rather than data-deck-active, which is
    // briefly stripped during scatterboard priming and would race here.
    const sections = [...document.querySelectorAll('deck-stage > section')];
    const idx = (typeof deck.index === 'number') ? deck.index : -1;
    const active = sections[idx];
    broadcast({
      type: 'state',
      index: idx,
      total: (typeof deck.length === 'number') ? deck.length : sections.length,
      label: active ? (active.getAttribute('data-label') || '') : '',
    });
  }

  deck.addEventListener('slidechange', () => sendState());

  /* ───────────────────────────── boot ───────────────────────────── */

  injectStatusUI();
  unlockDeckAudioOnce();
  startPeer();

  // Expose for debugging only.
  window.__deckRemote = {
    peerId: PEER_ID,
    connectionCount: () => conns.size,
    isReady: () => peerReady,
  };

  console.log('[remote] Auto-starting remote host, peerId =', PEER_ID);
})();
