export type ContextFill = { tokens: number | null; window: number; percent: number | null }

declare module 'claude-code' {
  interface PluginState {
    'context-bar': { fill: ContextFill | null }
  }
}
