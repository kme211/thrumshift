# Working on Thrumshift

Read README.md for current behavior and supported runtime, docs/roadmap.md for planned scope, and docs/design/README.md plus the relevant visual-system rules for UI work. The assigned issue defines the bounded task. Ideas in docs/backlog.md are not authorization to expand scope.

Preserve telemetry and lifecycle invariants, deterministic occurrence-time/sequence ordering, warm-up qualification, suspension/reconnection, active-play timing and mission-result boundaries. Keep UI transition timing outside domain logic. Do not incidentally introduce persistence, accounts, a backend or new telemetry collection into the current client-only architecture.

Use the existing simulator and injected telemetry/browser ports for automated testing. Do not open a real Bluetooth chooser from automation. Hardware verification must be explicitly recorded when required; historical observations in DEVELOPMENT.md are not evidence for a new revision.

For affected application changes, use the supported Node versions (22.13+ within 22.x, or 24.x; .nvmrc pins 22.23.4), npm run format:check, npm run lint, npm run typecheck, npm test, npm run build, npm run e2e and npm run e2e:puzzle. Build before production E2E. Keep development diagnostics excluded from production. Choose focused checks for documentation/role-only changes and describe their limits honestly. Never weaken acceptance criteria or claim unrun checks passed.

Keep UI changes aligned with the approved current design documents and inspect relevant desktop/mobile, focus/accessibility and reduced-motion behavior. Historical captures in docs/design/old are not the current reference. Resolve routine choices from current code; document contradictions requiring a consequential product decision rather than guessing.

For a host-assigned supervisor role, also read docs/supervisor.md. The host coordinates planning, implementation, independent review and publication in separate sessions. Do not spawn nested orchestration. Never merge, deploy, release, modify secrets/access/billing or perform destructive production work as part of issue implementation.

For story-bearing work, read docs/lore.md and the affected compact mission brief. Use .agents/skills/thrumshift-narrative/SKILL.md when preparing or auditing narrative meaning/continuity. Preparation is an optional capability within DEEP, selected explicitly by the host; it is not another workflow class and must not delay unrelated non-narrative work.
