/**
 * AI-PE Deck — Express server.
 *
 *  • Serves /public as static.
 *  • /api/claude — POSTs a prompt, shells out to the local `claude` CLI
 *    (auto-detected on PATH) and streams stdout back. If no CLI is found,
 *    returns a helpful 501 so the page can degrade gracefully.
 *  • /api/save-notes — persists edited speaker notes back to disk. Used
 *    only if someone wants to hook the deck up to an editor; the Claude
 *    CLI edits /public/speaker-notes.json directly.
 *  • /healthz — 200 OK plus node + claude status.
 *
 * Port auto-detect: starts at PORT env (or 3000), tries up to +20. Logs
 * the bound port so you can share it.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const net = require('net');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const EXPORTS_DIR = path.join(ROOT, 'exports');

const app = express();
app.use(express.json({ limit: '2mb' }));

// ─── Static ──────────────────────────────────────────────────────
app.use(express.static(PUBLIC_DIR, {
  setHeaders: (res, filePath) => {
    // JSX must serve as text so Babel can transpile in-browser
    if (filePath.endsWith('.jsx')) res.type('text/plain');
    // JSON with no-cache so CLI edits show on refresh
    if (filePath.endsWith('.json')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

app.use('/exports', express.static(EXPORTS_DIR));

// ─── Claude CLI proxy ─────────────────────────────────────────────
function findClaudeBinary() {
  // Honor explicit override
  if (process.env.CLAUDE_BIN && fs.existsSync(process.env.CLAUDE_BIN)) {
    return process.env.CLAUDE_BIN;
  }
  // Try `which claude` / `where claude`
  try {
    const cmd = process.platform === 'win32' ? 'where claude' : 'which claude';
    const out = execSync(cmd, { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
    if (out) return out;
  } catch {}
  // Common locations
  const candidates = [
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    path.join(process.env.HOME || '', '.local/bin/claude'),
    path.join(process.env.HOME || '', '.npm-global/bin/claude'),
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch {}
  }
  return null;
}

const CLAUDE_BIN = findClaudeBinary();
console.log(CLAUDE_BIN
  ? `[claude] found CLI at ${CLAUDE_BIN}`
  : `[claude] CLI not found — /api/claude will return 501`);

app.post('/api/claude', (req, res) => {
  if (!CLAUDE_BIN) {
    return res.status(501).json({
      error: 'claude CLI not found on host',
      hint: 'install it or set CLAUDE_BIN=/path/to/claude',
    });
  }
  const { prompt, args = [] } = req.body || {};
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'prompt required' });
  }
  // Use `-p` (print) mode for non-interactive one-shot prompting.
  const child = spawn(CLAUDE_BIN, ['-p', prompt, ...args], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Transfer-Encoding', 'chunked');
  child.stdout.on('data', (chunk) => res.write(chunk));
  child.stderr.on('data', (chunk) => {
    // Pass stderr through so the caller sees diagnostics.
    res.write(chunk);
  });
  child.on('close', (code) => {
    if (code !== 0) res.write(`\n[claude exited ${code}]`);
    res.end();
  });
  child.on('error', (err) => {
    res.write(`\n[claude spawn error: ${err.message}]`);
    res.end();
  });
});

// ─── Save edited notes ────────────────────────────────────────────
app.post('/api/save-notes', (req, res) => {
  const notes = req.body;
  if (!Array.isArray(notes)) {
    return res.status(400).json({ error: 'body must be a JSON array of strings' });
  }
  fs.writeFileSync(
    path.join(PUBLIC_DIR, 'speaker-notes.json'),
    JSON.stringify(notes, null, 2),
  );
  res.json({ ok: true, count: notes.length });
});

// ─── Health ───────────────────────────────────────────────────────
app.get('/healthz', (_req, res) => {
  res.json({
    ok: true,
    node: process.version,
    claude: CLAUDE_BIN || null,
    uptime: process.uptime(),
  });
});

// Fallback for SPA-ish routes (optional).
app.get('/', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ─── Port auto-detect ─────────────────────────────────────────────
async function findFreePort(start, tries = 20) {
  for (let p = start; p < start + tries; p++) {
    const ok = await new Promise((resolve) => {
      const srv = net.createServer();
      srv.once('error', () => resolve(false));
      srv.once('listening', () => srv.close(() => resolve(true)));
      srv.listen(p, '0.0.0.0');
    });
    if (ok) return p;
  }
  return null;
}

(async () => {
  const preferred = parseInt(process.env.PORT || '3000', 10);
  const port = await findFreePort(preferred, 30) || preferred;
  app.listen(port, '0.0.0.0', () => {
    console.log('');
    console.log(`  ╭────────────────────────────────────────────────╮`);
    console.log(`  │  AI-PE Deck is live                            │`);
    console.log(`  │                                                │`);
    console.log(`  │  ▸ http://localhost:${String(port).padEnd(26)} │`);
    console.log(`  │  ▸ health  /healthz                            │`);
    console.log(`  │  ▸ claude  ${(CLAUDE_BIN ? 'ready'.padEnd(35) : 'not installed'.padEnd(35))}│`);
    console.log(`  ╰────────────────────────────────────────────────╯`);
    console.log('');
  });
})();
