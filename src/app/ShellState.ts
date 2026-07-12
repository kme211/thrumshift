export interface ShellWarmupState {
  readonly placeholder: 'warmup'
}

export interface ShellMissionState {
  readonly placeholder: 'mission'
}

export interface ShellResult {
  readonly outcome: 'success' | 'failure'
}

export const freshShellWarmup = (): ShellWarmupState => ({
  placeholder: 'warmup',
})

export const freshShellMission = (): ShellMissionState => ({
  placeholder: 'mission',
})
