# Thrumshift MVP Implementation Plan

> **Product:** Thrumshift  
> **Tagline:** Stay in range. Keep the station alive.  
> **Planning status:** Proposed; implementation must proceed one approved phase at a time.  
> **Primary target:** Mobile Chrome on Android with a Bluetooth heart-rate monitor.  
> **Secondary targets:** Larger tablets and desktop Chromium browsers.

## 1. Repository inspection

The repository currently contains only `.git`; it has no commits, tracked files, package manifest, source tree, configuration, documentation, or established conventions. The current unborn branch is `master`. Therefore the foundation phase must establish conventions explicitly rather than inherit them.

This plan is the only file to add during planning. No application code, dependencies, services, or deployment resources should be created until Phase 1 is approved.

## 2. Scope and implementation protocol

The MVP is a static, client-only React application with one Operator, one local heart-rate monitor, one mission (`Reactor Cooling Failure`), one easy coolant-routing puzzle, and no account or backend. It has four primary user-facing states: pre-mission, warm-up, active mission, and result. Success and failure are result variants; pause, disconnect, countdown, and unsupported-browser states are explicit substates.

Implementation is approval-gated:

1. Implement only the currently approved phase.
2. Keep the repository runnable and testable at the end of that phase.
3. Run type checking, linting, relevant tests, and a production build.
4. Report what changed, key decisions, files changed, command results, manual tests, and known limitations.
5. Stop and wait for explicit approval before starting the next phase.

No phase may bundle unrelated refactoring. Logical commits are recommended below, but commits should be created only when requested.

## 3. Recommended architecture

### Technology choices

- React, strict TypeScript, and Vite.
- Tailwind CSS, as requested by the product brief, for responsive layout and utility styling, with a deliberately small CSS custom-property token layer. Phase 1 must name its concrete uses (safe-area layout, responsive spacing/type, focus and reduced-motion variants); no component theme or plugin ecosystem is added.
- Vitest, React Testing Library, `user-event`, and a DOM accessibility matcher set for unit/component tests.
- Playwright for end-to-end, viewport, reduced-motion, and browser-capability tests.
- Web Bluetooth behind a narrow adapter; simulated telemetry is the default automated-test boundary.
- A small reducer-driven application state machine implemented with React's `useReducer`, not a state-machine library for the MVP.
- A portable static build with no production hostname in application logic; validate one host chosen at release review rather than configuring two hosts speculatively.
- No IndexedDB in the MVP. Current-run data lives in memory. The final `MissionResult` is serializable so persistence can be added later without changing mission rules.

### State-management recommendation

Use a discriminated-union `AppState` and a pure reducer for navigation and lifecycle only. It owns the displayed phase, current run identity, and suspension reasons. It does **not** calculate warm-up qualification, puzzle completion, stability, outcomes, or statistics. A warming phase contains exactly one canonical `WarmupState`; an active or suspended run contains exactly one canonical `MissionState`. Only pure domain transitions produce those values, and they are never mirrored as reducer fields.

One application controller/composition root serializes timestamped facts, advances the applicable domain state, and dispatches the resulting canonical value to the reducer. Effects and feature components may report facts but may not calculate outcomes or retain competing domain state. Browser adapters report telemetry, visibility, Wake Lock, and scheduler facts; domain modules never call browser APIs.

Interruptions use one representation: `suspended { resumeTarget, reasons }`, where `reasons` is a nonempty set of `manual`, `hidden`, `disconnect`, and `staleSignal`. Reasons may coexist. Clearing one cannot resume while another remains; reconnect never implies resume; explicit resume is allowed only when automatic blockers are clear. Warm-up/countdown suspension revokes qualification and returns to warm-up on recovery. Mission suspension retains canonical `MissionState` but freezes gameplay time.

Tradeoffs: a reducer and serialized controller are more explicit than several hooks but remain smaller than adding a state-machine library. The controller is coordination, not a second store: after each fact, canonical state exists only in reducer-held `AppState`.

### Proposed directory structure

```text
src/
  app/                  # one controller/composition root and lifecycle reducer
  config/               # validated runtime/build configuration and MVP tuning
  domain/
    heart-rate/         # samples, range classification, smoothing, event counting
    mission/            # mission rules, stability, timing, result calculation
    puzzle/             # board model, rotation, connectivity, authored board
  telemetry/            # application telemetry interface and source lifecycle
    bluetooth/          # Web Bluetooth boundary and packet parser
    simulated/          # deterministic/manual simulation source
  features/
    pre-mission/
    warm-up/
    active-mission/
    mission-result/
  components/
    mission/            # domain-specific visual components
    ui/                 # only selected locally owned generic primitives
  platform/             # clock, visibility, Wake Lock, capability adapters
  styles/               # global styles and shared design tokens
  test/                 # shared test builders/fakes, not production utilities
e2e/
public/
```

Modules should expose narrow public entry points. Avoid catch-all `utils`, giant contexts, and importing feature UI into domain code. Copy and tuning data remain outside pure rules where practical.

### Boundary ownership

| Boundary | Owns | Must not own |
|---|---|---|
| `domain/heart-rate` | samples, signal quality, stateful pure classifier | Bluetooth objects, React, mission aggregation, medical advice |
| `telemetry` | source contract, source status, real/simulated sample delivery | mission transitions or UI copy |
| `telemetry/bluetooth` | GATT lifecycle, notification parsing, disconnect mapping | game state or DOM rendering |
| `domain/puzzle` | tile model, rotation, route connectivity, completion | pointer events, SVG layout |
| `domain/mission` | stability, elapsed active time, pause semantics, result | timers, Bluetooth, React |
| `app` | lifecycle/navigation, serialized fact ordering, composition | duplicate domain state, packet parsing, puzzle/stability decisions |
| `features`/`components` | semantic rendering and user interaction | duplicated business rules |
| `platform` | browser capability wrappers | product rules |
| storage (deferred) | validated serialized results if later approved | live mission authority |

### Telemetry contract and Web Bluetooth

Define a small application-level `HeartRateTelemetrySource` contract with capability/status observation and explicit `connect`, `disconnect`, and sample subscription behavior. Samples contain a monotonic occurrence time, BPM, source identity/type, and optional RR intervals. Transport state (`connected`, etc.) and signal quality (`usable`, `stale`, `invalid`, `insufficient`) are separate. Samples contain no `BluetoothDevice`, GATT characteristic, or browser event objects.

The Bluetooth source requests devices advertising the standard Heart Rate Service, connects to the service and Heart Rate Measurement characteristic, subscribes to notifications, parses 8-bit and 16-bit BPM from the flags, preserves every valid RR interval as explicitly required by the brief, rejects truncated/malformed data safely, and translates GATT disconnects to a source lifecycle state. Energy expenditure is parsed only far enough to locate later fields and is not exposed in the application contract. Device names may be display-only and must not be assumed stable identifiers. RR support remains optional until verified on real hardware.

### Canonical event and timing contract

Every external fact—sample, puzzle move, visibility change, connection change, pause action, hint action, or scheduler wakeup—receives a monotonic occurrence time and increasing sequence number at the single composition root. Facts are processed in `(occurrenceTime, sequence)` order. A pure transition first advances canonical domain state from `lastProcessedTime` to the fact time, then applies the fact. Equal-time facts therefore have explicit arrival order; tests lock outcome precedence. A finalized run rejects later facts.

Scheduler callbacks only wake the controller to enqueue a timestamped `timeAdvanced` fact; they are not elapsed-time truth. Domain calculations never call `Date.now()` or own timers. Wall-clock time is optional display metadata only and never affects gameplay. Tests inject a monotonic fake clock and exact fact sequences.

Elapsed time is never silently capped or discarded. A normal long interval is subdivided deterministically into configured integration steps until fully processed. An interval spanning a known hidden/suspended period is recorded as suspension/signal-gap time, not simulated as active play. If the browser prevents determining an exact transition time, the conservative suspension policy and limitation are documented.

**Active mission time** is derived once from the canonical timeline. Stability and classified durations advance only when the mission is unsuspended and signal is usable; hint eligibility uses the same unsuspended active-play timeline. Warm-up dwell and countdown use the same monotonic time but are revoked, not frozen, on invalidation. Mission completion excludes suspension and unusable-signal gaps. Suspension reasons may overlap, but total suspension time is not double-counted. The application controller schedules wakeups; pure domain transitions calculate elapsed effects.

### Noisy BPM, crossings, and event counting

Keep raw valid samples for current-run aggregation while deriving a stable gameplay classification separately. Recommended initial policy:

- Validate BPM as a finite positive integer and apply a documented configurable plausibility range for gameplay. Zero, malformed, and implausible readings do not become samples; they update signal quality without inventing a BPM.
- Use a short time-weighted rolling median (approximately the latest 3–5 valid samples or about 3 seconds) to reject single-sample spikes.
- Apply configurable hysteresis at target boundaries (for example, enter range at the configured bounds and leave only after crossing a small margin) plus a short dwell period (about 2 seconds) before changing gameplay state.
- If samples become stale or valid-data density stays below a minimum policy, report connected-but-unusable signal and suspend progression/stability changes. The standard service provides no portable sensor-worn or strap-battery guarantee, so absence of usable measurements is handled generically.
- Keep all constants centralized in typed MVP tuning configuration and lock exact defaults during Phase 5 playtesting.

Do not average so aggressively that sustained changes disappear. UI can show the latest valid BPM while station stability responds to the debounced classification; label or document this distinction.

Implement classification as a pure stateful transition over `ClassifierState` with explicit `sample`, `timeAdvanced`, and `invalidate` inputs. It alone retains rolling samples, hysteresis/dwell state, last-valid time, and signal quality. Disconnect, hidden, manual/mission suspension, run replay, target-range change, and stale/invalid signal invoke `invalidate`; fresh dwell is required before another classified interval. Mission logic consumes classified intervals and signal-quality facts, never filter history.

A **low-output event** begins when stable classification enters `below` from any non-below state and ends after a stable exit. A **redline/overload event** follows the same rule for `above`. Initial classification does not count until dwell confirms it. Invalidation creates or closes no event; reclassification establishes a new baseline before a later crossing can count. Percentages use usable classified mission time, while signal-gap time is displayed separately. Runs below a configured minimum valid-data duration/count suppress average BPM and percentages as “insufficient signal.” Tests lock the denominator and threshold.

### Disconnect and recovery policy

- Pre-mission: show disconnected status and allow a new chooser request from a user gesture.
- Warm-up/countdown: cancel accumulated consecutive progress and return to a suspended/disconnected state. After reconnect, resume warm-up from zero; never auto-launch the mission on stale qualification.
- Active mission: automatically pause immediately, freeze clock and stability, retain puzzle and telemetry aggregates, release/reacquire Wake Lock as appropriate, and show a modal-like reconnect decision. Reconnection requires a user gesture because browser chooser behavior may require one. After valid fresh samples re-establish signal, the Operator explicitly resumes.
- A user may end/abandon the run from the disconnect UI; abandoning does not masquerade as reactor failure. The MVP need not persist a run across refresh or browser termination.

### Simulated telemetry

Provide a deterministic source implementing the same contract as Bluetooth. In development, a clearly marked simulator panel or query/build flag can select scripted scenarios (below → operational → above), manually set BPM, disconnect/reconnect, and emit malformed-source errors where relevant. Production builds should not expose test controls accidentally; source selection is validated configuration. Playwright injects or selects the simulated source through the composition root, never mocks domain modules.

### Coolant puzzle usability at a distance

Use a hand-authored, guaranteed-solvable 3×3 board with few incorrect orientations and no random generation in the MVP. Render thick pipes with SVG or CSS shapes at high contrast. Each tile is a semantic button with a minimum target of 48 CSS pixels and preferably much larger in the 3×3 layout. Entire tiles rotate on tap/keyboard activation; no dragging. Non-color cues show source, reactor, connections, selected/changed state, and completed flow. Provide concise instructions, obvious tap feedback without shake, an announced completion state, and a hint that identifies a useful tile after a configurable active-play delay. Rotation animation respects reduced motion.

### Serializable mission result

Define a minimal plain-data `MissionResult` containing only MVP result-screen inputs, plus a single schema discriminator because serializability is explicitly required:

- schema version, outcome (`success` or `failure`), and active duration milliseconds;
- target range used;
- average BPM (time-weighted where sampling permits), peak BPM, valid sample count;
- active milliseconds and percentages below, operational, and above;
- unclassified/signal-gap duration;
- low-output and overload event counts;
- ending station stability, pause count/duration, disconnect count/duration;
- puzzle move count, hint-used flag, and completion state;
- simple deterministic performance rating and a short explanation derived from displayed metrics.

Do not add run IDs, wall-clock history fields, mission/puzzle/rules versions, recomputation metadata, or a full raw telemetry history until a real persistence/progression consumer needs them. Current-run raw samples may be held only as needed for accurate aggregation. Do not add storage until history or reload recovery is approved. Rating remains because the MVP brief explicitly requires it, but rating policy belongs to result presentation rather than the mission transition engine.

### UI primitive strategy

Use semantic HTML first. Custom-build `MissionShell`, `MissionHeader`, `BioLinkStatus`, `HeartbeatIndicator`, `OperationalRangeGauge`, `StationStabilityMeter`, `CoolantPuzzle`, `CoolantTile`, `WarmupProgress`, and `MissionResultPanel`; these express Thrumshift's domain and must not be generic dashboard cards.

Selective shadcn/ui with its Base UI foundation is evaluated only when native semantics prove insufficient for an approved interaction. Candidate MVP additions are:

- an accessible dialog/alert-dialog for pause, disconnect recovery, and destructive “end run” confirmation;
- accessible form primitives only where native range/number inputs do not meet target-range usability after testing;
- a switch only if the simulator or reduced-effects preference needs one;
- a live notification/toast only for transient, noncritical connection feedback that is also available persistently.

Do not install shadcn/Base UI during foundation work, install the catalog, or adopt default visuals. First test a native `<dialog>`/semantic solution; add one primitive only if a concrete focus/interaction gap remains in the phase that uses it. Keep copied code locally owned in `components/ui`, style it through Thrumshift tokens, and test keyboard operation, focus trapping/restoration, names, and announcements. Prefer native buttons, fieldsets, labels, output, meter/progress semantics where appropriate. The gray-box flow precedes final visual styling.

### Single diagnostics entry point and asynchronous adapter discipline

The repository may have one development-only diagnostics entry selected by build-time development configuration and using the same composition root as the product. Phases extend this surface; they do not create separate harness applications or duplicate state ownership. Production E2E asserts it is unreachable or absent.

Every asynchronous browser adapter uses an operation/generation token, serializes overlapping connect/disconnect or acquire/release operations, ignores stale completions and notifications from earlier generations/runs, and guarantees idempotent teardown. Tests cover overlapping connects, late completion after cancellation/unmount, notification after disconnect, notification bursts without an unbounded queue/render loop, retry generations, and Wake Lock resolution after lifecycle state changes.

### Explicit state invariants

- A finalized run accepts no time, telemetry, classification, hint, or puzzle facts.
- Ordered facts determine whether puzzle completion precedes stability failure; no reducer independently re-decides the outcome.
- Stability changes only during active, usable, classified mission intervals.
- Below + operational + above + signal-gap time equals the unsuspended mission timeline; the displayed percentage denominator is documented separately.
- Transport connection never implies usable signal, and reconnection never implies resume.
- Warm-up qualification and countdown validity are revoked together on classifier invalidation.
- Exactly one run owns one puzzle state, aggregate state, classifier state, and mission state.
- Facts from earlier connection generations or run identities are ignored.
- Wake Lock ownership is derived from lifecycle state and is never mission truth.
- Replay creates fresh classifier/domain state and invalidates pending scheduler and adapter callbacks.

### Useful extension points versus premature abstractions

Useful now: telemetry interface, clock/scheduler boundary, pure mission/puzzle rules, a minimal serializable result discriminator, central typed tuning, isolated platform capabilities, and copy outside rules.

Premature now: generic plugin systems, networking transports, rooms/roles, distributed state, WebRTC/audio engines, repositories/storage services with no persistence, generic mission builders, random puzzle generators, event sourcing, a global event bus, account models, generalized rewards, or speculative multi-device synchronization.

## 4. Cross-phase quality gates

Every phase must satisfy all of the following before review:

- strict TypeScript type checking passes;
- linting passes with no newly ignored errors;
- relevant unit/component/end-to-end tests pass deterministically;
- production build succeeds;
- new behavior has a documented focused manual test;
- semantic markup, keyboard/touch use, contrast, announcements, and reduced motion are considered as applicable;
- no unrelated refactor or speculative scaffolding is included;
- decisions and non-obvious constraints are documented in code or repository docs without relying on chat history.

## 5. Phased implementation plan

The implementation now has **15 approval gates**. Lettered phases are full stop points, not parallel work or informal substeps. Each must independently meet the cross-phase gates and use the objective, files, decisions, tests, manual checks, risks, non-goals, review points, and commit boundaries in its detailed parent section only to the extent assigned below. If a parent section mentions work assigned to its later lettered gate, that work is context, not authorization.

| Gate | Reviewable scope | Explicit boundary |
|---|---|---|
| 1 | Repository foundation and branded gray box | Tooling only; no product architecture |
| 2 | Packet parser, telemetry contract, single diagnostics entry, simulation | No browser chooser |
| 3 | Real Bluetooth adapter | No game-state integration; hardware test required before Bluetooth slice acceptance |
| 4A | Lifecycle reducer, domain-state ownership, transition table, invariants | No platform adapters or screen shells |
| 4B | Clock/scheduler, visibility and Wake Lock adapters; semantic screen shells | No feature rules |
| 5A | Signal-quality classifier and warm-up/countdown pure rules | No telemetry/UI integration |
| 5B | Pre-mission and warm-up UI/integration | Consumes 5A rules without duplicating them |
| 6 | Pure authored puzzle and isolated accessible interaction | No mission pressure |
| 7A | Active-mission timeline, stability, ordered outcome transitions | No statistics/result schema/rating |
| 7B | Metric aggregation and minimal result finalization | No result presentation/rating policy |
| 8A | Active mission screen and puzzle integration using simulation | Manual pause only; no browser interruption adapters |
| 8B | Hidden/disconnect/stale multi-reason suspension, reconnect, Wake Lock | No visual-effects polish |
| 9 | Result presentation, simple required rating, and replay | No persistence/history |
| 10A | Complete E2E, accessibility, race, signal-quality, and real-hardware release gates | No final visual restyle or host configuration |
| 10B | Restrained visual polish and one selected static-host readiness check | No deployment without authorization |

For the detailed sections below, `Phase 4`, `5`, `7`, `8`, and `10` are respectively executed as their A and B gates above. The following mandatory allocation prevents their task lists from being treated as one diff:

- **4A:** state/event types, reducer, transition table, interruption representation, canonical ownership tests. **4B:** platform interfaces/adapters, shells, focus movement, and diagnostics controls.
- **5A:** tuning validation, signal-quality policy, classifier transition/invalidation, warm-up/countdown functions and fake-time tests. **5B:** telemetry controller integration, target-range UX, unsupported-browser state, pre-mission/warm-up components and interaction tests.
- **7A:** mission configuration, ordered event advancement, stability/outcome rules and scenario tests. **7B:** classified duration/BPM/event/pause/disconnect/puzzle aggregates, minimum-data behavior, minimal result serialization and tests. Rating is excluded.
- **8A:** mission engine/controller integration, responsive domain components, puzzle/hint UI, simulated play and physical layout review. **8B:** reason-set suspension UI, visibility/disconnect/stale recovery, Wake Lock races, focus restoration and real-hardware interruption review.
- **10A:** full E2E matrix, TalkBack/zoom/font-size/forced-colors/orientation checks, browser-race tests, hardware acceptance record and limitations. **10B:** final tokens/effects, documentation, and production preview on one human-selected host.

### Phase 1 — Repository foundation and executable gray box

**Objective**

Establish the smallest maintainable React/Vite project and quality toolchain, with a branded but intentionally plain Thrumshift entry screen.

**User-visible outcome**

Opening the application shows “Thrumshift,” the tagline, and a short “Reactor Cooling Failure” placeholder in a responsive, high-contrast page. No gameplay or Bluetooth controls exist yet.

**Proposed modules or files**

`package.json`, lockfile, `index.html`, Vite/TypeScript/Vitest/Playwright/ESLint configuration, `src/main.tsx`, `src/app/App.tsx`, `src/styles/tokens.css`, `src/styles/global.css`, a smoke test, `e2e/smoke.spec.ts`, `README.md`, `.gitignore`, and static-host configuration only if needed.

**Important design decisions**

- Pin a supported Node version in repository metadata.
- Enable strict TypeScript settings, including unchecked-index awareness where compatible.
- Use a small semantic CSS-variable layer with Tailwind for safe-area/mobile layout, responsive spacing/type, visible-focus, and reduced-motion variants. Record these concrete benefits in review; do not add Tailwind plugins or generic component styling.
- Make mobile portrait the default layout; larger screens enhance rather than redefine it.
- Add no router: application state, not URLs, drives the four-screen MVP.
- Defer shadcn until an interaction actually needs a primitive.

**Tasks in implementation order**

1. Initialize Vite React TypeScript files and package scripts for dev, typecheck, lint, unit tests, E2E, and build.
2. Configure strict TypeScript, ESLint, Vitest/JSDOM, RTL setup, and Playwright projects/viewports.
3. Establish semantic tokens, global focus styles, reduced-motion baseline, and safe-area-aware viewport layout.
4. Add the minimal branded gray-box screen and metadata.
5. Add README setup/commands and static-host SPA fallback notes (even though no URL routing is used).
6. Add smoke tests and run all gates.

**Automated tests**

- Component smoke test verifies product name, tagline, and heading semantics.
- Playwright smoke test loads the production-like app at narrow phone and tablet viewport sizes with no horizontal overflow.
- A reduced-motion test verifies the media-query baseline disables nonessential transitions.

**Manual test checklist**

- Run locally in current Chrome and Android Chrome if available.
- Inspect 360×640 portrait, larger phone, tablet, and desktop widths.
- Zoom to 200%; verify readable content, visible focus, no clipping, and no horizontal scroll.
- Confirm metadata and visible copy consistently say Thrumshift.

**Definition of done**

Fresh install, typecheck, lint, unit test, E2E smoke test, and production build succeed; README is sufficient for another developer to reproduce them.

**Known risks**

Tool version incompatibility and over-configuring before product behavior exists.

**Explicit non-goals**

Bluetooth, telemetry, state machine, mission screens, final visual design, shadcn, deployment, or CI service setup.

**Expected review points**

Dependency list, scripts, strictness, test ergonomics, mobile baseline, naming, and whether the initial design tokens are suitably semantic.

**Logical commit boundaries**

1. `chore: establish strict React and test foundation`
2. `feat: add Thrumshift gray-box entry screen`

### Phase 2 — Heart-rate domain and simulated telemetry

**Objective**

Create the browser-independent telemetry contract, pure Heart Rate Measurement parser, and deterministic simulated source.

**User-visible outcome**

The single development-only diagnostics entry can display simulated connection status and BPM through the product composition root. The main product remains a gray box.

**Proposed modules or files**

`src/domain/heart-rate/types.ts`, `range.ts`, `src/telemetry/HeartRateTelemetrySource.ts`, `src/telemetry/bluetooth/parseHeartRateMeasurement.ts`, `src/telemetry/simulated/SimulatedHeartRateSource.ts`, fixtures/builders under `src/test`, and the one development-only diagnostics entry.

**Important design decisions**

- Parser accepts byte-oriented input (`DataView`) and returns validated plain data or a typed parse failure.
- Preserve optional RR intervals because the brief requires it; do not expose energy expenditure in the application contract.
- Source emits immutable app-level samples/status; no Web Bluetooth types escape.
- Simulator uses injected time and scripted/manual emissions; it does not depend on real timers in tests.

**Tasks in implementation order**

1. Define telemetry status/sample/error types and source interface.
2. Implement flags-aware 8-bit/16-bit BPM and RR parsing with bounds checks.
3. Implement deterministic simulated connect, emit, error, disconnect, and cleanup behavior.
4. Add the guarded single diagnostics entry for manual inspection, using the product composition root.
5. Document how automated tests select simulation and run gates.

**Automated tests**

- Parser: 8-bit BPM, 16-bit BPM, one/multiple RR intervals, absent RR, truncated flags/value, truncated RR pair, malformed packet, correct unit conversion/retention.
- Simulator: status order, samples, disconnect/reconnect, listener cleanup, deterministic scripted data.
- Contract-level tests reusable by real and simulated sources where meaningful.

**Manual test checklist**

- Use dev harness to connect, vary BPM, emit RR values, disconnect, and reconnect.
- Verify diagnostics are absent/inaccessible in a production build.
- Verify large BPM text remains readable at phone distance.

**Definition of done**

All parser and simulator branches are covered meaningfully, no browser Bluetooth object appears outside the Bluetooth folder, and all cross-phase gates pass.

**Known risks**

Misreading Bluetooth flag offsets; simulator behavior drifting from the real source contract.

**Explicit non-goals**

Calling the device chooser, smoothing/classification, warm-up, stability, or production telemetry UI.

**Expected review points**

Contract size, parse failure behavior, RR representation, source cleanup, and production exclusion of controls.

**Logical commit boundaries**

1. `feat: define heart-rate telemetry contract and packet parser`
2. `test: add deterministic simulated telemetry source`

### Phase 3 — Web Bluetooth connection boundary

**Objective**

Implement and manually validate the real Bluetooth adapter and explicit connection lifecycle without coupling it to game logic.

**User-visible outcome**

A simple connection harness reports unsupported, unconnected, connecting, connected with current BPM, disconnected, and recoverable error states. A button initiates the browser chooser.

**Proposed modules or files**

`src/telemetry/bluetooth/WebBluetoothHeartRateSource.ts`, `bluetoothCapabilities.ts`, boundary ports/types for testability, adapter tests, and updates to the harness.

**Important design decisions**

- Chooser calls occur only from a direct user gesture.
- Request the standard Heart Rate Service and subscribe to Heart Rate Measurement notifications.
- Wrap the narrow browser boundary rather than globally mocking Bluetooth.
- Make connect/disconnect idempotence and listener cleanup explicit.
- Treat unexpected disconnect as recoverable source status; browser APIs generally require choosing/reconnecting again.
- Feature-detect secure-context and `navigator.bluetooth` support.

**Tasks in implementation order**

1. Define a minimal injectable browser Bluetooth port needed by the adapter.
2. Implement capability detection and typed user-facing error categories.
3. Implement chooser, GATT/service/characteristic connection, notification parsing, and status publication.
4. Implement serialized connect/disconnect, generation tokens, deliberate/unexpected disconnect cleanup, stale-callback rejection, and retry.
5. Add harness UI for real/simulated selection in development and document hardware steps.
6. Test with mocks, then perform the separate hardware checkpoint.

**Automated tests**

- Correct Heart Rate Service filter and characteristic lookup.
- Connection/status order and sample delivery for 8-/16-bit notifications.
- Chooser cancellation, permission denial, missing service/characteristic, GATT failure, malformed notification, unexpected disconnect, retry, and cleanup.
- Overlapping connects, cancellation/unmount before resolution, notification after disconnect, notification flood coalescing/backpressure, and stale retry-generation callbacks.
- Unsupported browser and insecure-context capability behavior.

**Manual test checklist**

- On Android Chrome over HTTPS or localhost, connect the actual strap through the chooser.
- Observe BPM changes and an intentional strap/browser disconnect.
- Reconnect and verify no duplicate notifications.
- Record whether the specific Moofit model emits RR intervals; do not infer support from the standard.
- Verify unsupported behavior in a browser without Web Bluetooth.

**Definition of done**

Mocked boundary tests pass, adapter resources clean up correctly, and capability/error states are understandable. Software work may be reviewed without equipment, but the Bluetooth slice cannot be accepted as complete for MVP release until the real-hardware record in Phase 10A passes.

**Known risks**

Web Bluetooth browser/OS variability, device-specific GATT behavior, secure-context requirements, and chooser automation limitations.

**Explicit non-goals**

Warm-up, mission behavior, automatic background reconnect, device persistence, or claiming RR compatibility.

**Expected review points**

Permissions/filters, object containment, error taxonomy, cleanup, retry semantics, and hardware observations.

**Logical commit boundaries**

1. `feat: add Web Bluetooth heart-rate adapter`
2. `test: cover Bluetooth lifecycle at browser boundary`

### Phase 4 — Explicit application flow shell and platform adapters

**Objective**

Define legal application transitions and render all four gray-box screens with pause/disconnect/result variants, using fake data only.

**User-visible outcome**

Reviewers can navigate a development scenario through pre-mission, warm-up, countdown, mission, pause/disconnect, and success/failure result shells.

**Proposed modules or files**

`src/app/AppState.ts`, `appReducer.ts`, `App.tsx`, `AppEffects.tsx` or focused hooks, `src/platform/Clock.ts`, `PageVisibility.ts`, `WakeLock.ts`, and feature screen shells.

**Important design decisions**

- Discriminated union plus pure reducer; no external state library.
- Separate base phase from interruption state only if that representation cannot create invalid combinations; otherwise use explicit variants carrying resumable state.
- Platform adapters translate visibility/wake/clock behavior into events.
- Hidden page automatically pauses active play. Wake Lock is best-effort and never a mission prerequisite.
- Screen copy is feature-level data, not reducer logic.

**Tasks in implementation order**

1. Enumerate states, events, invariants, and a transition table in code/docs.
2. Implement pure reducer and illegal/no-op transition policy.
3. Add fake-clock, visibility, and Wake Lock interfaces/adapters.
4. Build semantic gray-box shells for all primary and interruption states.
5. Add development controls to exercise transitions, excluded from production.
6. Add transition, component, and platform-adapter tests.

**Automated tests**

- Every allowed transition plus rejected/stale events.
- Pause/resume, hidden-page pause, disconnect from warm-up/countdown/mission, reconnect destination, success, and failure.
- Wake Lock request/release/reacquire behavior and graceful unsupported/failure cases.
- Screen heading/landmark/accessibility-name smoke tests.

**Manual test checklist**

- Exercise every state and back/retry/run-again path through dev controls.
- Background and restore the tab; verify active shell pauses.
- Verify focus lands on the new screen/state heading or appropriate control.
- Verify unsupported Wake Lock causes no blocked action.

**Definition of done**

Impossible state combinations are unrepresentable or guarded, all transition tests pass, every shell is accessible by keyboard, and platform failures degrade safely.

**Known risks**

Overloading one reducer with telemetry details; losing resumable mission data; focus movement across state replacement.

**Explicit non-goals**

Real feature behavior, puzzle, stability, metrics, final styling, or URL routing.

**Expected review points**

Transition table, state payloads, effect ownership, interruption semantics, focus strategy, and whether a library remains unnecessary.

**Logical commit boundaries**

1. `feat: model explicit Thrumshift application states`
2. `feat: add gray-box flow and platform capability adapters`

### Phase 5 — Pre-mission, target range, and warm-up

**Objective**

Integrate telemetry into a complete pre-mission and deterministic warm-up flow, including stable range classification.

**User-visible outcome**

The Operator can connect or simulate a monitor, configure a target range, read safety guidance, start warm-up, see large BPM/status/progress, and qualify only after consecutive operational seconds.

**Proposed modules or files**

`src/config/mvpTuning.ts`, `src/domain/heart-rate/classifyRange.ts`, `stabilizeRange.ts`, `src/domain/mission/warmup.ts`, pre-mission/warm-up feature components, `BioLinkStatus`, `OperationalRangeGauge`, `WarmupProgress`, and target-range controls.

**Important design decisions**

- Target range is user-configurable within clearly documented product limits; copy states that Thrumshift does not provide a medical target.
- Validate lower < upper and reasonable input bounds at the UI/config boundary.
- Latest valid BPM is displayed; stable classified state drives qualification.
- Consecutive warm-up time resets on stable exit, stale signal, disconnect, or hidden page; countdown is cancelable if range is lost.
- Use native labeled controls unless testing demonstrates a strong reason for a selected primitive.

**Tasks in implementation order**

1. Add typed/validated MVP tuning and target-range model.
2. Implement pure raw classification, rolling filter/hysteresis/dwell policy, staleness, and warm-up accumulator.
3. Connect telemetry source status/samples to app events through the existing application controller.
4. Build pre-mission content, connection actions, target controls, guidance, and unsupported state.
5. Build warm-up telemetry, non-color status, progress, countdown, and disconnect recovery.
6. Test with fake time and simulated telemetry; tune only from documented manual findings.

**Automated tests**

- Range boundary values and invalid ranges.
- Single spikes, sustained crossings, hysteresis, dwell, sparse samples, stale signal, and recovery.
- Zero/implausible BPM, alternating valid/invalid readings, connected-but-unusable status, minimum-valid-data threshold, and classifier invalidation/re-establishment.
- Consecutive-time qualification, resets, tick sizes, pause/hidden/disconnect behavior, and no stale countdown completion.
- Components: labels, errors, live announcements without excessive chatter, touch/keyboard controls, unsupported browser.
- Integration: simulated connect → operational dwell → countdown → mission shell.

**Manual test checklist**

- Configure valid/invalid ranges using touch and keyboard.
- Walk/march safely with a mounted phone; assess readability from distance.
- Simulate below, approaching, operational, and above states plus noisy crossings.
- Disconnect during warm-up and countdown; verify progress resets and recovery is clear.
- Test unsupported browser and Bluetooth denial.

**Definition of done**

Both simulated and real-source paths use the same app contract; warm-up timing is deterministic; unsafe/medical recommendation language is absent; and all gates pass.

**Known risks**

Filter latency feeling unresponsive, live-region noise, device sample cadence differences, and target controls being cumbersome during physical activity.

**Explicit non-goals**

Mission stability, puzzle, result metrics, storage, medical target recommendations, or polished cinematic visuals.

**Expected review points**

Exact tuning constants, distinction between displayed/stable BPM state, validation language, reset behavior, and distance readability.

**Logical commit boundaries**

1. `feat: add stable heart-rate classification and warm-up rules`
2. `feat: complete pre-mission and warm-up flow`

### Phase 6 — Pure coolant puzzle and accessible interaction

**Objective**

Implement the authored easy puzzle as a pure tested model, then expose it in an isolated accessible puzzle workbench.

**User-visible outcome**

The Operator can tap large 3×3 tiles to rotate pipes, see connection feedback, request a hint after simulated eligibility, and complete the route using touch or keyboard.

**Proposed modules or files**

`src/domain/puzzle/types.ts`, `rotateTile.ts`, `connectivity.ts`, `boards/reactorCoolingEasy.ts`, `hint.ts`, plus `CoolantPuzzle`, `CoolantTile`, and puzzle visual assets/tests.

**Important design decisions**

- Board is hand-authored and versioned, with source/reactor endpoints and a verified solution.
- Tile openings use cardinal-direction data; orientation transformations and graph traversal are pure.
- A move is a discrete rotation; no dragging or precision gesture.
- SVG pipe visuals have decorative paths hidden from assistive tech while buttons receive concise meaningful names/state.
- Hint selection is deterministic and points to one useful incorrect tile without solving the puzzle automatically.

**Tasks in implementation order**

1. Define minimal board/tile/endpoint model and invariants.
2. Implement rotation, adjacent reciprocal connections, source reachability, and completion.
3. Author and validate one easy starting board and expected solution/move envelope.
4. Implement deterministic hint choice.
5. Build isolated accessible 3×3 UI with thick graphics and reduced motion.
6. Test touch/keyboard interaction, completion announcement, sizing, and contrast.

**Automated tests**

- All tile rotations and four-step identity.
- Edge bounds, reciprocal connection rules, loops/dead ends, source-to-reactor connectivity, and false-positive prevention.
- Authored starting board is incomplete, solvable, and has only the intended incorrect orientations.
- Hint is valid/deterministic and completed board yields no hint.
- Component buttons have accessible names, respond to click/Enter/Space, preserve logical focus, and honor reduced motion.

**Manual test checklist**

- Solve at 360px portrait while standing at intended viewing distance.
- Use one hand, keyboard only, 200% zoom, high-contrast settings if available, and reduced motion.
- Confirm shape/labels—not color alone—communicate source, reactor, and flow.
- With a screen reader, verify concise instructions plus each tile's row/column, orientation/open sides, source-connected state, and completion form a usable nonvisual mental model; BPM-style changing values are not announced continuously.
- Verify increased mobile font size, forced colors/high contrast, and portrait/landscape changes preserve puzzle state and operability.
- Confirm no accidental browser zoom/scroll behavior makes taps unreliable.

**Definition of done**

The board is demonstrably solvable, algorithms are UI-independent, all tiles meet target sizing, completion works by touch and keyboard, and all gates pass.

**Known risks**

Accessible naming becoming verbose, SVG contrast, visual connection ambiguity, and the puzzle being trivial or confusing rather than easy.

**Explicit non-goals**

Random boards, multiple difficulties, drag interactions, mission stability, aggressive timers, or procedural hints.

**Expected review points**

Board representation, authored layout/difficulty, tile size, accessible names, hint usefulness, and distance legibility.

**Logical commit boundaries**

1. `feat: add pure coolant-routing puzzle model`
2. `feat: add accessible coolant puzzle workbench`

### Phase 7 — Active mission engine and result aggregation

**Objective**

Combine stable heart-rate state, puzzle events, and deterministic time into pure active-mission rules, including stability and complete metric aggregation.

**User-visible outcome**

In a development mission harness, simulated BPM changes affect stability; puzzle completion succeeds; zero stability fails; pause/disconnect freezes the run; a raw result summary is produced.

**Proposed modules or files**

`src/domain/mission/MissionState.ts`, `advanceMission.ts`, `stability.ts`, `telemetryAggregate.ts`, `events.ts`, `MissionResult.ts`, and fake-clock scenario tests. Rating code is not added until Phase 9, and only if a separate module is warranted.

**Important design decisions**

- One pure `advanceMission(state, input, deltaMs)` path owns duration and stability updates.
- Configure below/above drain and in-range preserve/recovery rates; clamp stability to `[0, 100]`.
- Use the canonical timestamp/sequence ordering contract and fully process elapsed intervals. Puzzle completion succeeds only if its ordered fact is applied before the transition reaches failure; equal timestamps use sequence order. Tests lock this policy.
- Pause, hidden, disconnect, and stale telemetry contribute no active classification or stability delta.
- Metrics use time-weighted intervals, not a simple mean of unevenly sampled BPM values where avoidable.
- Rating is excluded from Phase 7A/7B and decided in Phase 9 from displayed metrics; it is not a progression system.

**Tasks in implementation order**

1. Define mission configuration, state invariants, and versioned result schema.
2. Implement stability integration/clamping and outcome precedence.
3. Implement classified-duration, BPM, low/redline event, pause, disconnect, puzzle, and hint aggregation.
4. Implement success/failure finalization without rating policy.
5. Wire the development harness to simulator, fake clock controls, and Phase 6 puzzle.
6. Add deterministic long-scenario and boundary tests.

**Automated tests**

- Stability drain/recovery/preserve, fractional deltas, clamps, zero crossing, large-delta bound, and configuration validation.
- Low-output/overload event entry/exit, initial dwell, noisy crossings, pause/disconnect resume, and no duplicate counts.
- Percentages/durations, unclassified time, average/peak BPM, empty/one-sample cases, hint/move counts.
- Success, failure, tie ordering, pause, disconnect, hidden state, and final result serialization.
- Same scripted inputs produce byte-for-byte identical results.

**Manual test checklist**

- Run scripted below/in/above scenarios and compare visible raw metrics to expected values.
- Pause for a noticeable period; verify time and stability freeze.
- Disconnect and reconnect; verify puzzle/state retained and explicit resume required.
- Trigger success and failure near the same moment to inspect precedence.

**Definition of done**

All mission outcomes and result fields derive from pure deterministic functions, configuration is centralized, and no React/browser dependency exists in mission domain code.

**Known risks**

Timer drift at orchestration boundary, ambiguous outcome ordering, biased averages from sparse telemetry, and stability tuning not feeling fun.

**Explicit non-goals**

Final mission screen, persistence, progression, telemetry graphs, audio engine, or multiplayer-ready distributed rules.

**Expected review points**

Exact rates, delta handling, event definitions, result schema, denominator policy, rating transparency, and success/failure precedence.

**Logical commit boundaries**

1. `feat: add deterministic active mission rules`
2. `feat: aggregate minimal serializable mission results`

### Phase 8 — Integrated active mission UI and interruption safety

**Objective**

Build the complete active gameplay screen around the mission engine and puzzle, then validate physical-use accessibility.

**User-visible outcome**

The Operator sees Reactor Cooling Failure, large BPM/bio-link state, operational range, station stability, instructions, puzzle, hint, and pause controls. Telemetry changes affect stability; pause, hidden page, stale signal, and disconnect are safe and clear.

**Proposed modules or files**

Active-mission screen integrated by the existing application controller, `MissionShell`, `MissionHeader`, `BioLinkStatus`, `HeartbeatIndicator`, `OperationalRangeGauge`, `StationStabilityMeter`, integrated puzzle, pause/disconnect dialog primitive if justified, and focused styles/tests.

**Important design decisions**

- The existing application controller connects clock and telemetry facts to the reducer and domain transitions; presentation components remain props/events only. No feature-level controller or second state authority is introduced.
- Critical values are persistent and not toast-only. Color always has text/icon/shape reinforcement.
- No visual shaking. Heartbeat-responsive effects are subtle, non-layout-moving, and disabled/reduced under reduced motion.
- Pause is a large persistent control. Disconnect and stale signal auto-pause.
- Start with native dialog semantics. Add one Base UI-backed primitive only if tests demonstrate a concrete gap; then test focus trap, initial focus, Escape policy, and focus restoration. A reconnect chooser button remains a direct gesture.

**Tasks in implementation order**

1. Integrate mission engine into application transitions with simulated telemetry.
2. Build responsive active layout and domain components with functional tokens.
3. Add pause flow, automatic hidden/disconnect/stale pause, reconnect/end-run decisions, and Wake Lock lifecycle.
4. Add hint eligibility using active elapsed time.
5. Add restrained feedback and reduced-motion behavior.
6. Run component/integration tests and physical-use manual review; adjust layout before visual polish.

**Automated tests**

- Simulated telemetry updates BPM/classification/stability without duplicating rule calculations in UI.
- Puzzle moves, hint timing, success/failure dispatch, pause/resume, disconnect/reconnect, stale signal, visibility, and Wake Lock.
- Dialog keyboard/focus tests if used; critical controls and values have accessible names/status.
- Narrow portrait and tablet component/E2E screenshots or assertions for no overlap/overflow.
- Reduced-motion path removes rotation/pulse motion while preserving state feedback.

**Manual test checklist**

- Complete a mission while walking/marching safely with phone mounted.
- Verify tap accuracy, distance readability, minimal reading, and no layout movement.
- Pause manually; background/restore; disconnect/reconnect real hardware.
- Test TalkBack on the primary Android device and keyboard-only desktop play. BPM changes are never announced per sample; only throttled meaningful state changes are live.
- Test increased Android font size, 200% browser zoom, forced colors/high contrast, and portrait/landscape changes without state loss.
- Verify nonvisual puzzle instructions expose tile position, orientation/open sides, source connectivity, and completion without relying on the SVG.
- Verify focus placement/restoration for manual, hidden, stale-signal, and disconnect interruptions.
- Test dim/screen-lock behavior with Wake Lock supported and unsupported.

**Definition of done**

The full active mission is playable with simulation and real telemetry, interruptions cannot silently drain stability, physical-use review findings are addressed/documented, and all gates pass.

**Known risks**

Main-thread/background throttling, Wake Lock revocation, mobile viewport constraints, excessive announcements, and reconnection differences across devices.

**Explicit non-goals**

Final cinematic art pass, sound engine, graphs, additional missions/difficulties, or background execution while hidden.

**Expected review points**

Information hierarchy, component cohesion, orchestration ownership, interruption UX, chosen generic primitive, touch targets, and reduced-motion result.

**Logical commit boundaries**

1. `feat: integrate active mission gameplay`
2. `feat: add safe pause and disconnect recovery`
3. `fix: address physical-use accessibility findings`

### Phase 9 — Mission result and replay loop

**Objective**

Present explainable success/failure results and make Run Again reset every run-scoped subsystem correctly.

**User-visible outcome**

After success or failure, the Operator sees completion time, average/peak BPM, below/operational/above percentages, low-output/redline counts, remaining stability, rating, signal-gap disclosure where relevant, and Run Again.

**Proposed modules or files**

Mission-result feature, `MissionResultPanel`, formatting/presentation helpers colocated with the feature, replay reset transition, and result fixtures/tests.

**Important design decisions**

- The result object is domain data; rounding and labels are presentation-only.
- Clearly explain percentages and signal gaps without a detailed graph.
- “Completion time” on failure is labeled mission duration if completion wording would mislead.
- Run Again returns to pre-mission, retains target-range preference only in memory, and disconnects or deliberately retains the device based on a reviewed policy. Recommended: retain the live connection with explicit status, reset all run metrics/puzzle/classification, and require warm-up again.
- Rating criteria are visible and nonmedical.
- Rating is the smallest deterministic mapping that satisfies the explicit MVP requirement, uses only displayed metrics, and has no ranks, unlocks, stored progression, or hidden recomputation metadata. Its thresholds are a Phase 9 human review point.

**Tasks in implementation order**

1. Build result view-model formatting from the versioned result.
2. Implement semantic success/failure layout and concise rating explanation.
3. Implement complete replay reset and source lifecycle policy.
4. Add fixtures for success, failure, missing/sparse signal, and boundary values.
5. Test screen readers/zoom and replay leakage.

**Automated tests**

- Exact formatting/rounding for duration, BPM, percentages, events, and stability.
- Insufficient-data results suppress average/percentage claims and visibly explain unusable signal time.
- Success/failure headings and conditional copy.
- Percentages remain coherent with signal gaps and rounding.
- Run Again resets timers, aggregate, puzzle, outcome, hint, pause/disconnect counts, and warm-up while applying the approved connection/range retention policy.
- Serializable result contains no browser objects or non-finite values.

**Manual test checklist**

- Reach both result variants with simulation.
- Verify all numbers against known scripted runs.
- Use Run Again twice and confirm no prior metrics or puzzle orientation leaks.
- Inspect at phone distance, 200% zoom, and with a screen reader.

**Definition of done**

Every required metric is correct and understandable, both outcomes work, replay is clean, result data is serializable, and no persistence is introduced.

**Known risks**

Rounding totals to 99/101%, misleading sparse-signal averages, rating feeling arbitrary, and incomplete reset bugs.

**Explicit non-goals**

History, IndexedDB, accounts, comparisons, achievements, sharing, graphs, or cloud sync.

**Expected review points**

Metric language, rating formula, rounding, signal-gap disclosure, replay connection policy, and result schema stability.

**Logical commit boundaries**

1. `feat: add success and failure result presentation`
2. `feat: complete clean replay loop`

### Phase 10 — End-to-end hardening, visual identity, hardware matrix, and deployment readiness

**Objective**

Harden the complete MVP, apply a restrained Thrumshift console identity after gray-box validation, verify target environments, and prepare static deployment without adding product scope.

**User-visible outcome**

Thrumshift presents a cohesive, high-contrast spacecraft-console experience across supported viewports, with reliable simulated E2E flows and documented real-hardware/browser limitations.

**Proposed modules or files**

Playwright scenario fixtures/page objects kept small, final token/style refinements, accessibility/deployment documentation, static-host configuration, environment template, icons/manifest only if approved, and CI configuration if a provider is chosen.

**Important design decisions**

- Simulation drives automated E2E; chooser and strap compatibility remain manual checkpoints.
- Test behavior primarily; use a few stable visual snapshots only for high-value layouts.
- Cyan is operational, amber caution, red critical; all reinforced non-visually. Avoid excessive glow, tiny HUD copy, generic cards/badges, and motion noise.
- Deployment base URL/assets derive from Vite configuration; no hardcoded hostname.
- No analytics or error-reporting service without separate privacy/product approval.

**Tasks in implementation order**

1. Add deterministic E2E scenarios for the full supported state matrix.
2. Run narrow portrait, larger phone/tablet, desktop Chromium, reduced-motion, zoom, keyboard, and basic screen-reader/accessibility audits.
3. Execute the Android Chrome hardware gate and record OS, Chrome version, phone model, strap model/firmware, secure-origin setup, notification cadence, RR observations, Bluetooth-off behavior, permission revocation, screen lock/background behavior, and reconnect results.
4. Apply final restrained visual tokens and component polish based on tested hierarchy.
5. After human selection, configure and validate one production static build/preview target (Netlify or Cloudflare Pages) without deploying unless separately authorized.
6. Update README with support matrix, permissions, safety language, manual regression checklist, and release limitations.

**Automated tests**

- Full simulation E2E: connect, warm-up, countdown, solve/success, drain/failure, manual pause, hidden-page pause, disconnect/reconnect, stale telemetry, hint, run again.
- Unsupported-browser and chooser-error flows.
- Narrow phone portrait and larger phone/tablet Chromium projects.
- Reduced-motion assertions and keyboard-only puzzle/dialog flow.
- Automated accessibility scan where useful, supplemented by semantic assertions and manual review.
- Production build served from a static preview with direct-load asset checks.

**Manual test checklist**

- Android Chrome on the primary available device using the actual monitor; this is a release gate, not optional risk documentation. Add a second viewport/device when available but do not claim it was tested if it was not.
- Complete success/failure, pause, background, screen rotation, disconnect/reconnect, and Run Again.
- Check bright/dim environments, arm's-length/mounted readability, touch accuracy, reduced motion, 200% zoom, and basic TalkBack/desktop screen reader.
- Validate install/serve instructions for each chosen static host; confirm no hostname assumptions.
- Review all safety, permission, error, and unsupported-browser copy.

**Definition of done**

All quality gates and E2E scenarios pass; the real-strap Android hardware record passes or the MVP is explicitly not release-ready; unsupported cases are documented; production build works on the one selected static-host preview; critical accessibility findings are resolved or explicitly accepted; no backend or persistence exists.

**Known risks**

Real-device Web Bluetooth variability, mobile background/Wake Lock behavior, and visual polish reducing contrast or performance.

**Explicit non-goals**

Backend, actual deployment without authorization, Safari/iOS support promises, progression, co-op/WebRTC, accounts, telemetry history, generalized audio, additional content, or analytics.

**Expected review points**

E2E coverage, support matrix, remaining accessibility findings, visual restraint/originality, bundle/dependency size, host portability, and release limitations.

**Logical commit boundaries**

1. `test: cover complete Thrumshift MVP journeys`
2. `style: apply tested spacecraft-console identity`
3. `chore: document hardware and static deployment readiness`

## 6. Phase sequencing rationale

The plan now has fifteen approval gates by splitting five oversized phases at architectural seams. Parsing and simulation precede the real adapter. Lifecycle ownership is reviewed before platform adapters and shells. Classification/warm-up rules precede their UI integration. The puzzle remains independently reviewable. Active mission transitions precede aggregation; screen integration precedes interruption/platform behavior. Release correctness and hardware acceptance precede final visual styling and one-host readiness.

Every phase yields either a runnable product increment or an isolated, user-inspectable workbench for the new capability. Temporary development harnesses must be guarded and removed or consolidated once their capability is integrated; they are not parallel production architectures.

## 7. Highest technical risks

1. **Web Bluetooth and actual strap behavior:** Android/browser/device variation, secure-context/gesture restrictions, disconnect recovery, notification cadence, and unknown RR support cannot be proven by automated tests.
2. **Time and noisy-signal correctness:** background throttling, uneven sample cadence, boundary noise, stale readings, and pause/disconnect intervals can corrupt stability and statistics unless the monotonic delta model and classification policy are rigorously tested.
3. **Physical-use accessibility:** a UI that passes desktop tests can still be unreadable or mistappable while the Operator is moving; real mounted-device testing must drive layout and feedback decisions before final styling.

## 8. Decisions deliberately deferred

1. **Persistence, profiles, and progression:** IndexedDB, history, accounts, achievements, and cloud storage wait for an approved user need; only the serializable result schema is built now.
2. **Co-op/network/audio architecture:** rooms, roles, signaling, WebRTC, push-to-talk, distributed state, and a generalized heartbeat/foley engine wait until those features are scoped.
3. **Production identity details:** final hostname, hosting provider, analytics/observability vendor, detailed visual assets, and trademark/domain decisions remain configuration or product decisions, not application assumptions.

## 9. Questions that block implementation

There are no questions that block Phase 1. Defaults can be reviewed phase by phase. Before the relevant later phases are approved, the following decisions should be confirmed through review rather than guessed:

- Phase 3 hardware checkpoint: which exact heart-rate strap/model and Android devices are available for testing.
- Phase 5 tuning checkpoint: initial target range defaults, qualification duration, smoothing/dwell/hysteresis constants, framed as gameplay configuration rather than medical guidance.
- Phase 7A tuning checkpoint: starting stability, below/above drain rates, and in-range preservation versus recovery. Phase 9 separately reviews the simple rating thresholds.
- Phase 9 replay checkpoint: retain the active Bluetooth connection between runs (recommended) or require reconnecting.
- Phase 10B release checkpoint: choose Netlify or Cloudflare Pages for the single validated configuration, and decide whether CI/deployment itself is authorized.

Until each checkpoint, tests should use named proposed constants, not bury assumptions in components.

## 10. Final implementation handoff checklist

At the end of each future phase, the implementation report must include:

- approved phase and user-visible outcome;
- concise change summary and key decisions;
- complete files-changed list;
- commands run with pass/fail results;
- focused manual test steps for the reviewer;
- accessibility considerations and findings;
- known limitations, risks, or follow-ups;
- proposed commit boundaries (or actual commits only if authorized);
- an explicit statement that work has stopped pending approval for the next phase.

## 11. Architecture review disposition record

This section records the July 2026 independent review so rejected recommendations are not silently reintroduced during implementation.

| # | Concern | Disposition | Smallest plan correction | Sections/gates changed |
|---|---|---|---|---|
| 1 | App reducer, mission functions, and orchestrators could all become mission-state authorities. | **Agree.** | Reducer owns lifecycle/navigation; one canonical `WarmupState`/`MissionState` is produced by pure domain transitions; one controller serializes facts and holds no competing store. | State management, boundaries, 4A/4B, 7A |
| 2 | Bounded tick deltas could discard time and misorder simultaneous outcomes. | **Agree.** | Monotonic occurrence time plus sequence order; wakeups are not time truth; all elapsed time is processed or explicitly suspended, never truncated. | Timing contract, invariants, 7A |
| 3 | Timer ownership and active-time semantics were fragmented. | **Agree.** | One timing contract now governs gameplay, wall-clock metadata, active/suspended time, staleness, warm-up, countdown, hint, stability, and metrics. | Timing contract, 4B, 5A, 7A/7B |
| 4 | Pause, hidden, disconnect, and stale states could contradict one another. | **Agree.** | One `suspended` lifecycle shape with a nonempty reason set and explicit resume rules. | State management, invariants, 4A, 8B |
| 5 | Classifier history and invalidation ownership were unclear. | **Agree.** | Pure stateful classifier with `sample`, `timeAdvanced`, and `invalidate`; mission consumes only classified intervals/signal facts. | Heart-rate policy, 5A/5B |
| 6 | Mission transition, aggregation, serialization, and rating made Phase 7 too broad. | **Agree.** | Split 7A transitions/stability from 7B aggregation/finalization; move rating policy to Phase 9. | Phase map, 7A/7B, 9 |
| 7 | Phases 4, 5, 8, and 10 were too large for focused approval. | **Agree.** | Split each at a behavior/ownership boundary, yielding 15 approval gates. | Phase map and sequencing rationale |
| 8 | RR and energy fields were speculative. | **Partially agree.** | Remove energy from the application contract. Retain optional RR because the original brief explicitly requires preserving it; do not let RR affect MVP rules/UI. | Telemetry contract, Phase 2 |
| 9 | Result versioning/IDs/recomputation fields and rating anticipated progression. | **Partially agree.** | Keep only displayed fields and one schema discriminator; remove IDs, timestamps, mission/puzzle/rules versions, and recomputation metadata. Retain a simple rating because it is an explicit MVP result requirement, decided in Phase 9. | Result model, 7B, 9 |
| 10 | Tailwind, shadcn/Base UI, and two hosting targets broadened the baseline. | **Partially agree.** | Retain Tailwind because it is the requested default and has named responsive/accessibility uses; add no plugins/theme. Defer shadcn until a native gap is proven. Validate only one human-selected host. | Technology/UI strategy, 1, 8B, 10B |
| 11 | Repeated harnesses could become a parallel app. | **Agree.** | One development diagnostics entry using the product composition root; production asserts it is absent. | Diagnostics discipline, 2–4B |
| 12 | Async browser races were under-specified. | **Agree.** | Generation tokens, serialized operations, stale-callback rejection, idempotent teardown, backpressure, and focused race tests. | Adapter discipline, 3, 4B, 8B, 10A |
| 13 | Hardware acceptance was optional despite Android Bluetooth being primary. | **Agree.** | Real strap/Android test record is a release gate with required environment and lifecycle observations. | 3 definition of done, 10A |
| 14 | Accessibility checks lacked operational acceptance criteria. | **Agree.** | Add TalkBack, text scaling, forced colors, orientation/state retention, announcement throttling, nonvisual puzzle model, and interruption focus checks. | 6, 8A/8B, 10A |
| 15 | Connected transport could be confused with usable sensor data. | **Agree.** | Separate transport and signal quality; define invalid/implausible/minimum-data behavior, suspension, and insufficient-result suppression. | Telemetry/classifier policy, 5A/5B, 7B, 9 |

The review's “blocking” labels were not treated as authority. Findings 1–5 are accepted because they expose real competing-authority or deterministic-correctness gaps. RR removal is rejected because it conflicts with an explicit requirement. Full rating removal is rejected for the same reason. Tailwind removal is rejected because the requested stack is reasonable for this mobile responsive UI; its use is constrained and must justify itself in the Phase 1 diff.
