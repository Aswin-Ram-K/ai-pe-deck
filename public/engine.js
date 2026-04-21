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
  /* Living Universe backdrop — 5 orbs (one per deck accent), varied
   * periods (22/28/34/41/49s) so interference never repeats, reduced
   * base opacity (0.55 from 0.72), plus a 5.2s ease-in-out breathing
   * pulse and a compositor-wide subtle opacity sine. Net effect: more
   * perceptible motion, lower total visual weight — "alive, not loud". */
  function installAuroraBackdrop() {
    const ORBS = [
      { cls: 'a1', color: '#0B3FB5', top: '-12%', left: '-14%', drift: 'auroraDrift1', period: 22, phase:  0 },
      { cls: 'a2', color: '#5B21B6', top:  '28%', left:  '42%', drift: 'auroraDrift2', period: 28, phase: -6 },
      { cls: 'a3', color: '#831843', top:  '48%', left:  '-8%', drift: 'auroraDrift3', period: 34, phase: -12 },
      { cls: 'a4', color: '#064E3B', top:  '10%', left:  '58%', drift: 'auroraDrift4', period: 41, phase: -20 },
      { cls: 'a5', color: '#0A0A1F', top:  '62%', left:  '28%', drift: 'auroraDrift5', period: 49, phase: -28 },
    ];

    const css = document.createElement('style');
    css.textContent = `
      .aurora-backdrop {
        position: fixed; inset: 0; z-index: 9997;
        pointer-events: none; overflow: hidden;
        mix-blend-mode: screen;
        opacity: 0.55;
        animation: auroraGlobalPulse 10s ease-in-out infinite alternate;
      }
      html[data-theme="light"] .aurora-backdrop {
        mix-blend-mode: multiply;
        opacity: 0.38;
      }
      .aurora-backdrop .orb {
        position: absolute;
        width: 55vw; height: 55vw;
        border-radius: 50%;
        filter: blur(120px);
        will-change: transform, opacity;
      }
      ${ORBS.map((o) => `
        .aurora-backdrop .orb.${o.cls} {
          background: radial-gradient(circle,
            color-mix(in oklch, ${o.color} 65%, transparent), transparent 65%);
          top: ${o.top}; left: ${o.left};
          animation:
            ${o.drift} ${o.period}s ease-in-out infinite alternate,
            auroraBreath 5.2s ease-in-out ${o.phase}s infinite alternate;
        }
      `).join('\n')}
      @keyframes auroraDrift1 { from { transform: translate(0,0)   scale(1);    } to { transform: translate( 28%,  18%) scale(1.15); } }
      @keyframes auroraDrift2 { from { transform: translate(0,0)   scale(1);    } to { transform: translate(-24%, -12%) scale(1.12); } }
      @keyframes auroraDrift3 { from { transform: translate(0,0)   scale(1);    } to { transform: translate( 40%, -28%) scale(1.20); } }
      @keyframes auroraDrift4 { from { transform: translate(0,0)   scale(1);    } to { transform: translate(-30%,  22%) scale(1.08); } }
      @keyframes auroraDrift5 { from { transform: translate(0,0)   scale(1);    } to { transform: translate( 18%, -32%) scale(1.10); } }

      /* Gentle "breathing" — per-orb scale/opacity pulsation layered
       * atop the drift animations. Composed via comma in animation: ... */
      @keyframes auroraBreath {
        0%   { filter: blur(120px); }
        50%  { filter: blur(132px) brightness(1.08); }
        100% { filter: blur(120px); }
      }

      /* Global subtle pulse on the compositor layer */
      @keyframes auroraGlobalPulse {
        0%   { opacity: 0.53; }
        100% { opacity: 0.58; }
      }

      @media (prefers-reduced-motion: reduce) {
        .aurora-backdrop .orb { animation-duration: 80s, 60s !important; }
        .aurora-backdrop { animation: none; }
      }
      @media print {
        .aurora-backdrop, #bg-flowfield { display: none !important; }
      }
    `;
    document.head.appendChild(css);

    const root = document.createElement('div');
    root.className = 'aurora-backdrop';
    for (const o of ORBS) {
      const orb = document.createElement('div');
      orb.className = 'orb ' + o.cls;
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

    const BASE_SPEED = 0.6 * dpr * intensity;
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

    /* Gust rhythm — intensity sinusoidally oscillates 0.35 ↔ 0.68 over
     * a ~16s period so the particle field ebbs and swells instead of
     * humming at fixed brightness. Drives both alpha and speed so the
     * visual reads as a tidal cycle. */
    const GUST_PERIOD_MS = 16000;
    const GUST_MIN = 0.35, GUST_MAX = 0.68;
    const gustAt = (t) => {
      const u = 0.5 - 0.5 * Math.cos((t / GUST_PERIOD_MS) * Math.PI * 2);
      return GUST_MIN + (GUST_MAX - GUST_MIN) * u;
    };

    const draw = () => {
      const t = performance.now();
      const gust = gustAt(t);
      const [r, g, b] = hexToRgb(readAccent());
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';

      ctx.lineCap = 'round';
      const speed = BASE_SPEED * (0.7 + gust * 0.8);  // gust scales speed
      for (const p of particles) {
        const ang = flowAngle(p.x, p.y, t);
        const vx = Math.cos(ang) * speed;
        const vy = Math.sin(ang) * speed;
        const x2 = p.x + vx;
        const y2 = p.y + vy;

        const ageN = p.age / p.life;
        const alpha = Math.sin(ageN * Math.PI) * gust;  // gust drives alpha directly

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
