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

/* Cosmic-ambient pacing (deck-side audio bed synced to the visual
 * state machine in SlideIntro). Times are seconds relative to the
 * explode moment (AudioContext.currentTime basis).
 *   • fade-in covers the 3.5s tensioning phase
 *   • shimmer bell starts 0.5s before the flash for anticipation
 *   • whoosh hits ON the flash frame (t = 6.45)
 *   • release begins as deck.next() fires at 10.80s, 1.8s fall
 *     covers the slide 1 scatterboard enter (ends at 12.60s)
 */
const AMBIENT_FADE_IN_SEC          = 3.0;
const AMBIENT_SHIMMER_SEC          = 5.95;
const AMBIENT_WHOOSH_SEC           = 6.45;
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
  const PEER_ID = 'ai-pe-deck-aswin-ram-k-ece563';

  let peer = null;
  let peerReady = false;
  const conns = new Set();

  /* ─── Cosmic-ambient audio (deck-side, classroom speakers) ─────────
   * AudioContext can't be opened until a user gesture. We listen
   * once on pointer/key/touch and lazily create the ctx. Presenter
   * will typically click or press a key on the deck window (enter
   * fullscreen, focus, etc.) before tapping BIG BANG on the phone.
   * If no gesture has occurred by the time 'start' arrives, the
   * visual cosmic still runs — only the ambient is silent. */
  let deckAudioCtx = null;
  const cosmicAmbient = {
    active: false,
    masterGain: null,
    dryBus: null,
    revInput: null,
    nodes: [],           // oscillators + LFOs held for cleanup
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

  /* Ethereal bed — sub drone (A1) + pad chord (A3/E4/A4 detuned sines,
   * 0.15Hz breathing) + dual-delay "space" reverb. Layers build over
   * AMBIENT_FADE_IN_SEC so the audio rises under the cosmic tensioning
   * phase rather than slamming in at zero. */
  function startCosmicAmbient() {
    if (!deckAudioCtx || cosmicAmbient.active) return;
    cosmicAmbient.active = true;

    const ctx = deckAudioCtx;
    const now = ctx.currentTime;
    const SUSTAIN_GAIN = 0.26;  // classroom speakers; leaves headroom under presenter's voice

    // Master bus — soft exponential fade-in
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(SUSTAIN_GAIN, now + AMBIENT_FADE_IN_SEC);
    master.connect(ctx.destination);

    // Parallel dry + wet buses
    const dryBus = ctx.createGain(); dryBus.gain.value = 1.0; dryBus.connect(master);
    const wetBus = ctx.createGain(); wetBus.gain.value = 0.40; wetBus.connect(master);

    // Cheap dual-delay space reverb (two prime-ish taps, lowpassed feedback)
    const revInput = ctx.createGain();
    const d1 = ctx.createDelay(1.0); d1.delayTime.value = 0.137;
    const d2 = ctx.createDelay(1.0); d2.delayTime.value = 0.197;
    const fbLP = ctx.createBiquadFilter();
    fbLP.type = 'lowpass'; fbLP.frequency.value = 2600;
    const fb1 = ctx.createGain(); fb1.gain.value = 0.44;
    const fb2 = ctx.createGain(); fb2.gain.value = 0.44;
    revInput.connect(d1); revInput.connect(d2);
    d1.connect(fb1); fb1.connect(fbLP); fbLP.connect(d1);
    d2.connect(fb2); fb2.connect(fbLP); fbLP.connect(d2);
    d1.connect(wetBus); d2.connect(wetBus);

    // ── Layer 1: Sub drone — A1 saw pair (55, 55.5 Hz), lowpassed ──
    const subLP = ctx.createBiquadFilter();
    subLP.type = 'lowpass'; subLP.frequency.value = 180; subLP.Q.value = 0.5;
    const subSum = ctx.createGain(); subSum.gain.value = 0.55;
    subLP.connect(subSum); subSum.connect(dryBus);  // sub stays dry — reverb muddies lows
    [55.0, 55.5].forEach((hz) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = hz;
      osc.connect(subLP);
      osc.start(now);
      cosmicAmbient.nodes.push(osc);
    });

    // ── Layer 2: Pad — A3/E4/A4 detuned sine cluster with 0.15Hz LFO ──
    const padSum = ctx.createGain(); padSum.gain.value = 0.22;
    const padDry = ctx.createGain(); padDry.gain.value = 0.55;
    const padWet = ctx.createGain(); padWet.gain.value = 0.90;
    padSum.connect(padDry); padSum.connect(padWet);
    padDry.connect(dryBus);
    padWet.connect(revInput);
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
      osc.start(now);
      cosmicAmbient.nodes.push(osc);
    });
    // LFO → padSum.gain ("breathing")
    const lfo = ctx.createOscillator();
    const lfoAmt = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.15;
    lfoAmt.gain.value = 0.06;
    lfo.connect(lfoAmt); lfoAmt.connect(padSum.gain);
    lfo.start(now);
    cosmicAmbient.nodes.push(lfo);

    cosmicAmbient.masterGain = master;
    cosmicAmbient.dryBus = dryBus;
    cosmicAmbient.revInput = revInput;
  }

  /* A6 shimmer bell — 0.45s swell, 0.45s release. Fires 0.5s
   * before the visual flash so the ear anticipates the peak. */
  function scheduleCosmicShimmer(atCtxTime) {
    if (!deckAudioCtx || !cosmicAmbient.revInput) return;
    const ctx = deckAudioCtx;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    const dryAmt = ctx.createGain(); dryAmt.gain.value = 0.35;
    const wetAmt = ctx.createGain(); wetAmt.gain.value = 0.80;
    osc.type = 'sine';
    osc.frequency.value = 1760;  // A6
    osc.connect(g);
    g.connect(dryAmt); dryAmt.connect(cosmicAmbient.dryBus);
    g.connect(wetAmt); wetAmt.connect(cosmicAmbient.revInput);
    g.gain.setValueAtTime(0.0001, atCtxTime);
    g.gain.exponentialRampToValueAtTime(0.11, atCtxTime + 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, atCtxTime + 0.90);
    osc.start(atCtxTime); osc.stop(atCtxTime + 0.95);
  }

  /* Flash whoosh — filtered-noise burst, bandpass swept 400→4000Hz
   * over 0.85s with fast-attack / exp-decay gain. Impact hit at
   * the moment of the visual white-out. */
  function scheduleCosmicWhoosh(atCtxTime) {
    if (!deckAudioCtx) return;
    const ctx = deckAudioCtx;
    const dur = 0.85;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(400, atCtxTime);
    bp.frequency.exponentialRampToValueAtTime(4000, atCtxTime + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, atCtxTime);
    g.gain.exponentialRampToValueAtTime(0.38, atCtxTime + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, atCtxTime + dur);

    const dryAmt = ctx.createGain(); dryAmt.gain.value = 0.65;
    const wetAmt = ctx.createGain(); wetAmt.gain.value = 0.55;

    src.connect(bp); bp.connect(g);
    g.connect(dryAmt); g.connect(wetAmt);
    dryAmt.connect(cosmicAmbient.dryBus || ctx.destination);
    wetAmt.connect(cosmicAmbient.revInput || ctx.destination);
    src.start(atCtxTime);
  }

  function stopCosmicAmbient(fadeOutSec = AMBIENT_RELEASE_DURATION_SEC) {
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
      cosmicAmbient.dryBus = null;
      cosmicAmbient.revInput = null;
      cosmicAmbient.active = false;
    }, Math.ceil((fadeOutSec + 0.2) * 1000));
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
    peer = new window.Peer(PEER_ID, { debug: 1 });

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

        /* Cosmic-ambient bed — synced to the visual phase map. Bed
         * begins now (fades in under tensioning); shimmer bell
         * anticipates the flash; whoosh hits on the flash frame;
         * release starts as deck.next() fires (slide 1 enter). */
        if (deckAudioCtx) {
          startCosmicAmbient();
          const t0 = deckAudioCtx.currentTime;
          scheduleCosmicShimmer(t0 + AMBIENT_SHIMMER_SEC);
          scheduleCosmicWhoosh(t0 + AMBIENT_WHOOSH_SEC);
          setTimeout(() => stopCosmicAmbient(), AMBIENT_RELEASE_AT_MS);
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
