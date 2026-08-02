export interface ShellMissionState {
  readonly placeholder: 'mission'
}

export const freshShellMission = (): ShellMissionState => ({
  placeholder: 'mission',
})
