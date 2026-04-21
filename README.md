# AI in Power Electronics — Interactive Deck

An animated, voice-controlled presentation built as a self-contained Node.js
app. Designed to run locally alongside your Claude CLI so you can iterate
on the deck content through natural-language edits.

## What's in here

```
app/
├── public/               ← served static
│   ├── index.html        ← shell (loads everything below at boot)
│   ├── styles.css        ← theme tokens + animations
│   ├── deck-stage.js     ← slide-stage web component (nav, scaling, print)
│   ├── deck.jsx          ← React source for all 13 slides
│   ├── engine.js         ← animated bg + reveal system + voice control
│   └── speaker-notes.json← narration per slide — CLI-editable
├── server/
│   ├── index.js          ← Express app (port auto-detect + Claude proxy)
│   └── scripts/
│       ├── export-pptx.js       ← notes-bearing PPTX for submission
│       └── export-notes-pdf.js  ← speaker notes as PDF
├── exports/              ← generated .pptx / .pdf land here
├── package.json
├── Dockerfile
└── docker-compose.yml
```

## Run locally (no Docker)

```bash
cd app
npm install
npm start                     # starts server, auto-picks a free port
```

Then open the URL printed in the console (e.g. `http://localhost:3000`).

Dev mode with auto-restart:

```bash
npm run dev
```

## Run in Docker

```bash
cd app
docker compose up --build
```

Set a preferred port:

```bash
PORT=4000 docker compose up
```

The server auto-detects the next free port if your preferred one is taken.

## Claude CLI integration

If the `claude` binary is on `PATH` (or set via `CLAUDE_BIN=/path/to/claude`),
the server exposes `POST /api/claude`:

```bash
curl -X POST http://localhost:3000/api/claude \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Summarize slide 7 in two sentences"}'
```

This spawns `claude -p <prompt>` and streams stdout back to the caller. If
no CLI is found, the route returns `501` with a helpful hint.

Inside the container, bind-mount your CLI to use it from the host:

```yaml
# docker-compose.yml
services:
  deck:
    volumes:
      - /usr/local/bin/claude:/usr/local/bin/claude:ro
    environment:
      CLAUDE_BIN: /usr/local/bin/claude
```

## Editing the deck with Claude CLI

The app is split into files that are easy to prompt against:

- **Content/narration** → `public/speaker-notes.json` (plain JSON array)
- **Slide layouts** → `public/deck.jsx` (React components, no build step)
- **Styles & theme** → `public/styles.css`
- **Animations & voice** → `public/engine.js`

Because the server serves these live (no bundler), edits take effect on
refresh. Sample CLI prompts:

```bash
claude "In public/deck.jsx, shorten the slide-11 cards to one line each."
claude "In public/speaker-notes.json, tighten slide 6 to 45 seconds of speech."
claude "In public/styles.css, change --accent on the default :root to a cooler blue."
```

## Exports

```bash
npm run export:pptx        # writes exports/ai-pe-deck.pptx
npm run export:notes-pdf   # writes exports/speaker-notes.pdf
```

Both read live from `public/speaker-notes.json` so regenerate after edits.

## Voice control

Click the mic button (bottom-right) or press **V** to toggle.

- Uses the browser's built-in SpeechRecognition (Chrome/Edge work best).
- Trigger phrases are extracted automatically from `speaker-notes.json`.
- When the recognizer hears a target phrase, the current slide's next
  reveal group animates in. After the last phrase on a slide, it auto-
  advances to the next.
- `space` or click anywhere is the manual fallback if voice misses a cue.

## Ports & health

- `/` → the deck
- `/healthz` → JSON status (node version, claude path, uptime)
- `/exports/*` → generated files

## Next steps for CLI iteration

The design is final; all further changes are operational. Common tweaks
you can do through Claude CLI without understanding the code:

- **Rewrite narration**: edit `speaker-notes.json` — voice triggers
  re-extract automatically on the next page load.
- **Swap accent color**: the Tweaks panel stores `{accent}` in
  `deck.jsx`'s `TWEAK_DEFAULTS` block (EDITMODE-BEGIN/END markers).
  Change the hex in place; server serves it live.
- **Add a slide**: add a `<section>` in `public/index.html`, a component
  in `public/deck.jsx`, a `mountAt(...)` call at the bottom of the JSX,
  and a new entry to `speaker-notes.json`.

Enjoy.
