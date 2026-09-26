interface TargetRangeFieldsProps {
  readonly lower: string
  readonly upper: string
  readonly error: string | null
  readonly variant?: 'default' | 'equipment'
  readonly onChange: (field: 'lower' | 'upper', value: string) => void
  readonly onCommit: () => void
}

export function TargetRangeFields({
  lower,
  upper,
  error,
  variant = 'default',
  onChange,
  onCommit,
}: TargetRangeFieldsProps) {
  const equipment = variant === 'equipment'
  return (
    <fieldset
      className={equipment ? 'target-range target-range--equipment' : 'mt-6'}
    >
      <legend className={equipment ? undefined : 'font-semibold'}>
        Gameplay target range
      </legend>
      <div
        className={
          equipment ? 'target-range__fields' : 'mt-3 grid gap-3 sm:grid-cols-2'
        }
      >
        {(['lower', 'upper'] as const).map((field) => (
          <label key={field}>
            <span
              className={equipment ? undefined : 'block text-sm capitalize'}
            >
              {field} BPM
            </span>
            <input
              className={
                equipment
                  ? undefined
                  : 'mt-1 min-h-12 w-full border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 text-lg'
              }
              inputMode="numeric"
              type="number"
              min="40"
              max="220"
              value={field === 'lower' ? lower : upper}
              aria-describedby={
                error === null ? undefined : 'target-range-error'
              }
              aria-invalid={error !== null}
              onChange={(event) => onChange(field, event.currentTarget.value)}
              onBlur={onCommit}
            />
          </label>
        ))}
      </div>
      {error === null ? null : (
        <p
          id="target-range-error"
          className={equipment ? 'target-range__error' : 'mt-2'}
          role="alert"
        >
          {error}
        </p>
      )}
    </fieldset>
  )
}
