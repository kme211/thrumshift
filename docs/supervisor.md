# Supervised issue workflow

This repository supports a DEEP-only initial rollout using the local codex-supervisor. The supervisor supplies the phase contracts, artifact paths, packet hashes and durable role sessions. No project-specific orchestration skill is required.

## Routing and ownership

- Use the `deep` workflow, routed by `codex:deep`. No LIGHT workflow is enabled initially.
- The planner always qualifies SOL; no optional LUNA implementer is configured in this rollout. Planner, implementer and reviewer have explicit, versioned model settings copied from the working supervisor setup. The host freezes these definitions before implementation.
- Work on one assigned issue in its isolated worktree. Read its acceptance criteria and preserve unrelated work. Do not merge PRs, deploy, release, change secrets/access/billing, or perform destructive production operations.
- Respect `codex:skip` and human blockers. An authenticated maintainer reply clarifies the assigned task; it does not bypass role permissions, validation or independent review.
- The supervisor resumes quota-interrupted work with the same role session and saved files. Do not restart the whole workflow, discard partial work, or create nested orchestration.
- Return the host's structured report and handoff. Successful plan, implementation and review use `status: continue`; only publication may report `ready_for_review`.

## Evidence and publication

The planner must identify concrete affected invariants, exact validation commands and an explicit UI-evidence decision. A visible UI/interaction change normally requires inspected before/after captures from comparable states, covering relevant desktop/mobile layouts and accessibility behavior. SKIP requires a reason grounded in the assigned scope. Do not regenerate unrelated visual references.

Keep checkpoints, raw logs, packets and other runtime evidence in the host-authorized artifact directory outside the repository. Commit only intentional project changes. Never include tokens, device identifiers or private environment files in evidence or Git. Documentation/role-only changes can use focused TOML, reference and diff validation; never present those as application or browser test results. Application changes require the affected canonical checks and all acceptance checks.

Acceptance checks must actually pass. Do not edit tests just to hide failures, relax canonical rules, fabricate UI/hardware evidence or relabel failed checks as passed. Wider-suite baseline exceptions require the host's revision-bound comparison manifests and independent reviewer acceptance, and cannot excuse an assigned acceptance failure. Missing tools/access or a genuine product decision must be reported precisely; routine choices and internal plan assumptions should be resolved from current evidence within the host's correction budget.

The publisher must preserve the independently reviewed commit and exact validation list. Recheck remote main and the remote PR head. Changed application files, rebases or new commits require implementation and fresh independent review before publication. Attach the required inspected evidence using an available supported mechanism; keep the PR draft if required evidence cannot be attached. Report CI as passed only when applicable checks actually ran and passed; no configured checks is not a passing CI run.

Link the assigned issue in the PR (`Closes #N` only when its acceptance criteria are met), identify the frozen tested/reviewed commit, summarize checks and disclose limitations. Apply `codex:managed` to the issue and PR when publishing. Use `codex:blocked` for an unresolved published blocker; remove it when that same job is explicitly resumed and its gates are satisfied. Ensure these labels exist before using them. Mark the PR ready only after the host's publication and validation requirements are satisfied. Human review and merge remain separate.

## Onboarding

Copy the project object in `docs/supervisor.project.example.json` into the supervisor’s local `projects` array, replacing `checkout` with this repository’s actual absolute path. These files do not register or start the supervisor automatically.

Merge the repository's setup PR before scheduling its first issue; roles must exist on remote main so the host can load trusted definitions. The local supervisor entry starts with `enabled: false` and `autoPick: false`. Enable it for one explicitly chosen issue first. A milestone is optional for an explicit enqueue and required before automatic selection. Do not choose a feature or create a milestone as an installation side effect.

After enabling the local project entry, enqueue with `npm start -- enqueue thrumshift ISSUE --workflow deep` from the supervisor checkout, using the same state directory as the runner. The explicit workflow assigns the routing label when the job starts; an issue with only `codex:deep` can also be enqueued without the flag. Existing managed PRs and blockers still enforce the project work limit.

The existing runner, account cooldown, independent-review gates and #supervisor Slack destination are shared across projects. Answer a blocker in the thread of its new bot alert. Ready-for-review PRs wait for the maintainer. Turn on milestone auto-pick only after a successful explicit trial and a deliberate milestone/routing choice.

Role-file format: [official OpenAI documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents). These TOMLs are consumed by the supervisor as external CLI role definitions; the supervisor enforces phase sandboxing and independent sessions. They do not enable nested agents.

## Thrumshift rules and validation

Read `README.md` for current behavior, `docs/roadmap.md` for planned scope and `docs/design/README.md` plus the affected visual-system documents for approved design. `docs/backlog.md` contains ideas, not authorization. The assigned issue defines the bounded task; do not add deferred features as implementation conveniences. Preserve product behavior unless the issue explicitly authorizes its change, and surface conflicts requiring a consequential decision.

Preserve telemetry filtering/staleness and qualification rules, ordered occurrence-time/sequence facts, suspension/reconnection behavior, active-play timing, deterministic mission results, accessibility/focus and reduced-motion behavior. UI effects must not alter domain timing or reorder facts. The current application is client-only; do not incidentally introduce accounts, a backend, persistence or new telemetry collection. Historical captures under `docs/design/old` are not the approved current visual direction.

`README.md` and `package.json` define the checks. Use the supported Node range (22.12 through 24) and the following commands for application changes, with affected subsets during implementation and the full applicable set before readiness:

```sh
npm ci
npx playwright install chromium
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run e2e
npm run e2e:puzzle
```

Build before the production E2E run. Use the explicit simulator and injected telemetry/browser ports for automation; tests must not open a real device chooser. Do not run `npm run format` over the whole repository just to make unrelated files pass. Preserve exclusion of development diagnostics from production and never use a deployed environment or new tunnel as a shortcut for local validation.

Actual Bluetooth/Android/monitor checks are manual gates when the issue requires hardware verification. `DEVELOPMENT.md` records historical device observations, not proof for a new change. Keep automated simulator evidence distinct from current hardware observations; do not invent firmware/cadence measurements or claim unperformed device checks passed. When a required hardware gate cannot be completed, keep the PR draft and ask for the exact manual check. Device-free UI/configuration changes do not automatically require hardware testing.

The currently configured GitHub Actions workflow, `.github/workflows/dependabot-ci.yml`, runs verification only for Dependabot PRs. A separate Cloudflare Workers Builds integration can also report checks on ordinary PRs. Inspect the actual check results: a skipped Dependabot job does not prove feature validation, and a build-only check does not prove the unit/browser suites ran. Local canonical validation and independent evidence review remain required, and failed applicable remote checks block readiness. Do not change CI or deployment settings as an unrelated side effect.

There are currently no GitHub issues or milestones selected for supervision. The maintainer will choose the first feature later. Keep auto-pick disabled; do not convert the roadmap/backlog into issues, create a milestone, or start a job automatically.
