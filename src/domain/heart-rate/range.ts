export function isValidHeartRateBpm(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value > 0
}
