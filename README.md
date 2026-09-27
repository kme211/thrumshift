# Thrumshift

Stay in range. Keep the station alive.

Thrumshift is a browser game in which heart-rate telemetry affects station stability while the player restores coolant flow through a failing reactor system. The production flow includes the station-access launch console, an intentional 110 BPM simulator path, Web Bluetooth heart-rate input, briefing, warm-up, countdown, active play, suspension/reconnection, and mission results. The application is client-only: it has no backend, account system, or persistence.

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

The app opens on a production station-access console. `Run Simulation` enters the existing briefing with a connected 110 BPM training signal, so no heart-rate monitor or query string is required. `Connect Bio-Link` opens the Web Bluetooth chooser directly from the explicit button gesture and enters the same briefing with the hardware source selected.

Development builds additionally show one diagnostics panel beneath the product flow after a launch path is selected. Its coolant workbench exposes the 3×3 authored puzzle, deterministic hint, and reset without connecting it to mission or telemetry rules. The simulator controls can change BPM and cadence, stop the production simulation stream for staleness testing, or emit one-shot samples. The 1,095 ms default approximates the observed HR6 cadence. The development briefing also retains its telemetry-source selector; neither the selector nor diagnostics are included in production.

The pre-mission and warm-up components render canonical heart-rate and warm-up domain values; they do not calculate signal quality, classification, qualification, or countdown validity. Backgrounding warm-up/countdown invalidates progress and returns through a fresh warm-up on recovery. Disconnect, stale signal, and target-range changes also revoke qualification. Disconnect and stale signal suspend the lifecycle and release Wake Lock; suspended warm-up offers a direct reconnect gesture when needed and a safe return to the briefing. Stale recovery requires fresh usable, stable classification. Wake Lock is requested only for unsuspended warm-up, countdown, and active-mission shells, and unsupported or rejected requests never block navigation.

Signal filtering and delivery density use separate horizons. The rolling median uses at most five valid samples from the latest 3,000 ms. Signal usability requires at least three valid samples in the latest 4,000 ms, accommodating the observed approximately 1,095 ms HR6 notification cadence without recomputing the filter on scheduler-only wakeups. A signal is still stale 3,000 ms after the last valid sample.

The composition root stamps facts with increasing sequence numbers. The warm-up controller applies facts in `(occurrenceTime, sequence)` order, accepts equal-time facts by sequence, and safely ignores and diagnoses late or duplicate facts before they can reach domain transitions.

The active-mission domain uses the same ordering contract without reading browser clocks or scheduling callbacks. Stability rates are station-stability points per eligible active-play second. Eligible time requires active rather than suspended play, usable signal, and an established stable classification; otherwise both active mission time and stability freeze. Between ordered facts the rate is constant, so the engine integrates the entire interval analytically without capping or subdividing it. A failure strictly before a fact preempts that fact. At an exact zero-stability endpoint, the first sequenced fact at that timestamp applies before boundary finalization, allowing puzzle completion to win only when it is ordered first. Once success or failure is finalized, every later mission fact is ignored.

Mission statistics consume facts only through that authoritative transition. Classified, signal-gap, suspension, disconnect, and time-weighted BPM segments use behavior-change anchors, so scheduler cadence does not affect totals. Raw BPM statistics include plausible integer samples received during unsuspended mission play; samples are never inferred across suspension or unusable-signal gaps. Serialized mission results use schema version 1, contain no device identifiers or wall-clock history, and expose insufficient averages or percentages as `null` rather than invented values.

Web Bluetooth requires Android Chrome or another compatible Chromium browser on HTTPS or localhost. The adapter requests only devices advertising the standard Heart Rate Service and subscribes to Heart Rate Measurement notifications. It does not automatically reconnect or remember a device.

See [DEVELOPMENT.md](DEVELOPMENT.md) for the tested temporary-HTTPS workflow used to open the development diagnostics on a phone.

Automated component tests inject telemetry sources at the application boundary rather than mocking domain modules. The reusable telemetry-source contract suite runs against both simulated and Web Bluetooth adapters. Web Bluetooth tests use the narrow injected browser port; automated tests never open a real chooser. The diagnostics panel is removed from production builds, and `npm run build && npm run e2e` verifies that exclusion.

## Web Bluetooth hardware check

1. Serve the development app from localhost or an HTTPS origin and open it in Android Chrome.
2. Turn on and wear the heart-rate monitor according to its manufacturer instructions.
3. Choose `Connect Bio-Link` on the launch console and select the monitor in Chrome’s chooser.
4. Confirm connecting becomes connected and live BPM values appear.
5. Intentionally disconnect or power off the monitor; confirm the run suspends, Wake Lock releases, and reconnect and return-to-briefing actions appear.
6. Use the reconnect action, choose the monitor again, and verify warm-up restarts from zero without duplicate notifications.
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
npm run e2e:puzzle
```

`npm run e2e` serves the already-built `dist` directory through Vite preview and checks 360×640 phone and 768×1024 tablet viewports. Run `npm run build` first when invoking E2E independently.

`npm run e2e:puzzle` opens the same development diagnostics entry used by the app and checks the workbench at phone/tablet sizes, a viewport orientation change, reduced motion, and a 200% zoom approximation. It does not create a second application or harness.

## Cloudflare Pages deployment

`npm run build` produces the production site in `dist`. Before creating a release, run the quality commands above from a clean `npm ci` installation.

Create a Cloudflare Pages project connected to this repository with these settings:

- Production branch: `main`
- Framework preset: React (Vite)
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: leave blank
- Environment variables and secrets: none

The committed `.nvmrc` pins the Pages build image to Node.js 22.12.0. No Pages Functions, Wrangler configuration, redirect file, or custom build adapter is required. Cloudflare Pages treats a project without a top-level `404.html` as a single-page application and serves `/` for unknown paths, so direct URL reloads reach the application shell.

After the first successful deployment, attach a production hostname from the Pages project's **Custom domains** panel. If the hostname is in the same Cloudflare account, Pages can create the DNS record automatically. For DNS hosted elsewhere, associate the hostname in Pages first and then create the requested CNAME to the project's `<project-name>.pages.dev` hostname.

## Current styling scope

Tailwind remains limited to safe-area-aware application layout and a small amount of utility styling in legacy screens and development tooling. The active gameplay screen now establishes the first production visual-system slice: reusable equipment-shell primitives, recessed CRT display surfaces, industrial labeling, persistent status indicators, physical controls, and responsive density rules. CSS tokens own both the original semantic application colors and the new equipment/display palette. Global CSS also supplies the keyboard-focus baseline, forced-color support, and reduced-motion override. No Tailwind plugins, generic component library, or router is installed.

The approved visual rules and captures are indexed under [docs/design](docs/design/README.md). The industrial equipment language now covers the production launch console and the complete mission lifecycle without changing their underlying information architecture.

Run `npm run format` to apply the repository's Prettier rules. `npm run format:check` is the non-mutating quality gate.
