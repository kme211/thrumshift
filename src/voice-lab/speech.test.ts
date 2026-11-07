import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpeechAdapter, type RecognitionPort } from './speech'

function fakeRecognition(): RecognitionPort {
  return {
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
}
afterEach(() => vi.useRealTimers())
describe('bounded speech adapter', () => {
  it('returns raw alternatives/confidence once, without reordering toward an expected command', () => {
    const port = fakeRecognition()
    const adapter = new SpeechAdapter(() => port)
    const state = vi.fn(),
      result = vi.fn()
    adapter.start(state, result)
    expect(port.continuous).toBe(false)
    expect(port.interimResults).toBe(false)
    port.onaudioend?.()
    expect(state).toHaveBeenLastCalledWith('processing')
    const callback = port.onresult!
    const end = port.onend!
    const alternatives = Object.assign(
      [
        { transcript: 'Stop auxiliary pump', confidence: 0.51 },
        { transcript: 'Start auxiliary pump', confidence: 0.49 },
      ],
      { isFinal: true },
    )
    callback({ resultIndex: 0, results: [alternatives] })
    end()
    callback({ resultIndex: 0, results: [alternatives] })
    expect(result).toHaveBeenCalledTimes(1)
    expect(result.mock.calls[0]![0]).toMatchObject({
      transcript: 'Stop auxiliary pump',
      confidence: 0.51,
      error: null,
    })
    expect(port.abort).toHaveBeenCalledOnce()
    expect(port.onresult).toBeNull()
  })
  it('bounds silence, permits retry, and ignores late callbacks after timeout', () => {
    vi.useFakeTimers()
    const port = fakeRecognition(),
      result = vi.fn()
    const adapter = new SpeechAdapter(() => port)
    adapter.start(vi.fn(), result)
    const late = port.onerror!
    vi.advanceTimersByTime(10000)
    late({ error: 'network' })
    expect(result).toHaveBeenCalledTimes(1)
    expect(result.mock.calls[0]![0].error).toContain('timeout')
    adapter.start(vi.fn(), result)
    port.onerror?.({ error: 'not-allowed', message: 'Permission denied' })
    expect(result.mock.calls[1]![0].error).toBe(
      'not-allowed: Permission denied',
    )
  })
  it('records cancellation and no-result; synchronous failures remain retryable', () => {
    const port = fakeRecognition(),
      result = vi.fn()
    const adapter = new SpeechAdapter(() => port)
    adapter.start(vi.fn(), result)
    adapter.abort()
    adapter.dispose()
    expect(result).toHaveBeenCalledTimes(1)
    expect(result.mock.calls[0]![0].error).toBe('aborted')
    adapter.start(vi.fn(), result)
    port.onend?.()
    expect(result.mock.calls[1]![0].error).toBe('no-result')
    vi.mocked(port.start).mockImplementation(() => {
      throw new DOMException('No input', 'InvalidStateError')
    })
    adapter.start(vi.fn(), result)
    expect(result.mock.calls[2]![0].error).toContain('InvalidStateError')
  })
  it('reports unsupported without constructing a browser API', () => {
    const result = vi.fn()
    new SpeechAdapter(null).start(vi.fn(), result)
    expect(result.mock.calls[0]![0].error).toContain('unsupported')
  })
})
