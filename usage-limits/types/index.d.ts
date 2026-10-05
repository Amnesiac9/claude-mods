export type LimitKind = 'five_hour' | 'seven_day'

// resetsAt in epoch ms, null when the response gave none.
export type Limit = { kind: LimitKind; percent: number; resetsAt: number | null }

// `now` is minute-rounded, so the reset countdown redraws once a minute.
export type Limits = { windows: Limit[]; now: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-limits': { limits: Limits | null }
  }
}
