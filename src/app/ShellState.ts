export interface ShellMissionState {
  readonly placeholder: 'mission'
}

export interface ShellResult {
  readonly outcome: 'success' | 'failure'
}

export const freshShellMission = (): ShellMissionState => ({
  placeholder: 'mission',
})
