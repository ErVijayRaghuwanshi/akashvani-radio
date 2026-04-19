# Akashvani Radio

A modern web app to stream Akashvani / AIR and additional Indian radio channels with a rich player UI, spectrum visualizer, smart station sequencing, PiP mode, and PWA support.

## Live URL

- https://ervijayraghuwanshi.github.io/akashvani-radio/

## Features

- Live streaming with HLS support (`hls.js`) and native fallback.
- Spectrum visualizer on main player and PiP canvas:
  - Real spectrum via Web Audio `AnalyserNode` when stream is analyzable.
  - Smooth dummy spectrum fallback when CORS restrictions block analysis.
- Optional Cloudflare Worker proxy support to enable real spectrum on compatible third-party streams.
- Picture-in-Picture support with:
  - Manual PiP toggle controls.
  - Auto-PiP behavior after at least one successful manual PiP session.
  - Progressive enhancement for Chromium `autoPictureInPicture` when available.
- Media controls: play, pause, next, previous.
- Media Session integration for hardware media keys.
- Smart client-side station ordering using recent plays, play counts, and search interactions.
- Search and grouped station browsing by state/language/name.
- Installable PWA with offline shell and clear offline stream messaging.

## Tech Stack

- React 19
- Vite 8
- Tailwind CSS 4 (via `@tailwindcss/vite`)
- `hls.js`
- `lucide-react`

## Project Structure

- `src/App.jsx` — main UI, visualizer rendering, search/list view.
- `src/hooks/useRadioPlayer.js` — playback, HLS setup, PiP, audio graph/analyser.
- `src/hooks/useSmartQueue.js` — smart sequencing and user profile behavior.
- `src/hooks/usePersistentState.js` — localStorage persistence helper.
- `src/data/stations.js` — station dataset.
- `workers/stream-proxy.js` — Cloudflare Worker stream proxy (adds CORS headers).
- `wrangler.toml` — Cloudflare Worker deployment configuration.
- `public/manifest.webmanifest` and `public/sw.js` — PWA assets.

## Getting Started

### Prerequisites

- Node.js 18+ (recommended)
- npm

### Install

```bash
npm install
```

### Environment

Create `.env` (or copy from `.env.example`) and set:

```bash
VITE_STREAM_PROXY_URL=https://<your-worker-url>.workers.dev
```

- If `VITE_STREAM_PROXY_URL` is not set, the app still works and uses current fallback behavior.

### Run development server

```bash
npm run dev
```

### Lint

```bash
npm run lint
```

### Build

```bash
npm run build
```

### Preview production build

```bash
npm run preview
```

## Deploy to GitHub Pages

Deployment is configured using `gh-pages` and Vite base path:

- `vite.config.js` uses:
  - `base: '/akashvani-radio/'`
- `package.json` includes:
  - `predeploy`: `npm run build`
  - `deploy`: `gh-pages -d dist`

Publish command:

```bash
npm run deploy
```

## Optional: Cloudflare Worker Proxy Setup

Use this if you want to attempt real spectrum on CORS-restricted third-party streams.

### 1) Login + deploy Worker

```bash
npx wrangler login
npx wrangler deploy
```

### 2) Copy Worker URL into `.env`

```bash
VITE_STREAM_PROXY_URL=https://akashvani-stream-proxy.<your-subdomain>.workers.dev
```

### 3) Run app

```bash
npm run dev
```

## Spectrum Behavior Notes

- Real spectrum is available when:
  - Stream is analyzable directly (CORS-safe), or
  - Stream works through configured proxy.
- Dummy spectrum is used when analysis is blocked by CORS/auth constraints.
- Some upstreams (for example, `*.zeno.fm`) may reject Worker-origin requests with `401`; those streams automatically bypass proxy and fall back to direct playback.

## Notes

- Live streams require internet access; offline mode keeps UI functional but cannot play radio streams.
- Some browsers require explicit user gesture for autoplay, Web Audio context resume, or PiP entry.
