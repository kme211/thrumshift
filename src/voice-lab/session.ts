import { commands, type Intent, type Interpretation } from './commands'
import type { SpeechResult } from './speech'

export const conditions = [
  'Baseline',
  'Pixel Buds',
  'Treadmill — easy',
  'Treadmill — workout',
] as const
export type Condition = (typeof conditions)[number]
export interface Attempt extends SpeechResult {
  id: number
  startedAtMs: number
  trial: number
  number: 1 | 2
  condition: Condition
  expected: Intent
  mode: 'lab' | 'demo'
  interpretation: Interpretation
  hr: {
    source: string
    connected: boolean
    bpm: number | null
    sampleAgeMs: number | null
    samplesDuringAttempt: number
  }
}
export function summarize(attempts: readonly Attempt[]) {
  const lab = attempts.filter((a) => a.mode === 'lab')
  const trials = [...new Set(lab.map((a) => a.trial))].map((id) =>
    lab.filter((a) => a.trial === id),
  )
  const correct = (a: Attempt) =>
    !a.error && a.interpretation.intent === a.expected
  const rows = commands.map((command) => {
    const groups = trials.filter(
      (group) => group[0]!.expected === command.intent,
    )
    const records = groups.flat()
    return {
      command: command.phrase,
      trials: groups.length,
      attempts: records.length,
      firstPass: groups.filter((group) => correct(group[0]!)).length,
      eventual: groups.filter((group) => group.some(correct)).length,
      // A one-attempt miss stays a failure so incomplete retries cannot inflate success.
      failures: groups.filter((group) => !group.some(correct)).length,
      unclear: records.filter((a) => a.interpretation.status !== 'known')
        .length,
      wrongIntent: records.filter(
        (a) => a.interpretation.intent !== null && !correct(a),
      ).length,
    }
  })
  const first = rows.reduce((sum, row) => sum + row.firstPass, 0)
  const eventual = rows.reduce((sum, row) => sum + row.eventual, 0)
  return {
    rows,
    trials: trials.length,
    firstAttemptRate: trials.length ? first / trials.length : null,
    withinTwoRate: trials.length ? eventual / trials.length : null,
    errors: attempts
      .filter((a) => a.error)
      .map((a) => ({ attempt: a.id, error: a.error })),
    wrongIntents: rows.reduce((sum, row) => sum + row.wrongIntent, 0),
  }
}
