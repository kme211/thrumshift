# Reactor Cooling Failure — narrative brief

Status: **draft direction; not implementation-ready**. This brief records approved narrative constraints, not finished artifact copy or a selected technical observation. Shared world authority: [lore](../../lore.md). Puzzle implementation remains tracked by [#15](https://github.com/kme211/thrumshift/issues/15) and its existing stories #16–#19; this brief does not expand their scope.

## Narrative purpose and belief change

Give the player specific local evidence that a problem they just worked around was already known, while corporate reporting treats their successful intervention as proof that no additional staff were needed. Do not state that conclusion explicitly.

Before: the player has encountered a coolant-system problem and the practical burden of restoring it. After: the player has evidence that someone previously observed the relevant behavior and attempted to have it addressed. Mara already knows staffing and maintenance are strained; this is not her first discovery of those conditions.

## Incident truth and characters

The exact observation remains dependent on the approved deduction redesign and a concrete narrative binding to that design. Do not invent a mechanical fault from the former rotatable-grid puzzle or introduce a new system to justify the record.

The record belongs to a former worker who owned or regularly serviced the subsystem before responsibility consolidation. Their name and appropriate role can be proposed within the assigned narrative task. Do not decide their wider fate, senior executive culpability or Adrian Kess's knowledge.

## Evidence, provenance and reveal sequence

Successful coolant restoration makes this controller/subsystem's **local service or maintenance history** accessible. Present the recovered evidence as part of normal success/result flow. It is a required narrative beat, not a required optional lore interaction. Exact layout and interaction presentation remain a separate planning decision.

| Evidence                  | Source and creation context                                                                     | Intended information and limits                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original service entry    | Former responsible worker; written before the current incident and later administrative changes | Known behavior/fault, warning, workaround and/or repair/replacement request. Its exact technical statement must match the approved puzzle binding.                           |
| Subsequent status/history | Appropriately identified later work-order/system updates                                        | Deferral, administrative closure, reassignment or responsibility/coverage consolidation as authorized. Never write these later facts as foreknowledge in the original entry. |
| Corporate result          | Current mission outcome reporting                                                               | Preserve `ADDITIONAL PERSONNEL REQUIRED: 0` as the understated counterpoint.                                                                                                 |

The record contextualizes something the player actually encountered. It must not contain information that was necessary to solve the preceding puzzle while inaccessible. Keep original claims, source knowledge, literal facts and intended inference distinct. Exact relative chronology and certainty must be documented when the artifact is authored.

## Corporate and human interpretations

Corporate interpretation: recovery succeeded within the current staffing model. Human interpretation: prior warnings and deferred corrective work place Mara's emergency effort in a different light. Convey that difference through juxtaposed evidence and calm corporate language, without an explanatory speech or ideological conclusion.

## Puzzle dependency and readiness

The deduction redesign is being developed through the existing issue chain. Before this narrative payoff is implemented, cite the approved design/revision and select a concrete observed behavior, quirk, workaround, misleading indication or failure characteristic that the recovered record retrospectively explains. A design description alone does not select or approve that narrative observation.

That binding, final attributed record copy, presentation sequence and relevant success/failure/replay/accessibility checks are unresolved here. They must appear as open items in preparation. No implementation-ready mission plan may retain this meaningful placeholder.

This dependency applies to the narrative payoff. It does not block unrelated ready Thrumshift work or the ordinary DEEP path for non-narrative tasks.

## Future hooks and canon changes

Leave the record's future reuse open; do not establish a conspiracy, the ultimate cause of staffing policy, a responsible executive, Kess's knowledge or other protected unknowns. This draft introduces no named worker, identifier, exact dates or new technical canon.

Within an explicitly assigned narrative task, ordinary names, role titles, record IDs, relative timing, human wording and minor credible service details may be proposed consistently with lore and approved mechanics. Additions become canon through normal reviewed and merged changes. Retcons and protected-unknown resolutions require explicit direction.

## Implementation boundary

This brief does not implement or authorize the payoff. Use the current local client-only architecture when that work is assigned. Do not add accounts, backend services, campaign persistence, remote archives, telemetry collection or a general codex system to support the beat. Keep future hooks author-side until deliberately included in shipped content.
