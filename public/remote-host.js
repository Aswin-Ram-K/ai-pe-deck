/* ═══════════════════════════════════════════════════════════════
 * Remote host — deck-side WebRTC peer that receives control
 * messages from the mobile remote page (public/remote.html).
 *
 * Pairing flow:
 *   1. User presses `C` on the deck (or clicks the tiny remote icon).
 *   2. Deck generates a 6-char room code, loads PeerJS lazily,
 *      connects to the PeerJS public broker with id
 *      `ai-pe-deck-${roomCode}`.
 *   3. Overlay appears showing a big QR code (pointing at
 *      https://…/remote.html#room=CODE) + the 6-char code as text.
 *   4. User scans with iPhone. Remote page auto-connects.
 *   5. Pressing `C` again (or Esc) hides the overlay; the peer
 *      connection stays open.
 *
 * Protocol (over the WebRTC DataChannel):
 *   Phone → Deck:   { action: 'next' | 'prev' | 'home' | 'end' | 'goto', index?: N }
 *   Deck  → Phone:  { type: 'state', index, total, label }
 * ═══════════════════════════════════════════════════════════════ */

(() => {
  const deck = document.querySelector('deck-stage');
  if (!deck) return;

  // 6-char code from a deliberately-unambiguous alphabet (no 0/O, 1/I).
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const ROOM = Array.from({ length: 6 }, () =>
    ALPHA[Math.floor(Math.random() * ALPHA.length)]
  ).join('');
  const PEER_ID = `ai-pe-deck-${ROOM}`;
  const REMOTE_URL =
    location.origin + location.pathname.replace(/\/[^/]*$/, '/') +
    'remote.html#room=' + ROOM;

  let peer = null;
  let peerReady = false;
  const conns = new Set();

  /* ───────────────────────────── Peer lifecycle ─────────────────── */

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function ensurePeer() {
    if (peerReady) return;
    if (!window.Peer) {
      await loadScript('https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js');
    }
    if (!window.qrcode) {
      // kazuhikoarase/qrcode-generator — stable pure-JS UMD. Exposes
      // `window.qrcode(typeNumber, errorCorrectionLevel)`. We render
      // by iterating `.isDark(r,c)` into canvas fills.
      await loadScript('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js');
    }
    peer = new window.Peer(PEER_ID, { debug: 1 });
    peer.on('open', (id) => {
      peerReady = true;
      setStatus('Waiting for phone…');
      console.log('[remote] Deck peer ready as', id);
    });
    peer.on('connection', (conn) => {
      conns.add(conn);
      conn.on('open', () => {
        setStatus('Phone connected');
        sendState();
      });
      conn.on('data', (msg) => handleCommand(msg));
      conn.on('close', () => {
        conns.delete(conn);
        if (conns.size === 0) setStatus('Phone disconnected');
      });
    });
    peer.on('error', (err) => {
      console.warn('[remote] peer error', err && err.type, err);
      if (err && err.type === 'unavailable-id') {
        // Same room code already taken on broker — regenerate.
        setStatus('Room code busy; retrying…');
      } else {
        setStatus('Connection error');
      }
    });
  }

  /* ───────────────────────────── Command handling ───────────────── */

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
    }
  }

  function broadcast(msg) {
    conns.forEach((c) => { try { c.open && c.send(msg); } catch (e) {} });
  }

  function sendState() {
    // Use deck's public getters rather than reading data-deck-active
    // from the DOM — during our scatterboard transition the priming
    // phase briefly strips that attribute (so the new slide can paint
    // before its animations start), and a race can report index=-1
    // mid-transition. deck.index stays correct throughout.
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

  // Broadcast state on every slide change so the phone display
  // stays in sync with keyboard navigation too.
  deck.addEventListener('slidechange', () => sendState());

  /* ───────────────────────────── Pairing overlay ─────────────────── */

  const OVERLAY_ID = 'remote-pairing';
  const STATUS_ID = 'remote-status';

  function css() {
    if (document.getElementById('remote-host-css')) return;
    const style = document.createElement('style');
    style.id = 'remote-host-css';
    style.textContent = `
      #${OVERLAY_ID} {
        position: fixed; inset: 0; z-index: 10500;
        background: rgba(5, 5, 17, 0.92);
        backdrop-filter: blur(18px);
        display: flex; align-items: center; justify-content: center;
        font-family: 'JetBrains Mono', ui-monospace, monospace;
        color: #f5f5f0;
        animation: rh-fade 200ms ease-out;
      }
      html[data-theme="light"] #${OVERLAY_ID} {
        background: rgba(255, 255, 255, 0.94);
        color: #0a0a1f;
      }
      @keyframes rh-fade { from { opacity: 0 } to { opacity: 1 } }
      #${OVERLAY_ID} .rh-panel {
        max-width: 720px; padding: 56px 64px;
        text-align: center;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(15,15,28,0.8);
        border-radius: 16px;
      }
      html[data-theme="light"] #${OVERLAY_ID} .rh-panel {
        background: rgba(255,255,255,0.85);
        border-color: rgba(0,0,0,0.1);
      }
      #${OVERLAY_ID} .rh-kicker {
        font-size: 13px; letter-spacing: 0.24em; text-transform: uppercase;
        color: var(--accent); opacity: 0.85;
        margin-bottom: 18px;
      }
      #${OVERLAY_ID} .rh-title {
        font-family: 'Fraunces', Georgia, serif;
        font-size: 40px; font-weight: 400; margin: 0 0 8px;
      }
      #${OVERLAY_ID} .rh-sub {
        font-size: 15px; opacity: 0.7; margin-bottom: 28px;
        line-height: 1.5;
      }
      #${OVERLAY_ID} canvas.rh-qr {
        display: block; margin: 0 auto 24px;
        padding: 18px; background: #fff;
        border-radius: 10px;
      }
      #${OVERLAY_ID} .rh-code {
        font-size: 36px; font-weight: 500;
        letter-spacing: 0.18em;
        color: var(--accent);
        margin-bottom: 8px;
      }
      #${OVERLAY_ID} .rh-url {
        font-size: 13px; opacity: 0.6;
        word-break: break-all;
        margin-bottom: 16px;
      }
      #${OVERLAY_ID} #${STATUS_ID} {
        display: inline-block;
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(255,255,255,0.08);
        font-size: 11px; letter-spacing: 0.16em;
        text-transform: uppercase;
      }
      #${OVERLAY_ID} .rh-dismiss {
        margin-top: 22px;
        font-size: 11px; letter-spacing: 0.14em;
        text-transform: uppercase; opacity: 0.5;
      }
      @media print { #${OVERLAY_ID} { display: none !important; } }
    `;
    document.head.appendChild(style);
  }

  function show() {
    css();
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) { overlay.style.display = 'flex'; return; }

    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = `
      <div class="rh-panel">
        <div class="rh-kicker">Phone remote · Pair</div>
        <h2 class="rh-title">Scan with your iPhone camera</h2>
        <div class="rh-sub">
          Opens the remote control page pre-paired to this deck.
          No app, no account. Tap next / prev on your phone; it just works.
        </div>
        <canvas class="rh-qr" id="rh-qr-canvas"></canvas>
        <div class="rh-code">${ROOM}</div>
        <div class="rh-url">${REMOTE_URL}</div>
        <div id="${STATUS_ID}">Connecting…</div>
        <div class="rh-dismiss">Press C or Esc to dismiss</div>
      </div>
    `;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) hide();
    });
    document.body.appendChild(overlay);

    // Render QR code onto the canvas
    ensurePeer().then(() => {
      const canvas = document.getElementById('rh-qr-canvas');
      if (!canvas || !window.qrcode) return;
      // typeNumber 0 = auto-pick smallest version that fits the data.
      // 'M' error-correction tolerates ~15% damage — good for a screen
      // scanned from a few feet away. 'L' would fit larger URLs but
      // scans worse.
      const qr = window.qrcode(0, 'M');
      qr.addData(REMOTE_URL);
      qr.make();
      const mods = qr.getModuleCount();      // number of cells per side
      const pxPerModule = 8;                 // cell size in CSS px
      const margin = 1;                      // quiet-zone cells
      const size = (mods + margin * 2) * pxPerModule;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = size + 'px';
      canvas.style.height = size + 'px';
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      // Quiet zone (white background).
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#0a0a1f';
      for (let r = 0; r < mods; r++) {
        for (let c = 0; c < mods; c++) {
          if (qr.isDark(r, c)) {
            ctx.fillRect(
              (c + margin) * pxPerModule,
              (r + margin) * pxPerModule,
              pxPerModule, pxPerModule
            );
          }
        }
      }
    });
  }

  function hide() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.style.display = 'none';
  }

  function setStatus(text) {
    const el = document.getElementById(STATUS_ID);
    if (el) el.textContent = text;
  }

  /* ───────────────────────────── Keybinding ─────────────────────── */

  window.addEventListener('keydown', (e) => {
    // Don't hijack when user's typing in a field.
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      const overlay = document.getElementById(OVERLAY_ID);
      if (overlay && overlay.style.display !== 'none') hide();
      else show();
    } else if (e.key === 'Escape') {
      hide();
    }
  });

  // Expose for debugging
  window.__deckRemote = {
    roomId: ROOM,
    show, hide,
    status: () => conns.size,
  };

  console.log(`[remote] Press C to pair a phone remote (room ${ROOM}).`);
})();
