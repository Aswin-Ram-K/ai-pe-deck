/* ═══════════════════════════════════════════════════════════════
 * Mobile remote client for the AI-PE deck.
 *
 * Static design — the peer ID is baked in (matches remote-host.js),
 * so this page just auto-connects as soon as it loads. Bookmark the
 * URL on your phone; no room code to type, no QR to scan.
 *
 * Flow:
 *   1. Open bookmarked URL.
 *   2. PeerJS loads, opens signaling socket, dials the deck's peer.
 *   3. If deck is open → 'Connected', shows current slide.
 *   4. If deck isn't open → 'Deck not open · retrying…', auto-retries
 *      until the deck comes up.
 * ═══════════════════════════════════════════════════════════════ */

(() => {
  const $ = (id) => document.getElementById(id);

  /* Must match PEER_ID in remote-host.js.
   * This is how the two sides find each other on the PeerJS broker. */
  const PEER_ID = 'ai-pe-deck-aswin-ram-k-ece563';

  let peer = null;
  let conn = null;
  let reconnectTimer = null;

  /* ───────────────────── UI helpers ─────────────────────────────── */

  function setStatus(text, connected) {
    $('status-text').textContent = text;
    document.body.classList.toggle('connected', !!connected);
  }

  function setSlide(index, total, label) {
    if (typeof index === 'number' && typeof total === 'number' && index >= 0) {
      if (label === 'Intro') {
        // Pre-show cover — display a different layout so the audience
        // doesn't see "00 / 14" on the presenter's wrist.
        $('slide-num').innerHTML = `<span class="intro-label">READY</span>`;
      } else {
        // index 1..13 when label is normal (s1..s13 after the intro).
        // Subtract the intro from total so we still show N / 13.
        $('slide-num').innerHTML =
          `${String(index).padStart(2, '0')}<span class="of"> / ${total - 1}</span>`;
      }
    }
    if (label !== undefined) {
      $('slide-label').textContent = label === 'Intro' ? 'Tap start to begin' : (label || '—');
    }
    // Toggle intro-mode on the phone UI — morphs Next button to START.
    const onIntro = label === 'Intro';
    document.body.classList.toggle('on-intro', onIntro);
    const btn = $('btn-next');
    if (btn) btn.innerHTML = onIntro ? '▶&nbsp;&nbsp;START' : 'Next&nbsp;&nbsp;▶';
  }

  /* ───────────────────── peer setup ─────────────────────────────── */

  function connect() {
    if (!window.Peer) {
      setStatus('PeerJS failed to load', false);
      return;
    }
    setStatus('Connecting…', false);

    // Random client-side ID (broker assigns it). We only care about
    // connecting TO the deck's fixed ID; our own id doesn't matter.
    peer = new window.Peer(undefined, { debug: 1 });

    peer.on('open', () => openConnection(PEER_ID));

    peer.on('error', (err) => {
      console.warn('[remote] peer error', err && err.type, err);
      // "peer-unavailable" means the deck isn't registered with the
      // broker yet (deck not open). We retry silently — normal state
      // when you open the phone before opening the deck.
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

    // 6s timeout — if the connection hasn't opened by then, the deck
    // likely isn't up yet. Close and schedule a retry.
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
        // Signaling socket may be closed; reconnect restores it.
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

  /* ───────────────────── button & gesture wiring ────────────────── */

  $('btn-next').addEventListener('click', () => {
    // On intro: send 'start' (triggers the star explosion + advance).
    // Otherwise: normal 'next'.
    const isIntro = document.body.classList.contains('on-intro');
    send({ action: isIntro ? 'start' : 'next' });
  });
  $('btn-prev').addEventListener('click', () => send({ action: 'prev' }));
  $('btn-home').addEventListener('click', () => send({ action: 'home' }));
  $('btn-end').addEventListener('click', () => send({ action: 'end' }));
  $('btn-rescan').addEventListener('click', () => {
    // Hard reset: tear down peer + reload. Useful if something's stuck.
    if (conn) { try { conn.close(); } catch (e) {} }
    if (peer) { try { peer.destroy(); } catch (e) {} }
    location.reload();
  });

  // Swipe navigation — horizontal swipes advance/back.
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
      send({ action: dx < 0 ? 'next' : 'prev' });
    }
    tx = 0; ty = 0;
  }, { passive: true });

  // Bluetooth-keyboard / desktop-testing fallbacks.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') send({ action: 'next' });
    else if (e.key === 'ArrowLeft') send({ action: 'prev' });
    else if (e.key === 'Home') send({ action: 'home' });
    else if (e.key === 'End') send({ action: 'end' });
  });

  /* ───────────────────── boot ───────────────────────────────────── */

  connect();
})();
