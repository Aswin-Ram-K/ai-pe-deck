#!/usr/bin/env node
/* ─── build-script-json ────────────────────────────────────────────────
 * Converts SPEAKER_SCRIPT.md → public/speaker-script.json.
 *
 * Pacing model:
 *   - Total presentation time = TOTAL_PRESENTATION_SEC (17 min = 1020s)
 *   - Slides 1..12 share that budget in proportion to their SYLLABLE count
 *     (stage directions stripped, since they're not spoken)
 *   - Slide 13 (Q&A) gets timeBudgetSec: null and is excluded from pacing
 *
 * Syllable counting uses the `syllable` npm package (English-tuned).
 * Stage directions (lines wrapped in *[...]* or plain [...]) are
 * removed BEFORE counting — those are visual cues for the presenter,
 * not spoken words.
 * ────────────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');
const { syllable } = require('syllable');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC  = path.join(ROOT, 'SPEAKER_SCRIPT.md');
const OUT  = path.join(ROOT, 'public', 'speaker-script.json');

const TOTAL_PRESENTATION_SEC = 17 * 60;  // 1020s — slides 1..12
const PACED_SLIDE_MIN = 1;
const PACED_SLIDE_MAX = 12;

const SLIDE_HEADING = /^## Slide (\d+)\s*(?:—|-|–)\s*(.+?)$/;
const VISUAL_CUE    = /^Visual cue:\s*(.+)$/i;

function splitSlides(md) {
  const lines = md.split('\n');
  const slides = [];
  let current = null;
  let inHeaderBlock = true;  // skip the file's header section until first slide

  for (const raw of lines) {
    const line = raw.replace(/\r/g, '');
    const m = line.match(SLIDE_HEADING);
    if (m) {
      inHeaderBlock = false;
      if (current) slides.push(current);
      current = {
        index: Number(m[1]),
        title: m[2].trim(),
        visualCue: null,
        bodyLines: [],
      };
      continue;
    }
    if (inHeaderBlock || !current) continue;

    // capture first "Visual cue:" line into its own field
    const vc = line.match(VISUAL_CUE);
    if (vc && !current.visualCue) {
      current.visualCue = vc[1].trim().replace(/\.$/, '');
      continue;
    }

    // skip horizontal rules
    if (/^---\s*$/.test(line)) continue;

    current.bodyLines.push(line);
  }
  if (current) slides.push(current);

  return slides.map(s => ({
    index: s.index,
    title: s.title,
    visualCue: s.visualCue,
    body: cleanBody(s.bodyLines.join('\n')),
  }));
}

/* Remove markdown markers that aren't part of the spoken text but
 * keep formatting cues the teleprompter parser uses (blockquote > ,
 * CALLBACK →, stage directions [..]). */
function cleanBody(text) {
  return text
    .replace(/\r/g, '')
    // Strip bold/italic markers (leave text)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    // Italic-bracketed stage directions render as [bracketed]
    .replace(/\*(\[[^\]]+\])\*/g, '$1')
    // Remaining lone italic markers around words
    .replace(/(^|\s)\*([^*\s][^*]*)\*(?=\s|$|[.,;:!?])/g, '$1$2')
    // Collapse excess blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* Strip everything that isn't SPOKEN before counting syllables.
 * Speaker directions in *[...]* or [...] lines are omitted. Markdown
 * markers, CALLBACK labels, and blockquote carets are dropped (their
 * content is still spoken — just the prefix isn't). */
function spokenTextOnly(body) {
  return body
    .split('\n')
    .map(l => {
      // Drop pure stage-direction lines: *[...]* or [...]
      if (/^\*?\[.*\]\*?$/.test(l.trim())) return '';
      // Strip CALLBACK label prefix but keep the sentence
      l = l.replace(/^CALLBACK\s*→\s*/i, '');
      l = l.replace(/^←\s*CALLBACK.*$/i, '');
      // Strip blockquote marker
      l = l.replace(/^>\s*/, '');
      // Remove inline bracketed asides (they're stage-direction-ish,
      // e.g., "[Beat.]" mid-paragraph)
      l = l.replace(/\*?\[[^\]]*\]\*?/g, '');
      return l;
    })
    .join(' ')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

function countSyllables(text) {
  if (!text) return 0;
  // Split on whitespace and punctuation boundaries; syllable() handles
  // each word. Numbers-as-digits return 0 so we spell them as words
  // in the script (we already did — "seventeen percent" etc.)
  const words = text
    .split(/[^A-Za-z0-9'\-]+/)
    .filter(Boolean);
  let total = 0;
  for (const w of words) {
    const s = syllable(w);
    total += (s > 0) ? s : 1;  // unknown/digit → count as 1
  }
  return total;
}

function wordCount(text) {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Missing source at ${SRC}`);
    process.exit(1);
  }
  const md = fs.readFileSync(SRC, 'utf8');
  const slides = splitSlides(md).filter(s => s.index >= 1 && s.index <= 13);

  // ── Syllable-count every slide's spoken text ──────────────────
  for (const s of slides) {
    const spoken = spokenTextOnly(s.body);
    s._spoken = spoken;
    s._syllables = countSyllables(spoken);
    s._words = wordCount(spoken);
  }

  // ── Distribute 17 min across slides 1..12 by syllable share ──
  const pacedSlides = slides.filter(s =>
    s.index >= PACED_SLIDE_MIN && s.index <= PACED_SLIDE_MAX
  );
  const totalSyll = pacedSlides.reduce((a, s) => a + s._syllables, 0);
  const syllPerSec = totalSyll / TOTAL_PRESENTATION_SEC;

  for (const s of slides) {
    if (s.index >= PACED_SLIDE_MIN && s.index <= PACED_SLIDE_MAX) {
      s.timeBudgetSec = Math.round(s._syllables / syllPerSec * 10) / 10;
    } else {
      s.timeBudgetSec = null;  // Q&A or unpaced
    }
  }

  // ── Write JSON ─────────────────────────────────────────────────
  const out = {
    generatedAt: new Date().toISOString(),
    source: path.basename(SRC),
    totalPresentationSec: TOTAL_PRESENTATION_SEC,
    totalSyllables: totalSyll,
    syllablesPerSec: Number(syllPerSec.toFixed(3)),
    slides: slides.map(s => ({
      index: s.index,
      title: s.title,
      visualCue: s.visualCue,
      timeBudgetSec: s.timeBudgetSec,
      syllables: s._syllables,
      words: s._words,
      body: s.body,
    })),
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

  // ── Console report ────────────────────────────────────────────
  console.log(`Wrote ${OUT}`);
  console.log(`  Total presentation: ${TOTAL_PRESENTATION_SEC}s (${TOTAL_PRESENTATION_SEC/60} min)`);
  console.log(`  Total syllables (slides 1-12): ${totalSyll}`);
  console.log(`  Rate: ${syllPerSec.toFixed(2)} syllables/sec (${(syllPerSec*60).toFixed(0)} syll/min)`);
  console.log('');
  console.log(`  slide  syll  words  budget   title`);
  let budgetSum = 0;
  for (const s of out.slides) {
    const budget = s.timeBudgetSec === null ? '   —  ' : `${String(s.timeBudgetSec).padStart(5)}s`;
    if (s.timeBudgetSec !== null) budgetSum += s.timeBudgetSec;
    console.log(`  s${String(s.index).padStart(2,'0')}   ${String(s.syllables).padStart(4)}  ${String(s.words).padStart(4)}  ${budget}   ${s.title}`);
  }
  console.log(`                       -------`);
  console.log(`                       ${budgetSum.toFixed(1)}s  (= ${(budgetSum/60).toFixed(2)} min)`);
}

main();
