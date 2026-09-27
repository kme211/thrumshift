const SEGMENT_INDEXES = Array.from({ length: 10 }, (_, index) => index)

export type IndicatorBankTone = 'healthy' | 'degraded' | 'critical'

export function SegmentedIndicatorBank({
  litSegments,
  tone,
  className,
}: {
  readonly litSegments: number
  readonly tone: IndicatorBankTone
  readonly className?: string
}) {
  const normalizedLitSegments = Math.max(
    0,
    Math.min(SEGMENT_INDEXES.length, Math.floor(litSegments)),
  )

  return (
    <div
      className={['segmented-indicator-bank', className]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
      data-tone={tone}
    >
      {SEGMENT_INDEXES.map((index) => (
        <span
          key={index}
          className="segmented-indicator-bank__lamp"
          data-lit={index < normalizedLitSegments ? 'true' : 'false'}
        />
      ))}
    </div>
  )
}
