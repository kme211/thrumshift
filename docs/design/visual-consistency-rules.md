# Cross-state visual consistency rules

This final pass aligns the approved mission briefing, warm-up and countdown, active and degraded gameplay, suspension/interlock, and mission-result states. It does not introduce a new direction or change game behavior. State-specific composition remains intact while repeated equipment language now follows one set of rules at desktop and 390px.

## Shared screen rhythm

- Mission screens use the same identity plate, eyebrow, mission-title scale, header inset, divider, and bottom spacing. Different maximum console widths remain intentional responses to each state’s information density.
- Equipment modules use one casing treatment, inset rhythm, printed label strip, and inter-module gap. At 390px, framing density reduces before typography or touch targets shrink.
- The top bio-link and report-seal blocks share the same physical status-block dimensions and mobile collapse behavior.
- Suspension continues to dock over retained mission context. Its identifier now uses the same printed equipment-label primitive as every fixed module.

## Typography roles

- `--font-equipment` is the condensed uppercase role for plates, subsystem identifiers, controls, status blocks, and short state labels.
- `--font-instrument` is the monospace role for telemetry, CRT state language, tabular result values, and routing instructions.
- Readable system sans remains the body-copy role for briefing guidance, mission instructions, explanations, and archival notes.
- The repeated mission name uses one scale and spacing treatment across briefing, active mission, suspension context, and results. Large outcome messages remain state-specific because they are terminal dispositions, not screen identity.

## Status indicators and semantic color

Every persistent lamp uses one semantic state: `healthy`, `warning`, `critical`, or `inactive`. Text remains adjacent so color never carries the meaning alone.

- Green: connected, ready, operational, restored, completed, or sealed.
- Amber: live numeric telemetry, neutral prompts, advisories, or recovery in progress.
- Red: out-of-range operation, decreasing stability, disconnected bio-link, depleted stability, or incomplete routing.
- Cyan: live coolant flow and routing emphasis only.
- Inactive lamps and disabled controls are neutral gray, never warning red.

Degraded gameplay repeats the red classification in the stability bar and control-deck lamp, paired with `ABOVE RANGE`, `TREND: DECREASING`, and `STABILITY DEGRADING` text. The casing and page backdrop remain neutral.

## Control hierarchy

- Primary physical controls use the cream raised-button face: connect, begin, pause, reset, reconnect, resume, and run again.
- Disabled controls retain the same geometry but use a neutral recessed gray treatment.
- Secondary or terminating controls, such as `End Run`, use the darker equipment face and never adopt failure red.
- Puzzle utility controls now use the same physical button construction and minimum touch height as other console controls.

## Approved capture matrix

- Briefing: desktop and 390px ready at 110 BPM.
- Warm-up: desktop and 390px operational qualification at 110 BPM.
- Countdown: desktop and 390px transfer authorization at 110 BPM.
- Active: desktop and 390px stable at 110 BPM / 100% stability.
- Degraded: desktop and 390px above range at 170 BPM / 76% stability.
- Suspension: desktop manual hold, desktop disconnect, and 390px disconnect.
- Results: desktop and 390px success and failure.

The corresponding captures are stored under [`v1`](./v1/). They were regenerated together after this consistency pass so spacing, typography, status treatment, and responsive density can be compared directly.
