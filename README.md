# RadioWave

A modern web app to stream live radio channels with a rich player UI, real-time audio spectrum visualizer, smart station sequencing, and PWA support.

## Live URL

- https://ervijayraghuwanshi.github.io/radio-wave/

## Features

- Live streaming with HLS support (`hls.js`) and native fallback.
- Real audio spectrum visualizer (Web Audio `AnalyserNode`) on both main player and PiP canvas.
- Picture-in-Picture support with optional auto-activation on tab switch while playing.
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
- `public/manifest.webmanifest` and `public/sw.js` — PWA assets.

## Getting Started

### Prerequisites

- Node.js 18+ (recommended)
- npm

### Install

```bash
npm install
```

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
  - `base: '/radio-wave/'`
- `package.json` includes:
  - `predeploy`: `npm run build`
  - `deploy`: `gh-pages -d dist`

Publish command:

```bash
npm run deploy
```

## Notes

- Live streams require internet access; offline mode keeps UI functional but cannot play radio streams.
- Some browsers may require an explicit user gesture before enabling autoplay, PiP, or media-session actions.
