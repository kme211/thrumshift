import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BrowserMonotonicClock } from '../platform/Clock'
import { SimulatedHeartRateSource } from '../telemetry/simulated/SimulatedHeartRateSource'
import VoiceLab from './VoiceLab'
import { SpeechAdapter, type RecognitionPort } from './speech'

function setup() {
  const hr = new SimulatedHeartRateSource(
    new BrowserMonotonicClock(performance),
  )
  const recognition: RecognitionPort = {
    lang: '',
    continuous: true,
    interimResults: true,
    maxAlternatives: 1,
    onstart: null,
    onaudioend: null,
    onresult: null,
    onerror: null,
    onend: null,
    start: vi.fn(),
    abort: vi.fn(),
  }
  const wake = {
    capability: { supported: true as const },
    setActive: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  }
  let finishSpeech: (error: string | null) => void = () => {}
  const voice = {
    supported: true,
    cancel: vi.fn(),
    speak: vi.fn(
      (_text: string, _rate: number, done: (error: string | null) => void) => {
        finishSpeech = done
      },
    ),
  }
  const result = render(
    <VoiceLab
      createPorts={() => ({
        hr,
        wake,
        voice,
        speech: new SpeechAdapter(() => recognition),
      })}
    />,
  )
  const heard = (transcript: string) =>
    act(() =>
      recognition.onresult?.({
        resultIndex: 0,
        results: [
          Object.assign([{ transcript, confidence: 0.9 }], { isFinal: true }),
        ],
      }),
    )
  return {
    ...result,
    hr,
    wake,
    recognition,
    voice,
    heard,
    finishSpeech: () => act(() => finishSpeech(null)),
  }
}
afterEach(() => vi.useRealTimers())
it('keeps telemetry alive during voice, logs a gap and disconnect, scores an explicit retry, and cleans up', async () => {
  vi.useFakeTimers()
  const lab = setup()
  fireEvent.click(screen.getByRole('button', { name: 'Connect HR strap' }))
  act(() => lab.hr.startContinuousSamples(110, 1000))
  fireEvent.click(
    screen.getByRole('button', { name: 'Speak command · new trial' }),
  )
  act(() => vi.advanceTimersByTime(2000))
  expect(screen.getByText('110 BPM')).toBeInTheDocument()
  lab.heard('scan power')
  expect(screen.getByText('SCAN POWER')).toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry last trial · attempt 2' }),
  )
  lab.heard('give me status')
  expect(
    screen.getByText(/1 trials · First attempt 0% · Within two 100%/),
  ).toBeInTheDocument()
  act(() => lab.hr.stopContinuousSamples())
  fireEvent.click(
    screen.getByRole('button', { name: 'Speak command · new trial' }),
  )
  act(() => vi.advanceTimersByTime(3500))
  expect(screen.getByText(/SIGNAL GAP/)).toBeInTheDocument()
  act(() => {
    void lab.hr.disconnect()
  })
  expect(
    screen.getByText(/HR interruptions\/gaps: 2 · During voice: 2/),
  ).toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Stop listening / speech / auto turns',
    }),
  )
  expect(screen.getByText('aborted')).toBeInTheDocument()
  lab.unmount()
  expect(lab.wake.dispose).toHaveBeenCalledOnce()
  expect(lab.voice.cancel).toHaveBeenCalled()
  expect(lab.recognition.onresult).toBeNull()
})
it('completes five hands-free bounded turns without scoring demo as lab trials', () => {
  vi.useFakeTimers()
  const lab = setup()
  fireEvent.click(screen.getByRole('button', { name: 'Start / restart demo' }))
  for (const command of [
    'scan cooling',
    'start auxiliary pump',
    'status',
    'scan power',
    'route power to cooling',
  ]) {
    lab.finishSpeech()
    act(() => vi.advanceTimersByTime(1500))
    expect(screen.getByText('LISTENING')).toBeInTheDocument()
    lab.heard(command)
  }
  lab.finishSpeech()
  expect(screen.getByText(/5\/5 decisions/)).toBeInTheDocument()
  expect(screen.getByText(/0 trials · First attempt —/)).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(20000))
  expect(lab.recognition.start).toHaveBeenCalledTimes(5)
})
it('aborts on background and releases screen awake without restarting automatic turns', () => {
  vi.useFakeTimers()
  const lab = setup()
  fireEvent.click(screen.getByRole('button', { name: 'Start / restart demo' }))
  lab.finishSpeech()
  act(() => vi.advanceTimersByTime(1500))
  const visibility = vi
    .spyOn(document, 'visibilityState', 'get')
    .mockReturnValue('hidden')
  fireEvent(document, new Event('visibilitychange'))
  expect(lab.recognition.abort).toHaveBeenCalled()
  expect(lab.wake.setActive).toHaveBeenLastCalledWith(false)
  act(() => vi.advanceTimersByTime(20000))
  expect(lab.recognition.start).toHaveBeenCalledTimes(1)
  visibility.mockRestore()
})
