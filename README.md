# Thrumshift

Stay in range. Keep the station alive.

This repository currently contains the Gate 6 foundation for Thrumshift. In addition to the pre-mission and warm-up flow, it includes one pure, hand-authored coolant-routing puzzle and an isolated accessible puzzle workbench in development diagnostics. It does not include active-mission rules, mission pressure or stability, puzzle/telemetry integration, metrics, routing, backend, or persistence.

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

Development builds show one diagnostics panel beneath the product flow. Its coolant workbench exposes the 3×3 authored puzzle, deterministic hint, and reset without connecting it to mission or telemetry rules. Select Simulator in the mission briefing and connect it, then start continuous samples from diagnostics to emit the selected BPM at the configurable cadence while moving through the flow. The 1,095 ms default approximates the observed HR6 cadence. BPM changes apply to subsequent samples; Stop Samples deliberately allows normal staleness testing, and one-shot emission remains available. Select Web Bluetooth in the mission briefing and use “Choose heart-rate monitor” to open the browser chooser from that explicit button gesture.

The pre-mission and warm-up components render canonical heart-rate and warm-up domain values; they do not calculate signal quality, classification, qualification, or countdown validity. Backgrounding warm-up/countdown invalidates progress and returns through a fresh warm-up on recovery. Disconnect, stale signal, and target-range changes also revoke qualification. Disconnect and stale signal suspend the lifecycle and release Wake Lock; suspended warm-up offers a direct reconnect gesture when needed and a safe return to the briefing. Stale recovery requires fresh usable, stable classification. Wake Lock is requested only for unsuspended warm-up, countdown, and active-mission shells, and unsupported or rejected requests never block navigation.

Signal filtering and delivery density use separate horizons. The rolling median uses at most five valid samples from the latest 3,000 ms. Signal usability requires at least three valid samples in the latest 4,000 ms, accommodating the observed approximately 1,095 ms HR6 notification cadence without recomputing the filter on scheduler-only wakeups. A signal is still stale 3,000 ms after the last valid sample.

The composition root stamps facts with increasing sequence numbers. The warm-up controller applies facts in `(occurrenceTime, sequence)` order, accepts equal-time facts by sequence, and safely ignores and diagnoses late or duplicate facts before they can reach domain transitions.

Web Bluetooth requires Android Chrome or another compatible Chromium browser on HTTPS or localhost. The adapter requests only devices advertising the standard Heart Rate Service and subscribes to Heart Rate Measurement notifications. It does not automatically reconnect or remember a device.

See [DEVELOPMENT.md](DEVELOPMENT.md) for the tested temporary-HTTPS workflow used to open the development diagnostics on a phone.

Automated component tests inject telemetry sources at the application boundary rather than mocking domain modules. The reusable telemetry-source contract suite runs against both simulated and Web Bluetooth adapters. Web Bluetooth tests use the narrow injected browser port; automated tests never open a real chooser. The diagnostics panel is removed from production builds, and `npm run build && npm run e2e` verifies that exclusion.

## Web Bluetooth hardware check

1. Serve the development app from localhost or an HTTPS origin and open it in Android Chrome.
2. Turn on and wear the heart-rate monitor according to its manufacturer instructions.
3. Select Web Bluetooth, choose “Choose heart-rate monitor,” and select the monitor in Chrome’s chooser.
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

## Static hosting

`npm run build` produces a portable static site in `dist`. Configure a static host to serve `index.html` as the fallback for unknown paths. Thrumshift does not currently use URL routing, but documenting the fallback keeps direct loads compatible if app-state URLs are ever approved. No provider-specific configuration or deployment is included.

## Current styling scope

Tailwind is used only for safe-area-aware layout, mobile-first responsive spacing and type, and the gray-box composition. The small CSS token layer owns semantic colors and spacing. Global CSS supplies a visible keyboard-focus baseline and a reduced-motion override. No Tailwind plugins, component theme, router, or generic UI library is installed.

Run `npm run format` to apply the repository's Prettier rules. `npm run format:check` is the non-mutating quality gate.
