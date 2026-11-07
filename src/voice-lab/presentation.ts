export const messages = [
  'Auxiliary pump online.',
  'Warning. Bus B load increasing.',
  'Reactor temperature critical.',
  'Command unclear. Repeat.',
  'Primary cooling offline. Auxiliary circulation available.',
] as const

export interface VoicePresentation {
  readonly supported: boolean
  speak(text: string, rate: number, done: (error: string | null) => void): void
  cancel(): void
}
export function browserPresentation(): VoicePresentation {
  const supported =
    typeof window.speechSynthesis !== 'undefined' &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  let current: SpeechSynthesisUtterance | null = null
  return {
    supported,
    speak(text, rate, done) {
      this.cancel()
      if (!supported) {
        done('Speech synthesis unsupported')
        return
      }
      const utterance = new SpeechSynthesisUtterance(text)
      current = utterance
      utterance.lang = 'en-US'
      utterance.rate = rate
      utterance.onend = () => {
        if (current === utterance) {
          current = null
          done(null)
        }
      }
      utterance.onerror = (event) => {
        if (current === utterance) {
          current = null
          done(event.error)
        }
      }
      window.speechSynthesis.speak(utterance)
    },
    cancel() {
      current = null
      if (supported) window.speechSynthesis.cancel()
    },
  }
}
