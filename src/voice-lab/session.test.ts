import { expect, it } from 'vitest'
import { interpret, type Intent } from './commands'
import { summarize, type Attempt } from './session'

function attempt(
  id: number,
  trial: number,
  number: 1 | 2,
  transcript: string,
  expected: Intent = 'STATUS',
  error: string | null = null,
): Attempt {
  return {
    id,
    trial,
    number,
    startedAtMs: 0,
    condition: 'Baseline',
    expected,
    mode: 'lab',
    transcript,
    alternatives: [],
    confidence: null,
    error,
    elapsedMs: 100,
    interpretation: interpret(transcript),
    hr: {
      source: 'simulated',
      connected: true,
      bpm: 110,
      sampleAgeMs: 0,
      samplesDuringAttempt: 1,
    },
  }
}
it('scores trials, one retry, wrong known intents, errors and unclear parses without inflation from demo', () => {
  const records = [
    attempt(1, 1, 1, 'status'),
    attempt(2, 2, 1, 'scan power'),
    attempt(3, 2, 2, 'give me status'),
    attempt(4, 3, 1, '', 'STATUS', 'no-speech'),
    attempt(
      5,
      4,
      1,
      'start auxiliary pump or stop auxiliary pump',
      'START_AUX_PUMP',
    ),
    { ...attempt(6, 5, 1, 'status'), mode: 'demo' as const },
  ]
  const summary = summarize(records)
  expect(summary.trials).toBe(4)
  expect(summary.firstAttemptRate).toBe(0.25)
  expect(summary.withinTwoRate).toBe(0.5)
  expect(summary.wrongIntents).toBe(1)
  expect(summary.errors).toHaveLength(1)
  expect(summary.rows[0]).toMatchObject({
    attempts: 4,
    firstPass: 1,
    eventual: 2,
    failures: 1,
    unclear: 1,
  })
  expect(summary.rows[3]).toMatchObject({ failures: 1, unclear: 1 })
  expect(summarize([]).firstAttemptRate).toBeNull()
})
