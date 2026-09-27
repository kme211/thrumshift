import type { RangeClassification } from '../../domain/heart-rate/classifier'

export function rangeClassificationIndicator(
  classification: RangeClassification | null,
): '▲' | '▼' | '◆' | '◇' {
  if (classification === 'above') return '▲'
  if (classification === 'below') return '▼'
  if (classification === 'operational') return '◆'
  return '◇'
}
