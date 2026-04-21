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
  startPeer();

  // Expose for debugging only.
  window.__deckRemote = {
    peerId: PEER_ID,
    connectionCount: () => conns.size,
    isReady: () => peerReady,
  };

  console.log('[remote] Auto-starting remote host, peerId =', PEER_ID);
})();
