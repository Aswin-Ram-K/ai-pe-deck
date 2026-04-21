/**
 * Generate ai-pe-deck.pptx from the rendered slide screenshots.
 *
 * Pipeline:
 *   1. Read 13 PNG screenshots from `_shots/pptx/s01.png … s13.png` (captured
 *      externally via headless Chrome at design size 1920×1080 after
 *      animations settle — no mid-animation artifacts).
 *   2. Each screenshot becomes a full-bleed image slide in a 13.333"×7.5"
 *      widescreen deck (the standard PowerPoint 16:9 page).
 *   3. Speaker notes from `public/speaker-notes.json` are attached to the
 *      corresponding slide's notes pane so the PPTX carries narration too.
 *   4. Output: `exports/ai-pe-deck.pptx`.
 *
 * Missing a screenshot? That slide falls back to a plain text slide so the
 * export still succeeds end-to-end.
 */
const fs = require('fs');
const path = require('path');
const PptxGenJS = require('pptxgenjs');

const ROOT = path.resolve(__dirname, '..', '..');
const SHOTS_DIR = path.join(ROOT, '_shots', 'pptx');
const NOTES_PATH = path.join(ROOT, 'public', 'speaker-notes.json');
const OUT_PATH = path.join(ROOT, 'exports', 'ai-pe-deck.pptx');

const SLIDE_LABELS = [
  'Title',
  'Why Power Electronics Matters',
  'Paper at a Glance',
  'Taxonomy — 3 × 4',
  'Four AI Toolkits',
  'Design Phase',
  'Control Phase',
  'Maintenance Phase',
  'AI Tasks',
  'Open Problems',
  'My Take',
  'Takeaways',
  'Q & A',
];

const notes = JSON.parse(fs.readFileSync(NOTES_PATH, 'utf8'));
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });

const pres = new PptxGenJS();
// 13.333" × 7.5" is the standard PowerPoint 16:9 widescreen page.
pres.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });
pres.layout = 'WIDE';
pres.author = 'Aswin Ram Kalugasala Moorthy';
pres.title = 'AI in Power Electronics — Paper Review';
pres.subject = 'Zhao, Blaabjerg & Wang (2021) · IEEE TPEL 36(4) · review';

let imagesUsed = 0;
let fallbacks = [];

notes.forEach((note, i) => {
  const slideNum = i + 1;
  const imgPath = path.join(SHOTS_DIR, `s${String(slideNum).padStart(2, '0')}.png`);
  const hasImg = fs.existsSync(imgPath);

  const slide = pres.addSlide();
  slide.background = { color: '050511' };

  if (hasImg) {
    // Full-bleed: image covers the entire 13.333×7.5 page. Stretched to fit.
    // The screenshots are 3840×2132 (very close to 16:9), so no meaningful
    // distortion — and full-bleed avoids any PPT-rendering letterbox.
    slide.addImage({
      path: imgPath,
      x: 0, y: 0,
      w: 13.333, h: 7.5,
    });
    imagesUsed++;
  } else {
    fallbacks.push(slideNum);
    // Fallback: text-only slide so export doesn't break if a screenshot
    // is missing. Kicker + title + notes body.
    slide.addText(`SLIDE ${String(slideNum).padStart(2, '0')} / ${notes.length}`, {
      x: 0.5, y: 0.4, w: 4, h: 0.3,
      fontSize: 11, color: 'C46E8F', bold: true,
      fontFace: 'Consolas', charSpacing: 3,
    });
    slide.addText(SLIDE_LABELS[i] || 'Slide', {
      x: 0.5, y: 0.8, w: 12.3, h: 0.9,
      fontSize: 34, color: 'F5F5F0', bold: true,
      fontFace: 'Calibri',
    });
    slide.addText((note || '').trim(), {
      x: 0.5, y: 1.8, w: 12.3, h: 5.3,
      fontSize: 14, color: 'C8C8D4',
      fontFace: 'Calibri', lineSpacingMultiple: 1.3,
      valign: 'top',
    });
  }

  // Always attach the narration to the notes pane (whether image or text).
  slide.addNotes((note || '').trim());
});

pres.writeFile({ fileName: OUT_PATH }).then(() => {
  const stat = fs.statSync(OUT_PATH);
  console.log(`[pptx] wrote ${OUT_PATH}`);
  console.log(`[pptx] ${imagesUsed} image slides, ${fallbacks.length} text fallbacks${fallbacks.length ? ` (slides: ${fallbacks.join(', ')})` : ''}`);
  console.log(`[pptx] size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
});
