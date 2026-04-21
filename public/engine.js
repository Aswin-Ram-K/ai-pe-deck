/* ═══════════════════════════════════════════════════════════════
 * Deck Engine — animated background, reveal groups, voice control.
 *
 *   (a) PulsingGrid background   — canvas behind deck-stage
 *   (b) Reveal-group controller  — each slide has ordered reveal steps;
 *                                  space / click / voice advances
 *   (c) Voice controller         — Web Speech API, live transcript overlay,
 *                                  matches spoken phrases to triggers
 *   (d) Trigger phrases          — auto-extracted from speaker notes;
 *                                  rebuilt whenever notes or DOM structure
 *                                  changes (MutationObserver)
 *
 * All pieces are wired to the existing <deck-stage>'s `slidechange` event.
 * ═══════════════════════════════════════════════════════════════ */

(() => {
  const deck = document.querySelector('deck-stage');
  if (!deck) { console.warn('[engine] no deck-stage'); return; }

  /* ────────────────────────────────────────────────────────────
   * (a) PULSING GEOMETRIC GRID BACKGROUND
   * ──────────────────────────────────────────────────────────── */
  function installBackground(intensity = 0.25) {
    // Canvas fixed under everything.
    const canvas = document.createElement('canvas');
    canvas.id = 'bg-canvas';
    Object.assign(canvas.style, {
      position: 'fixed', inset: 0, zIndex: 0,
      pointerEvents: 'none', opacity: 1,
    });
    document.body.prepend(canvas);

    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.width  = innerWidth  * dpr;
      H = canvas.height = innerHeight * dpr;
      canvas.style.width  = innerWidth + 'px';
      canvas.style.height = innerHeight + 'px';
    };
    resize();
    addEventListener('resize', resize);

    // Read accent color at paint time so theme changes propagate.
    const readAccent = () => {
      const cs = getComputedStyle(document.documentElement);
      return (cs.getPropertyValue('--accent') || '#831843').trim();
    };

    // hex → rgb
    const hexToRgb = (hex) => {
      const h = hex.replace('#','');
      const s = h.length === 3 ? h.split('').map(c => c+c).join('') : h;
      return [
        parseInt(s.slice(0,2),16),
        parseInt(s.slice(2,4),16),
        parseInt(s.slice(4,6),16),
      ];
    };

    const gridSize = 64; // px (in CSS pixels) between dots
    let t0 = performance.now();

    const draw = () => {
      const t = (performance.now() - t0) / 1000;
      const [r, g, b] = hexToRgb(readAccent());
      const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
      ctx.clearRect(0, 0, W, H);

      const step = gridSize * dpr;
      const cols = Math.ceil(W / step) + 2;
      const rows = Math.ceil(H / step) + 2;

      // Two layered waves radiating from the center + a slow drift.
      const cx = W * 0.5, cy = H * 0.55;
      const maxR = Math.hypot(W, H) * 0.6;

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i * step;
          const y = j * step;
          const d = Math.hypot(x - cx, y - cy);
          const nd = d / maxR; // 0..1
          // Two sine waves of different periods
          const w1 = Math.sin(nd * 10 - t * 1.4);
          const w2 = Math.sin(nd * 20 - t * 0.6 + i * 0.3);
          const pulse = (w1 * 0.6 + w2 * 0.4 + 1) * 0.5; // 0..1

          // Base dot — very faint
          const baseAlpha = (isDark ? 0.08 : 0.12) * intensity * 4; // normalize
          const accentAlpha = pulse * 0.35 * intensity * 2;
          // dot radius scales slightly with pulse
          const rad = (1.1 + pulse * 1.4) * dpr;

          // Mix accent over base
          const base = isDark ? 235 : 40;
          const mixR = Math.round(base * (1 - pulse * 0.8) + r * pulse * 0.8);
          const mixG = Math.round(base * (1 - pulse * 0.8) + g * pulse * 0.8);
          const mixB = Math.round(base * (1 - pulse * 0.8) + b * pulse * 0.8);

          ctx.beginPath();
          ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${mixR},${mixG},${mixB},${baseAlpha + accentAlpha})`;
          ctx.fill();
        }
      }

      // Subtle connecting lines for nearest-neighbor pulses above threshold
      ctx.lineWidth = 1 * dpr;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i * step, y = j * step;
          const d = Math.hypot(x - cx, y - cy);
          const nd = d / maxR;
          const pulse = (Math.sin(nd * 10 - t * 1.4) + 1) * 0.5;
          if (pulse > 0.75) {
            const a = (pulse - 0.75) * 4 * 0.18 * intensity * 2;
            ctx.strokeStyle = `rgba(${r},${g},${b},${a})`;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + step, y);
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + step);
            ctx.stroke();
          }
        }
      }

      requestAnimationFrame(draw);
    };
    // Respect reduced motion — still paint, but freeze t.
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      requestAnimationFrame(draw);
    } else {
      draw();
    }
  }

  // Ensure deck-stage renders on top with a transparent inner bg
  // so the canvas shows through. deck-stage sets bg via its shadow DOM;
  // rather than piercing it, we position the canvas *behind* the whole
  // document and let the existing slide backgrounds do their thing —
  // but since slides paint their own --bg, we need them transparent.
  // We instead paint the background OVER the slide using mix-blend-mode.
  // Simpler: set the body background to the canvas, and make the
  // <deck-stage> shadow root background transparent via its `noscale`?
  // deck_stage.js uses background via shadow-DOM styles we can't touch.
  // Workaround: paint the canvas ABOVE deck-stage with very low opacity
  // and pointer-events:none. But slides already have their own color.
  // Best: leave canvas under, and add a CSS var that slides can use to
  // make their backgrounds translucent. We'll add a CSS override.
  const overrideCSS = document.createElement('style');
  overrideCSS.textContent = `
    /* Let the bg canvas show through deck-stage by pushing it above
       and using screen blend. Alternative: we inject a second canvas
       positioned ABOVE slide content at low opacity. */
    #bg-canvas-top {
      position: fixed; inset: 0; z-index: 9999; pointer-events: none;
      mix-blend-mode: screen; opacity: 1;
    }
    html[data-theme="light"] #bg-canvas-top { mix-blend-mode: multiply; }
  `;
  document.head.appendChild(overrideCSS);

  // Because deck-stage paints its own solid background inside the shadow
  // DOM, we route the canvas ABOVE it (screen blend) so the pulsing grid
  // still registers. The underlying #bg-canvas remains as a fallback
  // during print/export.
  function installTopBackground(intensity = 0.25) {
    const canvas = document.createElement('canvas');
    canvas.id = 'bg-canvas-top';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.width  = innerWidth  * dpr;
      H = canvas.height = innerHeight * dpr;
      canvas.style.width  = innerWidth + 'px';
      canvas.style.height = innerHeight + 'px';
    };
    resize();
    addEventListener('resize', resize);

    const readAccent = () => {
      const cs = getComputedStyle(document.documentElement);
      return (cs.getPropertyValue('--accent') || '#831843').trim();
    };
    const hexToRgb = (hex) => {
      const h = hex.replace('#','');
      const s = h.length === 3 ? h.split('').map(c => c+c).join('') : h;
      return [
        parseInt(s.slice(0,2),16),
        parseInt(s.slice(2,4),16),
        parseInt(s.slice(4,6),16),
      ];
    };

    const gridSize = 56;
    let t0 = performance.now();

    const draw = () => {
      const t = (performance.now() - t0) / 1000;
      const [r, g, b] = hexToRgb(readAccent());
      const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
      ctx.clearRect(0, 0, W, H);

      const step = gridSize * dpr;
      const cols = Math.ceil(W / step) + 2;
      const rows = Math.ceil(H / step) + 2;
      const cx = W * 0.5, cy = H * 0.55;
      const maxR = Math.hypot(W, H) * 0.6;

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i * step, y = j * step;
          const d = Math.hypot(x - cx, y - cy);
          const nd = d / maxR;
          const w1 = Math.sin(nd * 9 - t * 1.3);
          const w2 = Math.sin(nd * 18 - t * 0.5 + j * 0.25);
          const pulse = Math.max(0, (w1 * 0.6 + w2 * 0.4 + 1) * 0.5);

          // Very low alpha since blend-mode amplifies
          const a = pulse * 0.55 * intensity * (isDark ? 1 : 0.85);
          const rad = (0.9 + pulse * 1.6) * dpr;
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
          ctx.fill();
        }
      }

      // Lines (orthogonal) where pulse is very high
      ctx.lineWidth = 1 * dpr;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i * step, y = j * step;
          const d = Math.hypot(x - cx, y - cy);
          const nd = d / maxR;
          const pulse = (Math.sin(nd * 9 - t * 1.3) + 1) * 0.5;
          if (pulse > 0.82) {
            const a = (pulse - 0.82) * 5 * 0.3 * intensity;
            ctx.strokeStyle = `rgba(${r},${g},${b},${a})`;
            ctx.beginPath();
            ctx.moveTo(x, y); ctx.lineTo(x + step, y);
            ctx.moveTo(x, y); ctx.lineTo(x, y + step);
            ctx.stroke();
          }
        }
      }

      requestAnimationFrame(draw);
    };
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      requestAnimationFrame(draw);
    } else {
      draw();
    }
  }

  /* ────────────────────────────────────────────────────────────
   * AURORA BACKDROP — drifting blurred accent gradients
   *
   * Four giant radial gradients, each in an accent hue, drift + scale
   * independently. Sits above the deck with `mix-blend-mode: screen`
   * (dark) / `multiply` (light) so it colours the slides softly
   * without hiding text. Pure CSS — no canvas cost.
   * ──────────────────────────────────────────────────────────── */
  function installAuroraBackdrop() {
    const css = document.createElement('style');
    css.textContent = `
      .aurora-backdrop {
        position: fixed; inset: 0; z-index: 9997;
        pointer-events: none; overflow: hidden;
        mix-blend-mode: screen;
        opacity: 0.72;
      }
      html[data-theme="light"] .aurora-backdrop {
        mix-blend-mode: multiply;
        opacity: 0.42;
      }
      .aurora-backdrop .orb {
        position: absolute;
        width: 55vw; height: 55vw;
        border-radius: 50%;
        filter: blur(120px);
        will-change: transform;
      }
      .aurora-backdrop .orb.a1 {
        background: radial-gradient(circle,
          color-mix(in oklch, var(--accent) 70%, transparent), transparent 65%);
        top: -12%; left: -14%;
        animation: auroraDrift1 34s ease-in-out infinite alternate;
      }
      .aurora-backdrop .orb.a2 {
        background: radial-gradient(circle,
          color-mix(in oklch, var(--accent-2) 60%, transparent), transparent 65%);
        top: 28%; left: 42%;
        animation: auroraDrift2 44s ease-in-out infinite alternate;
      }
      .aurora-backdrop .orb.a3 {
        background: radial-gradient(circle,
          color-mix(in oklch, var(--accent-3) 55%, transparent), transparent 65%);
        top: 48%; left: -8%;
        animation: auroraDrift3 28s ease-in-out infinite alternate;
      }
      .aurora-backdrop .orb.a4 {
        background: radial-gradient(circle,
          color-mix(in oklch, var(--accent) 50%, transparent), transparent 65%);
        top: 10%; left: 58%;
        animation: auroraDrift4 38s ease-in-out infinite alternate;
      }
      @keyframes auroraDrift1 {
        from { transform: translate(0,0) scale(1); }
        to   { transform: translate(28%, 18%) scale(1.15); }
      }
      @keyframes auroraDrift2 {
        from { transform: translate(0,0) scale(1); }
        to   { transform: translate(-24%, -12%) scale(1.12); }
      }
      @keyframes auroraDrift3 {
        from { transform: translate(0,0) scale(1); }
        to   { transform: translate(40%, -28%) scale(1.2); }
      }
      @keyframes auroraDrift4 {
        from { transform: translate(0,0) scale(1); }
        to   { transform: translate(-30%, 22%) scale(1.08); }
      }
      @media (prefers-reduced-motion: reduce) {
        .aurora-backdrop .orb { animation-duration: 80s !important; }
      }
    `;
    document.head.appendChild(css);

    const root = document.createElement('div');
    root.className = 'aurora-backdrop';
    for (const cls of ['a1', 'a2', 'a3', 'a4']) {
      const orb = document.createElement('div');
      orb.className = 'orb ' + cls;
      root.appendChild(orb);
    }
    document.body.appendChild(root);
  }

  /* ────────────────────────────────────────────────────────────
   * FLOW-FIELD PARTICLES — drifting specks following a smooth
   * vector field. ~220 particles, motion blur via alpha-fade
   * instead of clearRect so you see short streaks.
   *
   * The flow vector at (x,y,t) = sin(x·α + t·β) + cos(y·α + t·γ).
   * Pseudo-Perlin, cheap, and smooth in both space and time.
   * ──────────────────────────────────────────────────────────── */
  function installFlowField({ count = 220, intensity = 0.55 } = {}) {
    const canvas = document.createElement('canvas');
    canvas.id = 'bg-flowfield';
    Object.assign(canvas.style, {
      position: 'fixed', inset: 0, zIndex: 9998,
      pointerEvents: 'none',
      mixBlendMode: 'screen',
    });
    // Light theme: multiply instead.
    const syncBlend = () => {
      const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
      canvas.style.mixBlendMode = isDark ? 'screen' : 'multiply';
    };
    syncBlend();
    new MutationObserver(syncBlend).observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-theme'],
    });
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.width  = innerWidth  * dpr;
      H = canvas.height = innerHeight * dpr;
      canvas.style.width  = innerWidth + 'px';
      canvas.style.height = innerHeight + 'px';
    };
    resize();
    addEventListener('resize', resize);

    const readAccent = () => {
      const cs = getComputedStyle(document.documentElement);
      return (cs.getPropertyValue('--accent') || '#831843').trim();
    };
    const hexToRgb = (hex) => {
      const h = hex.replace('#','');
      const s = h.length === 3 ? h.split('').map(c => c+c).join('') : h;
      return [
        parseInt(s.slice(0,2),16),
        parseInt(s.slice(2,4),16),
        parseInt(s.slice(4,6),16),
      ];
    };

    // Smooth pseudo-noise flow angle at (x,y,t).
    const ALPHA = 0.0028;  // spatial frequency — smaller = wider cells
    const BETA  = 0.00035; // temporal drift x
    const GAMMA = 0.00028; // temporal drift y
    const flowAngle = (x, y, t) => {
      const a = Math.sin(x * ALPHA + t * BETA) * Math.PI;
      const b = Math.cos(y * ALPHA + t * GAMMA) * Math.PI;
      return a + b;
    };

    // Particles — position + lifetime.
    const SPEED = 0.6 * dpr * intensity;
    const LIFE  = 180;
    const particles = [];
    const spawn = (p) => {
      p.x = Math.random() * W;
      p.y = Math.random() * H;
      p.age = Math.random() * LIFE;
      p.life = LIFE + Math.random() * 80;
    };
    for (let i = 0; i < count; i++) { const p = {}; spawn(p); particles.push(p); }

    // First paint — fill with transparent so alpha-fade works.
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, W, H);

    const draw = () => {
      const t = performance.now();
      const [r, g, b] = hexToRgb(readAccent());
      // Trail fade — repaint a small alpha rectangle. In screen-blend
      // mode, black = no effect, so the canvas naturally darkens toward
      // fully-transparent without touching the slide content.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';

      ctx.lineCap = 'round';
      for (const p of particles) {
        const ang = flowAngle(p.x, p.y, t);
        const vx = Math.cos(ang) * SPEED;
        const vy = Math.sin(ang) * SPEED;
        const x2 = p.x + vx;
        const y2 = p.y + vy;

        // Fade in at birth, fade out at death.
        const ageN = p.age / p.life; // 0..1
        const alpha = Math.sin(ageN * Math.PI) * 0.55 * intensity;

        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.lineWidth = (0.9 + Math.sin(ageN * Math.PI) * 1.4) * dpr;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        p.x = x2; p.y = y2;
        p.age++;
        if (p.age >= p.life || x2 < -20 || x2 > W + 20 || y2 < -20 || y2 > H + 20) {
          spawn(p);
        }
      }
      requestAnimationFrame(draw);
    };

    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      requestAnimationFrame(draw);
    } else {
      // Freeze a single frame for reduced-motion users.
      draw();
    }
  }

  // Aurora (cloudy base) + flow field (particles on top).
  // The pulsing-grid (`installTopBackground`) is kept as a function but
  // no longer called — aurora + flow-field replace it.
  installAuroraBackdrop();
  installFlowField();

  /* ────────────────────────────────────────────────────────────
   * (b) REVEAL-GROUP CONTROLLER
   *
   * Elements authored with [data-reveal="N"] (1+) stay hidden until
   * their slide's current step >= N. Step 0 is default-visible. We
   * track per-slide step in deck._revealStep.
   *
   * Element hiding is done via CSS (see style block below).
   * ──────────────────────────────────────────────────────────── */
  const revealStyle = document.createElement('style');
  revealStyle.textContent = `
    [data-reveal] {
      opacity: 0 !important;
      transform: translate3d(0, 18px, 0);
      transition: opacity 600ms ease, transform 600ms cubic-bezier(.2,.7,.2,1);
      pointer-events: none;
    }
    [data-reveal].revealed {
      opacity: 1 !important;
      transform: translate3d(0, 0, 0);
      pointer-events: auto;
    }
  `;
  document.head.appendChild(revealStyle);

  const slideSteps = new Map(); // slide element -> current step

  /* Auto-stage elements with data-anim + animationDelay into data-reveal
     slots. Called whenever voice listening starts, so the slide no longer
     auto-plays — each trigger phrase reveals the next group. */
  function stageSlide(slide) {
    if (!slide) return;
    const animated = [...slide.querySelectorAll('[data-anim]')];
    if (!animated.length) return;
    // Group by delay bucket (200ms buckets).
    const items = animated.map(el => {
      const cs = getComputedStyle(el);
      const ms = parseFloat(cs.animationDelay) * 1000 || 0;
      return { el, ms };
    }).sort((a, b) => a.ms - b.ms);
    // Make the first bucket always step 0 (visible on entry),
    // subsequent buckets become steps 1,2,3,...
    let lastMs = -Infinity, step = 0;
    const BUCKET_MS = 200;
    items.forEach((it) => {
      if (it.ms - lastMs > BUCKET_MS) {
        step += 1;
        lastMs = it.ms;
      }
      // Skip the very first bucket (step 1) — keep it visible as "entry"
      if (step > 1) {
        it.el.setAttribute('data-reveal', String(step - 1));
      }
    });
  }

  function unstageSlide(slide) {
    if (!slide) return;
    slide.querySelectorAll('[data-reveal]').forEach(el => {
      el.removeAttribute('data-reveal');
      el.classList.remove('revealed');
    });
  }

  function getMaxStep(slide) {
    const els = slide.querySelectorAll('[data-reveal]');
    let max = 0;
    els.forEach(el => {
      const n = parseInt(el.getAttribute('data-reveal'), 10) || 0;
      if (n > max) max = n;
    });
    return max;
  }

  function applyRevealState(slide) {
    const step = slideSteps.get(slide) || 0;
    slide.querySelectorAll('[data-reveal]').forEach(el => {
      const n = parseInt(el.getAttribute('data-reveal'), 10) || 0;
      el.classList.toggle('revealed', n <= step);
    });
  }

  function resetSlide(slide) {
    slideSteps.set(slide, 0);
    applyRevealState(slide);
  }

  function advanceSlide(slide) {
    const cur = slideSteps.get(slide) || 0;
    const max = getMaxStep(slide);
    if (cur >= max) return false; // no more steps; caller may go next slide
    slideSteps.set(slide, cur + 1);
    applyRevealState(slide);
    return true;
  }

  function getCurrentSlide() {
    return deck.querySelector('[data-deck-active]');
  }

  // Watch slide changes: reset the slide being ENTERED so its reveals
  // re-play. Don't reset the leaving slide (keeps state preserved if
  // user navigates back).
  deck.addEventListener('slidechange', (e) => {
    const cur = e.detail.slide;
    const prev = e.detail.previousSlide;
    if (prev) unstageSlide(prev);
    if (cur) {
      if (listening) stageSlide(cur);
      resetSlide(cur);
    }
    // Voice context also changes — rebuild matcher for new slide
    rebuildVoiceContext();
  });

  // Also initialize on load for whatever slide is active.
  (function init() {
    const s = getCurrentSlide();
    if (s) resetSlide(s);
  })();

  // Re-apply state if new reveal elements arrive (React renders async).
  const moHost = new MutationObserver(() => {
    const s = getCurrentSlide();
    if (s) applyRevealState(s);
  });
  moHost.observe(deck, { subtree: true, childList: true });

  /* ────────────────────────────────────────────────────────────
   * (c) MANUAL ADVANCE — space + click
   * ──────────────────────────────────────────────────────────── */
  function tryAdvanceOrNext() {
    const slide = getCurrentSlide();
    if (!slide) return;
    const advanced = advanceSlide(slide);
    if (!advanced) {
      // Delegate to deck's native next
      deck.next?.();
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    // Space handled here. Avoid when focused on form elements.
    const t = e.target;
    const tag = (t && t.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
    if (e.code === 'Space') {
      e.preventDefault();
      tryAdvanceOrNext();
    }
  }, true);

  // Click on slide content advances. Skip clicks on tweaks panel / mic.
  deck.addEventListener('click', (e) => {
    const blocked = e.target.closest('#tweaks-root, #mic-ui, #transcript-ui, a, button, input, select, textarea');
    if (blocked) return;
    tryAdvanceOrNext();
  });

  // Expose for debugging
  window.__deckEngine = {
    advance: tryAdvanceOrNext,
    reset: () => { const s = getCurrentSlide(); if (s) resetSlide(s); },
    getStep: () => { const s = getCurrentSlide(); return slideSteps.get(s) || 0; },
  };

  /* ────────────────────────────────────────────────────────────
   * (d) TRIGGER-PHRASE EXTRACTION from speaker notes
   *
   * We want a sequence of short (2–4 word) distinctive phrases per
   * slide, ordered so that saying them in order advances the reveal.
   *
   * Strategy: tokenize speaker note into sentences; pick the first
   * non-stopword noun-ish 2-4 word phrase from each sentence up to
   * the number of reveal steps on that slide. If the slide has no
   * reveal steps, we still extract ONE final phrase per slide (used
   * to auto-advance to next slide).
   * ──────────────────────────────────────────────────────────── */
  const STOPWORDS = new Set(`a an the of in on at to for and or but if so as
    is are was were be been being have has had do does did not no this that
    these those i we you they he she it my our your their his her its me us
    them very just really quite some any each every all most more less over
    under into onto from with by about than then there here when where why
    how what who which while during until since because although though also
    too also can could would should may might will shall does did done
    you'll we'll they'll i've we've you've they've it's that's there's
    here's one two three four five six seven eight nine ten first second
    third next last final basic simple`.split(/\s+/));

  function cleanWord(w) {
    return w.toLowerCase().replace(/[^a-z0-9\-']/g, '');
  }
  function isContent(w) {
    const c = cleanWord(w);
    return c && c.length > 2 && !STOPWORDS.has(c);
  }

  function extractPhrasesFromNote(note, n) {
    if (!note) return [];
    // Split into sentences
    const sentences = note
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(Boolean);

    const phrases = [];
    const used = new Set();
    for (const sent of sentences) {
      if (phrases.length >= n) break;
      const tokens = sent.split(/\s+/);
      // Slide a window of 2-4 content words; prefer 3-word phrases.
      const picks = [];
      for (let i = 0; i < tokens.length; i++) {
        for (const len of [3, 4, 2]) {
          const window = tokens.slice(i, i + len);
          if (window.length < len) continue;
          const contentCount = window.filter(isContent).length;
          if (contentCount < 2) continue;
          // Keep the phrase as originally spelled (lowercased)
          const raw = window.join(' ')
            .toLowerCase()
            .replace(/[^a-z0-9\-'\s]/g, '')
            .trim();
          if (!raw || used.has(raw)) continue;
          picks.push(raw);
          break;
        }
        if (picks.length) break;
      }
      if (picks.length) {
        phrases.push(picks[0]);
        used.add(picks[0]);
      }
    }
    return phrases;
  }

  // Get triggers for every slide: array of { slideEl, steps: [phrase, ...], nextPhrase }
  function buildTriggers() {
    const notesEl = document.getElementById('speaker-notes');
    let notes = [];
    try { notes = JSON.parse(notesEl?.textContent || '[]'); } catch {}
    const slides = [...deck.children].filter(s => s.tagName === 'SECTION');
    return slides.map((slide, i) => {
      const maxStep = getMaxStep(slide);
      // We need maxStep phrases for within-slide advances + 1 for "done/next"
      const n = maxStep + 1;
      const phrases = extractPhrasesFromNote(notes[i] || '', n);
      // Pad with generic if short
      while (phrases.length < n) phrases.push(null);
      return {
        slide,
        index: i,
        steps: phrases.slice(0, maxStep), // phrase that advances reveal→i
        nextPhrase: phrases[maxStep] || null,
      };
    });
  }

  let TRIGGERS = buildTriggers();

  function rebuildVoiceContext() {
    TRIGGERS = buildTriggers();
    updateTranscriptHint();
  }

  // Re-extract if speaker notes or deck structure changes
  const notesObs = new MutationObserver(() => rebuildVoiceContext());
  const notesEl = document.getElementById('speaker-notes');
  if (notesEl) notesObs.observe(notesEl, { characterData: true, childList: true, subtree: true });

  /* ────────────────────────────────────────────────────────────
   * (e) VOICE CONTROLLER — Web Speech API + transcript overlay
   * ──────────────────────────────────────────────────────────── */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voiceSupported = !!SR;

  // Build UI
  const micUI = document.createElement('div');
  micUI.id = 'mic-ui';
  micUI.innerHTML = `
    <button id="mic-btn" title="Toggle voice control (V)">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
        <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/>
      </svg>
      <span id="mic-label">Voice off</span>
    </button>
  `;
  document.body.appendChild(micUI);

  const transcriptUI = document.createElement('div');
  transcriptUI.id = 'transcript-ui';
  transcriptUI.innerHTML = `
    <div id="transcript-badge">LISTENING <span id="transcript-live-dot"></span></div>
    <div id="transcript-text"></div>
    <div id="transcript-meter">
      <div id="transcript-meter-fill"></div>
    </div>
    <div id="transcript-next">Next cue: <span id="transcript-next-phrase">—</span></div>
  `;
  document.body.appendChild(transcriptUI);

  const style = document.createElement('style');
  style.textContent = `
    #mic-ui {
      position: fixed; bottom: 24px; right: 24px; z-index: 10001;
      font-family: 'JetBrains Mono', monospace;
    }
    #mic-btn {
      display: inline-flex; align-items: center; gap: 10px;
      padding: 12px 18px; border-radius: 999px;
      background: rgba(20,20,25,0.85); color: #eaeaea;
      border: 1px solid rgba(255,255,255,0.14);
      font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase;
      cursor: pointer; backdrop-filter: blur(8px);
      transition: all .2s ease;
    }
    #mic-btn:hover { background: rgba(35,35,40,0.92); }
    #mic-btn.on {
      background: var(--accent, #831843); color: #fff;
      border-color: transparent;
      box-shadow: 0 0 0 0 rgba(131,24,67,0.7);
      animation: micPulse 1.6s ease-out infinite;
    }
    @keyframes micPulse {
      0%   { box-shadow: 0 0 0 0 rgba(131,24,67, 0.6); }
      70%  { box-shadow: 0 0 0 14px rgba(131,24,67, 0); }
      100% { box-shadow: 0 0 0 0 rgba(131,24,67, 0); }
    }
    html[data-theme="light"] #mic-btn {
      background: rgba(255,255,255,0.9); color: #111;
      border-color: rgba(0,0,0,0.12);
    }

    #transcript-ui {
      position: fixed; bottom: 92px; right: 24px; z-index: 10000;
      width: 420px; max-width: calc(100vw - 48px);
      padding: 16px 18px;
      background: rgba(20,20,25,0.88); color: #eaeaea;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 14px; backdrop-filter: blur(10px);
      font-family: 'JetBrains Mono', monospace; font-size: 14px;
      opacity: 0; transform: translateY(8px);
      transition: opacity .2s ease, transform .2s ease;
      pointer-events: none;
    }
    #transcript-ui.visible { opacity: 1; transform: translateY(0); }
    html[data-theme="light"] #transcript-ui {
      background: rgba(255,255,255,0.95); color: #1a1a1a;
      border-color: rgba(0,0,0,0.08);
    }
    #transcript-badge {
      display: inline-block;
      padding: 3px 8px; margin-bottom: 8px;
      font-size: 10px; letter-spacing: 0.2em;
      background: var(--accent, #831843); color: #fff;
      border-radius: 3px;
    }
    #transcript-text {
      min-height: 48px;
      max-height: 96px; overflow: hidden;
      line-height: 1.4; word-break: break-word;
      color: inherit; opacity: 0.95;
    }
    #transcript-text .final { color: inherit; opacity: 0.7; }
    #transcript-text .interim {
      color: var(--accent, #831843);
      font-weight: 600;
      /* subtle live pulse so the user SEES it's streaming */
      animation: interimPulse 1.2s ease-in-out infinite;
    }
    @keyframes interimPulse {
      0%, 100% { opacity: 0.85; }
      50%      { opacity: 1.0; }
    }
    #transcript-live-dot {
      display: inline-block;
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #fff;
      margin-left: 4px;
      animation: liveDot 1s ease-in-out infinite;
    }
    @keyframes liveDot {
      0%, 100% { opacity: 0.3; transform: scale(1); }
      50%      { opacity: 1;   transform: scale(1.4); }
    }
    /* Match-progress bar — widens as transcript gets closer to the
       next cue, giving the speaker a live hint that the advance is
       imminent. */
    #transcript-meter {
      height: 3px; margin-top: 10px;
      background: rgba(255,255,255,0.08);
      border-radius: 2px; overflow: hidden;
    }
    html[data-theme="light"] #transcript-meter { background: rgba(0,0,0,0.07); }
    #transcript-meter-fill {
      height: 100%; width: 0;
      background: var(--accent, #831843);
      transition: width 160ms linear, opacity 200ms ease;
      opacity: 0.6;
    }
    #transcript-meter-fill.match {
      animation: meterFlash 500ms ease-out;
    }
    @keyframes meterFlash {
      0%   { filter: brightness(1); width: 100%; }
      40%  { filter: brightness(1.8); }
      100% { filter: brightness(1); width: 100%; opacity: 0; }
    }
    #transcript-next {
      margin-top: 10px; padding-top: 10px;
      border-top: 1px solid rgba(255,255,255,0.12);
      font-size: 11px; letter-spacing: 0.14em;
      text-transform: uppercase; opacity: 0.7;
    }
    html[data-theme="light"] #transcript-next {
      border-top-color: rgba(0,0,0,0.1);
    }
    #transcript-next-phrase { color: var(--accent, #831843); text-transform: none; letter-spacing: 0; }

    /* Print: hide all engine UI */
    @media print {
      #bg-canvas, #bg-canvas-top, #mic-ui, #transcript-ui { display: none !important; }
      [data-reveal] { opacity: 1 !important; transform: none !important; }
    }
  `;
  document.head.appendChild(style);

  // Voice logic
  //
  // Design — two buffers, deduplicated. Web Speech emits interim
  // results that UPDATE in place (same resultIndex refires with
  // refined text). If we blindly append every onresult, the buffer
  // duplicates. Split:
  //
  //   finalBuf   — committed, never shrinks during listening. The
  //                canonical transcript we search for triggers.
  //   interimBuf — current hypothesis (replaced, not appended).
  //                Also searched, so we can match the moment a
  //                trigger phrase is recognized, even if not final.
  //
  // On each onresult, we check for a match on (finalBuf + ' ' + interimBuf)
  // and advance immediately — true live processing.
  let recog = null;
  let listening = false;
  let finalBuf = '';
  let interimBuf = '';
  const BUF_MAX = 600;

  function setListening(on) {
    listening = !!on;
    const btn = document.getElementById('mic-btn');
    const lab = document.getElementById('mic-label');
    if (btn) btn.classList.toggle('on', listening);
    if (lab) lab.textContent = listening ? 'Listening' : 'Voice off';
    document.getElementById('transcript-ui')?.classList.toggle('visible', listening);
    const cur = getCurrentSlide();
    if (listening) {
      if (cur) { stageSlide(cur); resetSlide(cur); }
      try { recog?.start(); } catch {}
    } else {
      if (cur) unstageSlide(cur);
      try { recog?.stop(); } catch {}
    }
    rebuildVoiceContext();
  }

  function updateTranscriptUI() {
    const el = document.getElementById('transcript-text');
    if (!el) return;
    // Render last ~180 chars of final transcript, then the live
    // interim tail highlighted in accent so the speaker SEES what's
    // being picked up at this moment.
    const finalTail = finalBuf.slice(-180).trim();
    const interimTail = interimBuf.trim();
    el.innerHTML =
      `<span class="final">${escapeHtml(finalTail)}</span>` +
      (interimTail ? ` <span class="interim">${escapeHtml(interimTail)}</span>` : '');
  }

  // Simple similarity 0..1 between two strings, based on shared words
  // in order — lets us progress the meter even when Web Speech's
  // interim result hasn't yet produced the full trigger phrase.
  function matchProgress(hay, needle) {
    if (!needle) return 0;
    const needleWords = needle.split(/\s+/).filter(Boolean);
    if (!needleWords.length) return 0;
    const tail = hay.slice(-200); // only the recent tail counts
    // Count consecutive prefix words from the end of the needle
    // that appear in the tail in order.
    let covered = 0;
    let cursor = 0;
    for (const w of needleWords) {
      const idx = tail.indexOf(w, cursor);
      if (idx < 0) break;
      cursor = idx + w.length;
      covered++;
    }
    return covered / needleWords.length;
  }

  // Fuzzy-tolerant substring: allow 1-2 word gaps between the
  // trigger's words, so small recognition mistakes don't stall the
  // advance. Returns the end-index in `hay` past the matched span,
  // or -1 if no match.
  function fuzzyMatchEnd(hay, needle) {
    const h = hay;
    // Fast path: exact substring.
    const exact = h.indexOf(needle);
    if (exact >= 0) return exact + needle.length;

    // Word-gap tolerant path: all needle words, in order, each
    // within 8 chars of the previous. Rejects if too much filler.
    const nWords = needle.split(/\s+/).filter(Boolean);
    if (nWords.length < 2) return -1;
    let cursor = 0;
    let lastEnd = -1;
    const tail = Math.max(0, h.length - 240); // only search recent tail
    for (const w of nWords) {
      const from = Math.max(cursor, tail);
      const idx = h.indexOf(w, from);
      if (idx < 0) return -1;
      if (lastEnd >= 0 && idx - lastEnd > 12) return -1; // too much filler
      lastEnd = idx + w.length;
      cursor = lastEnd;
    }
    return lastEnd;
  }
  function escapeHtml(s) {
    return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  }

  function updateTranscriptHint() {
    const el = document.getElementById('transcript-next-phrase');
    if (!el) return;
    const slide = getCurrentSlide();
    if (!slide) { el.textContent = '—'; return; }
    const idx = [...deck.children].indexOf(slide);
    const rec = TRIGGERS[idx];
    if (!rec) { el.textContent = '—'; return; }
    const curStep = slideSteps.get(slide) || 0;
    const max = getMaxStep(slide);
    const next = curStep < max
      ? rec.steps[curStep]
      : rec.nextPhrase;
    el.textContent = next ? `"${next}"` : (curStep < max ? '— (manual)' : '— (next slide)');
  }

  // Update the match-progress meter based on how much of the next
  // trigger phrase is already audible in the recent transcript.
  function updateMatchMeter() {
    const el = document.getElementById('transcript-meter-fill');
    if (!el) return;
    const slide = getCurrentSlide();
    if (!slide) { el.style.width = '0%'; return; }
    const idx = [...deck.children].indexOf(slide);
    const rec = TRIGGERS[idx];
    if (!rec) { el.style.width = '0%'; return; }
    const curStep = slideSteps.get(slide) || 0;
    const max = getMaxStep(slide);
    const target = curStep < max ? rec.steps[curStep] : rec.nextPhrase;
    if (!target) { el.style.width = '0%'; return; }
    const hay = (finalBuf + ' ' + interimBuf).replace(/['']/g, "'");
    const needle = target.replace(/['']/g, "'");
    const p = matchProgress(hay, needle);
    el.style.width = `${Math.round(p * 100)}%`;
    el.style.opacity = p < 0.1 ? '0.25' : (p < 0.99 ? '0.7' : '1');
  }

  // Check combined (final + interim) transcript for trigger phrase.
  // Runs on every onresult — true live processing.
  function matchAndAdvance() {
    const slide = getCurrentSlide();
    if (!slide) return;
    const idx = [...deck.children].indexOf(slide);
    const rec = TRIGGERS[idx];
    if (!rec) return;
    const curStep = slideSteps.get(slide) || 0;
    const max = getMaxStep(slide);
    const target = curStep < max ? rec.steps[curStep] : rec.nextPhrase;
    if (!target) return;

    const hay = (finalBuf + ' ' + interimBuf).replace(/['']/g, "'");
    const needle = target.replace(/['']/g, "'");
    const endIdx = fuzzyMatchEnd(hay, needle);
    if (endIdx < 0) return;

    // Crop both buffers past the match so we don't re-trigger on
    // the same audio.
    // Since hay = finalBuf + ' ' + interimBuf, figure out which
    // buffer the match ended in.
    const finalLen = finalBuf.length;
    if (endIdx <= finalLen) {
      finalBuf = finalBuf.slice(endIdx);
    } else {
      // Match ended inside interim — consume the final buf entirely
      // and the overlap into interim.
      const into = endIdx - finalLen - 1; // -1 for the joining space
      finalBuf = '';
      interimBuf = interimBuf.slice(Math.max(0, into));
    }

    // Visual flash on the meter to confirm the cue registered.
    const fill = document.getElementById('transcript-meter-fill');
    if (fill) {
      fill.classList.remove('match');
      // reflow so the class re-adds cleanly
      // eslint-disable-next-line no-unused-expressions
      fill.offsetHeight;
      fill.classList.add('match');
      setTimeout(() => fill.classList.remove('match'), 600);
    }

    if (curStep < max) advanceSlide(slide);
    else deck.next?.();
    updateTranscriptHint();
    // After advancing, re-read the new target and reset the meter.
    updateMatchMeter();
  }

  if (voiceSupported) {
    recog = new SR();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = 'en-US';
    recog.maxAlternatives = 1;
    recog.onresult = (ev) => {
      // Separate interim vs final results this event. Don't append
      // interim (it replaces); append only newly-finalized text.
      let newFinal = '';
      let curInterim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const t = res[0].transcript;
        if (res.isFinal) newFinal += t;
        else curInterim += t;
      }
      const cleanFn = s => s.toLowerCase()
        .replace(/[^a-z0-9\-'\s]/g, ' ')
        .replace(/\s+/g, ' ');
      if (newFinal) {
        finalBuf = (finalBuf + ' ' + cleanFn(newFinal)).slice(-BUF_MAX);
      }
      interimBuf = cleanFn(curInterim);
      updateTranscriptUI();
      matchAndAdvance();
      updateMatchMeter();
    };
    recog.onerror = (e) => { console.warn('[speech]', e.error); };
    recog.onend = () => {
      // Auto-restart if still listening — keeps the stream alive
      // across Chrome's ~60s-per-session internal limit and after
      // any silence-triggered end. Restart is immediate so the
      // audio gap is as small as the browser allows.
      if (listening) { try { recog.start(); } catch {} }
    };
  }

  document.getElementById('mic-btn').addEventListener('click', () => {
    if (!voiceSupported) {
      alert('Voice control needs a browser with SpeechRecognition (Chrome or Edge).');
      return;
    }
    setListening(!listening);
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyV' && !e.metaKey && !e.ctrlKey) {
      const t = e.target;
      const tag = (t && t.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
      e.preventDefault();
      document.getElementById('mic-btn').click();
    }
  });

  // When slide changes, update hint
  deck.addEventListener('slidechange', updateTranscriptHint);
  // Update hint after initial triggers build
  setTimeout(updateTranscriptHint, 300);

})();