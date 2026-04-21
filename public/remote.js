/* ═══════════════════════════════════════════════════════════════
 * Mobile remote for the AI-PE deck. Three UI states:
 *
 *   A — Big Bang launchpad (deck.label === 'Intro')
 *   C — 5-second countdown (after BIG BANG tap; audio+visual)
 *   B — Controls + teleprompter (deck off intro)
 *
 * State transitions are driven partly by local action (tap) and
 * partly by the `{type:'state', label}` messages from remote-host.
 * Local flag `.counting-down` takes priority during C so incoming
 * Intro state-messages don't kick us back to A mid-countdown.
 *
 * The teleprompter renders the full speaker script from
 * /speaker-script.json (built from AI-PE-Speaker-Script.docx),
 * starts scrolling only when the deck first lands on slide 1,
 * and snaps to the correct slide's baseline offset on manual
 * Next/Prev. Per-slide pacing uses the script's time budgets.
 * ═══════════════════════════════════════════════════════════════ */

(() => {
  const $ = (id) => document.getElementById(id);

  const PEER_ID = 'ai-pe-deck-aswin-ram-k-ece563';

  /* Teleprompter pacing knob. 1.0 = match the script's per-slide
   * time budgets exactly. >1 = slower scroll (teleprompter lingers);
   * <1 = faster. Adjust after seeing it on device. */
  const TELE_SPEED_MULTIPLIER = 1.0;

  /* Countdown length in seconds. 5 per spec. */
  const COUNTDOWN_SEC = 5;

  let peer = null;
  let conn = null;
  let reconnectTimer = null;

  const countdown = { active: false, intervalId: null };
  let audioCtx = null;

  const tele = {
    script: null,           // parsed speaker-script.json
    slideOffsets: [],       // index i → offsetTop of slide i's <section>
    slideHeights: [],       // index i → height of slide i's <section>
    currentIdx: 0,          // last slide index we snapped to
    started: false,         // true once we've seen the first slide-1 landing
    rafId: null,
    startTimeMs: 0,         // wall clock when the current slide's scroll began
    baselineOffsetPx: 0,    // scroll offset at startTimeMs
    pxPerSec: 0,            // derived from slide height / budget
  };

  /* ───────────────────── UI helpers ─────────────────────────────── */

  function setStatus(text, connected) {
    $('status-text').textContent = text;
    document.body.classList.toggle('connected', !!connected);
  }

  /* Drive State A / State B based on deck label. While counting-down,
   * we suppress transitions — the State C overlay sits on top. */
  function setSlide(index, total, label) {
    const onIntro = label === 'Intro';

    if (countdown.active) {
      if (!onIntro) {
        // Deck has advanced past intro → exit countdown, show State B
        exitCountdown();
      } else {
        return;  // stay in countdown
      }
    }

    document.body.classList.toggle('on-intro', onIntro);

    if (!onIntro && typeof index === 'number' && typeof total === 'number') {
      $('slide-idx').textContent   = String(index).padStart(2, '0');
      $('slide-total').textContent = String(total - 1);
      $('slide-label-mini').textContent = label || '';
      teleOnSlideChange(index);
    }
    if (onIntro) {
      $('slide-label-mini').textContent = '';
      teleReset();
    }
  }

  /* ───────────────────── peer setup ─────────────────────────────── */

  function connect() {
    if (!window.Peer) { setStatus('PeerJS failed to load', false); return; }
    setStatus('Connecting…', false);

    peer = new window.Peer(undefined, { debug: 1 });

    peer.on('open', () => openConnection(PEER_ID));
    peer.on('error', (err) => {
      console.warn('[remote] peer error', err && err.type, err);
      if (err && err.type === 'peer-unavailable') setStatus('Deck not open · retrying…', false);
      else setStatus('Connection error · retrying…', false);
      scheduleRetry();
    });
    peer.on('disconnected', () => { setStatus('Reconnecting…', false); scheduleRetry(); });
  }

  function openConnection(hostId) {
    try { conn = peer.connect(hostId, { reliable: true }); }
    catch (e) { setStatus('Could not connect', false); scheduleRetry(); return; }

    conn.on('open', () => { setStatus('Connected', true); send({ action: 'hello' }); });
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'state') setSlide(msg.index, msg.total, msg.label);
    });
    conn.on('close', () => { setStatus('Deck closed · retrying…', false); scheduleRetry(); });
    conn.on('error', (err) => { console.warn('[remote] conn error', err); setStatus('Connection error · retrying…', false); scheduleRetry(); });

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
      } else { connect(); }
    }, 3000);
  }

  function send(msg) {
    if (conn && conn.open) {
      conn.send(msg);
      if (navigator.vibrate) navigator.vibrate(12);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
   * STATE C — Countdown with voice + tone
   *
   * On BIG BANG tap:
   *   1. Unlock audio (AudioContext.resume + queue first utterance
   *      inside the tap handler — iOS requires both).
   *   2. Show overlay, tick from COUNTDOWN_SEC → 1 with voice + beep.
   *   3. At t=0, say "go", play a higher final tone, send
   *      {action:'start'} to deck. Remain in C until deck state
   *      reports label !== 'Intro'.
   * ═══════════════════════════════════════════════════════════════ */

  function enterCountdown() {
    if (countdown.active) return;
    countdown.active = true;
    document.body.classList.add('counting-down');

    unlockAudio();

    let n = COUNTDOWN_SEC;
    showCountdownNum(n);
    speakAndBeep(n);

    countdown.intervalId = setInterval(() => {
      n -= 1;
      if (n > 0) {
        showCountdownNum(n);
        speakAndBeep(n);
      } else {
        // t = 0 — fire the deck, announce GO, stop the interval
        clearInterval(countdown.intervalId);
        countdown.intervalId = null;
        showCountdownNum(0);
        speakAndBeep(0);
        send({ action: 'start' });
        // Stay in C. Exit when state message arrives with non-Intro label.
      }
    }, 1000);
  }

  function exitCountdown() {
    if (!countdown.active) return;
    countdown.active = false;
    if (countdown.intervalId) { clearInterval(countdown.intervalId); countdown.intervalId = null; }
    document.body.classList.remove('counting-down');
  }

  function showCountdownNum(n) {
    const el = $('countdown-num');
    // force restart of the pulse animation
    el.classList.remove('is-go');
    void el.offsetWidth;
    if (n === 0) {
      el.textContent = 'GO';
      el.classList.add('is-go');
    } else {
      el.textContent = String(n);
    }
    // Retrigger pulse
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  }

  function unlockAudio() {
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* noop */ }
    // iOS: speechSynthesis needs a gesture-scoped call before queued ones work.
    try {
      if (window.speechSynthesis) {
        const warm = new SpeechSynthesisUtterance(' ');
        warm.volume = 0;
        window.speechSynthesis.speak(warm);
      }
    } catch (e) { /* noop */ }
  }

  function speakAndBeep(n) {
    playTone(n === 0 ? 880 : 440, n === 0 ? 0.35 : 0.22);
    speak(n === 0 ? 'go' : numberWord(n));
  }

  function numberWord(n) {
    return { 5:'five', 4:'four', 3:'three', 2:'two', 1:'one' }[n] || String(n);
  }

  function playTone(hz, durSec) {
    if (!audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      const t = audioCtx.currentTime;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + durSec);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(t); osc.stop(t + durSec + 0.02);
    } catch (e) { /* noop */ }
  }

  function speak(text) {
    try {
      if (!window.speechSynthesis) return;
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05; u.pitch = 1.0; u.volume = 1.0;
      window.speechSynthesis.speak(u);
    } catch (e) { /* noop */ }
  }

  /* ═══════════════════════════════════════════════════════════════
   * TELEPROMPTER — scrolling speaker script
   *
   * - Render all 13 slide sections into #tele-scroller on load.
   * - After fonts/layout settle, measure each section's offsetTop.
   * - When deck first lands on slide 1, begin scroll animation;
   *   subsequent slide changes snap the baseline to that slide's
   *   start offset and reset the elapsed timer.
   * - Scroll speed per slide = slide height / (timeBudget * multiplier).
   *   This honors the script's author-intended pacing.
   * ═══════════════════════════════════════════════════════════════ */

  async function loadScript() {
    try {
      const resp = await fetch('speaker-script.json', { cache: 'no-cache' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      tele.script = await resp.json();
    } catch (e) {
      console.warn('[tele] script load failed', e);
      tele.script = { slides: [] };
    }
    renderScript();
    // Wait for fonts + layout before measuring
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    requestAnimationFrame(() => requestAnimationFrame(measureOffsets));
  }

  function renderScript() {
    const scroller = $('tele-scroller');
    if (!tele.script || !tele.script.slides) return;
    scroller.innerHTML = tele.script.slides.map(slideHTML).join('');
  }

  function slideHTML(s) {
    const hdr = `<h3>${String(s.index).padStart(2, '0')} · ${escapeHTML(s.title)}${s.timeBudgetSec ? ` · ${s.timeBudgetSec}s` : ''}</h3>`;
    const paras = (s.body || '').split(/\n\n+/).map(renderParagraph).join('');
    return `<section data-slide="${s.index}">${hdr}${paras}</section>`;
  }

  function renderParagraph(raw) {
    const text = raw.trim();
    if (!text) return '';
    // Stage directions: start with [ or wrapped in [ ... ]
    if (/^\[[^]*\]$/.test(text) || /^\[/.test(text)) {
      return `<p class="stage-dir">${escapeHTML(text)}</p>`;
    }
    // Blockquote (load-bearing lines)
    if (/^>\s/.test(text)) {
      return `<blockquote>${escapeHTML(text.replace(/^>\s*/, ''))}</blockquote>`;
    }
    // Callbacks (structural links across slides)
    if (/CALLBACK/i.test(text)) {
      return `<p class="callback">${escapeHTML(text)}</p>`;
    }
    // Default paragraph — line breaks within a paragraph preserved
    return `<p>${escapeHTML(text).replace(/\n/g, '<br>')}</p>`;
  }

  function escapeHTML(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function measureOffsets() {
    const scroller = $('tele-scroller');
    const sections = scroller.querySelectorAll('section[data-slide]');
    tele.slideOffsets = [];
    tele.slideHeights = [];
    sections.forEach((el) => {
      const idx = Number(el.dataset.slide);
      tele.slideOffsets[idx] = el.offsetTop;
      tele.slideHeights[idx] = el.offsetHeight;
    });
  }

  function teleOnSlideChange(slideIndex) {
    if (!tele.script || !tele.slideOffsets[slideIndex]) return;

    if (!tele.started) {
      // Start teleprompter on first non-Intro landing. The expected
      // flow is slide 1 (countdown → cosmic intro → slide 1 enters),
      // but if the remote reloads mid-presentation the deck may
      // report a later slide — start there rather than leaving the
      // presenter stuck on "Waiting for slide 1…".
      tele.started = true;
      document.body.classList.add('tele-started');
    }

    if (tele.currentIdx === slideIndex) return;  // no change
    tele.currentIdx = slideIndex;

    snapToSlide(slideIndex, /*animated*/ true);
    startScroll(slideIndex);
  }

  function teleReset() {
    // Only reset if we were past intro. If still on intro (first load), no-op.
    if (!tele.started) return;
    tele.started = false;
    tele.currentIdx = 0;
    document.body.classList.remove('tele-started');
    stopScroll();
    const scroller = $('tele-scroller');
    if (scroller) {
      scroller.classList.add('smooth');
      scroller.style.transform = 'translateY(0)';
      requestAnimationFrame(() => scroller.classList.remove('smooth'));
    }
  }

  function snapToSlide(slideIndex, animated) {
    const scroller = $('tele-scroller');
    if (!scroller) return;
    const off = tele.slideOffsets[slideIndex] || 0;
    tele.baselineOffsetPx = off;
    if (!animated) scroller.classList.add('smooth');
    else scroller.classList.add('jumping');
    scroller.style.transform = `translateY(-${off}px)`;
    // Remove transition helpers after frame
    requestAnimationFrame(() => {
      scroller.classList.remove('jumping');
      if (!animated) scroller.classList.remove('smooth');
    });
  }

  function startScroll(slideIndex) {
    stopScroll();
    const budget = tele.script.slides.find(s => s.index === slideIndex)?.timeBudgetSec || 75;
    const height = tele.slideHeights[slideIndex] || 400;
    tele.pxPerSec = height / (budget * TELE_SPEED_MULTIPLIER);
    tele.startTimeMs = performance.now();
    // let the snap animation land before starting smooth scroll
    setTimeout(() => { if (tele.currentIdx === slideIndex) scrollTick(); }, 420);
  }

  function scrollTick() {
    const scroller = $('tele-scroller');
    if (!scroller || !tele.started) return;
    scroller.classList.add('smooth');
    const elapsedSec = (performance.now() - tele.startTimeMs) / 1000;
    const offset = tele.baselineOffsetPx + elapsedSec * tele.pxPerSec;
    scroller.style.transform = `translateY(-${offset}px)`;
    tele.rafId = requestAnimationFrame(scrollTick);
  }

  function stopScroll() {
    if (tele.rafId) { cancelAnimationFrame(tele.rafId); tele.rafId = null; }
  }

  /* ───────────────────── button wiring ──────────────────────────── */

  $('btn-bigbang').addEventListener('click', () => {
    // Enter countdown FIRST (warms audio in the gesture scope),
    // then rely on countdown to fire {action:'start'} at t=0.
    enterCountdown();
  });

  $('btn-next').addEventListener('click', () => send({ action: 'next' }));
  $('btn-prev').addEventListener('click', () => send({ action: 'prev' }));
  $('btn-rescan').addEventListener('click', () => {
    if (conn) { try { conn.close(); } catch (e) {} }
    if (peer) { try { peer.destroy(); } catch (e) {} }
    location.reload();
  });

  /* ───────────────────── gestures ───────────────────────────────── */

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
      if (countdown.active) { /* swallow mid-countdown */ }
      else if (forward) send({ action: onIntro ? 'start' : 'next' });
      else if (!onIntro) send({ action: 'prev' });
    }
    tx = 0; ty = 0;
  }, { passive: true });

  window.addEventListener('keydown', (e) => {
    if (countdown.active) return;
    const onIntro = document.body.classList.contains('on-intro');
    if (e.key === 'ArrowRight' || e.key === ' ') {
      if (onIntro) enterCountdown();   // match BIG BANG semantics
      else send({ action: 'next' });
    } else if (e.key === 'ArrowLeft' && !onIntro) send({ action: 'prev' });
    else if (e.key === 'Home') send({ action: 'home' });
    else if (e.key === 'End')  send({ action: 'end' });
  });

  /* Re-measure on viewport resize (rotation, DevTools open) */
  window.addEventListener('resize', () => {
    if (!tele.script) return;
    measureOffsets();
    if (tele.started && tele.currentIdx) {
      snapToSlide(tele.currentIdx, /*animated*/ false);
      startScroll(tele.currentIdx);
    }
  });

  /* ───────────────────── boot ───────────────────────────────────── */

  loadScript();
  connect();
})();
