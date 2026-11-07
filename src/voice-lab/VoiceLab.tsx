import { useEffect, useRef, useState } from 'react'
import type { TelemetrySourceStatus } from '../telemetry/HeartRateTelemetrySource'
import { commands, interpret, type Intent } from './commands'
import { useAudioEnvironment } from './environment'
import { createBrowserLabPorts, type LabPorts } from './ports'
import { messages } from './presentation'
import { advanceDemo, demoSteps, startDemo, type DemoState } from './scenario'
import { conditions, summarize, type Attempt, type Condition } from './session'
import {
  browserRecognitionFactory,
  probeTrackValidation,
  type RecognitionState,
} from './speech'
import './voice-lab.css'

interface HrEvent {
  atMs: number
  event: string
  duringVoice: boolean
  visibility: DocumentVisibilityState
}
const percent = (rate: number | null) =>
  rate === null ? '—' : `${Math.round(rate * 100)}%`

export default function VoiceLab({
  createPorts = createBrowserLabPorts,
}: {
  createPorts?: () => LabPorts
}) {
  const ports = useRef<LabPorts | null>(null)
  const active = useRef(false)
  const origin = useRef(performance.now())
  const voiceActive = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const automatic = useRef(false)
  const autoFailures = useRef(0)
  const autoListen = useRef<() => void>(() => undefined)
  const stopForVisibility = useRef<() => void>(() => undefined)
  const [capabilities, setCapabilities] = useState({
    recognition: false,
    synthesis: false,
    hr: false,
    wake: false,
  })
  const [hrStatus, setHrStatus] = useState<TelemetrySourceStatus>({
    state: 'disconnected',
  })
  const [bpm, setBpm] = useState<number | null>(null)
  const hrSnapshot = useRef({
    connected: false,
    bpm: null as number | null,
    samples: 0,
    duringVoice: 0,
  })
  const lastSample = useRef<number | null>(null)
  const [sampleAge, setSampleAge] = useState<number | null>(null)
  const [hrEvents, setHrEvents] = useState<HrEvent[]>([])
  const [recognition, setRecognition] = useState<RecognitionState>('idle')
  const [speaking, setSpeaking] = useState(false)
  const [speechError, setSpeechError] = useState<string | null>(null)
  const [condition, setCondition] = useState<Condition>('Baseline')
  const [expected, setExpected] = useState<Intent>('STATUS')
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const sequence = useRef(0)
  const trialSequence = useRef(0)
  const [rate, setRate] = useState(1)
  const [demo, setDemo] = useState<DemoState | null>(null)
  const [handsFree, setHandsFree] = useState(true)
  const [trackProbe, setTrackProbe] = useState(
    'Not tested; default recognition input is browser-controlled',
  )
  const [observations, setObservations] = useState<
    {
      condition: Condition
      output: string
      intelligibility: string
      notes: string
    }[]
  >([])
  const [notes, setNotes] = useState('')
  const [output, setOutput] = useState('Not checked')
  const [intelligibility, setIntelligibility] = useState('Not rated')
  const audio = useAudioEnvironment()
  const busy = recognition === 'listening' || recognition === 'processing'
  const latest = attempts.at(-1)
  const summary = summarize(attempts)

  useEffect(() => {
    const resources = createPorts()
    ports.current = resources
    active.current = true
    setCapabilities({
      recognition: resources.speech.supported,
      synthesis: resources.voice.supported,
      hr: resources.hr.capability.supported,
      wake: resources.wake.capability.supported,
    })
    let connected = false
    let connectedAt = 0
    let gap = false
    const record = (event: string) =>
      setHrEvents((events) => [
        ...events,
        {
          atMs: Math.round(performance.now() - origin.current),
          event,
          duringVoice: voiceActive.current,
          visibility: document.visibilityState,
        },
      ])
    const unsubscribeStatus = resources.hr.subscribeStatus((status) => {
      if (connected && status.state !== 'connected')
        record(
          `HR connection interrupted: ${status.state}${status.state === 'error' ? ` (${status.error.code})` : ''}`,
        )
      if (!connected && status.state === 'connected') {
        connectedAt = performance.now()
        lastSample.current = null
        gap = false
        record('HR connected')
      }
      connected = status.state === 'connected'
      hrSnapshot.current.connected = connected
      if (!connected) {
        lastSample.current = null
        hrSnapshot.current.bpm = null
        setBpm(null)
        setSampleAge(null)
      }
      setHrStatus(status)
    })
    const unsubscribeSamples = resources.hr.subscribeSamples((sample) => {
      if (gap) {
        record('HR notification stream recovered')
        gap = false
      }
      hrSnapshot.current.bpm = sample.bpm
      hrSnapshot.current.samples += 1
      if (voiceActive.current) hrSnapshot.current.duringVoice += 1
      lastSample.current = performance.now()
      setBpm(sample.bpm)
      setSampleAge(0)
    })
    const interval = setInterval(() => {
      if (!connected) return
      const age = performance.now() - (lastSample.current ?? connectedAt)
      setSampleAge(Math.round(age))
      if (age >= 3000 && !gap) {
        gap = true
        record('HR notification gap ≥ 3 seconds')
      }
    }, 500)
    const visibility = () => {
      void resources.wake.setActive(document.visibilityState === 'visible')
      if (document.visibilityState !== 'visible') stopForVisibility.current()
    }
    const pagehide = () => {
      stopForVisibility.current()
      void resources.hr.disconnect()
      void resources.wake.setActive(false)
    }
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', pagehide)
    visibility()
    return () => {
      active.current = false
      automatic.current = false
      clearTimeout(timer.current)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', pagehide)
      unsubscribeStatus()
      unsubscribeSamples()
      resources.speech.dispose()
      resources.voice.cancel()
      resources.hr.dispose()
      void resources.wake.dispose()
      ports.current = null
    }
  }, [createPorts])

  function stop() {
    automatic.current = false
    clearTimeout(timer.current)
    ports.current?.speech.abort()
    ports.current?.voice.cancel()
    voiceActive.current = false
    setSpeaking(false)
  }
  stopForVisibility.current = stop

  function say(text: string, continueDemo = false) {
    setSpeechError(null)
    setSpeaking(true)
    voiceActive.current = true
    ports.current?.voice.speak(text, rate, (error) => {
      if (!active.current) return
      setSpeaking(false)
      voiceActive.current = false
      setSpeechError(error)
      if (error) automatic.current = false
      if (continueDemo && automatic.current)
        timer.current = setTimeout(() => autoListen.current(), 1500)
    })
  }

  function listen(retry = false) {
    if (
      !ports.current ||
      busy ||
      speaking ||
      document.visibilityState !== 'visible'
    )
      return
    clearTimeout(timer.current)
    const mode = demo && demo.step < demoSteps.length ? 'demo' : 'lab'
    const target = mode === 'demo' ? demoSteps[demo!.step]!.intent : expected
    const previous = attempts.at(-1)
    const canRetry =
      retry &&
      previous?.mode === 'lab' &&
      previous.number === 1 &&
      previous.expected === target &&
      previous.condition === condition
    const startedAtMs = Math.round(performance.now() - origin.current)
    const startSamples = hrSnapshot.current.samples
    const trial = canRetry ? previous.trial : ++trialSequence.current
    voiceActive.current = true
    ports.current.speech.start(setRecognition, (result) => {
      if (!active.current) return
      voiceActive.current = false
      const interpretation = interpret(result.transcript)
      const attempt: Attempt = {
        ...result,
        id: ++sequence.current,
        startedAtMs,
        trial,
        number: canRetry ? 2 : 1,
        condition,
        expected: target,
        mode,
        interpretation,
        hr: {
          source: ports.current!.hr.identity.type,
          connected: hrSnapshot.current.connected,
          bpm: hrSnapshot.current.bpm,
          samplesDuringAttempt: hrSnapshot.current.samples - startSamples,
          sampleAgeMs:
            lastSample.current === null
              ? null
              : Math.round(performance.now() - lastSample.current),
        },
      }
      setAttempts((records) => [...records, attempt])
      if (mode === 'demo' && demo) {
        const next =
          interpretation.intent && !result.error
            ? advanceDemo(demo, interpretation.intent)
            : {
                ...demo,
                message: `Command unclear. Repeat. ${demoSteps[demo.step]!.prompt}`,
              }
        setDemo(next)
        autoFailures.current =
          next.step === demo.step ? autoFailures.current + 1 : 0
        if (
          autoFailures.current >= 2 ||
          result.error?.startsWith('not-allowed') ||
          result.error?.startsWith('service-not-allowed') ||
          next.step >= demoSteps.length
        )
          automatic.current = false
        say(next.message, true)
      }
    })
  }
  autoListen.current = () => listen()

  function beginDemo() {
    stop()
    const next = startDemo()
    autoFailures.current = 0
    automatic.current = handsFree
    setDemo(next)
    say(next.message, true)
  }
  function tapIntent(intent: Intent) {
    if (!demo || busy || speaking) return
    clearTimeout(timer.current)
    const next = advanceDemo(demo, intent)
    if (next.step >= demoSteps.length) automatic.current = false
    setDemo(next)
    say(next.message, true)
  }
  function download() {
    const report = {
      schemaVersion: 1,
      capabilities,
      browser: {
        userAgent: navigator.userAgent,
        secureContext: globalThis.isSecureContext,
      },
      audio: {
        permission: audio.permission,
        inputNames: audio.inputs,
        captureTrackName: audio.captureLabel,
        trackProbe,
        recognitionInput: 'Browser-controlled; not identified',
        output,
        intelligibility,
      },
      condition,
      notes,
      summary,
      byCondition: conditions.map((name) => ({
        condition: name,
        ...summarize(attempts.filter((a) => a.condition === name)),
      })),
      attempts,
      hrEvents,
      hrSamples: hrSnapshot.current,
      observations,
      demo,
      hardwareValidation:
        'Tester must assess exported evidence; no automatic validation',
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = 'thrumshift-voice-lab.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <main className="voice-lab">
      <header>
        <p className="equipment-label">THRUMSHIFT / DISPOSABLE SPIKE</p>
        <h1>Voice Lab</h1>
        <p>No mission progress. Session stays in this tab until reload.</p>
        <a href="/">Return to station access</a>
        <nav aria-label="Lab sections">
          <a href="#command-test">Command test</a>
          <a href="#interaction-demo">Demo</a>
          <a href="#session-results">Results</a>
        </nav>
      </header>
      <aside className="lab-monitor" aria-label="Live lab status">
        <div className="lab-status">
          <strong>HR: {hrStatus.state}</strong>
          <strong>
            {hrStatus.state === 'connected' &&
            bpm !== null &&
            (sampleAge ?? 0) < 3000
              ? `${bpm} BPM`
              : '— BPM'}
          </strong>
          <span>
            {sampleAge === null
              ? 'No HR samples'
              : `Last sample ${Math.round(sampleAge / 1000)}s ago${sampleAge >= 3000 ? ' · SIGNAL GAP' : ''}`}
          </span>
        </div>
      </aside>
      <section aria-labelledby="voice-environment">
        <h2 id="voice-environment">A · Environment</h2>
        {hrStatus.state === 'error' ? (
          <p role="alert">{hrStatus.error.message}</p>
        ) : null}
        <button
          disabled={
            !capabilities.hr ||
            hrStatus.state === 'connecting' ||
            hrStatus.state === 'connected'
          }
          onClick={() => void ports.current?.hr.connect()}
        >
          Connect HR strap
        </button>
        <button
          disabled={hrStatus.state !== 'connected'}
          onClick={() => void ports.current?.hr.disconnect()}
        >
          Disconnect HR
        </button>
        {!capabilities.hr ? (
          <p>
            Web Bluetooth unavailable. Requires compatible Chrome on HTTPS or
            localhost.
          </p>
        ) : null}
        <p>
          Recognition: {capabilities.recognition ? 'supported' : 'unsupported'}{' '}
          · Synthesis: {capabilities.synthesis ? 'supported' : 'unsupported'}
        </p>
        <p>Microphone permission: {audio.permission}</p>
        <p>
          Screen awake:{' '}
          {capabilities.wake
            ? 'requested while visible; OS may release or reject'
            : 'unsupported'}
        </p>
        <label>
          Run condition
          <select
            value={condition}
            disabled={busy || speaking || demo !== null}
            onChange={(e) => setCondition(e.target.value as Condition)}
          >
            {conditions.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <details>
          <summary>Microphone & API inspection</summary>
          <p>
            Chrome chooses recognition input. A listed Pixel Buds input does not
            prove recognition uses it. Audio output follows Android routing.
          </p>
          <button
            disabled={busy || speaking}
            onClick={() => void audio.inspect()}
          >
            Inspect microphone (permission prompt)
          </button>
          <p>
            Temporary capture track: {audio.captureLabel}. Capture is stopped
            immediately; this is not the recognition track.
          </p>
          <ul>
            {audio.inputs.map((name, i) => (
              <li key={i}>{name}</li>
            ))}
          </ul>
          {audio.inputs.length === 0 ? <p>No input names exposed.</p> : null}
          {audio.error ? <p role="alert">{audio.error}</p> : null}
          <button
            disabled={busy || speaking || !capabilities.recognition}
            onClick={() =>
              setTrackProbe(probeTrackValidation(browserRecognitionFactory()))
            }
          >
            Probe ended audio-track validation
          </button>
          <p>{trackProbe}</p>
          <p>
            The probe may briefly open default recognition if a browser ignores
            its track argument. It aborts immediately. Validation alone does not
            prove live input routing.
          </p>
        </details>
      </section>
      <section id="command-test" aria-labelledby="voice-recognition">
        <h2 id="voice-recognition">B · Recognition</h2>
        <label>
          Expected command
          <select
            value={expected}
            disabled={busy || speaking || demo !== null}
            onChange={(e) => setExpected(e.target.value as Intent)}
          >
            {commands.map((c) => (
              <option key={c.intent} value={c.intent}>
                {c.phrase}
              </option>
            ))}
          </select>
        </label>
        <p>
          Say:{' '}
          <strong>
            {
              commands.find(
                (c) =>
                  c.intent ===
                  (demo && demo.step < demoSteps.length
                    ? demoSteps[demo.step]!.intent
                    : expected),
              )!.phrase
            }
          </strong>
        </p>
        <p>
          English (US). One command, up to 10 seconds. Browser recognition may
          use its vendor’s online service.
        </p>
        <div className="lab-readout" role="status" aria-live="polite">
          <strong className="lab-state">
            {speaking ? 'SPEAKING' : recognition.toUpperCase()}
          </strong>
          <p>HEARD</p>
          <blockquote>{busy ? '…' : latest?.transcript || '—'}</blockquote>
          <p>INTERPRETED</p>
          <strong>
            {busy
              ? '—'
              : commands
                  .find((c) => c.intent === latest?.interpretation.intent)
                  ?.phrase.toUpperCase() ||
                (latest ? 'COMMAND UNCLEAR — TRY AGAIN' : '—')}
          </strong>
          {!busy && latest?.error ? <p>{latest.error}</p> : null}
        </div>
        <button
          className="lab-primary"
          disabled={
            !capabilities.recognition ||
            busy ||
            speaking ||
            (demo !== null && demo.step >= demoSteps.length)
          }
          onClick={() => listen()}
        >
          {demo && demo.step < demoSteps.length
            ? 'Speak demo command'
            : 'Speak command · new trial'}
        </button>
        {latest?.mode === 'lab' &&
        latest.number === 1 &&
        latest.expected === expected &&
        latest.condition === condition &&
        latest.interpretation.intent !== expected ? (
          <button
            disabled={busy || speaking || demo !== null}
            onClick={() => listen(true)}
          >
            Retry last trial · attempt 2
          </button>
        ) : null}
        <button onClick={stop}>Stop listening / speech / auto turns</button>
      </section>
      <section aria-labelledby="voice-parser">
        <h2 id="voice-parser">C · Interpretation</h2>
        <p>
          Whole phrases and safe aliases only. Fuzzy matching disabled. Only the
          browser’s top transcript is interpreted; alternatives never choose the
          expected answer.
        </p>
        {latest ? (
          <>
            <p>Normalized: {latest.interpretation.normalized || '—'}</p>
            <p>
              {latest.interpretation.status} · {latest.interpretation.match} ·{' '}
              {latest.elapsedMs} ms · Confidence:{' '}
              {latest.confidence ?? 'not exposed'}
            </p>
            <details>
              <summary>
                Heard alternatives & attempt history ({attempts.length})
              </summary>
              <pre>{JSON.stringify(attempts, null, 2)}</pre>
            </details>
          </>
        ) : null}
      </section>
      <section aria-labelledby="voice-synthesis">
        <h2 id="voice-synthesis">D · Spoken responses</h2>
        <label>
          Speaking rate
          <select
            value={rate}
            disabled={speaking || busy}
            onChange={(e) => setRate(Number(e.target.value))}
          >
            <option value={1}>Normal</option>
            <option value={0.85}>Slightly slower</option>
          </select>
        </label>
        {messages.map((message) => (
          <button
            key={message}
            disabled={!capabilities.synthesis || busy || demo !== null}
            onClick={() => say(message)}
          >
            {message}
          </button>
        ))}
        {speechError ? <p role="alert">Speech: {speechError}</p> : null}
      </section>
      <section id="interaction-demo" aria-labelledby="voice-demo">
        <h2 id="voice-demo">Tiny interaction demo</h2>
        <p>
          Five equipment decisions. Disposable, non-canonical exercise; no HR
          branching. Wait for LISTENING before speaking. Automatic turns pause
          after two unclear/unavailable commands or a speech error.
        </p>
        <label className="lab-check">
          <input
            type="checkbox"
            checked={handsFree}
            disabled={demo !== null}
            onChange={(e) => setHandsFree(e.target.checked)}
          />
          Automatic bounded turns (hands free)
        </label>
        <button
          disabled={busy || speaking || !capabilities.synthesis}
          onClick={beginDemo}
        >
          Start / restart demo
        </button>
        {demo ? (
          <>
            <p role="status">
              {demo.step}/{demoSteps.length} decisions · {demo.message}
            </p>
            {demo.step < demoSteps.length ? (
              <>
                <p>
                  Valid now:{' '}
                  {
                    commands.find(
                      (c) => c.intent === demoSteps[demo.step]!.intent,
                    )!.phrase
                  }
                  , Repeat
                </p>
                <button
                  disabled={busy || speaking}
                  onClick={() => {
                    automatic.current = handsFree
                    autoFailures.current = 0
                    listen()
                  }}
                >
                  Resume voice turns
                </button>
                {[demoSteps[demo.step]!.intent, 'REPEAT' as const].map(
                  (intent) => (
                    <button
                      key={intent}
                      disabled={busy || speaking}
                      onClick={() => tapIntent(intent)}
                    >
                      {commands.find((c) => c.intent === intent)!.phrase}
                    </button>
                  ),
                )}
              </>
            ) : (
              <p>
                Exercise complete. Voice attempts are recorded separately from
                scored lab trials.
              </p>
            )}
            <button
              onClick={() => {
                stop()
                setDemo(null)
              }}
            >
              Exit demo
            </button>
          </>
        ) : null}
      </section>
      <section id="session-results" aria-labelledby="voice-results">
        <h2 id="voice-results">Session results</h2>
        <p>
          {summary.trials} trials · First attempt{' '}
          {percent(summary.firstAttemptRate)} · Within two{' '}
          {percent(summary.withinTwoRate)} · Wrong intents{' '}
          {summary.wrongIntents} · Recognition errors {summary.errors.length}
        </p>
        <p>
          A trial starts with “new trial” and permits one explicit retry.
          Missing retries count as failures. Correct means interpreted intent
          equals expected intent, not confidence. Demo/taps do not improve these
          rates.
        </p>
        <div className="lab-table">
          <table>
            <caption>
              Lab trials across all conditions; JSON also groups by condition
            </caption>
            <thead>
              <tr>
                <th>Command</th>
                <th>Attempts</th>
                <th>First</th>
                <th>Eventual</th>
                <th>Failures</th>
                <th>Unclear</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row) => (
                <tr key={row.command}>
                  <th scope="row">{row.command}</th>
                  <td>{row.attempts}</td>
                  <td>{row.firstPass}</td>
                  <td>{row.eventual}</td>
                  <td>{row.failures}</td>
                  <td>{row.unclear}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          HR interruptions/gaps:{' '}
          {hrEvents.filter((e) => /interrupted|gap/.test(e.event)).length} ·
          During voice:{' '}
          {
            hrEvents.filter(
              (e) => /interrupted|gap/.test(e.event) && e.duringVoice,
            ).length
          }
          . Timing correlation is not proof of cause.
        </p>
        <details>
          <summary>HR event log</summary>
          <pre>{JSON.stringify(hrEvents, null, 2)}</pre>
        </details>
        <label>
          Heard audio output
          <select value={output} onChange={(e) => setOutput(e.target.value)}>
            {[
              'Not checked',
              'Phone speaker',
              'Pixel Buds',
              'Other / unclear',
            ].map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Response intelligibility
          <select
            value={intelligibility}
            onChange={(e) => setIntelligibility(e.target.value)}
          >
            {[
              'Not rated',
              'Clear',
              'Sometimes unclear',
              'Hard to understand',
            ].map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Tester notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Phone/Chrome, pace, breathing, false positives, Buds comparison, natural/frustrating, play another?"
          />
        </label>
        <button
          onClick={() =>
            setObservations((items) => [
              ...items,
              { condition, output, intelligibility, notes },
            ])
          }
        >
          Save observation for {condition}
        </button>
        <p>{observations.length} labelled observations saved in this tab.</p>
        <button onClick={download}>Download session JSON</button>
        <p>
          No persistence or analytics. Download before reload. Actual phone,
          treadmill, Pixel Buds and HR testing is still required.
        </p>
      </section>
    </main>
  )
}
