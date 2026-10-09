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

export type CronJob = { id: string; cron: string; prompt: string; recurring: boolean }

export type Wakeup = { at: number; reason: string | null; prompt: string | null }

export type TaskItem = {
  id: string
  subject: string
  activeForm: string | null
  status: 'pending' | 'in_progress' | 'completed'
}

export type Background = { type: string; description: string }

export type Schedule = {
  crons: CronJob[]
  wakeup: Wakeup | null
  /** Combien de fois chaque prompt programmé s'est déclenché. */
  fires: { [prompt: string]: number }
  tasks: TaskItem[]
  background: Background[]
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
  | 'boucles'
  | 'taches'
  | 'arriereplan'
  | 'mascotte'

/** Ce qu'on règle depuis le panneau ; absent, la valeur par défaut du code. */
export type StyleOverrides = {
  segments?: number
  warnAt?: number
  alertAt?: number
  palette?: string
  flashSeconds?: number
  /** 0 : Pixel ne s'endort jamais. */
  sleepAfterMinutes?: number
}

export type Prefs = {
  isHidden: boolean
  overrides: { [K in InfoKey]?: boolean }
  style?: StyleOverrides
}

declare module 'claude-code' {
  interface PluginState {
    'usage-band': {
      usage: Usage | null
      info: Info
      activity: Activity
      prefs: Prefs
      mascot: Mascot
      schedule: Schedule
      tick: number
    }
  }
}
