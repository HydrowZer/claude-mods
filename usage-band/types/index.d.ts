export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Usage = {
  limits: Limit[]
  costUsd: number | null
  contextPercent: number | null
  startedAt: number | null
}

export type Info = { model: string | null; project: string | null; branch: string | null }

export type Activity = { since: number | null; tools: number; files: string[] }

export type InfoKey =
  | 'modele'
  | 'projet'
  | 'branche'
  | 'duree'
  | 'cout'
  | 'outils'
  | 'fichiers'
  | 'etat'
  | 'contexte'
  | 'limites'
  | 'reset'

export type Prefs = { isHidden: boolean; overrides: { [K in InfoKey]?: boolean } }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': {
      usage: Usage | null
      info: Info
      activity: Activity
      prefs: Prefs
      tick: number
    }
  }
}
