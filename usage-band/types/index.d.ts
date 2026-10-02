export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Usage = { limits: Limit[]; costUsd: number | null }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { usage: Usage | null }
  }
}
