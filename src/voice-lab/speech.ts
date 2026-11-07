export type RecognitionState =
  'idle' | 'listening' | 'processing' | 'result' | 'error'
export interface SpeechAlternative {
  transcript: string
  confidence: number | null
}
export interface SpeechResult {
  transcript: string
  alternatives: SpeechAlternative[]
  confidence: number | null
  error: string | null
  elapsedMs: number
}
interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<
    ArrayLike<{ transcript: string; confidence?: number }> & {
      isFinal: boolean
    }
  >
}
export interface RecognitionPort {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onaudioend: (() => void) | null
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: { error: string; message?: string }) => void) | null
  onend: (() => void) | null
  start(track?: MediaStreamTrack): void
  abort(): void
}
export type RecognitionFactory = () => RecognitionPort
export function browserRecognitionFactory(): RecognitionFactory | null {
  const browser = window as Window & {
    SpeechRecognition?: new () => RecognitionPort
    webkitSpeechRecognition?: new () => RecognitionPort
  }
  const Constructor =
    browser.SpeechRecognition ?? browser.webkitSpeechRecognition
  return Constructor ? () => new Constructor() : null
}

// One bounded attempt; settles once and invalidates late callbacks before aborting.
export class SpeechAdapter {
  private cancel: (() => void) | null = null
  constructor(private readonly factory: RecognitionFactory | null) {}
  get supported() {
    return this.factory !== null
  }
  start(
    onState: (state: RecognitionState) => void,
    onResult: (result: SpeechResult) => void,
  ): void {
    if (this.cancel) return
    const started = performance.now()
    let recognition: RecognitionPort | null = null
    let finished = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (
      transcript = '',
      alternatives: SpeechAlternative[] = [],
      error: string | null = null,
    ) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      this.cancel = null
      if (recognition) {
        recognition.onstart = recognition.onaudioend = recognition.onend = null
        recognition.onresult = recognition.onerror = null
        try {
          recognition.abort()
        } catch {
          /* already stopped */
        }
      }
      onState(error ? 'error' : 'result')
      onResult({
        transcript,
        alternatives,
        confidence: alternatives[0]?.confidence ?? null,
        error,
        elapsedMs: Math.round(performance.now() - started),
      })
    }
    this.cancel = () => finish('', [], 'aborted')
    try {
      if (!this.factory) {
        finish('', [], 'Speech recognition unsupported')
        return
      }
      recognition = this.factory()
      recognition.lang = 'en-US'
      recognition.continuous = false
      recognition.interimResults = false
      recognition.maxAlternatives = 3
      recognition.onstart = () => onState('listening')
      recognition.onaudioend = () => onState('processing')
      recognition.onresult = (event) => {
        const result = event.results[event.resultIndex]
        if (!result?.isFinal) return
        const alternatives = Array.from(result, (item) => ({
          transcript: item.transcript,
          confidence:
            typeof item.confidence === 'number' &&
            Number.isFinite(item.confidence)
              ? item.confidence
              : null,
        }))
        finish(
          alternatives[0]?.transcript ?? '',
          alternatives,
          alternatives.length ? null : 'no-result',
        )
      }
      recognition.onerror = (event) =>
        finish(
          '',
          [],
          `${event.error}${event.message ? `: ${event.message}` : ''}`,
        )
      recognition.onend = () => finish('', [], 'no-result')
      onState('listening')
      timer = setTimeout(() => finish('', [], 'timeout (10 seconds)'), 10_000)
      recognition.start()
    } catch (error) {
      finish(
        '',
        [],
        error instanceof Error || error instanceof DOMException
          ? `${error.name}: ${error.message}`
          : 'Recognition failed',
      )
    }
  }
  abort() {
    this.cancel?.()
  }
  dispose() {
    // Abort still records a terminal attempt; the UI unsubscribes before disposal.
    this.abort()
  }
}

export function probeTrackValidation(
  factory: RecognitionFactory | null,
): string {
  if (!factory || typeof AudioContext === 'undefined')
    return 'Probe unavailable'
  let context: AudioContext | null = null
  let recognition: RecognitionPort | null = null
  try {
    context = new AudioContext()
    const track = context
      .createMediaStreamDestination()
      .stream.getAudioTracks()[0]
    if (!track) return 'No probe track available'
    track.stop()
    recognition = factory()
    recognition.onerror = () => undefined
    recognition.start(track)
    return 'Ended track accepted/ignored. Track input NOT verified; default mic may have been opened.'
  } catch (error) {
    const named = error instanceof Error || error instanceof DOMException
    return named && error.name === 'InvalidStateError'
      ? 'Ended-track validation observed. Live track routing remains unverified.'
      : `Track rejected: ${named ? error.name : 'unknown error'}. Live routing unverified.`
  } finally {
    try {
      recognition?.abort()
    } catch {
      /* no active recognition */
    }
    void context?.close().catch(() => undefined)
  }
}
