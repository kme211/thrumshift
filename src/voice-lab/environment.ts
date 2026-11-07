import { useEffect, useState } from 'react'

export function useAudioEnvironment() {
  const [permission, setPermission] = useState('unknown')
  const [inputs, setInputs] = useState<string[]>([])
  const [captureLabel, setCaptureLabel] = useState('Not inspected')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    let status: PermissionStatus | undefined
    const update = () => {
      if (active && status) setPermission(status.state)
    }
    void navigator.permissions
      ?.query({ name: 'microphone' as PermissionName })
      .then((result) => {
        if (!active) return
        status = result
        update()
        status.addEventListener('change', update)
      })
      .catch(() => {
        if (active) setPermission('Not exposed by Permissions API')
      })
    const refresh = () => {
      void navigator.mediaDevices
        ?.enumerateDevices()
        .then((devices) => {
          if (active)
            setInputs(
              devices
                .filter((d) => d.kind === 'audioinput')
                .map((d, i) => d.label || `Input ${i + 1} (name hidden)`),
            )
        })
        .catch(() => {
          if (active) setError('Input enumeration unavailable')
        })
    }
    refresh()
    navigator.mediaDevices?.addEventListener('devicechange', refresh)
    return () => {
      active = false
      status?.removeEventListener('change', update)
      navigator.mediaDevices?.removeEventListener('devicechange', refresh)
    }
  }, [])
  async function inspect() {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        'Microphone inspection requires getUserMedia on HTTPS or localhost',
      )
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      try {
        setCaptureLabel(
          stream.getAudioTracks()[0]?.label || 'Capture track name hidden',
        )
      } finally {
        stream.getTracks().forEach((track) => track.stop())
      }
      const devices = await navigator.mediaDevices.enumerateDevices()
      setInputs(
        devices
          .filter((d) => d.kind === 'audioinput')
          .map((d, i) => d.label || `Input ${i + 1} (name hidden)`),
      )
      // A successful capture does not establish the separate recognition permission.
      setPermission('Capture granted; recognition permission is separate')
    } catch (cause) {
      setError(
        cause instanceof Error || cause instanceof DOMException
          ? `${cause.name}: ${cause.message}`
          : 'Microphone inspection failed',
      )
    }
  }
  return { permission, inputs, captureLabel, error, inspect }
}
