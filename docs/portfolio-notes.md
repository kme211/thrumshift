# Thrumshift Portfolio Notes

## Project summary

- **Core concept:** Thrumshift is a movement-driven reactor-repair game. The Operator keeps their heart rate within a chosen gameplay range while restoring a station's cooling controls.
- **Player experience:** The planned flow is briefing, monitor connection, warm-up, mission, and result. **Implemented:** target-range setup, real or simulated telemetry connection, warm-up qualification, countdown, and interruption recovery. **Deferred:** active mission rules, coolant puzzle integration, results, progression, co-op, and persistence.
- **Primary technology:** A static client-side React application using strict TypeScript and Vite, with Web Bluetooth for standard Heart Rate Service telemetry. Pure domain transitions are tested with Vitest; component and production-flow checks use Testing Library and Playwright.
- **Current implemented scope:** The repository has the approved pre-mission and warm-up slice. It includes signal filtering and classification, deterministic timing, lifecycle suspension, visibility handling, best-effort Screen Wake Lock, development diagnostics, and real/simulated telemetry paths. It has no backend, routing, or stored run history.

## Why this project is technically interesting

- **Implemented and hardware-checked:** A narrow Web Bluetooth adapter discovers devices advertising the standard Heart Rate Service, parses Heart Rate Measurement notifications, and maps browser/GATT behavior into application-level status and samples. The repository records successful desktop and Android Chrome hardware checks.
- **Implemented:** Browser capabilities, telemetry transport, application lifecycle coordination, and pure heart-rate/warm-up rules are separate boundaries. UI components render canonical domain values rather than recalculating classification or qualification.
- **Implemented and tested:** External facts use monotonic occurrence times and increasing sequence numbers. The controller orders equal-time facts explicitly, rejects late or duplicate facts, and treats scheduler callbacks as wakeups rather than elapsed-time truth.
- **Implemented and tested:** A deterministic simulated telemetry source shares the application contract with Web Bluetooth. One development-only diagnostics surface can emit samples and failures and export bounded, schema-versioned diagnostic data; production builds exclude it.
- **Partly implemented:** Current screens use large critical BPM text, native buttons and labeled inputs, visible focus, non-color text labels, controlled announcements, and a global reduced-motion override. Mounted-device and moving-user checks remain planned.
- **Process:** The implementation plan divides work into independently reviewable, testable approval points. Commits through the pre-mission/warm-up flow preserve those boundaries.

## Key engineering decisions

### Web Bluetooth behind a narrow telemetry adapter

- **Problem or constraint:** Browser Bluetooth objects and chooser behavior are asynchronous, platform-specific, and unsuitable as domain inputs.
- **Decision:** Expose a small `HeartRateTelemetrySource` contract; keep GATT lifecycle, packet parsing, generation guards, and browser ports in `src/telemetry/bluetooth/`.
- **Why:** Real and simulated sources can enter the application through the same boundary, while domain tests remain browser-independent.
- **Tradeoff:** The adapter adds translation and lifecycle code, and reconnect still requires an explicit user gesture.
- **Evidence:** `src/telemetry/HeartRateTelemetrySource.ts`, `src/telemetry/bluetooth/`, reusable source-contract tests, commit `907fb74`.

### Pure reducer-driven lifecycle state

- **Problem or constraint:** Warm-up, countdown, suspension reasons, and future mission state must not drift across competing hooks or UI fields.
- **Decision:** Use a discriminated lifecycle state and pure reducer for navigation and lifecycle; keep canonical classifier and warm-up state produced by pure domain transitions.
- **Why:** Legal transitions, run identity, and overlapping suspension blockers are explicit and testable.
- **Tradeoff:** Coordination is more verbose than independent component state and requires a composition controller.
- **Evidence:** `src/app/AppState.ts`, `src/app/appReducer.ts`, `src/app/WarmupFlowController.ts`, commits `c937dda` and `193e006`.

### Monotonic clock and deterministic scheduling boundaries

- **Problem or constraint:** Wall-clock changes, timer batching, and equal-time events could make gameplay outcomes nondeterministic.
- **Decision:** Inject clock and scheduler adapters; stamp facts once and process them by `(occurrenceTime, sequence)`. Pure rules derive deadlines and never call browser timers or `Date.now()`.
- **Why:** Large and small scheduler wakeups produce the same domain state, and stale callbacks can be ignored safely.
- **Tradeoff:** Facts require ordering metadata and explicit advance-then-apply logic.
- **Evidence:** `src/platform/Clock.ts`, `src/platform/Scheduler.ts`, `src/app/WarmupFlowController.ts`, classifier and controller tests, commits `84d35bc` and `193e006`.

### Transport connection separated from signal usability

- **Problem or constraint:** A connected monitor may provide sparse, stale, malformed, or unstable readings.
- **Decision:** Model transport status separately from signal quality and stable gameplay classification. Connection alone cannot qualify warm-up or resume progress.
- **Why:** The UI and lifecycle can represent connected-but-unusable data without treating it as valid play.
- **Tradeoff:** Users see more states, and recovery requires fresh sample density plus classification dwell.
- **Evidence:** `src/domain/heart-rate/classifier.ts`, `src/features/WarmupScreen.tsx`, controller recovery tests, commit `193e006`.

### Pure stateful heart-rate classification

- **Problem or constraint:** Raw notifications can be noisy, sparse, or implausible, while gameplay needs stable range changes.
- **Decision:** Use a pure stateful classifier with plausibility validation, a rolling median, sample-density policy, hysteresis, dwell, staleness, and explicit invalidation.
- **Why:** Signal behavior is deterministic and testable from exact fact sequences without Bluetooth or React.
- **Tradeoff:** Stable gameplay status intentionally lags the latest displayed BPM, and tuning must be validated with real hardware.
- **Evidence:** `src/domain/heart-rate/classifier.ts`, `src/config/gameplayTuning.ts`, classifier tests, commits `4ef3ece` and `193e006`.

### One development diagnostics entry

- **Problem or constraint:** Hardware and lifecycle faults need inspection without creating parallel harness applications or alternate state ownership.
- **Decision:** Extend one development-only diagnostics surface attached to the product composition root; export schema-versioned environment, tuning, state, and bounded event records.
- **Why:** Diagnostics observe the real application path while production exclusion remains testable.
- **Tradeoff:** Development-only controls and log capture add conditional code that must be kept outside production bundles.
- **Evidence:** `src/app/DevelopmentDiagnostics.tsx`, `src/app/diagnosticExport.ts`, diagnostics tests, commits `192d4cb` and `193e006`.

### Deliberate scope deferral

- **Problem or constraint:** Persistence, progression, co-op, generalized audio, and premature abstractions would expand risk before the core physical interaction is validated.
- **Decision:** Keep current runs in memory and defer those systems; build the authored puzzle, active mission, result flow, and any heartbeat-reactive audio only in their approved work slices.
- **Why:** Each increment remains reviewable and the current architecture serves known consumers.
- **Tradeoff:** The present build is a partial playable flow rather than a complete game.
- **Evidence:** `PLAN.md` scope, extension-point guidance, and explicit non-goals; `README.md` current-scope statement.

## Debugging and problem-solving stories

### Real-hardware signal-density mismatch

- **Observed symptom:** Real monitor notifications at roughly 1,095 ms intervals could cause an established classification to lose usability even though the stream was regular and not stale.
- **What diagnostics revealed:** The development diagnostic export preserved monotonic sample timing and showed that the observed cadence did not always leave three samples continuously inside the original 3,000 ms density window.
- **Incorrect assumption:** One 3,000 ms horizon could serve filtering, minimum sample density, and staleness while requiring three continuously present samples.
- **Correction:** Separate a 3,000 ms rolling-median filtering horizon, a 4,000 ms valid-data density horizon requiring three samples, and a 3,000 ms time-since-last-valid-sample staleness threshold. Scheduler-only wakeups prune windows but do not recompute the median from a reduced sample set.
- **Regression tests added:** Tests lock the independent horizons; captured cadence gaps; retained classification between notifications; scheduler-only filter behavior; genuinely sparse non-stale streams; deterministic large versus small wakeups; and staleness exactly three seconds after the last valid sample.
- **Broader lesson:** Filtering, delivery density, and staleness answer different questions. Sharing a time constant can look simpler while encoding a false assumption about real-device cadence.
- **Evidence:** `README.md` signal-policy note; `src/config/gameplayTuning.ts`; `src/domain/heart-rate/classifier.test.ts`; commit `193e006`.

## Accessibility and physical-use considerations

**Implemented and covered by automated checks:**

- Critical BPM and countdown values use large type; layouts are mobile-first and checked at phone and tablet viewports for horizontal overflow.
- Controls use native buttons, radio inputs, number inputs, fieldsets, labels, output, and progress semantics. Buttons have a 48 CSS pixel minimum height; target editing has keyboard interaction and validation tests.
- Stable state is communicated with text such as `Operational`, `Below range`, and signal-quality labels rather than color alone.
- Screen transitions move focus to the new heading. Latest BPM is deliberately not a live region; a single polite, visually hidden region announces selected lifecycle changes.
- The global reduced-motion rule removes nonessential animation and transition duration, with a Playwright assertion.
- No implemented interaction requires precision dragging or disruptive visual shaking.

**Planned and not yet recorded as completed:**

- Test warm-up and later mission screens while walking safely with a mounted phone, including arm's-length readability, touch accuracy, bright/dim environments, and minimal layout movement.
- Test 200% zoom, increased Android font size, TalkBack or another screen reader, forced colors/high contrast, and portrait/landscape state retention across the complete flow.
- For the coolant puzzle, retain the approved design constraints: large semantic tile buttons, tap and keyboard activation, non-color connection cues, no dragging, no shake feedback, reduced-motion rotation, concise instructions, and controlled completion announcements.

## Milestone log

| Date or commit         | Milestone                                   | What became possible                                                                                            | Notable decision or lesson                                                                                                          |
| ---------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-11 (`41228a1`) | Implementation plan                         | Work could proceed through explicit reviewable scopes.                                                          | Architecture, boundaries, non-goals, and quality checks were recorded before code.                                                  |
| 2026-07-11 (`3a547d7`) | React and testing foundation                | A responsive gray-box product shell could run, build, and be tested.                                            | Use strict TypeScript, a small token layer, semantic HTML, and no router.                                                           |
| 2026-07-11 (`192d4cb`) | Telemetry contract, parser, and simulator   | Standard heart-rate packets and deterministic simulated samples could enter one diagnostics path.               | Keep telemetry data browser-independent and production diagnostics absent.                                                          |
| 2026-07-11 (`907fb74`) | Web Bluetooth adapter                       | A real monitor could connect, notify, disconnect, and retry through the application telemetry contract.         | Generation guards and injected browser ports make asynchronous behavior testable.                                                   |
| 2026-07-11 (`c937dda`) | Explicit lifecycle model                    | Legal navigation, run identity, and overlapping suspension reasons became pure reducer behavior.                | Lifecycle coordination must not duplicate domain truth.                                                                             |
| 2026-07-11 (`84d35bc`) | Platform adapters and lifecycle shells      | Monotonic scheduling, visibility, Wake Lock, focus movement, and semantic state shells became available.        | Platform capability failure must not become mission truth or block navigation.                                                      |
| 2026-07-11 (`4ef3ece`) | Heart-rate classification and warm-up rules | Noisy samples could become stable range state, qualification, and countdown through pure transitions.           | Filtering, hysteresis, dwell, staleness, and invalidation require explicit state.                                                   |
| 2026-07-12 (`193e006`) | Integrated pre-mission and warm-up flow     | Players could choose a source, connect, configure a range, qualify, count down, and recover from interruptions. | Real cadence evidence required separate filter, density, and staleness horizons.                                                    |
| 2026-09-26             | Active-gameplay visual-system spike         | The representative mission state became installed industrial equipment with readable CRT instrumentation.       | Keep physical framing outside display surfaces; use bloom, scanlines, and semantic color only where they communicate machine state. |

## Portfolio evidence to collect later

- [ ] Gray-box screenshots and later polished equivalents
- [ ] Short gameplay video
- [ ] Bluetooth connection and retry flow
- [ ] Warm-up, qualification, and countdown flow
- [ ] Coolant puzzle interaction
- [ ] Success and failure result screens
- [ ] Architecture diagram showing browser, application, and domain boundaries
- [ ] Test counts, coverage where meaningful, and completed accessibility metrics
- [ ] Hardware/browser support matrix without device identifiers or private data
- [ ] Foley and heartbeat-reactive audio, if implemented
- [ ] Before-and-after evidence for meaningful usability changes

## Future case-study outline

1. **Problem:** Create an active game that turns live heart-rate data into readable, deterministic play.
2. **Concept:** Keep an Operator in a chosen range while repairing a failing station.
3. **My role:** Creator and product lead. I originated the concept, directed planning and implementation through an AI-assisted development workflow, and performed manual testing and code review.
4. **Constraints:** Mobile physical use, Web Bluetooth/browser limits, variable sensor cadence, accessibility, static hosting, and no backend.
5. **Architecture:** Narrow browser adapters, one composition controller, reducer-driven lifecycle, and pure domain transitions.
6. **Major technical challenges:** Real-device telemetry, stable signal classification, monotonic ordering, interruption recovery, and future puzzle usability.
7. **Accessibility and physical-use design:** Large readable status, semantic controls, non-color cues, low announcement noise, reduced motion, and mounted-device testing.
8. **Debugging story:** The real-hardware cadence mismatch and separation of filter, density, and staleness horizons.
9. **Testing strategy:** Pure fact-sequence tests, adapter contract/race tests, component semantics, production-flow E2E, and documented hardware/manual checks.
10. **Result:** TODO: Record the completed game outcome, final quality metrics, and verified support matrix after release checks.
11. **Future direction:** Complete the coolant puzzle, active mission, results, and polish first; evaluate deferred progression, co-op, persistence, and audio only after the core experience is validated.
