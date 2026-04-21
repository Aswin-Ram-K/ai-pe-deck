/* ═══════════════════════════════════════════════════════════════
 * Mobile remote client for the AI-PE deck.
 *
 * Two UI states, auto-driven by the deck's `state` message:
 *
 *   State A — Big Bang launchpad
 *     Triggered when deck.label === "Intro".
 *     Shows only the circular BIG BANG button. Tapping sends
 *     {action: 'start'}, which the deck translates into the full
 *     cosmic-intro sequence (dispatch `deck-explode` + delayed
 *     deck.next() after ~10.8s).
 *
 *   State B — Control surface
 *     Triggered when deck.label !== "Intro".
 *     Shows compact slide number/label at top, Prev + secondary
 *     row (Home/End/Rescan) in the middle, and a huge full-width
 *     Next button filling the bottom 25% of the viewport for
 *     blind thumb operation during the presentation.
 *
 * Static peer ID — the remote auto-connects to the deck without
 * QR/pairing. If the deck isn't open, we retry silently until it
 * comes up.
 * ═══════════════════════════════════════════════════════════════ */

(() => {
  const $ = (id) => document.getElementById(id);

  /* Must match PEER_ID in remote-host.js. Long string acts as a
   * soft shared secret — PeerJS broker is signaling-only, no auth. */
  const PEER_ID = 'ai-pe-deck-aswin-ram-k-ece563';

  let peer = null;
  let conn = null;
  let reconnectTimer = null;

  /* ───────────────────── UI helpers ─────────────────────────────── */

  function setStatus(text, connected) {
    $('status-text').textContent = text;
    document.body.classList.toggle('connected', !!connected);
  }

  /**
   * Drive the remote's State A / State B from the deck's state message.
   * - label === 'Intro'   → State A (launchpad). slide-num is
   *                         irrelevant but we reset it so switching
   *                         back and forth is clean.
   * - label !== 'Intro'   → State B (controls). Show slide number
   *                         as index (1-indexed post-intro) out of
   *                         (total - 1), so the numbered sequence
   *                         reads as N / 13 regardless of how many
   *                         off-sequence pre-show slides exist.
   */
  function setSlide(index, total, label) {
    const onIntro = label === 'Intro';
    document.body.classList.toggle('on-intro', onIntro);

    if (!onIntro && typeof index === 'number' && typeof total === 'number') {
      $('slide-idx').textContent   = String(index).padStart(2, '0');
      $('slide-total').textContent = String(total - 1);  // subtract the intro
    }
    if (label !== undefined) {
      $('slide-label').textContent = onIntro ? '' : (label || '—');
    }
  }

  /* ───────────────────── peer setup ─────────────────────────────── */

  function connect() {
    if (!window.Peer) {
      setStatus('PeerJS failed to load', false);
      return;
    }
    setStatus('Connecting…', false);

    // Random client-side ID — we only need to connect TO the deck's
    // fixed ID; our own id doesn't matter.
    peer = new window.Peer(undefined, { debug: 1 });

    peer.on('open', () => openConnection(PEER_ID));

    peer.on('error', (err) => {
      console.warn('[remote] peer error', err && err.type, err);
      if (err && err.type === 'peer-unavailable') {
        setStatus('Deck not open · retrying…', false);
      } else {
        setStatus('Connection error · retrying…', false);
      }
      scheduleRetry();
    });

    peer.on('disconnected', () => {
      setStatus('Reconnecting…', false);
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
      if (msg.type === 'state') setSlide(msg.index, msg.total, msg.label);
    });
    conn.on('close', () => {
      setStatus('Deck closed · retrying…', false);
      scheduleRetry();
    });
    conn.on('error', (err) => {
      console.warn('[remote] conn error', err);
      setStatus('Connection error · retrying…', false);
      scheduleRetry();
    });

    // 6s timeout — if connection hasn't opened the deck likely
    // isn't up yet. Close and schedule a retry.
    setTimeout(() => {
      if (conn && !conn.open) {
        setStatus('Deck not open · retrying…', false);
        try { conn.close(); } catch (e) {}
        scheduleRetry();
      }
    }, 6000);
  }

  function scheduleRetry() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (peer && !peer.destroyed) {
        try { peer.reconnect(); } catch (e) {}
        openConnection(PEER_ID);
      } else {
        connect();
      }
    }, 3000);
  }

  function send(msg) {
    if (conn && conn.open) {
      conn.send(msg);
      // Haptic tap on iPhone when Safari enables it (no-op today).
      if (navigator.vibrate) navigator.vibrate(12);
    }
  }

  /* ───────────────────── button wiring ──────────────────────────── */

  // State A — Big Bang
  $('btn-bigbang').addEventListener('click', () => send({ action: 'start' }));

  // State B — standard controls
  $('btn-next').addEventListener('click', () => send({ action: 'next' }));
  $('btn-prev').addEventListener('click', () => send({ action: 'prev' }));
  $('btn-home').addEventListener('click', () => send({ action: 'home' }));
  $('btn-end').addEventListener('click',  () => send({ action: 'end' }));
  $('btn-rescan').addEventListener('click', () => {
    // Hard reset: tear down peer + reload. Useful if something's stuck.
    if (conn) { try { conn.close(); } catch (e) {} }
    if (peer) { try { peer.destroy(); } catch (e) {} }
    location.reload();
  });

  /* ───────────────────── gestures ───────────────────────────────── */

  // Swipe navigation — horizontal swipes advance/back. Works in both
  // states: on launchpad, a swipe-right acts like tapping BIG BANG.
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
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const forward = dx < 0;
      const onIntro = document.body.classList.contains('on-intro');
      if (forward) {
        send({ action: onIntro ? 'start' : 'next' });
      } else if (!onIntro) {
        send({ action: 'prev' });
      }
      // Backward swipe on intro is a no-op (nothing before intro).
    }
    tx = 0; ty = 0;
  }, { passive: true });

  // Bluetooth-keyboard / desktop-testing fallbacks.
  window.addEventListener('keydown', (e) => {
    const onIntro = document.body.classList.contains('on-intro');
    if (e.key === 'ArrowRight' || e.key === ' ') {
      send({ action: onIntro ? 'start' : 'next' });
    } else if (e.key === 'ArrowLeft' && !onIntro) {
      send({ action: 'prev' });
    } else if (e.key === 'Home') {
      send({ action: 'home' });
    } else if (e.key === 'End') {
      send({ action: 'end' });
    }
  });

  /* ───────────────────── boot ───────────────────────────────────── */

  connect();
})();
