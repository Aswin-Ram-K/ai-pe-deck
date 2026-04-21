/* ═══════════════════════════════════════════════════════════════
 * Mobile remote client for the AI-PE deck.
 *
 * Flow:
 *   1. Parse room code from URL hash (`#room=ABCDEF`) or prompt.
 *   2. Connect to the deck's PeerJS host with id
 *      `ai-pe-deck-${roomCode}`.
 *   3. Send {action: 'next'|'prev'|'home'|'end'|'goto'} on button taps.
 *   4. Receive {type: 'state', index, total, label} and update UI.
 *
 * No dependencies beyond PeerJS — no build step, no framework.
 * ═══════════════════════════════════════════════════════════════ */

(() => {
  const $ = (id) => document.getElementById(id);

  /* ───────────────────── state + UI ───────────────────────────────
   * Declared up front so functions further down can close over them
   * without hitting a `let`-TDZ error when called during the
   * bootstrapping step below. */
  let peer = null;
  let conn = null;
  let reconnectTimer = null;

  /* ───────────────────── room code resolution ───────────────────── */

  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  let ROOM = (hashParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (!ROOM) {
    showPairModal();
    $('pair-go').addEventListener('click', tryPairFromModal);
    $('pair-input').addEventListener('keyup', (e) => { if (e.key === 'Enter') tryPairFromModal(); });
  } else {
    connect();
  }

  function tryPairFromModal() {
    const v = $('pair-input').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (v.length < 3) return;
    ROOM = v;
    location.hash = 'room=' + ROOM;
    hidePairModal();
    connect();
  }
  function showPairModal() { $('pair-modal').classList.remove('hidden'); }
  function hidePairModal() { $('pair-modal').classList.add('hidden'); }

  function setStatus(text, connected) {
    $('status-text').textContent = text;
    document.body.classList.toggle('connected', !!connected);
  }

  function setSlide(index, total, label) {
    if (typeof index === 'number' && typeof total === 'number') {
      $('slide-num').innerHTML =
        `${String(index + 1).padStart(2, '0')}<span class="of"> / ${total}</span>`;
    }
    if (label !== undefined) $('slide-label').textContent = label || '—';
  }

  /* ───────────────────── peer setup ─────────────────────────────── */

  function connect() {
    $('room-id').textContent = ROOM;
    if (!window.Peer) {
      setStatus('PeerJS failed to load', false);
      return;
    }
    setStatus('Connecting…', false);
    // Random client-side ID (broker assigns if omitted).
    peer = new window.Peer(undefined, { debug: 1 });
    peer.on('open', () => {
      const hostId = 'ai-pe-deck-' + ROOM;
      openConnection(hostId);
    });
    peer.on('error', (err) => {
      console.warn('[remote] peer error', err && err.type, err);
      setStatus('Connection error', false);
      scheduleRetry();
    });
    peer.on('disconnected', () => {
      setStatus('Disconnected · retrying…', false);
      scheduleRetry();
    });
  }

  function openConnection(hostId) {
    try {
      conn = peer.connect(hostId, { reliable: true });
    } catch (e) {
      setStatus('Could not connect', false);
      scheduleRetry();
      return;
    }
    conn.on('open', () => {
      setStatus('Connected', true);
      send({ action: 'hello' });
    });
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'state') {
        setSlide(msg.index, msg.total, msg.label);
      }
    });
    conn.on('close', () => {
      setStatus('Deck disconnected', false);
      scheduleRetry();
    });
    conn.on('error', (err) => {
      console.warn('[remote] conn error', err);
      setStatus('Connection error', false);
    });
    // Give the connection 6s to open. If it doesn't, assume deck isn't paired.
    setTimeout(() => {
      if (conn && !conn.open) {
        setStatus('Deck not found · press C on deck', false);
        conn.close();
      }
    }, 6000);
  }

  function scheduleRetry() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (peer && !peer.destroyed) {
        try { peer.reconnect(); } catch (e) {}
        if (ROOM) openConnection('ai-pe-deck-' + ROOM);
      } else if (ROOM) {
        connect();
      }
    }, 2500);
  }

  function send(msg) {
    if (conn && conn.open) {
      conn.send(msg);
      // Haptic tap on iPhone (Safari) — not yet supported broadly
      // but free when it is. Silently no-ops otherwise.
      if (navigator.vibrate) navigator.vibrate(12);
    }
  }

  /* ───────────────────── button & gesture wiring ────────────────── */

  $('btn-next').addEventListener('click', () => send({ action: 'next' }));
  $('btn-prev').addEventListener('click', () => send({ action: 'prev' }));
  $('btn-home').addEventListener('click', () => send({ action: 'home' }));
  $('btn-end').addEventListener('click', () => send({ action: 'end' }));
  $('btn-rescan').addEventListener('click', () => {
    if (conn) { try { conn.close(); } catch {} }
    if (peer) { try { peer.destroy(); } catch {} }
    location.hash = '';
    location.reload();
  });

  // Swipe navigation — horizontal swipes on the main area advance.
  // Prev / next on screen still work; swipe is a complement.
  let tx = 0, ty = 0;
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    tx = e.touches[0].clientX;
    ty = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!tx) return;
    const dx = e.changedTouches[0].clientX - tx;
    const dy = e.changedTouches[0].clientY - ty;
    // Horizontal swipe, not vertical.
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      send({ action: dx < 0 ? 'next' : 'prev' });
    }
    tx = 0; ty = 0;
  }, { passive: true });

  // Volume buttons don't fire on mobile web, but these keyboard
  // codes let you test from a Bluetooth keyboard or desktop.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') send({ action: 'next' });
    else if (e.key === 'ArrowLeft') send({ action: 'prev' });
    else if (e.key === 'Home') send({ action: 'home' });
    else if (e.key === 'End') send({ action: 'end' });
  });
})();
