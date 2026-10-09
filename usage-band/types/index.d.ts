export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Usage = {
  limits: Limit[]
  costUsd: number | null
  contextPercent: number | null
  startedAt: number | null
}

export type GitState = {
  added: number
  removed: number
  dirty: number
  ahead: number
  behind: number
}

export type Info = {
  model: string | null
  project: string | null
  branch: string | null
  git: GitState | null
}

export type Activity = { since: number | null; tools: number; files: string[] }

export type Mood =
  | 'idle'
  | 'think'
  | 'code'
  | 'read'
  | 'bash'
  | 'web'
  | 'agent'
  | 'done'
  | 'error'
  | 'alert'
  | 'sleep'
  | 'party'
  | 'love'
  | 'hello'
  | 'giggle'
  | 'boing'
  | 'surprise'
  | 'dizzy'

export type Mascot = {
  running: { [toolUseId: string]: Mood }
  flash: { mood: Mood; until: number } | null
  lastActivity: number | null
  /** Jusqu'à quand la souris est sur Pixel (null quand elle en est sortie). */
  hoverUntil: number | null
  /** Heures des derniers clics, pour repérer quand on l'embête. */
  pokes: number[]
  /** Nombre de clics, pour varier ses réactions. */
  pokeCount: number
}

export type InfoKey =
  | 'modele'
  | 'projet'
  | 'branche'
  | 'git'
  | 'duree'
  | 'cout'
  | 'outils'
  | 'fichiers'
  | 'etat'
  | 'contexte'
  | 'limites'
  | 'reset'
  | 'mascotte'

export type Prefs = { isHidden: boolean; overrides: { [K in InfoKey]?: boolean } }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': {
      usage: Usage | null
      info: Info
      activity: Activity
      prefs: Prefs
      mascot: Mascot
      tick: number
    }
  }
}
