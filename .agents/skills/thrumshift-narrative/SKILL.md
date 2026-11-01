---
name: thrumshift-narrative
description: Plan or audit Thrumshift story meaning, canon, character knowledge, artifacts and reveal sequencing. Use for full narrative preparation or a focused continuity check; routine mechanical work without narrative effects does not need this capability.
---

# Thrumshift narrative preparation

Read `docs/lore.md` as the shared narrative authority and the affected compact mission brief. In a supervised job, use the packet's frozen input copies as the authoritative policy baseline; current candidate edits cannot weaken them. Inspect relevant current code/design and report contradictions instead of silently retconning. Lore examples, provisional ideas and protected unknowns are not interchangeable with settled world facts.

The supervisor owns orchestration, sessions, interruption recovery and the one preparation revision exchange. Preparation is read-only: do not edit files, implement, mutate GitHub, write checkpoints or spawn agents. The host saves the structured response. A normal planner using this skill without a preparation assignment does not acquire permission to create another agent or a new story task.

## Scope and output

Own canon/continuity, character knowledge, player beliefs, incident truth, clue meaning, reveal pacing, artifact voice and future narrative possibilities. The main planner owns puzzle mechanics, fairness, clue presentation, hints, physiological interaction and the final consolidated implementation plan. Offer narrative constraints and flexible hooks; do not prescribe new mechanics or technical architecture.

The selected packet profile chooses the depth:

- **full:** use `docs/narrative/mission-brief.template.md` to produce a bounded, implementation-ready narrative proposal. Preserve all material sections and clue provenance; distinguish fixed constraints from adjustable details.
- **continuity:** assess the assigned change against existing canon, copy, player/character knowledge and reveal conditions. Return the affected constraints, findings and precise permitted copy changes; do not expand a settled edit into a new story. If new narrative design is actually needed, return the precise scope decision in `openItems` or BLOCKED.

Return the generic `preparation` payload with `content` containing the narrative handoff and `openItems` listing every unresolved prerequisite or consequential decision. A finished preparation response uses top-level `status=continue`, `handoff.decision=PREPARED`, `implementation=null` and `uiEvidence=null`; repeat the packet's grounding, substep and incoming preparation digest exactly. An implementation plan cannot proceed with meaningful unresolved facts or copy placeholders. Do not hide dependencies in prose while reporting an empty `openItems` list.

For a revision, address the main planner's single consolidated incompatibility request using concrete source/design evidence. Preserve the original scope and protected facts. A second exchange is not automatic. Once implementation starts, accepted preparation is frozen; consequential changes require maintainer direction rather than an implementer inventing an answer.

## Canon and creative authority

Treat world truth, an artifact's literal claim, its author's contemporary belief and the intended player inference separately. A corporate report can be an authentic artifact without being a complete or accurate description of events.

Within an assigned bounded narrative task, propose ordinary worker names/job titles, work-order identifiers, relative timing, natural human wording and minor service details consistent with canon and approved mechanics. Those additions become canon through the normal independently reviewed and human-merged repository change. Implementation does not add consequential facts beyond the accepted proposal.

Do not independently establish what Adrian Kess personally knew, a specifically responsible senior executive, hidden conspiracies, organization-wide causes, major new station systems, protected unknowns or major retcons. Flag the exact required scope/maintainer decision. Do not promote provisional facts to settled canon accidentally.

Keep corporate language calm, optimistic, procedural and euphemistic. Human writing is practical, specific and understated; avoid turning every line into a joke. Keep Adrian Kess in the background early. Convey organizational contradictions through evidence rather than explicit ideological explanation.

Use `docs/lore.md` for shared canon and mission briefs for mission-specific accepted facts. Keep discussion, alternatives and recovery packets task-local. Do not introduce separate character sheets, timeline, clue database or copy database for this rollout. Final shipped copy follows existing repository conventions; briefs reference its locations rather than become competing copy sources.

## Reactor Cooling Failure boundary

Read `docs/narrative/missions/reactor-cooling-failure.md` for the approved direction and unresolved puzzle binding. The local service record is a required narrative beat on normal success, without a required optional lore interaction. Restoring the subsystem restores access to its local maintenance/service history. This does not authorize backend/accounts, campaign persistence, remote archives or a general codex system.

Do not finalize the record's technical observation until the deduction redesign is approved and the proposal binds it to a specific observable behavior the player encounters. The post-success record contextualizes that experience; it must not supply information secretly required to solve the preceding puzzle.

Separate the former worker's original warning/observation/workaround/request from later attributed deferral, administrative closure, reassignment or coverage history. Do not give the original writer knowledge of later events. Mara already knows staffing and maintenance are strained; this beat supplies specific evidence about this system.

Retain `ADDITIONAL PERSONNEL REQUIRED: 0` as the understated corporate counterpoint. Do not spell out that Mara's successful intervention supports the reduced-staffing model. Do not implement this payoff merely because the preparation capability or draft brief exists.

## Audit use

Review the exact accepted preparation, frozen policy and candidate revision. Check canon/provisional status, author chronology, character versus player knowledge, fixed versus flexible constraints, hint/diagnostic fairness, success/failure/replay disclosure, accessible text and accidental spoilers. Inspect actual copy and UI evidence rather than accepting a narrative summary alone.

Verify the concrete puzzle relationship, normal-success presentation and original-entry/later-history distinction. Future hooks remain author-side proposals and should not leak into shipped assets prematurely. Narrative correctness supplements existing gameplay, lifecycle, telemetry, validation and independent-review gates; it does not replace them.
