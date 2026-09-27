import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createWarmupSession } from '../app/WarmupSession'
import { transitionClassifier } from '../domain/heart-rate/classifier'
import { transitionWarmup } from '../domain/mission/warmup'
import { defaultGameplayTuning } from '../config/gameplayTuning'
import { WarmupScreen } from './WarmupScreen'

function renderSession(
  session = createWarmupSession(
    0,
    { lowerBpm: 100, upperBpm: 140 },
    defaultGameplayTuning,
  ),
) {
  render(
    <WarmupScreen
      session={session}
      status={{ state: 'connected' }}
      targetDraft={{ lower: '100', upper: '140' }}
      targetError={null}
      onConnect={vi.fn()}
      onTargetChange={vi.fn()}
      onTargetCommit={vi.fn()}
      onBack={vi.fn()}
    />,
  )
}

describe('WarmupScreen', () => {
  it('renders connected-but-unusable separately from transport status', () => {
    renderSession()
    expect(screen.getByText(/Signal quality:/)).toHaveTextContent(
      'insufficient',
    )
    expect(screen.getByText(/Stable gameplay status:/)).toHaveTextContent(
      'Unusable signal',
    )
    expect(screen.getByText(/0 of 10 seconds/)).toBeInTheDocument()
    expect(
      screen.getByRole('list', { name: 'Readiness stages' }),
    ).toHaveTextContent('01 / Bio-link')
  })

  it('renders domain countdown state without calculating qualification', () => {
    let session = createWarmupSession(
      0,
      { lowerBpm: 100, upperBpm: 140 },
      defaultGameplayTuning,
    )
    let classifier = session.classifier
    for (const time of [0, 500, 1_000, 2_000, 3_000]) {
      classifier = transitionClassifier(
        classifier,
        { type: 'sample', occurrenceTimeMs: time, bpm: 110 },
        session.targetRange,
        defaultGameplayTuning.heartRateClassifier,
      ).state
    }
    let warmup = transitionWarmup(
      session.warmup,
      {
        type: 'classifierUpdated',
        occurrenceTimeMs: 3_000,
        signalQuality: classifier.signalQuality,
        stableClassification: classifier.stableClassification,
      },
      defaultGameplayTuning.warmup,
      defaultGameplayTuning.countdown,
    )
    warmup = transitionWarmup(
      warmup,
      { type: 'timeAdvanced', occurrenceTimeMs: 13_000 },
      defaultGameplayTuning.warmup,
      defaultGameplayTuning.countdown,
    )
    session = { ...session, classifier, warmup }
    renderSession(session)
    expect(
      screen.getByRole('heading', { name: 'Mission countdown' }),
    ).toHaveFocus()
    expect(screen.getByText('Transfer authorized')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders consecutive progress supplied by the domain warm-up state', () => {
    let session = createWarmupSession(
      0,
      {
        lowerBpm: 100,
        upperBpm: 140,
      },
      defaultGameplayTuning,
    )
    let warmup = transitionWarmup(
      session.warmup,
      {
        type: 'classifierUpdated',
        occurrenceTimeMs: 0,
        signalQuality: 'usable',
        stableClassification: 'operational',
      },
      defaultGameplayTuning.warmup,
      defaultGameplayTuning.countdown,
    )
    warmup = transitionWarmup(
      warmup,
      { type: 'timeAdvanced', occurrenceTimeMs: 5_000 },
      defaultGameplayTuning.warmup,
      defaultGameplayTuning.countdown,
    )
    session = { ...session, warmup }
    renderSession(session)
    expect(screen.getByText(/5 of 10 seconds/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '5000')
  })
})
