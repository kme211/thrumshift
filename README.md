# Thrumshift

Stay in range. Keep the station alive.

This repository currently contains the Phase 2 executable gray box for Thrumshift. It includes a browser-independent heart-rate packet parser and deterministic simulated telemetry, but no gameplay, real Bluetooth connection, routing, backend, or persistence.

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

Development builds show the single telemetry diagnostics panel beneath the product gray box. Connect the simulator, enter BPM and an optional RR-interval value (leave RR blank to omit it), emit samples or errors, and disconnect/reconnect. The panel uses the same application composition root and is removed from production builds; `npm run build && npm run e2e` verifies that exclusion.

Automated component tests inject `SimulatedHeartRateSource` at the application telemetry boundary rather than mocking domain modules. The reusable telemetry-source contract suite checks the same lifecycle and delivery behavior against the simulator and is available to later source adapters.

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
