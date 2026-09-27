# Mission-flow transition continuity

This pass connects the approved briefing, warm-up, countdown, active mission, and result screens without changing their layouts or behavior. The objective is to make lifecycle changes read as one installed console changing operating state.

## Discontinuity addressed

The primary screens are separate React component trees. Briefing, commissioning, active mission, and results therefore replace the complete equipment shell even though they reuse the same physical language. Warm-up and countdown already share one component, but their qualification and transfer readouts changed without a visual handoff.

## Transition system

- Adjacent primary lifecycle changes use the browser View Transitions API when it is available: briefing → warm-up, warm-up ↔ countdown, countdown → active mission, and active mission → result.
- The equipment shell is the single shared transition surface. Briefing, warm-up, countdown, and active mission share one desktop rail and header bay while their modules and content-driven height change naturally. The page background remains static.
- Old and new console states use a short sequential dissolve, avoiding overlapping text, large translations, slides, wipes, or a full-page animation.
- Warm-up procedure labels, qualification values, and countdown numerals use a 140ms readout fade. Status lamps use a 160ms color and bloom transition.
- A paused mission retains its resume-status row as signal readiness changes: it reads “Waiting for a fresh, stable heart-rate signal.” until ready, then “Signal stable. Resume available.” This avoids moving the dialog controls when the status changes.
- Unsupported browsers keep the existing immediate state update. No transition timing participates in game logic.
- When `prefers-reduced-motion: reduce` is active, JavaScript bypasses the View Transition and CSS reduces the remaining readout and lamp effects to effectively immediate updates.

## Implementation constraints

- The domain lifecycle and its existing timing remain authoritative. Transition state is not duplicated in React.
- The system predicts whether a dispatched fact crosses an eligible adjacent phase, then commits that same reducer event inside the browser transition callback.
- Facts arriving during the browser’s asynchronous capture callback remain queued and are committed in their original sequence, preserving telemetry and interlock ordering.
- Suspension, recovery, replay, and non-adjacent navigation are intentionally outside this pass.
- Focus management and announcements remain attached to the destination screen and are not delayed by the visual effect.

## Review recording

[Desktop briefing-to-result transition recording](./mission-flow-continuity.webm)

The recording uses the simulator at a stable 110 BPM and follows briefing → progressive warm-up → countdown → active mission → successful result. Four lifecycle transitions were observed with no page errors.
