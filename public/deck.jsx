// Components for the AI-in-Power-Electronics deck.
// Uses window globals (React) — loaded via Babel alongside main.jsx.

const { Fragment, useEffect, useRef } = React;

/* ── Animation helpers ─────────────────────────────────────────── */

/** Split text into per-character spans with staggered delays.
 *  Preserves word boundaries so wrapping still works naturally. */
function SplitText({ children, delay = 0, step = 28, startChar = 0, className, style }) {
  // Accept a string, or React text children.
  const text = typeof children === 'string' ? children
             : Array.isArray(children) ? children.join('')
             : String(children ?? '');
  const words = text.split(/(\s+)/); // keep whitespace as its own tokens
  let c = startChar;
  return (
    <span className={className} style={style}>
      {words.map((w, wi) => {
        if (/^\s+$/.test(w)) return <span key={wi}>{w}</span>;
        const chars = Array.from(w);
        return (
          <span key={wi} className="split-word">
            {chars.map((ch, ci) => {
              const d = delay + (c++) * step;
              return (
                <span key={ci} className="split-char" style={{ animationDelay: `${d}ms` }}>
                  {ch}
                </span>
              );
            })}
          </span>
        );
      })}
    </span>
  );
}

/** Animated count-up number. Respects active-slide state. */
function CountUp({ to, from = 0, duration = 1200, delay = 0, decimals = 0, suffix = '', style }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Find nearest ancestor slide — trigger when it becomes active.
    const slide = el.closest('[data-deck-slide]');
    if (!slide) return;
    let raf = 0, t0 = 0, timer = 0;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const run = () => {
      cancelAnimationFrame(raf); clearTimeout(timer);
      if (reduce) { el.textContent = to.toFixed(decimals) + suffix; return; }
      el.textContent = from.toFixed(decimals) + suffix;
      timer = setTimeout(() => {
        t0 = performance.now();
        const step = (t) => {
          const p = Math.min(1, (t - t0) / duration);
          // easeOutCubic
          const e = 1 - Math.pow(1 - p, 3);
          el.textContent = (from + (to - from) * e).toFixed(decimals) + suffix;
          if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      }, delay);
    };
    // Observe attribute changes on the slide.
    const obs = new MutationObserver(() => {
      if (slide.hasAttribute('data-deck-active')) run();
    });
    obs.observe(slide, { attributes: true, attributeFilter: ['data-deck-active'] });
    if (slide.hasAttribute('data-deck-active')) run();
    return () => { obs.disconnect(); cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [to, from, duration, delay, decimals, suffix]);
  return <span className="counter" ref={ref} style={style}>{from.toFixed(decimals) + suffix}</span>;
}

/* ── PE visual library ─────────────────────────────────────────── */
// Domain-specific diagrams: PWM waveforms, Pareto fronts, neural nets,
// sensor sparklines, control loops. All SVG, theme-aware via currentColor
// and CSS variables. Animate via classes from styles.css so they pause
// until the slide becomes active.

/** Animated PWM square wave. Pair of traces: classical (slow, low freq,
 *  wider pulses) and wide-bandgap (fast, high freq, clean edges). */
function PWMWaveform({ width = 720, height = 180, speed = 1, className }) {
  // Build two polylines — a slow one and a fast one.
  const slow = [];
  const fast = [];
  const cyclesSlow = 4;
  const cyclesFast = 14;
  const buildSquare = (cycles, amp, yBase, duty = 0.5) => {
    const pts = [];
    const stepX = width / cycles;
    for (let i = 0; i < cycles; i++) {
      const x0 = i * stepX;
      const xMid = x0 + stepX * duty;
      const x1 = x0 + stepX;
      pts.push([x0, yBase], [x0, yBase - amp], [xMid, yBase - amp], [xMid, yBase], [x1, yBase]);
    }
    return pts.map(p => p.join(',')).join(' ');
  };
  const slowPath = buildSquare(cyclesSlow, 46, 70);
  const fastPath = buildSquare(cyclesFast, 46, 160);
  // Rough length approximation — 2× stepX per cycle rise/fall + horizontals.
  const slowLen = cyclesSlow * (width / cyclesSlow) * 3;
  const fastLen = cyclesFast * (width / cyclesFast) * 3;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className}
         style={{ overflow: 'visible' }}>
      {/* Baselines */}
      <line x1="0" y1="70"  x2={width} y2="70"  stroke="var(--rule-soft)" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
      <line x1="0" y1="160" x2={width} y2="160" stroke="var(--rule-soft)" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />

      {/* Labels */}
      <text x="0" y="20" fill="var(--ink-3)" fontSize="13"
            fontFamily="JetBrains Mono, monospace" letterSpacing="0.14em">SILICON · 20 kHz</text>
      <text x="0" y="110" fill="var(--accent)" fontSize="13"
            fontFamily="JetBrains Mono, monospace" letterSpacing="0.14em">SiC · 200 kHz</text>

      {/* Slow (classical) wave */}
      <polyline className="trace" points={slowPath}
                fill="none" stroke="var(--ink-2)" strokeWidth="2.5"
                strokeLinejoin="miter" strokeLinecap="square"
                style={{ '--len': slowLen, '--trace-dur': `${1400 / speed}ms` }} />

      {/* Fast (SiC) wave */}
      <polyline className="trace" points={fastPath}
                fill="none" stroke="var(--accent)" strokeWidth="2.5"
                strokeLinejoin="miter" strokeLinecap="square"
                style={{ '--len': fastLen, '--trace-dur': `${1800 / speed}ms`, animationDelay: '600ms' }} />

      {/* Perpetual scan-cursor — thin vertical bar with a warm glow that
          sweeps left→right continuously after the traces settle. Adds
          "live oscilloscope" feel to the slide. */}
      <g className="pwm-scan" style={{ '--sweep-dist': `${width}px` }}>
        <rect x="0" y="20" width="2.5" height={height - 20}
              fill="var(--accent-3)" opacity="0.85" />
        <rect x="-8" y="20" width="20" height={height - 20}
              fill="var(--accent-3)" opacity="0.18" filter="blur(6px)" />
      </g>
    </svg>
  );
}

/** Pareto front scatter: hundreds of random candidates, a convex-ish
 *  frontier drawn on top. Candidates on the frontier stay bright; dominated
 *  candidates fade. */
function ParetoFront({ width = 560, height = 320 }) {
  // Deterministic pseudo-random so visuals are stable across reloads.
  const seed = (s) => { let x = Math.sin(s) * 10000; return x - Math.floor(x); };
  const pts = [];
  for (let i = 0; i < 180; i++) {
    const x = 20 + seed(i * 7.1) * (width - 40);
    // Bias y to look like a cost cloud with a curved lower envelope:
    // y = f(x) + noise, where f(x) is decreasing+convex.
    const t = (x - 20) / (width - 40);
    const envelope = (1 - Math.pow(t, 0.8)) * 0.7 + 0.1; // 0.1..0.8
    const noise = Math.pow(seed(i * 3.3 + 1), 1.6) * 0.55;
    const yNorm = Math.min(0.95, envelope + noise);
    const y = 20 + yNorm * (height - 40);
    pts.push({ x, y, i });
  }

  // Frontier = lowest-y dot in each x-bucket (Pareto-optimal in min-x, min-y sense).
  const buckets = 14;
  const bucketWidth = (width - 40) / buckets;
  const frontier = [];
  for (let b = 0; b < buckets; b++) {
    const xLo = 20 + b * bucketWidth;
    const xHi = xLo + bucketWidth;
    const inside = pts.filter(p => p.x >= xLo && p.x < xHi);
    if (inside.length) {
      inside.sort((a, b) => a.y - b.y);
      frontier.push(inside[0]);
    }
  }
  // Enforce monotonic frontier (no bumps up as x grows — accept any; as y
  // should be non-increasing along "efficiency up, cost down" direction,
  // we just take the envelope as-drawn).
  const frontierIds = new Set(frontier.map(p => p.i));

  // Approximate frontier path length for trace animation.
  let pathLen = 0;
  const pathD = frontier.map((p, i) => {
    if (i === 0) return `M${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    const prev = frontier[i - 1];
    pathLen += Math.hypot(p.x - prev.x, p.y - prev.y);
    return `L${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
         style={{ overflow: 'visible' }}>
      {/* Axes */}
      <line x1="20" y1={height - 20} x2={width - 20} y2={height - 20}
            stroke="var(--rule-soft)" strokeWidth="1" />
      <line x1="20" y1="20" x2="20" y2={height - 20}
            stroke="var(--rule-soft)" strokeWidth="1" />
      <text x={width - 60} y={height - 4} fill="var(--ink-3)" fontSize="12"
            fontFamily="JetBrains Mono, monospace" letterSpacing="0.12em">COST →</text>
      <text x="4" y="16" fill="var(--ink-3)" fontSize="12"
            fontFamily="JetBrains Mono, monospace" letterSpacing="0.12em">↑ LOSS</text>

      {/* Candidate dots — dominated ones drawn dim and breathe subtly,
          frontier ones bright and glow-pulse more strongly. */}
      {pts.map((p) => {
        const onFrontier = frontierIds.has(p.i);
        const finalOpacity = onFrontier ? 1 : 0.28;
        const r = onFrontier ? 4 : 2.5;
        const fill = onFrontier ? 'var(--accent)' : 'var(--ink-2)';
        const delay = 400 + (p.i % 40) * 25;
        // Per-dot idle motion. Deterministic via seed().
        const ang = seed(p.i * 3.3) * Math.PI * 2;
        const mag = onFrontier ? 1.5 + seed(p.i * 1.7) * 1.5 : 1 + seed(p.i * 1.9);
        return (
          <circle key={p.i} className="candidate-dot"
                  cx={p.x} cy={p.y} r={r} fill={fill}
                  style={{
                    '--d': `${delay}ms`,
                    '--final-opacity': finalOpacity,
                    '--dx': `${(Math.cos(ang) * mag).toFixed(1)}px`,
                    '--dy': `${(Math.sin(ang) * mag).toFixed(1)}px`,
                    '--idle-dur': `${(3.6 + seed(p.i * 2.3) * 2.2).toFixed(2)}s`,
                    '--idle-scale': onFrontier ? 0.35 : 0.10,
                    '--idle-opacity-boost': onFrontier ? 0.0 : 0.25,
                  }} />
        );
      })}

      {/* Frontier curve (drawn after dots). */}
      <path d={pathD} className="trace" fill="none"
            stroke="var(--accent-3)" strokeWidth="2.5" strokeLinejoin="round"
            style={{ '--len': pathLen, '--trace-dur': '1800ms', animationDelay: '1700ms' }} />
    </svg>
  );
}

/** Tiny neural net — 3 layers with animated synapses + activation pulses. */
function NeuralNetMini({ width = 220, height = 160 }) {
  const layers = [
    [30, 60, 90, 120],           // input (4 nodes)
    [40, 70, 100, 130],           // hidden (4 nodes)
    [70, 110],                     // output (2 nodes)
  ];
  const xCols = [30, width / 2, width - 30];
  const nodes = layers.map((ys, ci) => ys.map((y) => ({ x: xCols[ci], y })));
  // Build edges layer-to-layer
  const edges = [];
  for (let l = 0; l < nodes.length - 1; l++) {
    for (const a of nodes[l]) for (const b of nodes[l + 1]) edges.push([a, b]);
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      {edges.map(([a, b], i) => (
        <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="var(--rule-soft)" strokeWidth="1" opacity="0.5" />
      ))}
      {edges.filter((_, i) => i % 3 === 0).map(([a, b], i) => (
        <line key={`s${i}`} className="synapse"
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="var(--accent)" strokeWidth="1.5"
              strokeDasharray="10 190"
              style={{ animationDelay: `${i * 200}ms` }} />
      ))}
      {nodes.flat().map((n, i) => (
        <circle key={i} className="pulse-dot" cx={n.x} cy={n.y} r="5"
                fill="var(--accent)"
                style={{ animationDelay: `${(i % 5) * 240}ms` }} />
      ))}
    </svg>
  );
}

/** Fuzzy membership — three overlapping triangles (low/med/high). */
function FuzzyMembership({ width = 220, height = 120 }) {
  const baseY = height - 20;
  const peakY = 30;
  const tri = (cx, color, delay) => {
    const w = 70;
    const d = `M${cx - w},${baseY} L${cx},${peakY} L${cx + w},${baseY}`;
    return (
      <path key={cx} d={d} fill="none" stroke={color} strokeWidth="2"
            className="trace"
            style={{ '--len': 180, '--trace-dur': '900ms', animationDelay: `${delay}ms` }} />
    );
  };
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <line x1="10" y1={baseY} x2={width - 10} y2={baseY} stroke="var(--rule-soft)" strokeWidth="1" />
      {tri(60,  'var(--accent-3)', 0)}
      {tri(110, 'var(--accent)',   300)}
      {tri(160, 'var(--accent-2)', 600)}
      <text x="44"  y={height - 4} fill="var(--ink-3)" fontSize="10"
            fontFamily="JetBrains Mono, monospace" letterSpacing="0.1em">LOW</text>
      <text x="94"  y={height - 4} fill="var(--ink-3)" fontSize="10"
            fontFamily="JetBrains Mono, monospace" letterSpacing="0.1em">MED</text>
      <text x="148" y={height - 4} fill="var(--ink-3)" fontSize="10"
            fontFamily="JetBrains Mono, monospace" letterSpacing="0.1em">HIGH</text>
    </svg>
  );
}

/** Decision tree — three levels, branches draw in sequence. */
function DecisionTree({ width = 220, height = 140 }) {
  // Node positions
  const root = { x: width / 2, y: 20 };
  const l1 = [{ x: width * 0.25, y: 70 }, { x: width * 0.75, y: 70 }];
  const l2 = [
    { x: width * 0.12, y: 120 }, { x: width * 0.38, y: 120 },
    { x: width * 0.62, y: 120 }, { x: width * 0.88, y: 120 },
  ];
  const edge = (a, b, delay) => (
    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          className="trace"
          stroke="var(--accent)" strokeWidth="1.8"
          style={{ '--len': Math.hypot(b.x - a.x, b.y - a.y),
                   '--trace-dur': '500ms', animationDelay: `${delay}ms` }} />
  );
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      {edge(root, l1[0], 200)} {edge(root, l1[1], 200)}
      {edge(l1[0], l2[0], 700)} {edge(l1[0], l2[1], 700)}
      {edge(l1[1], l2[2], 700)} {edge(l1[1], l2[3], 700)}
      {[root, ...l1, ...l2].map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r={i === 0 ? 8 : i < 3 ? 6 : 5}
                fill="var(--ink)" stroke="var(--accent)" strokeWidth="2"
                className="candidate-dot"
                style={{ '--d': `${(i < 1 ? 0 : i < 3 ? 400 : 1000)}ms`,
                         '--final-opacity': 1 }} />
      ))}
    </svg>
  );
}

/** Particle swarm — dots drifting toward a target star. */
function ParticleSwarm({ width = 220, height = 140 }) {
  const seed = (s) => { let x = Math.sin(s * 12.9) * 437.5; return x - Math.floor(x); };
  const target = { x: width * 0.68, y: height * 0.42 };
  const dots = Array.from({ length: 22 }, (_, i) => {
    const t = seed(i);
    const ang = t * Math.PI * 2;
    const r = 20 + seed(i + 100) * 50;
    return {
      x: target.x + Math.cos(ang) * r,
      y: target.y + Math.sin(ang) * r,
      dx: (target.x - (target.x + Math.cos(ang) * r)) * 0.12,
      dy: (target.y - (target.y + Math.sin(ang) * r)) * 0.12,
      delay: i * 80,
    };
  });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      {/* Target */}
      <g transform={`translate(${target.x},${target.y})`}>
        <circle r="14" fill="none" stroke="var(--accent)" strokeWidth="1" opacity="0.4"
                className="pulse-dot" />
        <path d="M0,-8 L2,-2 L8,0 L2,2 L0,8 L-2,2 L-8,0 L-2,-2 Z"
              fill="var(--accent)" />
      </g>
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r="2.5" fill="var(--accent-3)"
                className="drift"
                style={{
                  '--dx': `${d.dx}px`, '--dy': `${d.dy}px`,
                  '--drift-dur': `${3.2 + (i % 4) * 0.4}s`,
                  animationDelay: `${d.delay}ms`,
                }} />
      ))}
    </svg>
  );
}

/** Animated sensor sparkline — continuous left-scrolling live-telemetry
 *  feel. We build ONE period of a noisy waveform, then render it twice
 *  side-by-side inside a clipped group. The group translates -period
 *  infinitely → seamless loop. A pulsing "head" dot anchors the right
 *  edge so the sparkline reads as "now". */
function Sparkline({ width = 260, height = 64, trend = 'up', thresholdAt, color, labelRight, seedOffset = 0 }) {
  const seed = (s) => { let x = Math.sin((s + seedOffset) * 9.13) * 10000; return x - Math.floor(x); };
  const N = 64;
  const period = width - 60;   // scrolling period width
  const traceY = (t) => {
    let base;
    if (trend === 'up')        base = 0.25 + t * 0.55;
    else if (trend === 'flat') base = 0.5;
    else if (trend === 'drift')base = 0.3 + t * 0.25 + Math.sin(t * 8) * 0.05;
    else                       base = 0.45 - t * 0.25; // down
    const noise = (seed(t * 100) - 0.5) * 0.12;
    return 6 + (1 - Math.max(0, Math.min(1, base + noise))) * (height - 12);
  };
  // Build one period of points. Ensure endpoints match so two tiles
  // seam cleanly when placed side-by-side.
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = t * period;
    pts.push(`${x.toFixed(1)},${traceY(t).toFixed(1)}`);
  }
  // Stitch: force the last point to equal the first so there's no jump
  // at the seam between tile 1 and tile 2.
  const first = pts[0].split(',');
  pts[pts.length - 1] = `${period.toFixed(1)},${first[1]}`;
  const pointsStr = pts.join(' ');
  const strokeColor = color || 'var(--accent)';
  // Unique clip id so multiple sparklines on a slide don't collide.
  const clipId = `spark-clip-${Math.abs(Math.round(seedOffset * 999 + width + height))}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={period} height={height} />
        </clipPath>
      </defs>
      {thresholdAt != null && (
        <g>
          <line x1="0" y1={thresholdAt} x2={period} y2={thresholdAt}
                stroke="var(--accent-2)" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
          <text x={width - 56} y={thresholdAt + 4} fill="var(--accent-2)" fontSize="10"
                fontFamily="JetBrains Mono, monospace" letterSpacing="0.1em">FAULT</text>
        </g>
      )}
      {/* Scrolling waveform — two tiles inside a clip, group translates -period */}
      <g clipPath={`url(#${clipId})`}>
        <g className="sparkline-sweep">
          <polyline points={pointsStr}
                    fill="none" stroke={strokeColor} strokeWidth="1.8"
                    strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={pointsStr}
                    transform={`translate(${period},0)`}
                    fill="none" stroke={strokeColor} strokeWidth="1.8"
                    strokeLinejoin="round" strokeLinecap="round" />
        </g>
      </g>
      {labelRight && (
        <text x={width - 56} y={height - 4} fill="var(--ink-3)" fontSize="10"
              fontFamily="JetBrains Mono, monospace" letterSpacing="0.1em">{labelRight}</text>
      )}
    </svg>
  );
}

/** Remaining Useful Life with uncertainty cone — a prediction curve that
 *  fans out into a 1σ band. */
function RULCone({ width = 360, height = 160 }) {
  // Observed segment (solid), predicted segment (dashed), uncertainty cone.
  // x in [0..w-20], y mapped so "health" = 1 at top.
  const w = width - 20;
  const h = height - 30;
  const obsN = 22, predN = 18;
  const obsPts = [];
  for (let i = 0; i < obsN; i++) {
    const t = i / (obsN - 1);
    const y = 20 + t * h * 0.45 + (Math.sin(i * 0.9) * 4);
    obsPts.push([20 + t * w * 0.45, y]);
  }
  const predPts = [];
  const upperPts = [];
  const lowerPts = [];
  const start = obsPts[obsPts.length - 1];
  for (let i = 0; i <= predN; i++) {
    const t = i / predN;
    const x = start[0] + t * (w - start[0]);
    const y = start[1] + t * (h * 0.55) + Math.pow(t, 1.3) * 18;
    predPts.push([x, y]);
    upperPts.push([x, y - Math.pow(t, 1.2) * 28]);
    lowerPts.push([x, y + Math.pow(t, 1.2) * 28]);
  }
  const toStr = arr => arr.map(p => p.join(',')).join(' ');
  const bandPath = 'M' + toStr(upperPts).replace(/ /g, ' L') + ' L' +
                   toStr([...lowerPts].reverse()).replace(/ /g, ' L') + ' Z';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <line x1="20" y1={height - 14} x2={width - 4} y2={height - 14}
            stroke="var(--rule-soft)" strokeWidth="1" />
      <text x="20" y={height - 2} fill="var(--ink-3)" fontSize="10"
            fontFamily="JetBrains Mono, monospace" letterSpacing="0.12em">NOW →</text>
      <text x={20 + w * 0.44} y={height - 2} fill="var(--accent)" fontSize="10"
            fontFamily="JetBrains Mono, monospace" letterSpacing="0.12em">PREDICTED</text>
      {/* Uncertainty band — fades in with candidate-dot, then breathes
          perpetually via the rul-breathe class (opacity + subtle scaleY). */}
      <g className="rul-breathe" style={{ transformBox: 'fill-box', transformOrigin: 'center top' }}>
        <path d={bandPath} className="candidate-dot"
              fill="color-mix(in oklch, var(--accent) 25%, transparent)"
              style={{ '--d': '1400ms', '--final-opacity': 0.65 }} />
      </g>
      {/* Observed */}
      <polyline className="trace" points={toStr(obsPts)}
                fill="none" stroke="var(--ink)" strokeWidth="2"
                style={{ '--len': 320, '--trace-dur': '1100ms' }} />
      {/* Predicted */}
      <polyline className="trace" points={toStr(predPts)}
                fill="none" stroke="var(--accent)" strokeWidth="2"
                strokeDasharray="5 4"
                style={{ '--len': 320, '--trace-dur': '1300ms', animationDelay: '900ms' }} />
      {/* "Now" marker */}
      <line x1={start[0]} y1="16" x2={start[0]} y2={height - 14}
            stroke="var(--accent-2)" strokeWidth="1" strokeDasharray="2 3" opacity="0.7" />
      <circle cx={start[0]} cy={start[1]} r="4" fill="var(--ink)" />
    </svg>
  );
}

/** Closed-loop control block diagram with two signal packets perpetually
 *  flowing around the loop (SET → summer → NN/MPC → Converter → OUT →
 *  feedback → summer). Uses SVG <animateMotion> along one continuous
 *  path; the path is invisible, the packets follow it. */
function ControlLoopDiagram({ width = 640, height = 220 }) {
  // Block positions
  const setY = height / 2;
  const r = 14;
  const summer = { x: 80, y: setY };
  const ctrl   = { x: 240, y: setY };
  const plant  = { x: 440, y: setY };
  const out    = { x: width - 30, y: setY };
  // Visible line segments (what the user sees). M-commands break continuity.
  const loopPath = `
    M10,${setY} L${summer.x - r},${setY}
    M${summer.x + r},${setY} L${ctrl.x - 60},${setY}
    M${ctrl.x + 60},${setY} L${plant.x - 60},${setY}
    M${plant.x + 60},${setY} L${out.x},${setY}
  `;
  const fbPath = `
    M${out.x},${setY}
    L${out.x},${setY + 70}
    L${summer.x},${setY + 70}
    L${summer.x},${setY + r}
  `.trim().replace(/\s+/g, ' ');
  // Single continuous path for packets to travel along — jumps "through"
  // the summer/controller/plant blocks (invisible path, packets ride it).
  // End point loops back to start (summer.x, setY+r up to summer.x, setY)
  // so motion visually closes.
  const packetPath = `
    M10,${setY}
    L${ctrl.x - 60},${setY}
    L${plant.x - 60},${setY}
    L${out.x},${setY}
    L${out.x},${setY + 70}
    L${summer.x},${setY + 70}
    L${summer.x},${setY}
    L${ctrl.x - 60},${setY}
  `.trim().replace(/\s+/g, ' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5"
                markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-2)" />
        </marker>
        {/* Invisible path for packet motion */}
        <path id="ctrlloop-motion" d={packetPath} fill="none" stroke="none" />
      </defs>
      {/* Visible lines */}
      <path d={loopPath} fill="none" stroke="var(--ink-2)" strokeWidth="2"
            markerEnd="url(#arr)" />
      <path d={fbPath} fill="none" stroke="var(--ink-2)" strokeWidth="2" />
      {/* Summer */}
      <circle cx={summer.x} cy={summer.y} r={r} fill="var(--bg)"
              stroke="var(--ink)" strokeWidth="1.5" />
      <text x={summer.x} y={summer.y + 4} textAnchor="middle" fontSize="16"
            fontFamily="JetBrains Mono, monospace" fill="var(--ink)">+</text>
      <text x={summer.x - 4} y={summer.y + 28} textAnchor="middle" fontSize="12"
            fontFamily="JetBrains Mono, monospace" fill="var(--ink-3)">−</text>
      {/* Controller */}
      <rect x={ctrl.x - 60} y={ctrl.y - 26} width="120" height="52"
            fill="var(--accent)" stroke="none" />
      <text x={ctrl.x} y={ctrl.y + 5} textAnchor="middle"
            fontFamily="Fraunces, serif" fontSize="18" fill="var(--bg)"
            fontStyle="italic">NN / MPC</text>
      {/* Plant */}
      <rect x={plant.x - 60} y={plant.y - 26} width="120" height="52"
            fill="var(--bg-2)" stroke="var(--ink)" strokeWidth="1" />
      <text x={plant.x} y={plant.y + 5} textAnchor="middle"
            fontFamily="Fraunces, serif" fontSize="18" fill="var(--ink)"
            fontStyle="italic">Converter</text>
      {/* Signal packets — two offset in phase so the flow reads as
          continuous. <animateMotion> plays while slide is active;
          because it's SVG-intrinsic animation it doesn't pause with
          CSS animation-play-state, but the packet only draws when the
          slide is visible, which is good enough. */}
      {[0, 1].map((i) => (
        <g key={i}>
          {/* Halo */}
          <circle r="7" fill="var(--accent-3)" opacity="0.35">
            <animateMotion dur="4.8s" repeatCount="indefinite" begin={`${i * -2.4}s`}>
              <mpath href="#ctrlloop-motion" />
            </animateMotion>
          </circle>
          {/* Core */}
          <circle r="3.4" fill="var(--accent-3)">
            <animateMotion dur="4.8s" repeatCount="indefinite" begin={`${i * -2.4}s`}>
              <mpath href="#ctrlloop-motion" />
            </animateMotion>
          </circle>
        </g>
      ))}
      {/* Labels */}
      <text x="10" y={setY - 10} fontSize="12" fill="var(--ink-3)"
            fontFamily="JetBrains Mono, monospace" letterSpacing="0.12em">SET</text>
      <text x={out.x - 4} y={setY - 10} fontSize="12" fill="var(--accent)"
            fontFamily="JetBrains Mono, monospace" letterSpacing="0.12em" textAnchor="end">OUT</text>
      <text x={summer.x + 110} y={setY + 82} fontSize="11" fill="var(--ink-3)"
            fontFamily="JetBrains Mono, monospace" letterSpacing="0.1em">FEEDBACK (sensor)</text>
    </svg>
  );
}

/** Paper-cluster swarm for "500+ papers". ~180 small dots that pop in and
 *  settle into three buckets. After entrance, each dot perpetually drifts
 *  ±3–5px around its anchor with a randomised 4–7s period so the cluster
 *  visibly "breathes" even after the reveal animation settles. */
function PaperCluster({ width = 560, height = 220 }) {
  const seed = (s) => { let x = Math.sin(s * 13.7) * 10000; return x - Math.floor(x); };
  const centers = [
    { x: width * 0.18, y: height * 0.55, color: 'var(--accent-3)', pct: 0.10 }, // design
    { x: width * 0.50, y: height * 0.45, color: 'var(--accent)',   pct: 0.78 }, // control
    { x: width * 0.82, y: height * 0.55, color: 'var(--accent-2)', pct: 0.12 }, // maintenance
  ];
  const total = 180;
  const dots = [];
  let idx = 0;
  centers.forEach((c, ci) => {
    const count = Math.round(total * c.pct);
    for (let i = 0; i < count; i++) {
      const ang = seed(idx + ci * 11) * Math.PI * 2;
      const rad = Math.sqrt(seed(idx + ci * 7)) * (ci === 1 ? 70 : 35);
      // Deterministic per-dot drift — small, tangential to the anchor
      // so the cluster "breathes" rather than dissolves.
      const driftAng = seed(idx * 2.7) * Math.PI * 2;
      const driftMag = 2.5 + seed(idx * 3.1) * 3;
      dots.push({
        x: c.x + Math.cos(ang) * rad,
        y: c.y + Math.sin(ang) * rad,
        color: c.color,
        delay: 400 + idx * 8,
        i: idx,
        dx: Math.cos(driftAng) * driftMag,
        dy: Math.sin(driftAng) * driftMag,
        idleDur: 4.2 + seed(idx * 5.1) * 2.8,
      });
      idx++;
    }
  });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      {dots.map(d => (
        <circle key={d.i} cx={d.x} cy={d.y} r="2.3" fill={d.color}
                className="candidate-dot"
                style={{
                  '--d': `${d.delay}ms`,
                  '--final-opacity': 0.85,
                  '--dx': `${d.dx.toFixed(1)}px`,
                  '--dy': `${d.dy.toFixed(1)}px`,
                  '--idle-dur': `${d.idleDur.toFixed(2)}s`,
                  '--idle-scale': 0.15,
                  '--idle-opacity-boost': 0.12,
                }} />
      ))}
      {centers.map((c, i) => (
        <g key={i}>
          <text x={c.x} y={height - 10} textAnchor="middle"
                fontFamily="JetBrains Mono, monospace" fontSize="12"
                letterSpacing="0.14em" fill="var(--ink-2)">
            {['DESIGN', 'CONTROL', 'MAINTENANCE'][i]}
          </text>
          <text x={c.x} y={height - 26} textAnchor="middle"
                fontFamily="JetBrains Mono, monospace" fontSize="13"
                fill={c.color} fontWeight="500">
            {Math.round(c.pct * 100)}%
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Projection chart — design/control/maintenance shares at 2020/2025/2030.
 *
 *  The three series-name labels (e.g. "MAINTENANCE · 34%") render to the
 *  RIGHT of each curve's 2030 endpoint, so xs[2] must leave ≥ 155 px of
 *  horizontal room inside the viewport for the label + left-gap. We
 *  place xs[2] at `width - 160` and rely on SVG's clipping at `width`
 *  to keep everything visible inside the chart panel. */
function TrendProjection({ width = 560, height = 240 }) {
  // x positions for three time checkpoints — last one inset to leave
  // clear room for the series-name labels. "MAINTENANCE · 34%" at 13 px
  // mono needs ~160 px; we reserve 172 for safety.
  const labelReserve = 172;
  const xs = [55, width / 2, width - labelReserve];
  const years = [2020, 2025, 2030];
  // y: top = 0%, bottom = 100%, drawing as scaled bars / curves
  const topY = 30, botY = height - 30;
  const ys = v => botY - v * (botY - topY);
  // Control, Maintenance, Design shares.
  const series = [
    { k: 'Control',     color: 'var(--accent)',   pts: [0.78, 0.58, 0.42] },
    { k: 'Maintenance', color: 'var(--accent-3)', pts: [0.12, 0.22, 0.34] },
    { k: 'Design',      color: 'var(--accent-2)', pts: [0.10, 0.20, 0.24] },
  ];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      {/* gridlines */}
      {[0.25, 0.5, 0.75].map((v, i) => (
        <line key={i} x1="40" y1={ys(v)} x2={width - 4} y2={ys(v)}
              stroke="var(--rule-soft)" strokeWidth="1" strokeDasharray="2 4" opacity="0.55" />
      ))}
      {/* year labels */}
      {xs.map((x, i) => (
        <g key={i}>
          <line x1={x} y1={topY} x2={x} y2={botY} stroke="var(--rule-soft)" strokeWidth="1" opacity="0.5" />
          <text x={x} y={botY + 18} textAnchor="middle"
                fontFamily="JetBrains Mono, monospace" fontSize="13"
                letterSpacing="0.14em" fill={i === 2 ? 'var(--accent)' : 'var(--ink-2)'}>
            {years[i]}
          </text>
        </g>
      ))}
      {/* series curves */}
      {series.map((s, si) => {
        const pts = s.pts.map((v, i) => [xs[i], ys(v)]);
        // Smooth curve via quadratic control points midway.
        const d = pts.reduce((acc, [x, y], i) => {
          if (i === 0) return `M${x},${y}`;
          const [px, py] = pts[i - 1];
          const cx = (px + x) / 2;
          return acc + ` Q${cx},${py} ${cx},${(py + y) / 2} T${x},${y}`;
        }, '');
        return (
          <g key={s.k}>
            <path d={d} className="trace" fill="none" stroke={s.color} strokeWidth="2.5"
                  style={{ '--len': 1200, '--trace-dur': '1400ms',
                           animationDelay: `${400 + si * 250}ms` }} />
            {pts.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="5" fill={s.color}
                      className="candidate-dot"
                      style={{ '--d': `${600 + si * 250 + i * 180}ms`, '--final-opacity': 1 }} />
            ))}
            {/* right-edge label */}
            <text x={xs[xs.length - 1] + 8} y={pts[pts.length - 1][1] + 4}
                  fontFamily="JetBrains Mono, monospace" fontSize="13"
                  fill={s.color} letterSpacing="0.1em">
              {s.k.toUpperCase()} · {Math.round(s.pts[s.pts.length - 1] * 100)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Ambient particle drift — for hero/thanks slides. */
function AmbientDrift({ count = 24, className }) {
  const seed = (s) => { let x = Math.sin(s * 19.3) * 10000; return x - Math.floor(x); };
  const dots = Array.from({ length: count }, (_, i) => ({
    top:  `${(seed(i) * 100).toFixed(1)}%`,
    left: `${(seed(i + 99) * 100).toFixed(1)}%`,
    dx:   `${(seed(i + 55) * 30 - 15).toFixed(1)}px`,
    dy:   `${(seed(i + 77) * 30 - 15).toFixed(1)}px`,
    dur:  `${4 + seed(i + 33) * 4}s`,
    size: 1 + seed(i + 11) * 2,
  }));
  return (
    <div className={className} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {dots.map((d, i) => (
        <span key={i} className="drift" style={{
          position: 'absolute', top: d.top, left: d.left,
          width: d.size, height: d.size, borderRadius: '50%',
          background: 'var(--accent)', opacity: 0.55,
          '--dx': d.dx, '--dy': d.dy, '--drift-dur': d.dur,
        }} />
      ))}
    </div>
  );
}

/* ── Type / spacing tokens ─────────────────────────────────────── */
const TYPE = {
  mega: 180,       // hero numerals
  h1: 88,          // slide titles
  h2: 64,          // big headline
  h3: 44,          // section title
  lead: 36,        // lead paragraph
  body: 30,        // body text
  small: 26,       // captions
  mono: 24,        // metadata / labels
};
const SPACE = {
  padX: 120,
  padY: 90,
  titleGap: 48,
  itemGap: 24,
};

/* ── Chapter marker (top-right corner) ─────────────────────────── */
function ChapterMark({ chapter, idx, total }) {
  const phases = { DESIGN: 'Design', CONTROL: 'Control', MAINTENANCE: 'Maintenance', FRAME: null };
  return (
    <div style={{
      position: 'absolute', top: 48, right: 72,
      display: 'flex', alignItems: 'center', gap: 20,
      fontFamily: 'JetBrains Mono, ui-monospace, monospace',
      fontSize: 18, letterSpacing: '0.14em', textTransform: 'uppercase',
      color: 'var(--ink-3)',
    }}>
      {chapter && chapter !== 'FRAME' && (
        <>
          <span style={{
            padding: '6px 12px',
            background: 'var(--ink)', color: 'var(--bg)',
            borderRadius: 2,
          }}>{chapter}</span>
          <span style={{ width: 24, height: 1, background: 'var(--ink-3)' }} />
        </>
      )}
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
        {String(idx).padStart(2, '0')} <span style={{ opacity: 0.5 }}>/ {String(total).padStart(2, '0')}</span>
      </span>
    </div>
  );
}

/* ── Footer strip (bottom) ─────────────────────────────────────── */
function Footer({ left, right }) {
  return (
    <div style={{
      position: 'absolute', left: 72, right: 72, bottom: 48,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 14, letterSpacing: '0.14em', textTransform: 'uppercase',
      color: 'var(--ink-3)',
    }}>
      <span style={{ whiteSpace: 'nowrap' }}>{left}</span>
      <span style={{ whiteSpace: 'nowrap' }}>{right}</span>
    </div>
  );
}

/* ── Kicker (small label above title) ──────────────────────────── */
function Kicker({ children, color, delay = 0 }) {
  return (
    <div data-anim="rise" style={{
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: TYPE.mono, letterSpacing: '0.18em',
      textTransform: 'uppercase',
      color: color || 'var(--accent)',
      fontWeight: 500,
      marginBottom: 24, animationDelay: `${delay}ms`,
    }}>{children}</div>
  );
}

/* ── Slide frame ───────────────────────────────────────────────── */
function Frame({ chapter, idx, total, dense, children, starfield = true, footerLeft = 'ECE-563 · Paper Review', footerRight }) {
  return (
    <div className={`slide ${starfield ? 'starfield' : ''} nebula`}
         style={{ width: '100%', height: '100%', padding: `${SPACE.padY}px ${SPACE.padX}px`,
                  display: 'flex', flexDirection: 'column' }}>
      <ChapterMark chapter={chapter} idx={idx} total={total} />
      {children}
      <Footer left={footerLeft} right={footerRight || `Zhao, Blaabjerg & Wang — TPEL 2021`} />
    </div>
  );
}

/* ── Slide 1: Title ─────────────────────────────────────────────── */
function SlideTitle({ idx, total, presenter }) {
  return (
    <div className="slide starfield starfield-dense nebula"
         style={{ width: '100%', height: '100%', padding: `${SPACE.padY}px ${SPACE.padX}px`,
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      {/* Top: citation bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        fontFamily: 'JetBrains Mono, monospace', fontSize: 22, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: 'var(--ink-3)',
      }}>
        <span style={{ whiteSpace: 'nowrap' }}>Paper Review · Spring 2026</span>
        <span style={{ whiteSpace: 'nowrap' }}>ECE-563 · Smart Grid</span>
      </div>

      {/* Hero — heavy visual weight, typographic */}
      <div style={{ marginTop: 'auto', marginBottom: 'auto' }}>
        <div data-anim="rise" style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: TYPE.mono, letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--accent)', marginBottom: 32, fontWeight: 500,
        }}>
          ◆ &nbsp;A review of 500+ publications
        </div>
        <h1 style={{
          margin: 0,
          fontFamily: 'Fraunces, "Playfair Display", Georgia, serif',
          fontWeight: 400,
          fontSize: 156,
          lineHeight: 0.95,
          letterSpacing: '-0.035em',
          color: 'var(--ink)',
        }}>
          <SplitText delay={200} step={36}>AI in Power</SplitText><br/>
          <SplitText delay={600} step={36}>Electronics</SplitText><span data-anim="pop" style={{ color: 'var(--accent)', animationDelay: '1400ms', display: 'inline-block' }}>.</span>
        </h1>
        <div data-anim="rise" style={{
          marginTop: 48, animationDelay: '1500ms',
          fontSize: 40, lineHeight: 1.3,
          color: 'var(--ink-2)', maxWidth: 1400,
          fontWeight: 300,
        }}>
          What <em style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>Zhao, Blaabjerg</em> &amp; <em style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>Wang</em> showed us —
          and where their map stops.
        </div>
      </div>

      {/* Bottom — presenter + citation */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 40,
        paddingTop: 40, borderTop: `1px solid var(--rule)`,
      }}>
        <div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 24, letterSpacing: '0.12em',
                        textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 16 }}>Presenter</div>
          <div style={{ fontSize: 32, color: 'var(--ink)' }}>{presenter}</div>
        </div>
        <div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 24, letterSpacing: '0.12em',
                        textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 16 }}>Source</div>
          <div style={{ fontSize: 26, color: 'var(--ink)', lineHeight: 1.35 }}>
            IEEE Transactions on Power Electronics<br/>
            <span style={{ color: 'var(--ink-2)' }}>Vol. 36 · No. 4 · April 2021</span>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 24, color: 'var(--ink-2)', lineHeight: 1.4 }}>
          <div style={{ color: 'var(--ink-3)', marginBottom: 12, letterSpacing: '0.12em', fontSize: 24 }}>SLIDE</div>
          <div style={{ fontSize: 48, fontVariantNumeric: 'tabular-nums' }}>01 / {String(total).padStart(2, '0')}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Slide 2: Why care ─────────────────────────────────────────── */
function SlideWhy({ idx, total }) {
  const examples = [
    { k: '01', label: 'EV fast-charger', detail: '350 kW · DC-DC · SiC' },
    { k: '02', label: 'Solar inverter', detail: 'grid-tied · MPPT · GaN' },
    { k: '03', label: 'Data-center PSU', detail: 'redundant · 97%+ efficiency' },
  ];
  return (
    <Frame chapter="FRAME" idx={idx} total={total}>
      <Kicker>◆ &nbsp;Why this matters</Kicker>
      <h1 style={{
        margin: 0, marginBottom: 28,
        fontFamily: 'Fraunces, serif', fontWeight: 400,
        fontSize: 72, lineHeight: 1.02, letterSpacing: '-0.025em',
        color: 'var(--ink)', maxWidth: 1500,
      }}>
        <SplitText step={24}>Power electronics is the </SplitText><em style={{ fontStyle: 'italic' }}><SplitText delay={600} step={24}>hardware layer</SplitText></em><br/>
        <SplitText delay={1100} step={22}>under the smart grid.</SplitText>
      </h1>

      {/* Switching-speed visual — silicon vs SiC, the 10× frequency jump */}
      <div data-anim="rise" style={{
        animationDelay: '1300ms',
        padding: '20px 32px 24px',
        border: '1px solid var(--rule-soft)',
        background: 'var(--bg-2)',
        marginBottom: 32,
        display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 48,
      }}>
        <PWMWaveform width={960} height={200} />
        <div style={{ maxWidth: 280 }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14,
                        color: 'var(--accent)', letterSpacing: '0.14em',
                        textTransform: 'uppercase', marginBottom: 10 }}>
            Switching · 10× jump
          </div>
          <div style={{ fontSize: 22, color: 'var(--ink)', lineHeight: 1.35,
                        fontFamily: 'Fraunces, serif', fontWeight: 300 }}>
            Wide-bandgap devices push converters past the regime where
            <em style={{ fontStyle: 'italic' }}> hand-tuned control </em>
            can keep up.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 32, marginTop: 'auto' }}>
        {examples.map((e, i) => (
          <div key={e.k} data-anim="rise" style={{
            animationDelay: `${1600 + i * 150}ms`,
            padding: '28px 32px',
            background: 'var(--bg-2)',
            borderLeft: '3px solid var(--accent)',
            minHeight: 160,
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          }}>
            <div style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 20, color: 'var(--accent)', letterSpacing: '0.1em',
            }}>{e.k}</div>
            <div>
              <div style={{ fontSize: 36, fontWeight: 500, color: 'var(--ink)',
                            marginBottom: 8, letterSpacing: '-0.02em' }}>{e.label}</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace',
                            fontSize: 17, color: 'var(--ink-3)', letterSpacing: '0.06em' }}>{e.detail}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="supporting" style={{
        marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--rule-soft)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 48,
      }}>
        <div style={{ fontSize: 26, color: 'var(--ink-2)', fontWeight: 300, lineHeight: 1.3, maxWidth: 1100 }}>
          Complexity is outrunning classical methods.
          <span style={{ color: 'var(--accent)', fontWeight: 500 }}> AI is the new lever.</span>
        </div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 16, color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          SiC · GaN · wide-bandgap era
        </div>
      </div>
    </Frame>
  );
}

/* ── Slide 3: Paper at a glance ────────────────────────────────── */
function SlideGlance({ idx, total }) {
  return (
    <Frame chapter="FRAME" idx={idx} total={total}>
      <Kicker>◆ &nbsp;The paper, in 40 seconds</Kicker>
      <h1 style={{
        margin: 0, marginBottom: 72,
        fontFamily: 'Fraunces, serif', fontWeight: 400,
        fontSize: TYPE.h1, lineHeight: 1.02, letterSpacing: '-0.025em',
      }}>
        <SplitText step={24}>Not a new algorithm —</SplitText><br/>
        <em style={{ fontStyle: 'italic' }}><SplitText delay={700} step={24}>a map of the field.</SplitText></em>
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0,
                    border: '1px solid var(--rule)', marginBottom: 48 }}>
        {[
          { label: 'Authors', big: 'Zhao · Blaabjerg · Wang',
            sub: 'Aalborg University · Center of Reliable Power Electronics (CORPE)' },
          { label: 'Venue',   big: 'IEEE TPEL',
            sub: 'Transactions on Power Electronics · Vol. 36 · Apr 2021 · 26 pp' },
          { label: 'Scope',   big: '500+ papers',
            sub: 'surveyed and organized into a lifecycle × method taxonomy' },
        ].map((t, i) => (
          <div key={t.label} data-anim="rise" style={{
            animationDelay: `${500 + i * 150}ms`,
            padding: '48px 40px',
            borderLeft: i ? '1px solid var(--rule)' : 'none',
            background: i === 1 ? 'var(--bg-2)' : 'var(--bg)',
          }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 18, color: 'var(--accent)', letterSpacing: '0.14em',
                          textTransform: 'uppercase', marginBottom: 28 }}>{t.label}</div>
            <div style={{ fontSize: 38, fontWeight: 500, color: 'var(--ink)',
                          lineHeight: 1.05, letterSpacing: '-0.02em', marginBottom: 20 }}>{t.big}</div>
            <div style={{ fontSize: 22, color: 'var(--ink-2)', lineHeight: 1.4 }}>{t.sub}</div>
          </div>
        ))}
      </div>

      {/* Paper-cluster visualization — 500+ dots self-organizing */}
      <div data-anim="rise" style={{
        animationDelay: '1100ms',
        marginBottom: 20, padding: '18px 28px',
        background: 'var(--bg-2)', border: '1px solid var(--rule-soft)',
        display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 36, alignItems: 'center',
      }}>
        <PaperCluster width={680} height={170} />
        <div style={{ maxWidth: 380 }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13,
                        color: 'var(--accent)', letterSpacing: '0.14em',
                        textTransform: 'uppercase', marginBottom: 8 }}>
            The survey corpus
          </div>
          <div style={{ fontSize: 18, color: 'var(--ink)', lineHeight: 1.35,
                        fontFamily: 'Fraunces, serif', fontWeight: 300 }}>
            180 dots here · <em style={{ fontStyle: 'italic' }}>500+ in the paper</em> ·
            each a publication, bucketed by the lifecycle phase it addresses.
          </div>
        </div>
      </div>

      {/* Pills — marginBottom: 88 reserves headroom for the absolutely
          positioned Footer (bottom:48 + footer-height ~24 + gap). */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 88 }}>
        {['review paper', 'taxonomy', 'outlook', 'design · control · maintenance'].map((t, i) => (
          <span key={t} data-anim="pop" style={{
            animationDelay: `${1500 + i * 100}ms`,
            padding: '10px 20px',
            border: '1px solid var(--ink)', color: 'var(--ink)',
            fontFamily: 'JetBrains Mono, monospace', fontSize: 18,
            letterSpacing: '0.08em', textTransform: 'lowercase',
            borderRadius: 999,
          }}>{t}</span>
        ))}
      </div>
    </Frame>
  );
}

/* ── Slide 4: Taxonomy 3×4 matrix ───────────────────────────────── */
function SlideTaxonomy({ idx, total }) {
  const rows = ['Design', 'Control', 'Maintenance'];
  const cols = ['Expert Systems', 'Fuzzy Logic', 'Metaheuristics', 'Machine Learning'];
  // prevalence 0..4, from lit review (informed by 78/10/12 split)
  const grid = [
    [1, 1, 4, 2], // design — metaheuristics dominant
    [3, 4, 2, 4], // control — fuzzy + ML very strong
    [2, 1, 1, 3], // maintenance — ML rising
  ];
  const heatColors = ['var(--heat-0)', 'var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)'];
  const share = [
    { label: 'Design',      pct: 9.8 },
    { label: 'Control',     pct: 77.8 },
    { label: 'Maintenance', pct: 12.4 },
  ];

  // Build a donut SVG
  const donut = (() => {
    const R = 110, r = 70, cx = 140, cy = 140;
    const segs = [];
    let start = -Math.PI / 2;
    const palette = ['var(--accent-3)', 'var(--accent)', 'var(--accent-2)'];
    share.forEach((s, i) => {
      const angle = (s.pct / 100) * Math.PI * 2;
      const end = start + angle;
      const x1 = cx + R * Math.cos(start), y1 = cy + R * Math.sin(start);
      const x2 = cx + R * Math.cos(end),   y2 = cy + R * Math.sin(end);
      const x3 = cx + r * Math.cos(end),   y3 = cy + r * Math.sin(end);
      const x4 = cx + r * Math.cos(start), y4 = cy + r * Math.sin(start);
      const large = angle > Math.PI ? 1 : 0;
      segs.push(
        <path key={i} d={`M${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2}
                         L${x3},${y3} A${r},${r} 0 ${large} 0 ${x4},${y4} Z`}
              fill={palette[i]} />);
      start = end;
    });
    return (
      <div className="donut-wrap">
        <svg width="280" height="280" viewBox="0 0 280 280">{segs}</svg>
      </div>
    );
  })();

  return (
    <Frame chapter="FRAME" idx={idx} total={total}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 40, gap: 40 }}>
        <div style={{ flex: '0 1 auto', maxWidth: 900 }}>
          <Kicker>◆ &nbsp;The spine of the paper</Kicker>
          <h1 style={{ margin: 0, fontFamily: 'Fraunces, serif', fontWeight: 400,
                       fontSize: 68, lineHeight: 1.04, letterSpacing: '-0.025em',
                       whiteSpace: 'nowrap' }}>
            <SplitText step={30}>3 lifecycle phases</SplitText><br/>
            <span data-anim="pop" style={{ color: 'var(--accent)', animationDelay: '800ms', display: 'inline-block' }}>×</span><SplitText delay={900} step={26}> 4 AI categories</SplitText>
          </h1>
        </div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 15,
                      color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase',
                      textAlign: 'right', lineHeight: 1.6, whiteSpace: 'nowrap' }}>
          heat = publication prevalence<br/>
          <span style={{ color: 'var(--ink-2)' }}>lighter = rare · darker = dominant</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 0.9fr', gap: 56, flex: 1 }}>
        {/* MATRIX */}
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '220px repeat(4, 1fr)', gap: 0 }}>
            <div />
            {cols.map(c => (
              <div key={c} style={{
                padding: '0 12px 16px', fontFamily: 'JetBrains Mono, monospace',
                fontSize: 18, fontWeight: 500, color: 'var(--ink)',
                letterSpacing: '0.04em', textAlign: 'center', lineHeight: 1.2,
              }}>{c}</div>
            ))}
            {rows.map((r, ri) => (
              <Fragment key={r}>
                <div style={{
                  display: 'flex', alignItems: 'center',
                  padding: '0 16px',
                  fontFamily: 'Fraunces, serif',
                  fontSize: 32, fontStyle: 'italic', color: 'var(--ink)',
                }}>{r}</div>
                {grid[ri].map((v, ci) => (
                  <div key={ci} data-anim="pop" style={{
                    animationDelay: `${400 + (ri * 4 + ci) * 60}ms`,
                    aspectRatio: '1.15',
                    background: heatColors[v],
                    border: '3px solid var(--bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'JetBrains Mono, monospace', fontSize: 22, fontWeight: 500,
                    color: v >= 3 ? 'var(--bg)' : 'var(--ink)',
                    position: 'relative',
                  }}>
                    <span style={{ opacity: 0.8 }}>
                      {['—', '·', '··', '●', '★'][v]}
                    </span>
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </div>

        {/* DONUT + lit share */}
        <div style={{
          padding: 40, background: 'var(--bg-2)',
          display: 'flex', flexDirection: 'column', gap: 28,
        }}>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 16,
            letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)',
          }}>Publication share</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {donut}
            <div style={{ flex: 1 }}>
              {share.map((s, i) => (
                <div key={s.label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  padding: '14px 0',
                  borderBottom: i < 2 ? '1px solid var(--rule-soft)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{
                      width: 12, height: 12, borderRadius: 2, display: 'inline-block',
                      background: ['var(--accent-3)', 'var(--accent)', 'var(--accent-2)'][i],
                    }} />
                    <span style={{ fontSize: 22, color: 'var(--ink)' }}>{s.label}</span>
                  </div>
                  <span style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 28, fontVariantNumeric: 'tabular-nums',
                    color: 'var(--ink)',
                  }}>{s.pct}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="supporting" style={{
            fontSize: 20, color: 'var(--ink-2)', lineHeight: 1.45,
            borderTop: '1px solid var(--rule-soft)', paddingTop: 20,
          }}>
            Control dominates because the problem is cleanest:
            real-time sensors, a defined plant, a clear metric.
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ── Slide 5: Four toolkits ────────────────────────────────────── */
function SlideToolkits({ idx, total }) {
  const tk = [
    { n: '01', name: 'Expert Systems', def: 'if-then rules encoded by humans',
      best: 'codified domain knowledge · explainability',
      era: '1970s →',
      viz: <DecisionTree width={200} height={130} /> },
    { n: '02', name: 'Fuzzy Logic', def: 'soft thresholds over linguistic variables',
      best: 'noisy, nonlinear control', era: '1980s → in production',
      viz: <FuzzyMembership width={200} height={110} /> },
    { n: '03', name: 'Metaheuristics', def: 'gradient-free population search — GA · PSO · SA',
      best: 'combinatorial design spaces', era: '1990s →',
      viz: <ParticleSwarm width={200} height={130} /> },
    { n: '04', name: 'Machine Learning', def: 'SVM · NN · CNN · LSTM · RL — patterns from data',
      best: 'classification · regression · learned control', era: '2010s → fastest growing',
      viz: <NeuralNetMini width={200} height={140} /> },
  ];
  return (
    <Frame chapter="FRAME" idx={idx} total={total}>
      <Kicker>◆ &nbsp;Four toolkits</Kicker>
      <h1 style={{ margin: 0, marginBottom: 40, fontFamily: 'Fraunces, serif', fontWeight: 400,
                   fontSize: 76, lineHeight: 1.02, letterSpacing: '-0.025em' }}>
        <SplitText step={22}>Four strengths, four regimes.</SplitText><br/>
        <span style={{ color: 'var(--ink-2)', fontSize: 44 }}><em style={{ fontStyle: 'italic' }}><SplitText delay={900} step={24}>No universal winner.</SplitText></em></span>
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr',
                    gap: 0, flex: 1, border: '1px solid var(--rule)' }}>
        {tk.map((t, i) => (
          <div key={t.n} data-anim="rise" style={{
            animationDelay: `${600 + i * 180}ms`,
            padding: '28px 36px',
            borderRight: i % 2 === 0 ? '1px solid var(--rule)' : 'none',
            borderBottom: i < 2 ? '1px solid var(--rule)' : 'none',
            background: (i === 1 || i === 2) ? 'var(--bg-2)' : 'var(--bg)',
            display: 'grid', gridTemplateColumns: '1fr 220px', gap: 24, alignItems: 'center',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                          height: '100%' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 20,
                                color: 'var(--accent)', letterSpacing: '0.14em' }}>{t.n}</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
                                color: 'var(--ink-3)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{t.era}</div>
                </div>
                <div style={{ fontSize: 36, fontWeight: 500, color: 'var(--ink)',
                              letterSpacing: '-0.02em', marginBottom: 10 }}>{t.name}</div>
                <div style={{ fontSize: 20, color: 'var(--ink-2)', lineHeight: 1.35,
                              fontStyle: 'italic', fontFamily: 'Fraunces, serif', fontWeight: 300 }}>{t.def}</div>
              </div>
              <div className="supporting" style={{
                marginTop: 20, paddingTop: 14,
                borderTop: '1px solid var(--rule-soft)',
                fontFamily: 'JetBrains Mono, monospace', fontSize: 13,
                color: 'var(--accent-2)', letterSpacing: '0.08em', textTransform: 'uppercase',
                lineHeight: 1.4,
              }}>
                Best for — <span style={{ color: 'var(--ink)' }}>{t.best}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {t.viz}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* ── Slide 6: Design ────────────────────────────────────────────── */
function SlideDesign({ idx, total }) {
  return (
    <Frame chapter="DESIGN" idx={idx} total={total}>
      <Kicker>◆ &nbsp;Phase 01 · Design</Kicker>
      <h1 style={{ margin: 0, marginBottom: 48, fontFamily: 'Fraunces, serif', fontWeight: 400,
                   fontSize: TYPE.h1, lineHeight: 1.02, letterSpacing: '-0.025em' }}>
        <SplitText step={22}>Searching </SplitText><em style={{ fontStyle: 'italic' }}><SplitText delay={400} step={30}>vast</SplitText></em><SplitText delay={600} step={22}> combinatorial spaces.</SplitText>
      </h1>

      {/* Two flows compared */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 1fr', gap: 0,
                    alignItems: 'stretch', marginBottom: 40 }}>
        {/* Classical */}
        <div data-anim="rise" style={{ padding: '32px 36px', background: 'var(--bg-2)', border: '1px solid var(--rule-soft)', animationDelay: '400ms' }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 16,
                        color: 'var(--ink-3)', letterSpacing: '0.14em',
                        textTransform: 'uppercase', marginBottom: 16 }}>Classical flow</div>
          <div style={{ fontSize: 30, color: 'var(--ink)', lineHeight: 1.5, fontWeight: 300 }}>
            Specify → Analyze → <span style={{ color: 'var(--ink-3)' }}>Iterate</span> → Validate
          </div>
          <div style={{ marginTop: 20, fontSize: 22, color: 'var(--ink-2)', lineHeight: 1.4 }}>
            <em style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>~10 iterations</em> per working day.
          </div>
        </div>

        {/* Arrow */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexDirection: 'column', color: 'var(--accent)' }}>
          <svg width="40" height="20" viewBox="0 0 40 20"><path d="M0,10 L30,10 M20,3 L30,10 L20,17"
            fill="none" stroke="currentColor" strokeWidth="2" /></svg>
        </div>

        {/* AI-augmented */}
        <div data-anim="rise" style={{ padding: '32px 36px',
                      background: 'var(--accent-2)', color: 'var(--bg)',
                      position: 'relative', animationDelay: '900ms' }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 16,
                        color: 'var(--accent-3)', letterSpacing: '0.14em',
                        textTransform: 'uppercase', marginBottom: 16 }}>AI-augmented flow</div>
          <div style={{ fontSize: 30, color: 'var(--bg)', lineHeight: 1.5, fontWeight: 300 }}>
            Specify → <span style={{ color: 'var(--accent-3)' }}>Metaheuristic / DNN-surrogate search</span> → Validate
          </div>
          <div style={{ marginTop: 20, fontSize: 22, color: 'rgba(255,255,255,0.75)', lineHeight: 1.4 }}>
            <em style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>10³–10⁴ candidates</em> · Pareto-aware.
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 20, fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 16, color: 'var(--accent)', letterSpacing: '0.12em',
                    textTransform: 'uppercase', textAlign: 'center' }}>
        — from tens of iterations to thousands, with Pareto-aware selection —
      </div>

      {/* Pareto front + sub-problems — left: visualization, right: the three tasks */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 40,
                    marginTop: 'auto', alignItems: 'center' }}>
        <div data-anim="rise" style={{
          animationDelay: '1400ms',
          padding: '24px 28px', background: 'var(--bg-2)',
          border: '1px solid var(--rule-soft)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                        marginBottom: 12 }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13,
                          color: 'var(--accent)', letterSpacing: '0.14em',
                          textTransform: 'uppercase' }}>Design-space search</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
                          color: 'var(--ink-3)', letterSpacing: '0.1em' }}>
              180 candidates · frontier highlighted
            </div>
          </div>
          <ParetoFront width={520} height={220} />
          <div className="supporting" style={{
            marginTop: 6, fontSize: 15, color: 'var(--ink-2)', lineHeight: 1.35,
            fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontWeight: 300,
          }}>
            Metaheuristics don't find <em>one</em> answer — they find a frontier.
            The engineer picks a point.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { t: 'Topology selection', s: 'which converter architecture?', ex: 'buck · boost · resonant · multi-level' },
            { t: 'Component sizing',   s: 'magnetics · capacitors · semiconductors', ex: 'multi-objective · non-convex' },
            { t: 'Layout optimization',s: 'thermal · EMI · parasitic', ex: 'simulated annealing + FEA' },
          ].map((x, i) => (
            <div key={x.t} data-anim="rise" style={{
              borderTop: '2px solid var(--ink)', paddingTop: 12,
              animationDelay: `${1600 + i * 160}ms`,
            }}>
              <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--ink)', marginBottom: 4,
                            letterSpacing: '-0.01em' }}>{x.t}</div>
              <div style={{ fontSize: 17, color: 'var(--ink-2)', lineHeight: 1.3, fontStyle: 'italic',
                            fontFamily: 'Fraunces, serif', marginBottom: 6 }}>{x.s}</div>
              <div className="supporting" style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: 13,
                color: 'var(--ink-3)', letterSpacing: '0.06em',
              }}>{x.ex}</div>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/* ── Slide 7: Control — three-tier stack ────────────────────────── */
function SlideControl({ idx, total }) {
  const tiers = [
    { tag: 'RESEARCH FRONTIER', name: 'Reinforcement Learning',
      detail: 'multi-objective trade-offs — efficiency · THD · thermal · lifetime',
      year: 'today →', fill: 'var(--accent-2)', text: 'var(--bg)', accent: 'var(--accent-3)' },
    { tag: 'STATE OF THE ART', name: 'Neural-net controllers + NN-approx MPC',
      detail: 'learn the plant inverse · µs-scale inference for switching rates',
      year: '2015 →', fill: 'var(--accent)', text: 'var(--bg)', accent: 'var(--bg)' },
    { tag: 'LEGACY PRODUCTION', name: 'Fuzzy logic controllers',
      detail: '30 years in motor drives, DC-DC — handles nonlinearity gracefully',
      year: '1990s →', fill: 'var(--bg-2)', text: 'var(--ink)', accent: 'var(--accent)' },
  ];
  return (
    <Frame chapter="CONTROL" idx={idx} total={total}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 48,
                    alignItems: 'flex-end', marginBottom: 28 }}>
        <div>
          <Kicker>◆ &nbsp;Phase 02 · Control</Kicker>
          <h1 style={{ margin: 0, fontFamily: 'Fraunces, serif', fontWeight: 400,
                       fontSize: 72, lineHeight: 1.02, letterSpacing: '-0.025em', whiteSpace: 'nowrap' }}>
            <SplitText step={24}>Beyond </SplitText><em style={{ fontStyle: 'italic' }}><SplitText delay={400} step={26}>hand-tuned PI.</SplitText></em>
          </h1>
        </div>
        <div style={{ textAlign: 'right', paddingTop: 28 }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 92, lineHeight: 0.95,
                        color: 'var(--accent)', fontWeight: 400, letterSpacing: '-0.03em' }}>
            <CountUp to={78} duration={1500} delay={500} suffix="%" />
          </div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14,
                        color: 'var(--ink-3)', letterSpacing: '0.12em', textTransform: 'uppercase',
                        marginTop: 4 }}>of the literature lives here</div>
        </div>
      </div>

      {/* Control loop diagram — shows what's inside the dominant block */}
      <div data-anim="rise" style={{
        animationDelay: '800ms',
        padding: '20px 32px 12px', marginBottom: 20,
        background: 'var(--bg-2)', border: '1px solid var(--rule-soft)',
        display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'center', gap: 40,
      }}>
        <ControlLoopDiagram width={680} height={200} />
        <div style={{ maxWidth: 340 }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13,
                        color: 'var(--accent)', letterSpacing: '0.14em',
                        textTransform: 'uppercase', marginBottom: 8 }}>
            What AI replaces
          </div>
          <div style={{ fontSize: 18, color: 'var(--ink)', lineHeight: 1.4,
                        fontFamily: 'Fraunces, serif', fontWeight: 300 }}>
            The controller block. Everything else stays.
            NN-approximated MPC gives <em style={{ fontStyle: 'italic' }}>µs</em> inference
            where full MPC would be milliseconds.
          </div>
        </div>
      </div>

      {/* Three tiers, stacked (top = frontier) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        {tiers.map((t, i) => (
          <div key={t.name} data-anim="wipe-down" style={{
            animationDelay: `${700 + i * 200}ms`,
            background: t.fill, color: t.text,
            padding: '32px 44px',
            display: 'grid', gridTemplateColumns: '220px 1fr 160px', gap: 32, alignItems: 'center',
            flex: 1, minHeight: 150,
            border: i === 2 ? '1px solid var(--rule-soft)' : 'none',
          }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14,
                          letterSpacing: '0.16em', color: t.accent }}>{t.tag}</div>
            <div>
              <div style={{ fontSize: 36, fontWeight: 500, letterSpacing: '-0.02em',
                            marginBottom: 8, lineHeight: 1.1 }}>{t.name}</div>
              <div className="supporting" style={{ fontSize: 22, opacity: 0.82, lineHeight: 1.35,
                            fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontWeight: 300 }}>
                {t.detail}
              </div>
            </div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 16,
                          textAlign: 'right', letterSpacing: '0.12em', textTransform: 'uppercase',
                          color: t.accent }}>{t.year}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* ── Slide 8: Maintenance pipeline ──────────────────────────────── */
function SlideMaintenance({ idx, total }) {
  return (
    <Frame chapter="MAINTENANCE" idx={idx} total={total}>
      <Kicker>◆ &nbsp;Phase 03 · Maintenance</Kicker>
      <h1 style={{ margin: 0, marginBottom: 48, fontFamily: 'Fraunces, serif', fontWeight: 400,
                   fontSize: TYPE.h1, lineHeight: 1.02, letterSpacing: '-0.025em' }}>
        <SplitText step={22}>Hearing failure </SplitText><em style={{ fontStyle: 'italic' }}><SplitText delay={500} step={28}>before</SplitText></em><SplitText delay={800} step={22}> it happens.</SplitText>
      </h1>

      {/* Lifecycle timeline */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ position: 'relative', height: 10, background: 'var(--bg-3)', borderRadius: 2,
                      overflow: 'hidden' }}>
          <div className="progress-fill" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '45%',
                        background: 'var(--accent-3)', animationDelay: '500ms' }} />
          <div className="progress-fill" style={{ position: 'absolute', left: '45%', top: 0, bottom: 0, width: '35%',
                        background: 'var(--accent)', animationDelay: '900ms', transformOrigin: 'left center' }} />
          <div className="progress-fill" style={{ position: 'absolute', left: '80%', top: 0, bottom: 0, width: '20%',
                        background: 'var(--accent-2)', animationDelay: '1200ms', transformOrigin: 'left center' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '45% 35% 20%', marginTop: 14,
                      fontFamily: 'JetBrains Mono, monospace', fontSize: 18,
                      letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          <div style={{ color: 'var(--ink)' }}>Healthy</div>
          <div style={{ color: 'var(--accent)' }}>Degrading</div>
          <div style={{ color: 'var(--accent-2)' }}>Fault</div>
        </div>
      </div>

      {/* Sensor sparklines (live-feel) → pipeline → RUL cone */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 40,
                    alignItems: 'stretch', flex: 1 }}>
        {/* Left: live sensor streams */}
        <div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14,
                        color: 'var(--accent)', letterSpacing: '0.14em',
                        textTransform: 'uppercase', marginBottom: 12 }}>
            Live sensor streams · module-level telemetry
          </div>
          {[
            { v: 'V_CE(on)', d: 'IGBT on-state voltage',     trend: 'up',    seed: 1.1 },
            { v: 'T_j',      d: 'junction temperature',      trend: 'drift', seed: 2.7 },
            { v: 'i-ripple', d: 'current ripple signature',  trend: 'flat',  seed: 3.9 },
            { v: 'R_bond',   d: 'bond-wire resistance drift',trend: 'up',    seed: 5.3 },
          ].map((s, i) => (
            <div key={s.v} data-anim="rise" style={{
              animationDelay: `${900 + i * 140}ms`,
              display: 'grid', gridTemplateColumns: '140px 1fr 320px', gap: 16, alignItems: 'center',
              padding: '10px 0',
              borderTop: i === 0 ? '1px solid var(--ink)' : '1px solid var(--rule-soft)',
              borderBottom: i === 3 ? '1px solid var(--ink)' : 'none',
            }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 20,
                            color: 'var(--ink)', fontWeight: 500 }}>{s.v}</div>
              <div style={{ fontSize: 17, color: 'var(--ink-2)', fontStyle: 'italic',
                            fontFamily: 'Fraunces, serif' }}>{s.d}</div>
              <Sparkline width={320} height={52} trend={s.trend}
                seedOffset={s.seed}
                color={s.trend === 'up' ? 'var(--accent-2)' : 'var(--accent)'}
                thresholdAt={s.trend === 'up' ? 10 : null} />
            </div>
          ))}

          {/* Processing pipeline (compressed) */}
          <div data-anim="rise" style={{
            animationDelay: '1700ms',
            marginTop: 20, padding: '16px 20px',
            background: 'var(--accent-2)', color: 'var(--bg)',
            display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
          }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
                           color: 'var(--accent-3)', letterSpacing: '0.14em',
                           textTransform: 'uppercase' }}>Pipeline</span>
            {[
              { m: 'CNN',     p: 'fault class' },
              { m: 'LSTM',    p: 'trajectory' },
              { m: 'GP + NN', p: 'RUL + σ' },
            ].map((p, i) => (
              <Fragment key={p.m}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 16, fontWeight: 500,
                                 color: 'var(--accent-3)' }}>{p.m}</span>
                  <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)',
                                 fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>→ {p.p}</span>
                </span>
                {i < 2 && <span style={{ color: 'var(--accent-3)', opacity: 0.5 }}>·</span>}
              </Fragment>
            ))}
          </div>
        </div>

        {/* Right: RUL cone — the payoff */}
        <div data-anim="rise" style={{
          animationDelay: '1400ms',
          background: 'var(--bg-2)', padding: '24px 28px',
          border: '1px solid var(--rule-soft)',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13,
                          color: 'var(--accent)', letterSpacing: '0.14em',
                          textTransform: 'uppercase', marginBottom: 8 }}>
              Remaining Useful Life
            </div>
            <div style={{ fontSize: 24, color: 'var(--ink)', lineHeight: 1.2,
                          fontFamily: 'Fraunces, serif', fontWeight: 400, marginBottom: 4 }}>
              <em style={{ fontStyle: 'italic' }}>Predict · with uncertainty.</em>
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.35 }}>
              Hybrid models (GP + NN) give you a point estimate <em>and</em> a 1σ band —
              what shift-planners actually need.
            </div>
          </div>
          <RULCone width={440} height={200} />
          <div className="supporting" style={{
            marginTop: 4, fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.3,
            borderTop: '1px solid var(--rule-soft)', paddingTop: 10,
            fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            Where ML is most clearly winning.
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ── Slide 9: Task-to-method ────────────────────────────────────── */
function SlideTasks({ idx, total }) {
  const tasks = [
    { n: '01', task: 'Optimization',              methods: 'metaheuristics · reinforcement learning' },
    { n: '02', task: 'Classification',            methods: 'expert systems · SVM · CNN' },
    { n: '03', task: 'Regression',                methods: 'neural nets · Gaussian processes · LSTM' },
    { n: '04', task: 'Data-structure exploration',methods: 'clustering · autoencoders · PCA' },
  ];
  return (
    <Frame chapter="FRAME" idx={idx} total={total}>
      <Kicker>◆ &nbsp;A second lens</Kicker>
      <h1 style={{ margin: 0, marginBottom: 40, fontFamily: 'Fraunces, serif', fontWeight: 400,
                   fontSize: TYPE.h1, lineHeight: 1.02, letterSpacing: '-0.025em' }}>
        <SplitText step={22}>Every AI-PE application</SplitText><br/>
        <SplitText delay={700} step={22}>reduces to </SplitText><em style={{ fontStyle: 'italic', color: 'var(--accent)' }}><SplitText delay={1100} step={30}>4 tasks.</SplitText></em>
      </h1>

      {/* Flow */}
      <div data-anim="rise" style={{
        padding: '24px 32px', marginBottom: 36,
        background: 'var(--bg-2)', border: '1px solid var(--rule-soft)',
        display: 'flex', alignItems: 'center', gap: 20, justifyContent: 'center',
        fontFamily: 'JetBrains Mono, monospace', fontSize: 22,
        animationDelay: '500ms',
      }}>
        <span style={{ color: 'var(--ink-2)' }}>PE problem</span>
        <span style={{ color: 'var(--accent)' }}>→</span>
        <span style={{ color: 'var(--ink)', fontWeight: 500 }}>task</span>
        <span style={{ color: 'var(--accent)' }}>→</span>
        <span style={{ color: 'var(--ink-2)' }}>AI method</span>
        <span style={{ marginLeft: 32, color: 'var(--ink-3)', fontSize: 18, fontStyle: 'italic',
                       fontFamily: 'Fraunces, serif' }}>
          pick the task first, not the toolkit
        </span>
      </div>

      {/* Table */}
      <div style={{ border: '1px solid var(--rule)', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1.5fr',
                      padding: '20px 32px', background: 'var(--ink)', color: 'var(--bg)',
                      fontFamily: 'JetBrains Mono, monospace', fontSize: 16,
                      letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          <div>#</div>
          <div>Task</div>
          <div>Candidate methods</div>
        </div>
        {tasks.map((t, i) => (
          <div key={t.n} data-anim="rise" style={{
            animationDelay: `${800 + i * 140}ms`,
            display: 'grid', gridTemplateColumns: '80px 1fr 1.5fr',
            padding: '28px 32px', alignItems: 'center',
            background: i % 2 ? 'var(--bg-2)' : 'var(--bg)',
            borderBottom: i < 3 ? '1px solid var(--rule-soft)' : 'none',
          }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 20,
                          color: 'var(--accent)' }}>{t.n}</div>
            <div style={{ fontSize: 32, color: 'var(--ink)', fontWeight: 500,
                          letterSpacing: '-0.01em' }}>{t.task}</div>
            <div style={{ fontSize: 24, color: 'var(--ink-2)',
                          fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontWeight: 300 }}>{t.methods}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* ── Slide 10: Open problems 2×2 ───────────────────────────────── */
function SlideOpen({ idx, total }) {
  const quads = [
    { n: '01', title: 'Data scarcity',
      body: 'rare fault modes aren\'t in the training set — you can\'t label what hasn\'t happened yet.',
      tag: 'failure-mode detection' },
    { n: '02', title: 'Interpretability',
      body: 'grid-connected hardware must pass functional-safety certification — black-box models fail that bar.',
      tag: 'commercial blocker' },
    { n: '03', title: 'Real-time constraints',
      body: 'microsecond inference on MCU-class controllers, not server GPUs. 200 MB transformers need not apply.',
      tag: 'µs-scale inference' },
    { n: '04', title: 'Hybrid physics + data',
      body: 'no clean recipe yet for combining first-principles models with learned components.',
      tag: 'the holy grail' },
  ];
  return (
    <Frame chapter="FRAME" idx={idx} total={total}>
      <Kicker>◆ &nbsp;Honest about limits</Kicker>
      <h1 style={{ margin: 0, marginBottom: 48, fontFamily: 'Fraunces, serif', fontWeight: 400,
                   fontSize: TYPE.h1, lineHeight: 1.02, letterSpacing: '-0.025em' }}>
        <SplitText step={24}>What AI </SplitText><em style={{ fontStyle: 'italic' }}><SplitText delay={500} step={24}>hasn't solved</SplitText></em><br/>
        <SplitText delay={1100} step={22}>in power electronics.</SplitText>
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr',
                    gap: 0, border: '1px solid var(--rule)', flex: 1 }}>
        {quads.map((q, i) => (
          <div key={q.n} data-anim="rise" style={{
            animationDelay: `${600 + i * 160}ms`,
            padding: '36px 40px',
            borderRight: i % 2 === 0 ? '1px solid var(--rule)' : 'none',
            borderBottom: i < 2 ? '1px solid var(--rule)' : 'none',
            background: i === 0 || i === 3 ? 'var(--bg)' : 'var(--bg-2)',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            position: 'relative',
          }}>
            <div style={{ position: 'absolute', top: 20, right: 24,
                          fontFamily: 'Fraunces, serif', fontSize: 100, color: 'var(--rule-soft)',
                          lineHeight: 1, fontWeight: 400, letterSpacing: '-0.04em' }}>{q.n}</div>
            <div>
              <div style={{ fontSize: 44, fontWeight: 500, color: 'var(--ink)',
                            letterSpacing: '-0.02em', marginBottom: 16, maxWidth: 480 }}>{q.title}</div>
              <div className="supporting" style={{ fontSize: 22, color: 'var(--ink-2)', lineHeight: 1.4,
                            maxWidth: 520, fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontWeight: 300 }}>
                {q.body}
              </div>
            </div>
            <div style={{ marginTop: 24, fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 15, color: 'var(--accent)', letterSpacing: '0.14em',
                          textTransform: 'uppercase' }}>› {q.tag}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* ── Slide 11: Critical take (editorial) ───────────────────────── */
function SlideTake({ idx, total }) {
  const cards = [
    { n: '01', kicker: 'TEMPORAL BLIND SPOT',
      claim: 'The taxonomy is 2021.',
      follow: 'Foundation models (2022+) aren\'t on the map. The 3×4 matrix would look different today — time-series foundation models, HDL-gen LLMs, control-pretrained transformers.',
      tone: 'dark' },
    { n: '02', kicker: 'UNDER-WEIGHTED',
      claim: 'Sim-to-real has a silent-bias problem.',
      follow: 'Most RL and NN controllers train in simulation. Simulators smooth over nonidealities that bite on real silicon. The paper names it; it doesn\'t weight it.',
      tone: 'light' },
    { n: '03', kicker: 'MY BET',
      claim: 'Maintenance gets to 30% in five years.',
      follow: 'Control is 78% today — but the data flywheel in maintenance (more sensors → more data → better models) is stronger. Redo this survey in 2030 and the numbers flip.',
      tone: 'accent' },
  ];
  return (
    <Frame chapter="FRAME" idx={idx} total={total}>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace', fontSize: TYPE.mono,
        letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--accent)',
        marginBottom: 24, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <span style={{ width: 48, height: 2, background: 'var(--accent)' }} />
        My take · stepping forward
      </div>
      <h1 style={{ margin: 0, marginBottom: 28, fontFamily: 'Fraunces, serif', fontWeight: 400,
                   fontSize: 64, lineHeight: 1.02, letterSpacing: '-0.025em' }}>
        <SplitText step={22}>What I inferred —</SplitText><br/>
        <em style={{ fontStyle: 'italic' }}><SplitText delay={700} step={24}>beyond the paper.</SplitText></em>
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        {cards.map((c, i) => {
          const animDelay = 600 + i * 200;
          const styles = c.tone === 'dark'
            ? { bg: 'var(--accent-2)', ink: 'var(--bg)', sub: 'rgba(255,255,255,0.75)', accent: 'var(--accent-3)' }
            : c.tone === 'accent'
              ? { bg: 'var(--accent)', ink: 'var(--bg)', sub: 'rgba(255,255,255,0.85)', accent: 'var(--bg)' }
              : { bg: 'var(--bg-2)', ink: 'var(--ink)', sub: 'var(--ink-2)', accent: 'var(--accent)' };
          return (
            <div key={c.n} data-anim="rise" style={{
              animationDelay: `${animDelay}ms`,
              background: styles.bg, color: styles.ink,
              padding: '24px 26px 28px',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              position: 'relative', minHeight: 240,
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                              marginBottom: 18 }}>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
                                color: styles.accent, letterSpacing: '0.16em' }}>{c.kicker}</div>
                  <div style={{ fontFamily: 'Fraunces, serif', fontSize: 26,
                                color: styles.accent, fontWeight: 400 }}>{c.n}</div>
                </div>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 28, fontWeight: 400,
                              lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: 14 }}>
                  <em style={{ fontStyle: 'italic' }}>{c.claim}</em>
                </div>
              </div>
              <div className="supporting" style={{ fontSize: 15, lineHeight: 1.45, color: styles.sub,
                            borderTop: `1px solid ${styles.accent}`, paddingTop: 12 }}>
                {c.follow}
              </div>
            </div>
          );
        })}
      </div>

      {/* The projection — 2020/2025/2030 share shift.
          Panel uses flex:1 from parent so it claims the leftover vertical
          space on slide 11. Chart is upsized to fill that space — width
          780, height 340 anchors the panel and removes the dead zone
          under the original 520×220 chart. */}
      <div data-anim="rise" style={{
        animationDelay: '1400ms', flex: 1,
        padding: '28px 36px', background: 'var(--bg-2)',
        border: '1px solid var(--rule-soft)',
        display: 'grid', gridTemplateColumns: '1fr auto', gap: 48, alignItems: 'center',
      }}>
        <div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13,
                        color: 'var(--accent)', letterSpacing: '0.14em',
                        textTransform: 'uppercase', marginBottom: 14 }}>
            My projection · lifecycle share of publications
          </div>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 34, color: 'var(--ink)',
                        lineHeight: 1.15, letterSpacing: '-0.02em', fontWeight: 400,
                        marginBottom: 14 }}>
            <em style={{ fontStyle: 'italic' }}>Maintenance closes the gap</em> —
            <span style={{ color: 'var(--accent)' }}> 12% → 34%</span> by 2030.
          </div>
          <div style={{ fontSize: 17, color: 'var(--ink-2)', lineHeight: 1.45, maxWidth: 560 }}>
            Control stays dominant, but the data flywheel (more sensors → more data →
            better models) bends the curve faster than design does.
          </div>
        </div>
        <TrendProjection width={780} height={340} />
      </div>
    </Frame>
  );
}

/* ── Slide 12: Three takeaways ─────────────────────────────────── */
function SlideTakeaways({ idx, total }) {
  const ts = [
    { n: '1', claim: 'AI in PE is here.', sub: 'Design · control · maintenance — already deployed.' },
    { n: '2', claim: 'Pick the task first.', sub: 'Not the toolkit. Task decides the method family.' },
    { n: '3', claim: 'The open problems are the point.', sub: 'Not a flaw — the reason this field is interesting.' },
  ];
  return (
    <Frame chapter="FRAME" idx={idx} total={total}>
      <Kicker>◆ &nbsp;Three things to leave with</Kicker>
      <h1 style={{ margin: 0, marginBottom: 48, fontFamily: 'Fraunces, serif', fontWeight: 400,
                   fontSize: TYPE.h1, lineHeight: 1.02, letterSpacing: '-0.025em' }}>
        <SplitText step={38}>Takeaways.</SplitText>
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1, justifyContent: 'center' }}>
        {ts.map((t, i) => (
          <div key={t.n} data-anim="rise" style={{
            animationDelay: `${500 + i * 220}ms`,
            display: 'grid', gridTemplateColumns: '140px 1fr',
            gap: 48, alignItems: 'baseline',
            padding: '32px 0',
            borderTop: '1px solid var(--ink)',
            borderBottom: i === 2 ? '1px solid var(--ink)' : 'none',
          }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 132, fontWeight: 400,
                          color: 'var(--accent)', lineHeight: 0.8, letterSpacing: '-0.04em' }}>{t.n}</div>
            <div>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 56, fontWeight: 400,
                            lineHeight: 1.02, letterSpacing: '-0.025em',
                            color: 'var(--ink)', marginBottom: 10 }}>
                <em style={{ fontStyle: 'italic' }}>{t.claim}</em>
              </div>
              <div className="supporting" style={{ fontSize: 24, color: 'var(--ink-2)',
                            lineHeight: 1.4, fontWeight: 300 }}>{t.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* ── Slide 13: Thanks + Q&A ────────────────────────────────────── */
function SlideThanks({ idx, total, presenter }) {
  return (
    <div className="slide starfield starfield-dense nebula"
         style={{ width: '100%', height: '100%', padding: `${SPACE.padY}px ${SPACE.padX}px`,
                  display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <AmbientDrift count={36} />
      <ChapterMark chapter="FRAME" idx={idx} total={total} />

      <div style={{ marginTop: 'auto', marginBottom: 'auto' }}>
        <div style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: TYPE.mono,
          letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--accent)',
          marginBottom: 40, fontWeight: 500,
        }}>
          ◆ &nbsp;Q &amp; A
        </div>
        <h1 style={{
          margin: 0, fontFamily: 'Fraunces, serif', fontWeight: 400,
          fontSize: 220, lineHeight: 0.9, letterSpacing: '-0.04em', color: 'var(--ink)',
        }}>
          <SplitText step={50}>Thank you</SplitText><span data-anim="pop" style={{ color: 'var(--accent)', animationDelay: '700ms', display: 'inline-block' }}>.</span>
        </h1>
        <div data-anim="rise" style={{ marginTop: 48, fontSize: 40, color: 'var(--ink-2)', fontWeight: 300, fontFamily: 'Fraunces, serif', fontStyle: 'italic', animationDelay: '900ms' }}>
          Questions welcome — especially on maintenance.
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 48,
        paddingTop: 32, borderTop: '1px solid var(--rule)',
      }}>
        <div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 16, letterSpacing: '0.12em',
                        textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 12 }}>
            Full citation
          </div>
          <div style={{ fontSize: 22, color: 'var(--ink)', lineHeight: 1.45, fontFamily: 'Fraunces, serif' }}>
            Zhao, S., Blaabjerg, F., &amp; Wang, H. (2021).
            <em style={{ fontStyle: 'italic' }}> An Overview of Artificial Intelligence
            Applications for Power Electronics.</em>{' '}
            IEEE Transactions on Power Electronics, 36(4), 4633–4658.
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 16, letterSpacing: '0.12em',
                        textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 12 }}>
            Presenter
          </div>
          <div style={{ fontSize: 22, color: 'var(--ink)', lineHeight: 1.4 }}>
            {presenter}<br/>
            <span style={{ color: 'var(--ink-3)' }}>ECE-563 · Smart Grid · Spring 2026</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Tweaks panel ──────────────────────────────────────────────── */
function TweaksPanel({ tweaks, setTweaks, visible, onClose }) {
  if (!visible) return null;
  const accents = [
    { id: 'blue',    v: '#0B3FB5', label: 'Deep Blue' },
    { id: 'violet',  v: '#5B21B6', label: 'Violet' },
    { id: 'plum',    v: '#831843', label: 'Plum' },
    { id: 'forest',  v: '#064E3B', label: 'Forest' },
    { id: 'ink',     v: '#0A0A1F', label: 'Ink' },
  ];
  return (
    <div style={{
      position: 'fixed', right: 24, bottom: 24,
      width: 320, background: '#0A0A1F', color: '#F5F5F0',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: 13, borderRadius: 12, padding: 20,
      boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      zIndex: 2147483500,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
                      letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.7 }}>Tweaks</div>
        <button onClick={onClose} style={{
          background: 'transparent', color: '#F5F5F0', border: 0, cursor: 'pointer',
          fontSize: 18, padding: 0,
        }}>×</button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ opacity: 0.65, fontSize: 11, letterSpacing: '0.08em',
                      textTransform: 'uppercase', marginBottom: 10,
                      fontFamily: 'JetBrains Mono, monospace' }}>Accent</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {accents.map(a => (
            <button key={a.id} onClick={() => setTweaks({ accent: a.v })} style={{
              width: 38, height: 38, border: tweaks.accent === a.v ? '2px solid #fff' : '2px solid transparent',
              borderRadius: '50%', background: a.v, cursor: 'pointer', padding: 0,
            }} title={a.label} />
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ opacity: 0.65, fontSize: 11, letterSpacing: '0.08em',
                      textTransform: 'uppercase', marginBottom: 10,
                      fontFamily: 'JetBrains Mono, monospace' }}>Theme</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['light', 'dark'].map(t => (
            <button key={t} onClick={() => setTweaks({ theme: t })} style={{
              flex: 1, padding: '10px 14px',
              background: tweaks.theme === t ? '#F5F5F0' : 'transparent',
              color: tweaks.theme === t ? '#0A0A1F' : '#F5F5F0',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 6, cursor: 'pointer', textTransform: 'capitalize',
              fontFamily: 'inherit', fontSize: 13,
            }}>{t}</button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ opacity: 0.65, fontSize: 11, letterSpacing: '0.08em',
                      textTransform: 'uppercase', marginBottom: 10,
                      fontFamily: 'JetBrains Mono, monospace' }}>Density</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[{ id: 'sparse', l: 'Sparse' }, { id: 'dense', l: 'Dense' }].map(d => (
            <button key={d.id} onClick={() => setTweaks({ density: d.id })} style={{
              flex: 1, padding: '10px 14px',
              background: tweaks.density === d.id ? '#F5F5F0' : 'transparent',
              color: tweaks.density === d.id ? '#0A0A1F' : '#F5F5F0',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 6, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 13,
            }}>{d.l}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Share globals ─────────────────────────────────────────────── */
Object.assign(window, {
  SlideTitle, SlideWhy, SlideGlance, SlideTaxonomy, SlideToolkits,
  SlideDesign, SlideControl, SlideMaintenance, SlideTasks, SlideOpen,
  SlideTake, SlideTakeaways, SlideThanks, TweaksPanel,
});

/* ── Boot ──────────────────────────────────────────────────────── */
const PRESENTER = 'Aswin Ram Kalugasala Moorthy';
const TOTAL = 13;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#831843",
  "theme": "dark",
  "density": "dense"
}/*EDITMODE-END*/;

/* ─── Theme-aware palette derivation ─────────────────────────────
 * From a single user-picked accent hex, derive an entire harmonious
 * palette (accent, accent-2, accent-3, heat-0…heat-4) that shifts
 * lighter in dark theme and darker in light theme so contrast stays
 * high in both. Uses OKLCH via color-mix so hue stays put.
 * ──────────────────────────────────────────────────────────────── */
function applyTweaks(t) {
  const root = document.documentElement;
  root.setAttribute('data-theme', t.theme);
  root.setAttribute('data-density', t.density);

  const isDark = t.theme === 'dark';
  const A = t.accent;

  // In dark theme: primary accent shifts LIGHTER & more saturated so it
  // pops against near-black. In light theme: shifts DARKER.
  //
  // We use color-mix with white / black to shift lightness while keeping
  // hue, and apply a secondary (deeper) and tertiary (brighter) variant.
  const set = (k, v) => root.style.setProperty(k, v);

  if (isDark) {
    // Dark theme — brighten accent (mix with off-white)
    set('--accent',    `color-mix(in oklch, ${A} 55%, #FFFFFF 45%)`);
    set('--accent-2',  `color-mix(in oklch, ${A} 85%, #FFFFFF 15%)`);
    set('--accent-3',  `color-mix(in oklch, ${A} 35%, #FFFFFF 65%)`);
    // Heat scale: from near-black to accent → near-white
    set('--heat-0',    `color-mix(in oklch, ${A}  6%, #0A0A14 94%)`);
    set('--heat-1',    `color-mix(in oklch, ${A} 22%, #0A0A14 78%)`);
    set('--heat-2',    `color-mix(in oklch, ${A} 55%, #0A0A14 45%)`);
    set('--heat-3',    `color-mix(in oklch, ${A} 70%, #FFFFFF 30%)`);
    set('--heat-4',    `color-mix(in oklch, ${A} 40%, #FFFFFF 60%)`);
  } else {
    // Light theme — deepen accent (mix with near-black)
    set('--accent',    `color-mix(in oklch, ${A} 82%, #000000 18%)`);
    set('--accent-2',  `color-mix(in oklch, ${A} 55%, #000000 45%)`);
    set('--accent-3',  `color-mix(in oklch, ${A} 70%, #FFFFFF 30%)`);
    // Heat scale: from near-white → darker accent
    set('--heat-0',    `color-mix(in oklch, ${A}  6%, #FFFFFF 94%)`);
    set('--heat-1',    `color-mix(in oklch, ${A} 22%, #FFFFFF 78%)`);
    set('--heat-2',    `color-mix(in oklch, ${A} 55%, #FFFFFF 45%)`);
    set('--heat-3',    `color-mix(in oklch, ${A} 80%, #000000 20%)`);
    set('--heat-4',    `color-mix(in oklch, ${A} 55%, #000000 45%)`);
  }
}

function mountAt(id, element) {
  const el = document.getElementById(id);
  if (el) ReactDOM.createRoot(el).render(element);
}

applyTweaks(TWEAK_DEFAULTS);

mountAt('s1',  <SlideTitle       idx={1}  total={TOTAL} presenter={PRESENTER} />);
mountAt('s2',  <SlideWhy         idx={2}  total={TOTAL} />);
mountAt('s3',  <SlideGlance      idx={3}  total={TOTAL} />);
mountAt('s4',  <SlideTaxonomy    idx={4}  total={TOTAL} />);
mountAt('s5',  <SlideToolkits    idx={5}  total={TOTAL} />);
mountAt('s6',  <SlideDesign      idx={6}  total={TOTAL} />);
mountAt('s7',  <SlideControl     idx={7}  total={TOTAL} />);
mountAt('s8',  <SlideMaintenance idx={8}  total={TOTAL} />);
mountAt('s9',  <SlideTasks       idx={9}  total={TOTAL} />);
mountAt('s10', <SlideOpen        idx={10} total={TOTAL} />);
mountAt('s11', <SlideTake        idx={11} total={TOTAL} />);
mountAt('s12', <SlideTakeaways   idx={12} total={TOTAL} presenter={PRESENTER} />);
mountAt('s13', <SlideThanks      idx={13} total={TOTAL} presenter={PRESENTER} />);

function TweaksHost() {
  const [tweaks, setTweaksState] = React.useState(TWEAK_DEFAULTS);
  const [visible, setVisible] = React.useState(false);

  const setTweaks = (patch) => {
    const next = { ...tweaks, ...patch };
    setTweaksState(next);
    applyTweaks(next);
    try { window.parent.postMessage({ type: '__edit_mode_set_keys', edits: patch }, '*'); } catch (e) {}
  };

  React.useEffect(() => {
    const onMsg = (e) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === '__activate_edit_mode')   setVisible(true);
      if (e.data.type === '__deactivate_edit_mode') setVisible(false);
    };
    window.addEventListener('message', onMsg);
    try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch (e) {}
    return () => window.removeEventListener('message', onMsg);
  }, []);

  return <TweaksPanel tweaks={tweaks} setTweaks={setTweaks} visible={visible} onClose={() => setVisible(false)} />;
}

const tweaksRoot = document.getElementById('tweaks-root');
if (tweaksRoot) ReactDOM.createRoot(tweaksRoot).render(<TweaksHost />);

/* ── Slide-to-slide orchestration ───────────────────────────────
 * Three responsibilities on every slidechange event:
 *
 *   (a) RESTART — strip & re-add data-deck-active on the incoming
 *       slide so all its data-anim entrance animations play again
 *       from step 0 (same as before).
 *
 *   (b) EXIT — on the outgoing slide, add data-deck-leaving (keeps
 *       it visible via CSS override), then apply .deck-leaving-anim
 *       to each [data-anim] child with a staggered animation-delay,
 *       so tiles fly upward/fade. After the exit completes, strip
 *       data-deck-leaving and let deck-stage hide the slide normally.
 *       The backdrop (aurora + flow field) sits at document level —
 *       so it does NOT move between slides; only the content does.
 *
 *   (c) TILE TAGGING — auto-detect card-like data-anim elements on
 *       the new slide (they have a background + size + children) and
 *       mark them with `data-tile`, setting --flash-delay based on
 *       their entrance animation-delay so the accent-glow flash fires
 *       just after they settle in. Idempotent — second visit is a
 *       no-op.
 */
(() => {
  const deck = document.querySelector('deck-stage');
  if (!deck) return;

  // Timings — must match longest duration in styles.css Scatterboard block.
  const EXIT_DURATION  = 460;  // longest exit variant (slide-left)
  const ENTER_DURATION = 560;  // longest enter variant (slide-right)
  const EXIT_STAGGER   = 28;   // ms between exiting elements
  const ENTER_STAGGER  = 34;   // ms between entering elements — slightly
                               // larger than exit to make the scatter
                               // feel more layered than the flush exit.
  const ENTER_DELAY    = 320;  // ms after key press before new slide
                               // visually activates (exit has ~70% done).
  const PAINT_BUFFER   = 180;  // ms after activation, BEFORE entrance
                               // animations start. Gives the browser time
                               // to paint the new slide + an added visual
                               // pause so the user registers the slide
                               // change before content scatters in.

  const restart = (slide) => {
    if (!slide) return;
    // Strip any "arrived" pins from a prior enter so native data-anim
    // animations can replay when we toggle data-deck-active below.
    slide.querySelectorAll('.deck-arrived').forEach(el => el.classList.remove('deck-arrived'));
    slide.removeAttribute('data-deck-active');
    // eslint-disable-next-line no-unused-expressions
    slide.offsetHeight; // reflow resets keyframe state
    slide.setAttribute('data-deck-active', '');
  };

  // Pick a transition variant based on what the element IS.
  //   dataAnim="pop"   → pop (authored intent)
  //   data-tile        → scale (cards/panels)
  //   <h1>/<h2>        → slide horizontally (left on exit, right on enter)
  //   absolute & near top → slide up on exit, drop down on enter
  //   absolute & near bottom → slide down on exit, rise up on enter
  //   default          → fade-up
  const pickVariant = (el, isExit) => {
    const dataAnim = el.getAttribute('data-anim');
    const tag = el.tagName;

    if (dataAnim === 'pop') return 'pop';
    if (el.hasAttribute('data-tile')) return 'scale';
    if (tag === 'H1' || tag === 'H2') return isExit ? 'slide-left' : 'slide-right';

    const cs = getComputedStyle(el);
    if (cs.position === 'absolute') {
      const topPx = parseFloat(cs.top);
      const botPx = parseFloat(cs.bottom);
      if (!isNaN(topPx) && topPx < 150) return isExit ? 'slide-up' : 'slide-down';
      if (!isNaN(botPx) && botPx < 150) return isExit ? 'slide-down' : 'slide-up';
    }

    return 'fade-up';
  };

  const tagTiles = (slide) => {
    // Promote card-like [data-anim] divs to [data-tile] for the
    // reveal-flash glow. Idempotent.
    slide.querySelectorAll('[data-anim]').forEach((el) => {
      if (el.tagName !== 'DIV') return;
      if (el.hasAttribute('data-tile')) return;
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      const hasBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      const borderSum = ['borderLeftWidth', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth']
        .map(k => parseFloat(cs[k]) || 0).reduce((a, b) => a + b, 0);
      const hasBorder = borderSum >= 1;
      const big = el.clientHeight >= 120 && el.clientWidth >= 200;
      const hasChildren = el.children.length >= 2;
      if ((hasBg || hasBorder) && big && hasChildren) {
        el.setAttribute('data-tile', '');
      }
    });
    // Set --flash-delay per tile = entrance-delay + 850ms buffer.
    slide.querySelectorAll('[data-tile]').forEach((el) => {
      const raw = el.style.animationDelay || '';
      const match = raw.match(/(-?\d+(?:\.\d+)?)(ms|s)?/);
      let ms = 0;
      if (match) {
        ms = parseFloat(match[1]);
        if (match[2] === 's') ms *= 1000;
      }
      el.style.setProperty('--flash-delay', `${Math.max(0, ms) + 850}ms`);
    });
  };

  // Collect every "animateable" element in a slide: top-level children
  // of the .slide root (chapter mark, hero, footer, etc.) PLUS all
  // [data-anim] descendants. Deduplicated.
  const collectAnimated = (slide) => {
    const root = slide.querySelector('.slide') || slide;
    const topLevel = [...root.children];
    const dataAnims = [...slide.querySelectorAll('[data-anim]')];
    return [...new Set([...topLevel, ...dataAnims])];
  };

  const animateExit = (prevSlide) => {
    if (!prevSlide) return;
    prevSlide.setAttribute('data-deck-leaving', '');
    const elements = collectAnimated(prevSlide);
    const state = new Map();
    elements.forEach((el, i) => {
      const variant = pickVariant(el, true);
      const cls = 'deck-exit-' + variant;
      state.set(el, { cls, origDelay: el.style.animationDelay });
      // Clear any "arrived" pin from a prior enter so our exit
      // animation isn't suppressed by `animation: none`.
      el.classList.remove('deck-arrived');
      el.style.animationDelay = `${i * EXIT_STAGGER}ms`;
      el.classList.add(cls);
    });
    const totalMs = EXIT_DURATION + elements.length * EXIT_STAGGER + 80;
    setTimeout(() => {
      prevSlide.removeAttribute('data-deck-leaving');
      elements.forEach(el => {
        const s = state.get(el);
        if (!s) return;
        el.classList.remove(s.cls);
        el.style.animationDelay = s.origDelay || '';
      });
    }, totalMs);
  };

  // ENTER — applies one of the scatterboard enter variants to EVERY
  // animateable element on the new slide, overriding the element's
  // default data-anim entrance for the duration of the transition.
  // After the enter completes, original animation-delay is restored
  // so that future navigations (or a same-slide replay) still see
  // the originally authored delays.
  const animateEnter = (newSlide) => {
    if (!newSlide) return;
    const elements = collectAnimated(newSlide);
    const state = new Map();
    elements.forEach((el, i) => {
      const variant = pickVariant(el, false);
      const cls = 'deck-enter-' + variant;
      state.set(el, { cls, origDelay: el.style.animationDelay });
      // Also clear any stale "arrived" pin from a prior visit.
      el.classList.remove('deck-arrived');
      el.style.animationDelay = `${i * ENTER_STAGGER}ms`;
      el.classList.add(cls);
    });
    const totalMs = ENTER_DURATION + elements.length * ENTER_STAGGER + 80;
    setTimeout(() => {
      elements.forEach(el => {
        const s = state.get(el);
        if (!s) return;
        el.classList.remove(s.cls);
        el.style.animationDelay = s.origDelay || '';
        // Pin "arrived" to prevent the native [data-anim] CSS rule
        // from re-triggering its entrance animation now that our
        // deck-enter-* class is gone. This is what killed the jitter.
        el.classList.add('deck-arrived');
      });
    }, totalMs);
  };

  deck.addEventListener('slidechange', (e) => {
    const { slide, previousSlide, reason } = e.detail || {};
    const sameSlide = previousSlide && previousSlide === slide;

    // Actual slide→slide transition: exit old → HOLD → activate new
    // (paused) → paint → visual BUFFER → enter animations.
    //
    //   t=0           key pressed, old slide starts animating out
    //   t=ENTER_DELAY new slide gets data-deck-active + .deck-priming.
    //                 Slide background renders, content elements stay
    //                 frozen (data-anim CSS paused via .deck-priming).
    //                 We then wait for two animation frames (ensures a
    //                 full paint cycle completes) plus PAINT_BUFFER.
    //   t=…+BUFFER    .deck-priming removed, deck-enter-* classes
    //                 applied → animations begin from the user's
    //                 first-seen frame, not from mid-flight.
    if (reason !== 'init' && !sameSlide) {
      animateExit(previousSlide);
      slide.removeAttribute('data-deck-active');
      setTimeout(() => {
        slide.classList.add('deck-priming');
        slide.setAttribute('data-deck-active', '');
        tagTiles(slide);
        // Wait for the browser to paint the newly-activated slide
        // before starting the entrance animations. Double RAF fires
        // the callback AFTER the browser has composited the frame.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // And then hold a small visual buffer so the user has
            // time to register the slide change before content moves.
            setTimeout(() => {
              slide.classList.remove('deck-priming');
              animateEnter(slide);
            }, PAINT_BUFFER);
          });
        });
      }, ENTER_DELAY);
    } else {
      // Init (first mount) or same-slide replay — just activate fresh.
      requestAnimationFrame(() => {
        restart(slide);
        tagTiles(slide);
      });
    }
  });
})();