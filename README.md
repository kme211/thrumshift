# Thrumshift

Stay in range. Keep the station alive.

This repository currently contains the Gate 4B executable gray-box flow for Thrumshift. It includes the lifecycle reducer, semantic shells, monotonic clock and scheduler boundaries, visibility handling, a best-effort Screen Wake Lock adapter, deterministic simulated telemetry, and a narrow Web Bluetooth heart-rate adapter. It does not include heart-rate classification, warm-up qualification, gameplay, puzzle behavior, metrics, routing, backend, or persistence.

## Requirements

- Node.js 22.12.0 (pinned in `.nvmrc`; `package.json` permits supported releases from 22.12 through 24)
- npm 10 or newer
- Chromium for end-to-end tests

## Setup

```sh
nvm use
npm ci
npx playwright install chromium
```

Start the development server with `npm run dev`, then open the local URL Vite prints.

Development builds show one diagnostics panel beneath the product gray box. Its lifecycle controls exercise pre-mission, warm-up, countdown, active mission, pause/disconnect, success/failure, recovery, abandonment, and run-again shells using placeholder state only. The telemetry section retains the Phase 3 simulator and Web Bluetooth controls. Select Simulator to enter BPM and an optional RR-interval value (leave RR blank to omit it), emit samples or errors, and disconnect/reconnect. Select Web Bluetooth and use “Choose heart-rate monitor” to open the browser chooser from that explicit button gesture.

The lifecycle shells intentionally contain no target-range, signal-quality, warm-up timing, puzzle, stability, outcome, or result-metric rules. Backgrounding any live shell adds the hidden suspension reason. Restoring an active mission leaves it paused until explicit resume; restoring warm-up/countdown returns through the fresh placeholder warm-up path. Wake Lock is requested only for unsuspended warm-up, countdown, and active-mission shells, and unsupported or rejected requests never block navigation.

Web Bluetooth requires Android Chrome or another compatible Chromium browser on HTTPS or localhost. The adapter requests only devices advertising the standard Heart Rate Service and subscribes to Heart Rate Measurement notifications. It does not automatically reconnect or remember a device.

See [DEVELOPMENT.md](DEVELOPMENT.md) for the tested temporary-HTTPS workflow used to open the development diagnostics on a phone.

Automated component tests inject telemetry sources at the application boundary rather than mocking domain modules. The reusable telemetry-source contract suite runs against both simulated and Web Bluetooth adapters. Web Bluetooth tests use the narrow injected browser port; automated tests never open a real chooser. The diagnostics panel is removed from production builds, and `npm run build && npm run e2e` verifies that exclusion.

## Web Bluetooth hardware check

1. Serve the development app from localhost or an HTTPS origin and open it in Android Chrome.
2. Turn on and wear the heart-rate monitor according to its manufacturer instructions.
3. Select Web Bluetooth, choose “Choose heart-rate monitor,” and select the monitor in Chrome’s chooser.
4. Confirm connecting becomes connected and live BPM values appear.
5. Intentionally disconnect or power off the monitor; confirm a recoverable disconnected error appears.
6. Choose the monitor again and verify values resume without duplicate notifications.
7. Record the phone model, Android and Chrome versions, monitor model/firmware, notification cadence, and whether RR intervals actually appear. Absence of observed RR intervals is not evidence of incompatibility, and the MVP does not claim RR support for an untested monitor.
8. Deny or cancel the chooser once and confirm the error is understandable and retryable.
9. In a browser without Web Bluetooth, confirm the panel reports that the capability is unavailable.

## Quality commands

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run e2e
```

`npm run e2e` serves the already-built `dist` directory through Vite preview and checks 360×640 phone and 768×1024 tablet viewports. Run `npm run build` first when invoking E2E independently.

## Static hosting

`npm run build` produces a portable static site in `dist`. Configure a static host to serve `index.html` as the fallback for unknown paths. Thrumshift does not currently use URL routing, but documenting the fallback keeps direct loads compatible if app-state URLs are ever approved. No provider-specific configuration or deployment is included.

## Current styling scope

Tailwind is used only for safe-area-aware layout, mobile-first responsive spacing and type, and the gray-box composition. The small CSS token layer owns semantic colors and spacing. Global CSS supplies a visible keyboard-focus baseline and a reduced-motion override. No Tailwind plugins, component theme, router, or generic UI library is installed.

Run `npm run format` to apply the repository's Prettier rules. `npm run format:check` is the non-mutating quality gate.
