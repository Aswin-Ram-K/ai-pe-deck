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

  /* Bumps per deploy so iOS Safari can't serve cached assets after
   * we ship a fix. Seen as ?v=<stamp> on remote.js + speaker-script.json. */
  const BUILD_VERSION = '20260421-abbr-legend';

  /* Total presentation budget used by the "Total" countdown in the
   * timer strip. Starts the moment the teleprompter lands on a
   * real slide for the first time (first non-Intro state message). */
  const TOTAL_PRESENTATION_MS = 17 * 60 * 1000;  // 17:00

  /* Teleprompter pacing knob. 1.0 = match the script's per-slide
   * time budgets exactly. >1 = slower scroll (teleprompter lingers);
   * <1 = faster. Adjust after seeing it on device. */
  const TELE_SPEED_MULTIPLIER = 1.0;

  /* Breather at the start of each slide — gives the presenter a
   * beat to catch the first paragraph visually before the scroll
   * accumulator starts advancing. Increase if they want more. */
  const BREATHER_MS = 1000;

  /* When the scroll accumulator reaches the *next* slide's offset
   * minus this margin, we stop advancing — the current slide's
   * content has fully scrolled through and we pause until the
   * presenter taps Next. */
  const END_OF_SLIDE_MARGIN_PX = 12;

  /* Debug overlay — enable by appending ?debug=1 to the URL. Shows
   * tele state (offsets, heights, started flag) on-device so you
   * can verify without a Mac-tethered DevTools session. */
  const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

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
    started: false,         // true once we've seen the first non-Intro landing
    rafId: null,
    /* ACCUMULATOR scroll model:
     *   currentOffsetPx advances by dt * pxPerSec every animation frame.
     *   On slide change, we jump currentOffsetPx to the new slide's
     *   offsetTop — no elapsed-time math that can race a leftover rAF. */
    currentOffsetPx: 0,     // current scroll position (px from top of column)
    lastFrameMs: 0,         // wall clock of last scrollTick call
    pxPerSec: 0,            // current scroll speed (derived from slide budget)
    scrollStartAtMs: 0,     // breather gate — accumulator won't advance before this wall-clock
    maxOffsetPx: 0,         // clamp — stop accumulator when currentOffsetPx reaches this
    /* PAUSE state — two independent flags so hold-to-pause and
     * button-pause compose naturally. ScrollTick stalls if either is true. */
    manualPause: false,     // touch-and-hold on teleprompter
    buttonPause: false,     // pause toggle button
    /* TIMER state — totalElapsedMs + slideElapsedMs accumulate while
     * not paused and the timer tick is running. slideBeepedOver
     * latches after the first overtime alert so we don't spam beeps. */
    totalElapsedMs: 0,
    slideElapsedMs: 0,
    slideDurationMs: 0,
    slideBeepedOver: false,
    lastTimerTickMs: 0,
    timerIntervalId: null,
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
      // Cache-bust so iOS Safari can't serve a stale JSON after we
      // ship new script content. Version stamp bumps per build.
      const resp = await fetch('speaker-script.json?v=' + BUILD_VERSION, { cache: 'no-cache' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      tele.script = await resp.json();
    } catch (e) {
      console.warn('[tele] script load failed', e);
      tele.script = { slides: [] };
    }
    renderScript();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    // NOTE: we do NOT measure offsets here. On fresh phone load
    // body.on-intro is true, which makes #controls-surface display:none,
    // and every descendant has offsetTop/offsetHeight === 0. Instead,
    // ensureMeasured() runs lazily in teleOnSlideChange the first time
    // State B becomes visible (non-Intro state message arrives).
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

  /* Returns true if the scroller is currently laid out (State B is
   * visible). Used as the gate for measureOffsets — measuring while
   * the ancestor is display:none gives zeros for everything. */
  function ensureMeasured() {
    const scroller = $('tele-scroller');
    if (!scroller) return false;
    const s1 = scroller.querySelector('section[data-slide="1"]');
    if (!s1 || s1.offsetHeight === 0) return false;
    measureOffsets();
    return tele.slideHeights[1] > 0;
  }

  function teleOnSlideChange(slideIndex) {
    if (!tele.script) return;

    // Lazy measurement: on fresh phone load, State B is hidden and
    // any earlier measurement would have captured offsetTop=0 and
    // offsetHeight=0 for every section. The FIRST time we're called
    // after State B becomes visible, we need to re-measure.
    if (!ensureMeasured()) {
      // Layout hasn't settled after display:none→flex yet. Retry on
      // the next frame — and once more if still not ready.
      requestAnimationFrame(() => {
        if (ensureMeasured()) return teleOnSlideChange(slideIndex);
        requestAnimationFrame(() => {
          if (ensureMeasured()) teleOnSlideChange(slideIndex);
        });
      });
      return;
    }

    if (!tele.started) {
      tele.started = true;
      document.body.classList.add('tele-started');
    }

    if (tele.currentIdx === slideIndex) return;  // no change
    tele.currentIdx = slideIndex;

    // Jump to the new slide's top and begin scrolling from there.
    // Order matters: snap FIRST so any in-flight rAF from the old
    // scrollTick sees currentOffsetPx at the new position; startScroll
    // cancels the old rAF and starts a fresh one with new pxPerSec.
    snapToSlide(slideIndex);
    startScroll(slideIndex);

    // Reset per-slide timer. Total timer keeps running across slides.
    const slide = tele.script.slides.find(s => s.index === slideIndex);
    const budget = (slide && typeof slide.timeBudgetSec === 'number')
      ? slide.timeBudgetSec : null;
    startTimers(budget);
  }

  function teleReset() {
    if (!tele.started) return;
    tele.started = false;
    tele.currentIdx = 0;
    tele.currentOffsetPx = 0;
    tele.totalElapsedMs = 0;
    tele.slideElapsedMs = 0;
    tele.slideBeepedOver = false;
    document.body.classList.remove('tele-started', 'slide-overtime', 'is-paused');
    stopScroll();
    stopTimers();
    $('total-timer-value').textContent = '—:—';
    $('slide-timer-value').textContent = '—:—';
    const scroller = $('tele-scroller');
    if (scroller) {
      scroller.classList.add('smooth');
      scroller.style.transform = 'translateY(0)';
    }
  }

  /* Instant jump to the top of a given slide. Uses .smooth
   * (transition:none) so there's no intermediate animation state
   * that could race the new scrollTick. Q: why not animate the
   * snap? A: animation intent is a behavioral smell here — the deck
   * itself fires the scatterboard transition, and layering two
   * concurrent animations on both screens reads as lag. One discrete
   * snap per Next-tap is the right UX. */
  function snapToSlide(slideIndex) {
    stopScroll();
    const off = tele.slideOffsets[slideIndex];
    if (typeof off !== 'number') return;  // measurement not ready
    tele.currentOffsetPx = off;
    const scroller = $('tele-scroller');
    if (!scroller) return;
    scroller.classList.add('smooth');
    scroller.style.transform = `translateY(-${off}px)`;
  }

  function startScroll(slideIndex) {
    stopScroll();
    const slide = tele.script.slides.find(s => s.index === slideIndex);
    const budget = (slide && typeof slide.timeBudgetSec === 'number')
      ? slide.timeBudgetSec : null;

    if (budget === null) {
      // Un-paced slide (e.g., Q&A). No auto-scroll; snap holds.
      tele.pxPerSec = 0;
      tele.maxOffsetPx = tele.currentOffsetPx;  // coherent phase reporting
      return;
    }

    const height = tele.slideHeights[slideIndex] || 400;
    tele.pxPerSec = height / (budget * TELE_SPEED_MULTIPLIER);

    // Stop accumulator when we reach the TOP of the next slide (minus a
    // small safety margin). For the last slide, fall back to this
    // slide's full height — there's no successor offset to clamp against.
    const thisOffset = tele.slideOffsets[slideIndex] ?? 0;
    const nextOffset = tele.slideOffsets[slideIndex + 1];
    tele.maxOffsetPx = (typeof nextOffset === 'number')
      ? nextOffset - END_OF_SLIDE_MARGIN_PX
      : thisOffset + height - END_OF_SLIDE_MARGIN_PX;

    // 1-second breather so the presenter can visually catch the first
    // paragraph before the accumulator starts advancing.
    tele.scrollStartAtMs = performance.now() + BREATHER_MS;
    tele.lastFrameMs = performance.now();
    tele.rafId = requestAnimationFrame(scrollTick);
  }

  function isPaused() {
    return tele.manualPause || tele.buttonPause;
  }

  function scrollTick() {
    const scroller = $('tele-scroller');
    if (!scroller || !tele.started) return;
    scroller.classList.add('smooth');
    const now = performance.now();

    // PAUSE gate — hold lastFrameMs steady so dt after unpause is tiny.
    if (isPaused()) {
      tele.lastFrameMs = now;
      tele.rafId = requestAnimationFrame(scrollTick);
      return;
    }

    // BREATHER gate — 1 s hold at slide start.
    if (now < tele.scrollStartAtMs) {
      tele.lastFrameMs = now;
      tele.rafId = requestAnimationFrame(scrollTick);
      return;
    }

    // If the user scrubbed past the current slide's end-clamp, don't
    // force them back — just hold. The deck advancing / next-state
    // will re-seed with a new maxOffsetPx.
    if (tele.currentOffsetPx >= tele.maxOffsetPx) return;

    // Cap dt at 100 ms — backgrounded-tab rAF pauses would otherwise
    // cause a visible scroll-leap on resume.
    const dt = Math.min((now - tele.lastFrameMs) / 1000, 0.1);
    tele.lastFrameMs = now;

    const next = Math.min(
      tele.currentOffsetPx + dt * tele.pxPerSec,
      tele.maxOffsetPx
    );
    tele.currentOffsetPx = next;
    scroller.style.transform = `translateY(-${next}px)`;

    // Reached end of slide → stop the rAF. A new startScroll (triggered
    // by the next state message) will resume from the new slide's start.
    // Timers keep running via their setInterval, independent of rAF.
    if (next >= tele.maxOffsetPx) return;
    tele.rafId = requestAnimationFrame(scrollTick);
  }

  /* ═══════════════════════════════════════════════════════════════
   * TIMERS — total + per-slide countdown
   *
   * Two reasons this uses setInterval instead of piggy-backing on
   * scrollTick's rAF:
   *   (1) Timers must keep counting at end-of-slide when scroll has
   *       stopped — so the overtime flash/beep triggers even while
   *       the presenter is lingering past budget.
   *   (2) 4 Hz updates are plenty for a "0:41"-resolution display,
   *       and costs nothing compared to 60 Hz rAF.
   * ═══════════════════════════════════════════════════════════════ */

  function startTimers(slideDurationSec) {
    tele.slideElapsedMs = 0;
    tele.slideDurationMs = (typeof slideDurationSec === 'number') ? slideDurationSec * 1000 : 0;
    tele.slideBeepedOver = false;
    document.body.classList.remove('slide-overtime');
    tele.lastTimerTickMs = performance.now();
    if (tele.timerIntervalId == null) {
      tele.timerIntervalId = setInterval(timerTick, 250);
      // Render once immediately so the display doesn't show "—:—" briefly.
      timerTick();
    }
  }

  function stopTimers() {
    if (tele.timerIntervalId != null) {
      clearInterval(tele.timerIntervalId);
      tele.timerIntervalId = null;
    }
  }

  function timerTick() {
    if (!tele.started) return;
    const now = performance.now();
    const dt = now - tele.lastTimerTickMs;
    tele.lastTimerTickMs = now;
    // Timers are INDEPENDENT of scroll pause — wall-clock accountability.
    // Once the presentation has started they advance every tick, whether
    // the user is holding/scrubbing or the pause button is engaged.
    tele.totalElapsedMs += dt;
    if (tele.slideDurationMs > 0) tele.slideElapsedMs += dt;
    renderTimers();
    // Overtime trigger — once per slide
    if (tele.slideDurationMs > 0 && !tele.slideBeepedOver) {
      if (tele.slideElapsedMs >= tele.slideDurationMs) {
        tele.slideBeepedOver = true;
        document.body.classList.add('slide-overtime');
        playOvertimeBeep();
      }
    }
  }

  function renderTimers() {
    const totalLeft = TOTAL_PRESENTATION_MS - tele.totalElapsedMs;
    $('total-timer-value').textContent = formatMs(totalLeft);
    if (tele.slideDurationMs > 0) {
      const slideLeft = tele.slideDurationMs - tele.slideElapsedMs;
      $('slide-timer-value').textContent = formatMs(slideLeft);
    } else {
      $('slide-timer-value').textContent = '—:—';
    }
  }

  function formatMs(ms) {
    const neg = ms < 0;
    let s = Math.floor(Math.abs(ms) / 1000);
    const m = Math.floor(s / 60);
    s = s % 60;
    const mm = String(m).padStart(1, '0');
    const ss = String(s).padStart(2, '0');
    return (neg ? '-' : '') + mm + ':' + ss;
  }

  function playOvertimeBeep() {
    if (!audioCtx) {
      // User hasn't tapped BIG BANG yet → no audio context. Silent
      // alert (flash still fires). Acceptable because overtime can
      // only happen after a slide has actually started, which means
      // the audio ctx was created during countdown.
      return;
    }
    // Higher + longer than countdown ticks so it's distinctive.
    playTone(1100, 0.45);
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

  /* ═══════════════════════════════════════════════════════════════
   * SCROLL PAUSE + SCRUB
   *
   * Touch on the teleprompter both pauses auto-scroll AND lets the
   * user scrub by dragging:
   *   touchstart  → capture {startY, startOffset}; manualPause=true
   *   touchmove   → currentOffsetPx = startOffset + (startY - currY)
   *                 (drag up = forward, drag down = backward)
   *   touchend    → manualPause=false; auto-scroll resumes from
   *                 wherever currentOffsetPx landed
   * Button pause is separate/sticky.
   *
   * Timers are NOT affected by either — they tick regardless.
   * ═══════════════════════════════════════════════════════════════ */

  function syncPausedClass() {
    document.body.classList.toggle('is-paused', tele.manualPause || tele.buttonPause);
  }

  function getMaxScrubOffsetPx() {
    // Max scrollable = end of last slide's content. Let the user
    // scrub to the very end of the script, not just the next-slide
    // clamp that auto-scroll uses.
    const scroller = $('tele-scroller');
    if (!scroller) return 0;
    const last = scroller.querySelector('section:last-child');
    if (!last) return scroller.offsetHeight;
    return last.offsetTop + last.offsetHeight;
  }

  let scrub = null;  // { startY, startOffset }

  function applyScrubTransform(offset) {
    const scroller = $('tele-scroller');
    if (!scroller) return;
    scroller.classList.add('smooth');
    scroller.style.transform = `translateY(-${offset}px)`;
  }

  const onHoldStart = (e) => {
    const p = e.touches ? e.touches[0] : e;
    if (!p) return;
    scrub = { startY: p.clientY, startOffset: tele.currentOffsetPx };
    tele.manualPause = true;
    syncPausedClass();
  };

  const onHoldMove = (e) => {
    if (!scrub) return;
    const p = e.touches ? e.touches[0] : e;
    if (!p) return;
    // Finger up → currentY < startY → dy positive → offset increases
    const dy = scrub.startY - p.clientY;
    let next = scrub.startOffset + dy;
    next = Math.max(0, Math.min(next, getMaxScrubOffsetPx()));
    tele.currentOffsetPx = next;
    applyScrubTransform(next);
  };

  const onHoldEnd = () => {
    if (scrub) scrub = null;
    tele.manualPause = false;
    syncPausedClass();
    // Re-seed lastFrameMs so the resumed scroll doesn't suddenly jump
    // by whatever dt accumulated during the scrub.
    tele.lastFrameMs = performance.now();
  };

  const teleEl = $('teleprompter');
  teleEl.addEventListener('touchstart',  onHoldStart, { passive: true });
  teleEl.addEventListener('touchmove',   onHoldMove,  { passive: true });
  teleEl.addEventListener('touchend',    onHoldEnd,   { passive: true });
  teleEl.addEventListener('touchcancel', onHoldEnd,   { passive: true });
  // Desktop fallbacks for MCP testing
  teleEl.addEventListener('mousedown',  onHoldStart);
  teleEl.addEventListener('mousemove',  (e) => { if (e.buttons) onHoldMove(e); });
  teleEl.addEventListener('mouseup',    onHoldEnd);
  teleEl.addEventListener('mouseleave', onHoldEnd);

  // Pause button for longer pauses — sticky toggle.
  $('btn-pause').addEventListener('click', (e) => {
    e.stopPropagation();
    tele.buttonPause = !tele.buttonPause;
    syncPausedClass();
    const btn = $('btn-pause');
    btn.textContent = tele.buttonPause ? '▶' : '⏸';
    btn.setAttribute('aria-pressed', String(tele.buttonPause));
    // Re-seed lastFrameMs on resume so we don't leap.
    if (!tele.buttonPause) tele.lastFrameMs = performance.now();
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

  /* ───────────────────── debug overlay ─────────────────────────── */

  function updateDebugPanel() {
    const el = $('debug-content');
    if (!el) return;
    const now = performance.now();
    let phase;
    if (!tele.started) phase = 'idle';
    else if (now < tele.scrollStartAtMs) phase = 'breathing';
    else if (tele.currentOffsetPx >= tele.maxOffsetPx) phase = 'end-reached (paused)';
    else phase = 'scrolling';

    el.textContent = JSON.stringify({
      build: BUILD_VERSION,
      bodyClasses: document.body.className,
      tele_phase: phase,
      tele_currentIdx: tele.currentIdx,
      tele_currentOffsetPx: Number(tele.currentOffsetPx?.toFixed?.(1) ?? 0),
      tele_maxOffsetPx: Number(tele.maxOffsetPx?.toFixed?.(1) ?? 0),
      tele_pxPerSec: Number(tele.pxPerSec?.toFixed?.(2) ?? 0),
      tele_manualPause: tele.manualPause,
      tele_buttonPause: tele.buttonPause,
      timer_totalLeft: formatMs(TOTAL_PRESENTATION_MS - tele.totalElapsedMs),
      timer_slideLeft: tele.slideDurationMs > 0
        ? formatMs(tele.slideDurationMs - tele.slideElapsedMs)
        : '—:—',
      timer_slideBeepedOver: tele.slideBeepedOver,
      tele_scriptSlides: tele.script?.slides?.length ?? null,
      countdown_active: countdown.active,
      viewport: window.innerWidth + 'x' + window.innerHeight,
    }, null, 2);
  }

  if (DEBUG) {
    document.body.classList.add('debug-on');
    setInterval(updateDebugPanel, 400);
    // Debug-only test hook: lets tests (or devtools console) simulate
    // an incoming state message without needing a real deck peer.
    window.__teleTestSetSlide = setSlide;
  }

  /* ───────────────────── boot ───────────────────────────────────── */

  loadScript();
  connect();
})();
