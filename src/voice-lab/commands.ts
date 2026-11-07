export const commands = [
  {
    intent: 'STATUS',
    phrase: 'Status',
    aliases: ['status report', 'give me status'],
  },
  {
    intent: 'SCAN_COOLING',
    phrase: 'Scan cooling',
    aliases: ['scan the cooling', 'check cooling'],
  },
  {
    intent: 'SCAN_POWER',
    phrase: 'Scan power',
    aliases: ['scan the power', 'check power'],
  },
  {
    intent: 'START_AUX_PUMP',
    phrase: 'Start auxiliary pump',
    aliases: [
      'start the auxiliary pump',
      'auxiliary pump on',
      'engage auxiliary pump',
      'turn on auxiliary pump',
    ],
  },
  {
    intent: 'STOP_AUX_PUMP',
    phrase: 'Stop auxiliary pump',
    aliases: [
      'stop the auxiliary pump',
      'auxiliary pump off',
      'turn off auxiliary pump',
    ],
  },
  {
    intent: 'ROUTE_POWER_COOLING',
    phrase: 'Route power to cooling',
    aliases: ['route power to the cooling'],
  },
  {
    intent: 'ISOLATE_BUS_TWO',
    phrase: 'Isolate bus two',
    aliases: ['isolate bus 2'],
  },
  { intent: 'REPEAT', phrase: 'Repeat', aliases: ['repeat that', 'say again'] },
] as const

export type Intent = (typeof commands)[number]['intent']
export interface Interpretation {
  normalized: string
  status: 'known' | 'ambiguous' | 'unrecognized'
  intent: Intent | null
  match: 'exact' | 'alias' | 'no match'
}
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Whole-phrase allowlist only. Negation, missing words, and near matches never actuate.
export function interpret(text: string): Interpretation {
  const normalized = normalize(text)
  const base = { normalized, intent: null, match: 'no match' } as const
  for (const command of commands) {
    if (normalized === normalize(command.phrase))
      return {
        normalized,
        status: 'known',
        intent: command.intent,
        match: 'exact',
      }
    if (command.aliases.some((alias) => normalized === alias))
      return {
        normalized,
        status: 'known',
        intent: command.intent,
        match: 'alias',
      }
  }
  const mentioned = commands.filter((command) =>
    [normalize(command.phrase), ...command.aliases].some((phrase) =>
      ` ${normalized} `.includes(` ${phrase} `),
    ),
  )
  return {
    ...base,
    status: mentioned.length > 1 ? 'ambiguous' : 'unrecognized',
  }
}
