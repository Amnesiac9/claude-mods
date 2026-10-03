export type ContextSource = { name: string; tokens: number; color: string; kind: 'used' | 'free' | 'buffer' }

// The /context breakdown, measured against the compaction window.
export type ContextBreakdown = { total: number; window: number; percent: number; sources: ContextSource[] }

export type ContextFill = {
  tokens: number | null
  window: number
  percent: number | null
  breakdown: ContextBreakdown | null
}

declare module 'claude-code' {
  interface PluginState {
    'context-bar': { fill: ContextFill | null }
  }
}
