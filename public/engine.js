/* ═══════════════════════════════════════════════════════════════
 * Deck Engine — animated backdrop (aurora + flow field) only.
 *
 * Voice control and reveal-group systems were removed at the
 * presenter's request (different control approach coming).
 *
 * What lives here now:
 *   (a) AURORA BACKDROP — drifting blurred accent gradients drawn
 *       at body level via CSS keyframes. Theme-reactive.
 *
 *   (b) FLOW-FIELD PARTICLES — 220 particles ride a pseudo-Perlin
 *       vector field on a fixed canvas, drawn with alpha-fade
 *       trails via `destination-out` compositing.
 *
 * Everything else (slide transitions, data-anim entrances,
 * element-level scatter animation) is handled by deck.jsx and
 * styles.css. Keyboard navigation is handled natively by
 * <deck-stage>: ArrowLeft/Right, Space, PageUp/Down, Home/End,
 * digits 1–9 (and 0 for slide 10), R for reset.
 * ═══════════════════════════════════════════════════════════════ */

(() => {
  /* ────────────────────────────────────────────────────────────
   * (a) AURORA BACKDROP — drifting blurred accent gradients.
   *     Sits above deck-stage with mix-blend-mode: screen (dark)
   *     / multiply (light) so it colours the slides softly
   *     without hiding text. Pure CSS — no canvas cost.
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
      @media print {
        .aurora-backdrop, #bg-flowfield { display: none !important; }
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
   * (b) FLOW-FIELD PARTICLES — drifting specks following a smooth
   *     vector field. `destination-out` alpha-fade gives trails
   *     without tinting the slides black.
   * ──────────────────────────────────────────────────────────── */
  function installFlowField({ count = 220, intensity = 0.55 } = {}) {
    const canvas = document.createElement('canvas');
    canvas.id = 'bg-flowfield';
    Object.assign(canvas.style, {
      position: 'fixed', inset: 0, zIndex: 9998,
      pointerEvents: 'none',
      mixBlendMode: 'screen',
    });
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
    const ALPHA = 0.0028;
    const BETA  = 0.00035;
    const GAMMA = 0.00028;
    const flowAngle = (x, y, t) =>
      Math.sin(x * ALPHA + t * BETA) * Math.PI +
      Math.cos(y * ALPHA + t * GAMMA) * Math.PI;

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

    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, W, H);

    const draw = () => {
      const t = performance.now();
      const [r, g, b] = hexToRgb(readAccent());
      // Trail fade via subtractive alpha — doesn't darken the slide
      // behind it because screen blend treats rgba(0,0,0,0.08) as noop.
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

        const ageN = p.age / p.life;
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
      draw();
    }
  }

  installAuroraBackdrop();
  installFlowField();
})();
