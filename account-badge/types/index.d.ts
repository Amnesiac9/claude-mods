export type Account = { label: string; isSignedIn: boolean }

declare module 'claude-code' {
  interface PluginState {
    'account-badge': { account: Account | null }
  }
}
