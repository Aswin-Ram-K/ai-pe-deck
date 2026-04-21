/**
 * Generate speaker-notes.pdf from public/speaker-notes.json.
 * Uses PDFKit (no chrome dependency) so it runs in the Docker image.
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const ROOT = path.resolve(__dirname, '..', '..');
const notes = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'speaker-notes.json'), 'utf8'));
const outPath = path.join(ROOT, 'exports', 'speaker-notes.pdf');
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const SLIDE_LABELS = [
  'Title', 'Why care', 'At a glance', 'Taxonomy', 'Toolkits', 'Design',
  'Control', 'Maintenance', 'Tasks', 'Open problems', 'My take',
  'Takeaways', 'Thanks',
];

const doc = new PDFDocument({ size: 'LETTER', margin: 56 });
doc.pipe(fs.createWriteStream(outPath));

doc.font('Helvetica-Bold').fontSize(22)
  .text('AI in Power Electronics — Speaker Notes', { align: 'left' });
doc.moveDown(0.4);
doc.font('Helvetica').fontSize(11).fillColor('#666')
  .text('Aswin Ram Kalugasala Moorthy · ECE-563 · Paper Review');
doc.moveDown(1.2);

notes.forEach((note, i) => {
  if (i > 0) doc.addPage();
  doc.fillColor('#831843').font('Helvetica-Bold').fontSize(10)
    .text(`SLIDE ${String(i + 1).padStart(2, '0')} / ${notes.length}`, { continued: true })
    .fillColor('#999').text(`   ·   ${SLIDE_LABELS[i] || ''}`);
  doc.moveDown(0.3);
  doc.fillColor('#111').font('Helvetica').fontSize(12)
    .text((note || '').trim(), { lineGap: 2, align: 'left' });
});

doc.end();
console.log(`[notes-pdf] wrote ${outPath}`);
