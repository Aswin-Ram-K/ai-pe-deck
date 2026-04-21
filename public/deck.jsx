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
              // Data endpoints use candidate-dot for the entrance pop,
              // but we zero the idle drift/breathe parameters so they
              // lock in place after arriving — they anchor the curve
              // to specific years and shouldn't float.
              <circle key={i} cx={x} cy={y} r="5" fill={s.color}
                      className="candidate-dot"
                      style={{
                        '--d': `${600 + si * 250 + i * 180}ms`,
                        '--final-opacity': 1,
                        '--dx': '0px',
                        '--dy': '0px',
                        '--idle-scale': 0,
                        '--idle-opacity-boost': 0,
                      }} />
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

/* ── Slide 0: Intro (cosmic plasma star) ───────────────────────
 *
 * Pre-show cover. A plasma sphere hangs alone in pure vacuum,
 * its surface noise drifting through 5 deck-accent colors (blue,
 * violet, plum, forest, ink) as it revolves. On "Start" from the
 * phone remote (or any advance key), the window dispatches
 * `deck-explode`; the sphere collapses (0.0-0.28s), flashes white
 * (0.28-0.45s), and ejects 1500 GPU-rendered particles radially
 * (0.45-1.55s). Aurora + flow-field backdrop fade in underneath
 * while particles dissipate (1.55-3.10s); a 0.7s hold lets the
 * universe "breathe" (3.10-3.80s); then deck.next() fires and
 * Slide 1's scatterboard enter lands on screen by t=4.55s, fully
 * settled at t=5.00s. Total cosmic-intro budget: 5.0 seconds.
 *
 * Rendered via Three.js r160 (loaded from unpkg with SRI in
 * index.html, exposed as window.THREE after the module loads).
 * The SlideIntro useEffect blocks on a 'three-ready' window
 * event if THREE isn't available at mount time.
 *
 * Shader: custom ShaderMaterial. Fragment blends 5-color tulip
 * ring by phase (fBm noise + time); ink (#0A0A1F) is treated as
 * a brightness modulator rather than a dominant fill color —
 * ink-dominant regions read as cooler stellar spots, not voids.
 * Corona is a back-facing sphere with additive blending.
 * Particles use a points ShaderMaterial with per-vertex dir +
 * speed attributes; all ejecta motion is GPU-side. */

const INTRO_PALETTE = [
  '#0B3FB5',  // blue
  '#5B21B6',  // violet
  '#831843',  // plum (TWEAK_DEFAULTS.accent)
  '#064E3B',  // forest
  '#0A0A1F',  // ink (rendered as shadow modulator — see shader)
];

function SlideIntro() {
  const introRef  = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const mount = canvasRef.current;
    const slideEl = introRef.current;
    if (!mount || !slideEl) return;

    let disposed = false;
    let teardown = () => {};

    const boot = () => {
      if (disposed) return;
      const THREE = window.THREE;
      if (!THREE) return;  // still waiting; rebind below

      const DPR = Math.min(window.devicePixelRatio || 1, 2);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      camera.position.z = 4.2;

      const renderer = new THREE.WebGLRenderer({
        alpha: true, antialias: true, powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(DPR);
      renderer.setClearColor(0x000000, 0);
      const resize = () => {
        const w = mount.clientWidth || 1920;
        const h = mount.clientHeight || 1080;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      mount.appendChild(renderer.domElement);
      Object.assign(renderer.domElement.style, {
        width: '100%', height: '100%', display: 'block',
      });

      /* ─── Plasma sphere ─── */
      const paletteVec3 = INTRO_PALETTE.map(hex => new THREE.Color(hex));
      const uniforms = {
        iTime:     { value: 0 },
        uCollapse: { value: 0 },
        uBurst:    { value: 0 },
        uTension:  { value: 0 },  // 0=idle nebulous gas, 1=pre-implosion climax
        uPalette:  { value: paletteVec3 },
      };

      const sphereGeom = new THREE.IcosahedronGeometry(0.5, 48);
      const sphereMat = new THREE.ShaderMaterial({
        uniforms,
        transparent: false,
        vertexShader: /* glsl */`
          varying vec3 vPos;
          varying vec3 vNormal;
          varying vec3 vWorldPos;
          void main() {
            vPos = position;
            vNormal = normalize(normalMatrix * normal);
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */`
          precision highp float;
          uniform float iTime;
          uniform float uCollapse;
          uniform float uBurst;
          uniform float uTension;
          uniform vec3  uPalette[5];
          varying vec3 vPos;
          varying vec3 vNormal;
          varying vec3 vWorldPos;

          vec3 hash3(vec3 p) {
            p = vec3(
              dot(p, vec3(127.1, 311.7, 74.7)),
              dot(p, vec3(269.5, 183.3, 246.1)),
              dot(p, vec3(113.5, 271.9, 124.6))
            );
            return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
          }
          float noise3(vec3 p) {
            vec3 i = floor(p);
            vec3 f = fract(p);
            vec3 u = f*f*(3.0-2.0*f);
            return mix(mix(mix(dot(hash3(i+vec3(0,0,0)), f-vec3(0,0,0)),
                               dot(hash3(i+vec3(1,0,0)), f-vec3(1,0,0)), u.x),
                           mix(dot(hash3(i+vec3(0,1,0)), f-vec3(0,1,0)),
                               dot(hash3(i+vec3(1,1,0)), f-vec3(1,1,0)), u.x), u.y),
                       mix(mix(dot(hash3(i+vec3(0,0,1)), f-vec3(0,0,1)),
                               dot(hash3(i+vec3(1,0,1)), f-vec3(1,0,1)), u.x),
                           mix(dot(hash3(i+vec3(0,1,1)), f-vec3(0,1,1)),
                               dot(hash3(i+vec3(1,1,1)), f-vec3(1,1,1)), u.x), u.y), u.z);
          }
          float fbm(vec3 p) {
            float f = 0.0;
            f += 0.50 * noise3(p);
            f += 0.25 * noise3(p * 2.07);
            f += 0.12 * noise3(p * 4.13);
            return f;
          }

          // 5-color ring sampled by phase (0..1), wraps.
          vec3 tulipRing(float phase) {
            phase = fract(phase) * 5.0;
            float t = fract(phase);
            int idx = int(floor(phase));
            vec3 c0, c1;
            if (idx == 0)      { c0 = uPalette[0]; c1 = uPalette[1]; }
            else if (idx == 1) { c0 = uPalette[1]; c1 = uPalette[2]; }
            else if (idx == 2) { c0 = uPalette[2]; c1 = uPalette[3]; }
            else if (idx == 3) { c0 = uPalette[3]; c1 = uPalette[4]; }
            else               { c0 = uPalette[4]; c1 = uPalette[0]; }
            return mix(c0, c1, t);
          }

          void main() {
            // Surface noise + time drift
            float n = fbm(vPos * 2.3 + vec3(iTime * 0.12, iTime * 0.08, -iTime * 0.10));
            float phase = n * 0.8 + iTime * 0.045;
            vec3 color = tulipRing(phase);

            // Ink treatment: where the sampled color is very dark
            // (i.e., phase is near ink band), dim it further so it
            // reads as a cooler starspot rather than a pure void.
            // Ink band is around phase = 4/5 = 0.8 in the ring.
            float inkness = smoothstep(0.0, 0.3, 1.0 - length(color - vec3(0.04, 0.04, 0.12)));
            color = mix(color, color * 0.55 + vec3(0.015, 0.015, 0.035), inkness);

            // Fresnel rim — thin warm bloom at the silhouette
            vec3 viewDir = normalize(cameraPosition - vWorldPos);
            float fres = pow(1.0 - abs(dot(vNormal, viewDir)), 2.6);
            vec3 rim = vec3(1.0, 0.76, 0.62) * fres * 0.65;
            color += rim;

            // Subtle surface hotspot flicker (frequency scales with tension)
            float flickerFreq = 0.5 + uTension * 3.0;
            float flicker = fbm(vPos * 6.0 + iTime * flickerFreq) * 0.15 + 0.85;
            color *= flicker;

            // Tension glow — color intensifies + warms as pressure builds
            color += vec3(0.35, 0.18, 0.10) * uTension * uTension;

            // Collapse — colors lift toward white-hot; sphere brighter
            vec3 hotCore = vec3(1.0, 0.86, 0.72);
            color = mix(color, hotCore * 1.3, uCollapse * 0.9);

            // Burst — saturate white (HDR-ish, clamped by tonemap at render)
            color = mix(color, vec3(1.8), uBurst);

            gl_FragColor = vec4(color, 1.0);
          }
        `,
      });
      const sphere = new THREE.Mesh(sphereGeom, sphereMat);
      sphere.visible = false;  // v4: sphere removed — screen is pure particle field
      // scene.add(sphere);  // kept in code in case you want to revert

      /* ─── Corona (back-facing, additive blend) ─── */
      const coronaGeom = new THREE.IcosahedronGeometry(0.70, 24);
      const coronaMat = new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        vertexShader: /* glsl */`
          varying vec3 vNormal;
          varying vec3 vWorldPos;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */`
          precision highp float;
          uniform float iTime;
          uniform float uCollapse;
          uniform float uBurst;
          uniform float uTension;
          uniform vec3  uPalette[5];
          varying vec3 vNormal;
          varying vec3 vWorldPos;
          // Minimal noise for wispy atmosphere modulation
          float hash1(float n) { return fract(sin(n) * 43758.5453); }
          float noise1(vec3 p) {
            vec3 i = floor(p), f = fract(p);
            f = f*f*(3.0-2.0*f);
            float n = i.x + i.y * 157.0 + 113.0 * i.z;
            return mix(mix(mix(hash1(n + 0.0),   hash1(n + 1.0),   f.x),
                           mix(hash1(n + 157.0), hash1(n + 158.0), f.x), f.y),
                       mix(mix(hash1(n + 113.0), hash1(n + 114.0), f.x),
                           mix(hash1(n + 270.0), hash1(n + 271.0), f.x), f.y), f.z);
          }
          void main() {
            vec3 viewDir = normalize(cameraPosition - vWorldPos);
            float fres = pow(1.0 - abs(dot(vNormal, viewDir)), 1.8);
            // Atmospheric wisp — noise-modulated alpha so corona reads
            // as flowing gas, not a clean halo shell.
            float wisp = 0.55 + 0.45 * noise1(vNormal * 3.0 + iTime * 0.25);
            // Corona hue drifts through plum/violet (warmer end of palette)
            float t = 0.5 + 0.5 * sin(iTime * 0.35);
            vec3 tint = mix(uPalette[1], uPalette[2], t) * (1.2 + uTension * 0.4);
            float a = fres * 0.55 * wisp * (1.0 - uBurst);
            gl_FragColor = vec4(tint, a);
          }
        `,
      });
      const corona = new THREE.Mesh(coronaGeom, coronaMat);
      corona.visible = false;  // v4: corona removed — no sphere to halo
      // scene.add(corona);

      /* ─── Particle field (3500 points, full-screen nebulous cloud) ───
       * No sphere, no halo. Particles distributed through a volume that
       * spans the viewport. Idle: each particle drifts + responds to a
       * radial pulse wave propagating from center (uPulseAmp + uPulseFreq
       * control amplitude/speed). Tensioning builds pulse, intensifying
       * ramps frequency. Imploding (uCollapse 0→1) pulls every particle
       * to origin. Flash releases ejecta (existing expansion behavior). */
      const PCOUNT = 6000;  // dense nebular cloud (Apple-silicon-comfortable)
      const pGeom = new THREE.BufferGeometry();
      const pPositions = new Float32Array(PCOUNT * 3);
      const pDirs      = new Float32Array(PCOUNT * 3);  // unit direction
      const pColors    = new Float32Array(PCOUNT * 3);
      const pSpeeds    = new Float32Array(PCOUNT);
      const pBaseR     = new Float32Array(PCOUNT);      // per-particle resting radius
      // Per-particle orbital attributes — precomputed so the shader doesn't
      // re-run atan2 / sqrt per vertex per frame.
      const pTheta0    = new Float32Array(PCOUNT);      // initial xy angle (radians)
      const pInPlaneR  = new Float32Array(PCOUNT);      // sqrt(1 - aDir.z²) — orbit radius in xy plane
      const pOmega     = new Float32Array(PCOUNT);      // per-particle angular speed (rad/s)
      for (let i = 0; i < PCOUNT; i++) {
        // Uniform sphere direction (Marsaglia method)
        const u = Math.random() * 2 - 1;
        const th = Math.random() * Math.PI * 2;
        const sr = Math.sqrt(1 - u * u);
        const dx = sr * Math.cos(th), dy = sr * Math.sin(th), dz = u;
        pDirs[i*3  ] = dx; pDirs[i*3+1] = dy; pDirs[i*3+2] = dz;

        // Base radius distributed 0.25 → 2.2 so particles fill viewport
        // (camera z=4.2, FOV 40° → visible half-height at z=0 is ≈1.53;
        // extend to 2.2 so field runs off-screen at edges, no hard cutoff)
        // Use cube-root distribution for even volumetric density.
        const baseR = 0.25 + Math.pow(Math.random(), 0.7) * 1.95;
        pBaseR[i] = baseR;
        pPositions[i*3  ] = dx * baseR;
        pPositions[i*3+1] = dy * baseR;
        pPositions[i*3+2] = dz * baseR;

        const c = paletteVec3[i % 5];
        pColors[i*3  ] = c.r; pColors[i*3+1] = c.g; pColors[i*3+2] = c.b;
        pSpeeds[i] = 1.5 + Math.random() * 2.2;

        // Orbital attributes around Z-axis (camera-facing). Slight per-
        // particle ω variation (~0.28-0.60 rad/s, i.e., full revolution
        // every 10.5-22s) gives a dreamy, non-synchronized swirl.
        pTheta0[i]   = Math.atan2(dy, dx);
        pInPlaneR[i] = Math.sqrt(Math.max(0, 1 - dz * dz));
        pOmega[i]    = 0.28 + Math.random() * 0.32;
      }
      pGeom.setAttribute('position',   new THREE.BufferAttribute(pPositions, 3));
      pGeom.setAttribute('aDir',       new THREE.BufferAttribute(pDirs, 3));
      pGeom.setAttribute('aColor',     new THREE.BufferAttribute(pColors, 3));
      pGeom.setAttribute('aSpeed',     new THREE.BufferAttribute(pSpeeds, 1));
      pGeom.setAttribute('aBaseR',     new THREE.BufferAttribute(pBaseR, 1));
      pGeom.setAttribute('aTheta0',    new THREE.BufferAttribute(pTheta0, 1));
      pGeom.setAttribute('aInPlaneR',  new THREE.BufferAttribute(pInPlaneR, 1));
      pGeom.setAttribute('aOmega',     new THREE.BufferAttribute(pOmega, 1));

      const pMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime:      { value: 0 },
          uBurstTime: { value: -1 },   // -1 = inactive (idle/tensioning mode)
          uDPR:       { value: DPR },
          uPulseAmp:  { value: 0 },    // radial wave amplitude (0 idle → 0.08 climax)
          uPulseFreq: { value: 0.8 },  // wave freq in Hz (0.8 idle → 18 climax)
          uCollapse:  { value: 0 },    // 0 resting → 1 imploded to center
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */`
          attribute vec3 aDir;
          attribute vec3 aColor;
          attribute float aSpeed;
          attribute float aBaseR;
          attribute float aTheta0;
          attribute float aInPlaneR;
          attribute float aOmega;
          uniform float uTime;
          uniform float uBurstTime;
          uniform float uDPR;
          uniform float uPulseAmp;
          uniform float uPulseFreq;
          uniform float uCollapse;
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            vColor = aColor;
            float t = (uBurstTime < 0.0) ? -1.0 : (uTime - uBurstTime);
            vec3 pos;
            if (t < 0.0) {
              // Star-like orbital swirl: each particle traces a circle in
              // its own z-plane around the Z-axis at angular speed aOmega.
              // Collectively this reads as a 3-D swirling shell — particles
              // "floating around like a star" rather than jittering in place.
              float seed = aSpeed * 7.13;
              float driftPhase = uTime * 0.18 + seed;

              // Radial traveling wave (same as before — breathing pulse).
              float wavePhase = (uTime - aBaseR / 2.5) * uPulseFreq;
              float wave = sin(wavePhase * 6.2831853) * uPulseAmp;

              // Small 3-D drift preserves organic feel without fighting the orbit.
              vec3 drift = vec3(
                sin(driftPhase * 0.63 + seed * 1.9) * 0.04,
                cos(driftPhase * 0.41 + seed * 3.1) * 0.04,
                sin(driftPhase * 0.57 + seed * 2.3) * 0.04
              );

              // Resting radius offset by breathing wave.
              float r = aBaseR + wave;
              // Convergence: uCollapse pulls every particle toward origin.
              r = mix(r, 0.02, uCollapse);

              // Orbital angle. The spiralBoost term accelerates rotation as
              // the collapse deepens (uCollapse² × 8 rad ≈ 2.5 extra
              // revolutions over the 0.35 s implosion), so particles spiral
              // inward rather than tracking a straight radial pull.
              float spiralBoost = uCollapse * uCollapse * 8.0;
              float theta = aTheta0 + uTime * aOmega + spiralBoost;
              vec3 rotDir = vec3(
                aInPlaneR * cos(theta),
                aInPlaneR * sin(theta),
                aDir.z
              );

              // Drift damps during collapse so the spiral reads clean.
              vec3 driftActive = drift * (1.0 - uCollapse);

              pos = rotDir * r + driftActive;

              // Alpha breathes gently + brightens on the leading edge of
              // each wave (positive-phase crests more visible).
              float crest = max(0.0, wave / max(uPulseAmp, 0.001));
              vAlpha = 0.65 + 0.28 * sin(driftPhase * 0.5 + seed) + 0.30 * crest;
              // Fade entire cloud to invisible as it collapses — prevents
              // the "6000 particles stacked at origin" clump frame.
              // Curve squared so fade accelerates toward the end of implosion.
              vAlpha *= pow(1.0 - uCollapse, 2.0);
            } else {
              // Ejecta — particles radiate outward from ORIGIN (where the
              // singularity just sat). Smooth continuity with the
              // collapsed state (which had pos ≈ aDir * 0.02). No teleport.
              float dist = t * aSpeed * (1.0 - 0.3 * smoothstep(0.0, 2.2, t));
              pos = aDir * dist;
              vAlpha = (1.0 - smoothstep(0.4, 2.2, t)) * smoothstep(0.0, 0.08, t);
            }
            vec4 mv = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mv;
            // Idle size 5.5 for nebular cloud density; shrinks to 2.0 as
            // particles converge so the singularity reads as a tight
            // bright point, not a chunky dot. During ejecta, particles
            // become minute "light-like" specks (3.0 → 1.5).
            float idleSize = 5.5 - 3.5 * uCollapse;
            float baseSize = (t < 0.0) ? idleSize : (3.0 - 1.5 * smoothstep(0.0, 2.2, t));
            gl_PointSize = baseSize * uDPR;
          }
        `,
        fragmentShader: /* glsl */`
          precision highp float;
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            if (vAlpha <= 0.001) discard;
            vec2 uv = gl_PointCoord - 0.5;
            float d = length(uv);
            if (d > 0.5) discard;
            float a = smoothstep(0.5, 0.0, d) * vAlpha;
            // Brighten color for additive
            gl_FragColor = vec4(vColor * 1.6 + vec3(0.3), a);
          }
        `,
      });
      const particles = new THREE.Points(pGeom, pMat);
      scene.add(particles);

      /* ─── State machine ─── */
      // phase: 'idle' | 'collapsing' | 'flashing' | 'ejecting' | 'dissipating'
      let phase = 'idle';
      let burstAt = -1;  // performance.now() ms when burst started

      const triggerExplode = () => {
        if (phase !== 'idle') return;  // idempotent
        phase = 'tensioning';
        burstAt = performance.now();
        // Add class to root so CSS tagline fade triggers
        slideEl.classList.add('intro-exploding');
        // Note: uBurstTime is NOT set here — it's set when flash fires
        // so particles stay in idle-drift mode through tension + implode.
      };
      window.addEventListener('deck-explode', triggerExplode);

      /* ─── Animation loop ─── */
      /* Pacing windows (must match styles.css / remote-host.js constants):
       *   t = 0.00 - 3.50s   tensioning  (slow breath, pulse ramp 0.5→2Hz)
       *   t = 3.50 - 6.00s   intensify   (pulse ramp 2→18Hz, past threshold)
       *   t = 6.00 - 6.55s   imploding   (scale 1.15 → 0.08, uCollapse 0→1)
       *   t = 6.55 - 7.65s   held        (singularity, subtle tremor)
       *   t = 7.65 - 7.90s   flashing    (white-out; particles released)
       *   t = 7.90 - 10.10s  ejecting    (1500 points radiate outward)
       *   t = 10.10 - 12.80s erupting    (aurora materializes via CSS)
       *   t = 12.80 - 13.80s settled     (universe alive, pre-next hold)
       *   t = 13.80+         next        (slidechange fires; first-slide enter)
       * Total cosmic budget: 13.8s until deck.next(); +1.8s slow enter = 15.6s. */
      const clock = new THREE.Clock();
      let raf = 0;
      const tick = () => {
        const elapsed = clock.getElapsedTime();
        uniforms.iTime.value = elapsed;
        pMat.uniforms.uTime.value = elapsed;

        // Sphere/corona are hidden (v4), kept for teardown + potential revert.
        // Particle cloud is now the entire visible intro field.

        if (phase !== 'idle') {
          const t = (performance.now() - burstAt) / 1000;

          if (t < 3.5) {
            // Phase 1 — Tensioning. Wave pulses start propagating from
            // center. Amplitude + frequency both ramp from rest.
            const p = t / 3.5;
            uniforms.uTension.value = p * 0.4;
            pMat.uniforms.uPulseAmp.value  = 0.02 + 0.06 * p;   // 0.02 → 0.08
            pMat.uniforms.uPulseFreq.value = 0.8  + 1.2  * p;   // 0.8 → 2.0 Hz
            phase = 'tensioning';
          } else if (t < 6.0) {
            // Phase 2 — Intensifying. Frequency ramps past perceptual
            // threshold (~25Hz) so ripples become indistinguishable
            // individual cycles — reads as chaotic shivering.
            const p = (t - 3.5) / 2.5;
            uniforms.uTension.value = 0.4 + 0.6 * p;
            pMat.uniforms.uPulseAmp.value  = 0.08 * (1.0 - p * 0.2);  // slight reduction
            pMat.uniforms.uPulseFreq.value = 2.0 + 16.0 * p;          // 2 → 18 Hz
            phase = 'intensifying';
          } else if (t < 6.35) {
            // Phase 3 — Imploding (0.35s, snappier). Pulse dies.
            // Every particle pulled to origin.
            uniforms.uTension.value = 1.0;
            const p = (t - 6.0) / 0.35;
            const ease = p * p * (3.0 - 2.0 * p);  // smoothstep curve
            uniforms.uCollapse.value = ease;
            pMat.uniforms.uCollapse.value = ease;
            pMat.uniforms.uPulseAmp.value = 0.08 * (1.0 - ease);
            phase = 'imploding';
          } else if (t < 6.45) {
            // Phase 4 — Held singularity (0.10s — just a flash beat, not
            // a static frame). Dense bright point briefly at center.
            uniforms.uCollapse.value = 1.0;
            pMat.uniforms.uCollapse.value = 1.0;
            pMat.uniforms.uPulseAmp.value = 0;
            phase = 'held';
          } else if (t < 6.70) {
            // Phase 5 — Flash (0.25s). Release the singularity: burst
            // white-out, set uBurstTime so particle shader flips to
            // ejecta mode and expansion begins from origin.
            //
            // BUG FIX: uBurstTime MUST use the same clock reference as
            // uTime (THREE.Clock.getElapsedTime) — not performance.now().
            // Mismatched clocks produced a negative t in the shader and
            // froze particles in idle mode for multiple seconds, which
            // the user perceived as a "static frame" before the explosion.
            if (pMat.uniforms.uBurstTime.value < 0) {
              pMat.uniforms.uBurstTime.value = clock.getElapsedTime();
            }
            uniforms.uBurst.value = (t - 6.45) / 0.25;
            pMat.uniforms.uCollapse.value = 0;
            phase = 'flashing';
          } else if (t < 7.80) {
            // Phase 6a — Early ejecta (1.1s). Particles expand outward
            // unaccompanied — pure explosion over black vacuum. Stops
            // short so the aurora can materialise while the outer
            // particles are still finishing their arc.
            uniforms.uBurst.value = 1.0;
            phase = 'ejecting';
          } else {
            // Phase 7+ — Universe erupts. Aurora materializes via CSS
            // keyframe on body.universe-erupting; breathing begins.
            if (phase !== 'erupting') {
              document.body.classList.remove('intro-mode');
              document.body.classList.add('universe-settling');
              document.body.classList.add('universe-erupting');
              phase = 'erupting';
            }
          }
        }

        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      /* ─── Resize handling ─── */
      const ro = new ResizeObserver(resize);
      ro.observe(mount);

      /* ─── Teardown ─── */
      teardown = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('deck-explode', triggerExplode);
        ro.disconnect();
        sphereGeom.dispose(); sphereMat.dispose();
        coronaGeom.dispose(); coronaMat.dispose();
        pGeom.dispose();      pMat.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      };
    };

    // THREE may already be loaded (fast path) or still coming (wait for event)
    if (window.THREE) {
      boot();
    } else {
      const onReady = () => { boot(); };
      window.addEventListener('three-ready', onReady, { once: true });
      const prevTeardown = teardown;
      teardown = () => {
        window.removeEventListener('three-ready', onReady);
        prevTeardown();
      };
    }

    return () => { disposed = true; teardown(); };
  }, []);

  return (
    <div ref={introRef}
         className="slide intro-slide"
         style={{
           width: '100%', height: '100%',
           background: '#000',
           position: 'relative',
           overflow: 'hidden',
           display: 'flex', alignItems: 'center', justifyContent: 'center',
           flexDirection: 'column',
         }}>
      <div ref={canvasRef}
           className="intro-canvas-mount"
           style={{
             position: 'absolute', inset: 0,
             pointerEvents: 'none',
           }} />

      {/* Tagline beneath the star */}
      <div className="intro-tagline"
           style={{
             position: 'relative',
             marginTop: 'auto', marginBottom: '7%',
             fontFamily: 'JetBrains Mono, monospace',
             fontSize: 14, letterSpacing: '0.3em',
             textTransform: 'uppercase',
             color: 'rgba(200, 180, 220, 0.55)',
             textAlign: 'center',
             userSelect: 'none',
             zIndex: 2,
           }}>
        AI in Power Electronics
        <div style={{
          marginTop: 10,
          fontSize: 11, letterSpacing: '0.22em',
          color: 'rgba(200, 200, 220, 0.28)',
        }}>
          Tap start on the remote
        </div>
      </div>
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
  SlideIntro,
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

// Intro slide (s0) — no idx/total; it's a pre-show cover that sits
// outside the numbered 01/13 sequence. SlideIntro renders the
// revolving star + listens for the 'deck-explode' event.
mountAt('s0',  <SlideIntro />);
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

  // Apply intro-mode immediately if the deck is already on the intro
  // slide when this handler registers. deck-stage fires its 'init'
  // slidechange event BEFORE deck.jsx finishes loading (React mount is
  // async), so we miss that first event and would otherwise leave the
  // body without the class on initial load.
  {
    const initialActive = document.querySelector('deck-stage > section[data-deck-active]');
    if (initialActive?.getAttribute('data-label') === 'Intro') {
      document.body.classList.add('intro-mode');
    }
  }

  // Timings — must match longest duration in styles.css Scatterboard block.
  // All values 1.25× from original so inter-slide transitions feel 25%
  // slower per presenter preference. Originals in comments.
  const EXIT_DURATION  = 575;  // was 460 — longest exit variant (slide-left)
  const ENTER_DURATION = 700;  // was 560 — longest enter variant (slide-right)
  const EXIT_STAGGER   = 35;   // was 28  — ms between exiting elements
  const ENTER_STAGGER  = 43;   // was 34  — ms between entering elements
  const ENTER_DELAY    = 400;  // was 320 — ms after key press before new slide activates
  const PAINT_BUFFER   = 225;  // was 180 — ms after activation, BEFORE entrance animations

  // First-slide enter is a signature moment — unique opening after the cosmic
  // intro. All enter variants run at 1800ms (overridden via
  // body.first-slide-enter CSS class) to feel deliberately slower.
  const FIRST_SLIDE_ENTER_MS = 1800;

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

  /* ─── Intro → Slide 1 interception ────────────────────────────
   * Intercept ALL forward-advance paths (keyboard ArrowRight/Space/
   * PageDown, on-screen Next button, phone START via deck.next()) so
   * that leaving the Intro slide always runs the full 15.6s cosmic
   * sequence — not just the phone START path. This lets desktop
   * testing (hitting →) exercise the same cinematic flow the phone
   * triggers, with no code duplication.
   *
   * All these entry points converge on deck._go(targetIndex, reason).
   * Monkey-patching it catches them in one place. The `.intro-
   * exploding` class (added by SlideIntro.triggerExplode, persists
   * through the whole sequence) is the signal that the cosmic flow
   * is already running — we bypass interception in that case so the
   * scheduled deck.next() at t=13800ms advances cleanly.
   * ─────────────────────────────────────────────────────────── */
  {
    const INTRO_NEXT_DELAY_MS = 10800;  // mirrors remote-host.js INTRO_EXPLODE_TO_NEXT_MS
    const origGo = deck._go.bind(deck);
    let pendingGoTimeout = null;

    deck._go = function patchedGo(targetIndex, reason) {
      const currentIdx = deck._index;
      const currentSection = deck.querySelector(
        `section:nth-child(${currentIdx + 1})`
      );
      const onIntro = currentSection?.getAttribute('data-label') === 'Intro';
      const advancingForward = targetIndex === currentIdx + 1;
      const alreadyExploding = document.querySelector('.intro-exploding');

      if (onIntro && advancingForward && !alreadyExploding) {
        // Fresh desktop/phone advance from Intro — run the cinematic arc.
        window.dispatchEvent(new CustomEvent('deck-explode'));
        pendingGoTimeout = setTimeout(() => {
          pendingGoTimeout = null;
          origGo(targetIndex, reason);
        }, INTRO_NEXT_DELAY_MS);
        return;
      }

      // If the user manually advances (second keypress, R key, etc.)
      // while a scheduled intro advance is pending, cancel it so we
      // don't double-advance and overshoot past the target slide.
      if (pendingGoTimeout) {
        clearTimeout(pendingGoTimeout);
        pendingGoTimeout = null;
      }

      origGo(targetIndex, reason);
    };
    // Patch deck.next() to route through patched _go.
    deck.next = function patchedNext() { deck._go(deck._index + 1, 'api'); };
  }

  deck.addEventListener('slidechange', (e) => {
    const { slide, previousSlide, reason } = e.detail || {};
    const sameSlide = previousSlide && previousSlide === slide;

    // Intro-mode body class toggle — hides aurora + flow field while
    // the intro slide is active so the star sits on a pure-black field.
    // CSS transitions the fade, so this is just a boolean flip per change.
    const isIntro = slide?.getAttribute('data-label') === 'Intro';
    document.body.classList.toggle('intro-mode', isIntro);
    // Returning to intro (e.g., via R reset) — clear the eruption state
    // classes so a fresh cosmic sequence can run cleanly next time.
    if (isIntro) {
      document.body.classList.remove('universe-erupting');
      document.body.classList.remove('universe-settling');
    }

    // Leaving intro — trigger the cosmic-intro state machine AND mark
    // the first-slide signature enter (all scatterboard enter variants
    // stretch to 1800ms for this one transition only). SlideIntro's
    // triggerExplode is idempotent. Keyboard path is a fast-skip; the
    // cinematic path comes from the phone START which calls deck.next()
    // AFTER the INTRO_EXPLODE_TO_NEXT_MS delay (remote-host.js), giving
    // the shader state machine time to play before scatterboard enter.
    const wasIntro = previousSlide?.getAttribute('data-label') === 'Intro';
    if (wasIntro && !sameSlide) {
      window.dispatchEvent(new CustomEvent('deck-explode'));
      document.body.classList.add('first-slide-enter');
      // Remove the class after the slow enter completes so subsequent
      // transitions use the normal (25%-extended) timing. Buffer 300ms
      // after the 1800ms enter for the .deck-arrived settle window.
      setTimeout(() => {
        document.body.classList.remove('first-slide-enter');
      }, FIRST_SLIDE_ENTER_MS + 300);
    }

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