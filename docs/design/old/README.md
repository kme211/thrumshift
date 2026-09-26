# Pre-visual-system UI capture inventory

These screenshots preserve the gray-box implementation that preceded the approved active-gameplay visual system. They are retained as historical and before/after evidence; they no longer represent the current active gameplay styling. Desktop captures use a 1440px-wide viewport and mobile captures use a 390px-wide viewport. Full-page images include the development diagnostics panel where it was present in the implementation.

| Screenshot                                  | Viewport         | State represented                                                                                      |
| ------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| `desktop-startup-mission-entry.png`         | Desktop (1440px) | Initial mission briefing with the simulator disconnected.                                              |
| `mobile-startup-mission-entry.png`          | Mobile (390px)   | Initial mission briefing in the narrow responsive layout.                                              |
| `desktop-warmup-signal-acquisition.png`     | Desktop (1440px) | Warm-up immediately after starting continuous simulated telemetry; the signal is still being acquired. |
| `desktop-main-telemetry.png`                | Desktop (1440px) | Active mission with a stable, in-range 110 BPM reading and full station stability.                     |
| `mobile-main-telemetry.png`                 | Mobile (390px)   | The same active telemetry/gameplay state in the narrow responsive layout.                              |
| `desktop-active-puzzle-hint.png`            | Desktop (1440px) | Active coolant-routing interaction after a tile rotation and an in-game hint request.                  |
| `mobile-active-puzzle-hint.png`             | Mobile (390px)   | The active puzzle and hint state in the narrow responsive layout.                                      |
| `desktop-pause-modal.png`                   | Desktop (1440px) | Manual mission-suspension dialog over the retained active mission.                                     |
| `desktop-disconnect-interruption-modal.png` | Desktop (1440px) | Disconnect-driven suspension dialog with reconnect and end-run actions.                                |
| `desktop-telemetry-error-modal.png`         | Desktop (1440px) | Built-in simulator error state: the bio-link is in error, the signal is stale, and play is suspended.  |
| `desktop-stability-warning.png`             | Desktop (1440px) | Above-range (170 BPM) gameplay state with station stability declining to 70%.                          |
| `desktop-success-completion.png`            | Desktop (1440px) | Successful coolant-route completion result, including the performance summary.                         |
| `desktop-failure-completion.png`            | Desktop (1440px) | Failure result after sustained above-range telemetry drains station stability to zero.                 |

## Availability notes

All requested state categories were reachable through the UI and captured without modifying the product interface. The implementation did not expose a separate visual countdown or transition screen during this flow; warm-up, active mission, suspension, and result screens are represented above.
