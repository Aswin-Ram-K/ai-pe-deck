#!/usr/bin/env node
/* ─── build-script-json ────────────────────────────────────────────────
 * Converts AI-PE-Speaker-Script.docx → public/speaker-script.json.
 * Shape: { generatedAt, source, slides: [{ index, title, body }] }
 * body is plain text with paragraph breaks preserved (double newline).
 * Splits on `## Slide N — Title` headings; skips Slide 0 (pre-show).
 * ────────────────────────────────────────────────────────────────────── */

const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DOCX = path.join(ROOT, 'AI-PE-Speaker-Script.docx');
const OUT  = path.join(ROOT, 'public', 'speaker-script.json');

function cleanMarkdown(md) {
  return md
    .replace(/<a id="[^"]*"><\/a>/g, '')    // drop mammoth anchors
    .replace(/\\([.\-()\[\]*_#+!~|])/g, '$1') // unescape markdown backslashes
    .replace(/__([^_]+)__/g, '$1')           // strip bold markers
    .replace(/\*\*([^*]+)\*\*/g, '$1')       // strip bold markers (alt)
    .replace(/\*([^*]+)\*/g, '$1')           // strip italic markers
    .replace(/\r\n/g, '\n');
}

function splitSlides(md) {
  const lines = md.split('\n');
  const slides = [];
  let current = null;

  const slideHeading = /^## Slide (\d+)\s*(?:—|-)?\s*(.*)$/;

  for (const line of lines) {
    const m = line.match(slideHeading);
    if (m) {
      if (current) slides.push(current);
      current = { index: Number(m[1]), title: m[2].trim(), bodyLines: [] };
      continue;
    }
    // Stop collecting at the first non-slide H2 after slides have started
    if (/^## /.test(line) && current) {
      slides.push(current);
      current = null;
      continue;
    }
    if (current) current.bodyLines.push(line);
  }
  if (current) slides.push(current);

  return slides
    .filter(s => s.index >= 1 && s.index <= 13)
    .map(s => {
      let body = s.bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      // Extract "Time budget: NN s Visual cue: ..." from leading metadata line
      const m = body.match(/^Time budget:\s*(\d+)\s*s\b[^\n]*Visual cue:\s*([^\n]+)/i);
      let timeBudgetSec = null;
      let visualCue = null;
      if (m) {
        timeBudgetSec = Number(m[1]);
        visualCue = m[2].trim().replace(/\.$/, '');
        body = body.slice(m[0].length).trim();
      }
      return { index: s.index, title: s.title, timeBudgetSec, visualCue, body };
    });
}

async function main() {
  if (!fs.existsSync(DOCX)) {
    console.error(`Missing DOCX at ${DOCX}`);
    process.exit(1);
  }
  const { value: rawMd } = await mammoth.convertToMarkdown({ path: DOCX });
  const md = cleanMarkdown(rawMd);
  const slides = splitSlides(md);

  const out = {
    generatedAt: new Date().toISOString(),
    source: path.basename(DOCX),
    slides,
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  const totalWords = slides.reduce((a, s) => a + s.body.split(/\s+/).length, 0);
  console.log(`Wrote ${OUT}`);
  console.log(`  ${slides.length} slides, ${totalWords} words total`);
  slides.forEach(s => {
    const w = s.body.split(/\s+/).filter(Boolean).length;
    console.log(`  s${String(s.index).padStart(2, '0')}: ${w.toString().padStart(4)} words — ${s.title}`);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
