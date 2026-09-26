# Thrumshift design artifacts

## Current approved direction

- [Active gameplay visual-system rules](./active-gameplay-visual-system.md)
- [Mission briefing visual-system rules](./mission-briefing-visual-system.md)
- [Mission suspension visual-system rules](./mission-suspension-visual-system.md)
- [Mission result visual-system rules](./mission-result-visual-system.md)
- [Version 1 desktop reference](./v1/desktop-active-110bpm.png): active mission at a stable 110 BPM and 100% station stability
- [Version 1 mobile reference](./v1/mobile-active-110bpm.png): the same active mission adapted for a 390px viewport
- [Version 1 desktop briefing reference](./v1/desktop-briefing-ready-110bpm.png): connected briefing at 110 BPM with valid mission parameters
- [Version 1 mobile briefing reference](./v1/mobile-briefing-ready-110bpm.png): the same ready briefing adapted for a 390px viewport
- [Version 1 desktop manual-suspension reference](./v1/desktop-suspension-manual.png): operator hold with retained mission context
- [Version 1 desktop disconnect reference](./v1/desktop-suspension-disconnect.png): interrupted bio-link with reconnect-first recovery
- [Version 1 mobile disconnect reference](./v1/mobile-suspension-disconnect.png): the disconnect interlock adapted for a 390px viewport
- [Version 1 desktop success reference](./v1/desktop-result-success.png): restored coolant route with a controlled finish
- [Version 1 desktop failure reference](./v1/desktop-result-failure.png): depleted station stability with retained mission history
- [Version 1 mobile success reference](./v1/mobile-result-success.png): the successful terminal report adapted for a 390px viewport
- [Version 1 mobile failure reference](./v1/mobile-result-failure.png): the failed terminal report adapted for a 390px viewport

Version directories contain approved review captures for the visual system. The application remains the source of truth for behavior, semantics, responsive layout, and accessibility.

## Historical captures

The [`old`](./old/) directory contains the pre-visual-system gray-box state inventory. Those images are retained as implementation history and before/after evidence; they should not be used as the current art-direction reference.
