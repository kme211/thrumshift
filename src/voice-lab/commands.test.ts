import { describe, expect, it } from 'vitest'
import { commands, interpret } from './commands'
import { advanceDemo, demoSteps, startDemo } from './scenario'

describe('deterministic voice interpreter', () => {
  it('recognizes all canonical commands and aliases as whole phrases', () => {
    for (const command of commands) {
      expect(interpret(`  ${command.phrase.toUpperCase()}! `)).toMatchObject({
        status: 'known',
        intent: command.intent,
        match: 'exact',
      })
      for (const alias of command.aliases)
        expect(interpret(alias)).toMatchObject({
          status: 'known',
          intent: command.intent,
          match: 'alias',
        })
    }
  })
  it.each([
    'do not start auxiliary pump',
    'start auxiliary',
    'stort auxiliary pump',
    'isolate bus three',
    'route power from cooling',
    'stop start auxiliary pump',
    '',
    'turn auxiliary pump',
  ])('does not guess or remove negation: %s', (text) => {
    expect(interpret(text)).toMatchObject({
      status: 'unrecognized',
      intent: null,
      match: 'no match',
    })
  })
  it('surfaces competing complete commands without choosing one', () => {
    expect(
      interpret('start auxiliary pump or stop auxiliary pump'),
    ).toMatchObject({ status: 'ambiguous', intent: null })
  })
  it('shares intents with tappable demo decisions; wrong actions and Repeat cannot advance', () => {
    let state = startDemo()
    expect(advanceDemo(state, 'STOP_AUX_PUMP').step).toBe(0)
    expect(advanceDemo(state, 'REPEAT')).toEqual(state)
    for (const step of demoSteps) state = advanceDemo(state, step.intent)
    expect(state.step).toBe(5)
    expect(state.message).toContain('Exercise complete')
    expect(advanceDemo(state, 'START_AUX_PUMP')).toEqual(state)
  })
})
