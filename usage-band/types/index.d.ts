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

export type Reactions = { click: boolean; thanks: boolean; party: boolean; errors: boolean }

/** Ce qu'on règle depuis le panneau ; absent, la valeur par défaut du code. */
export type StyleOverrides = {
  // Disposition
  separator?: 'space' | 'dot' | 'bar'
  labels?: 'short' | 'long'
  currency?: 'usd' | 'eur'
  // Jauges
  shape?: 'squares' | 'pill' | 'dots' | 'thin'
  segments?: number
  size?: 'small' | 'medium' | 'large'
  percent?: 'left' | 'used'
  warnAt?: number
  alertAt?: number
  // Couleurs
  palette?: string
  accent?: string
  costAccent?: boolean
  // Pixel
  pixelColor?: string
  pixelSize?: 'small' | 'normal' | 'large'
  pixelSide?: 'right' | 'left'
  reactions?: Partial<Reactions>
  flashSeconds?: number
  /** 0 : Pixel ne s'endort jamais. */
  sleepAfterMinutes?: number
  // Alertes (0 : désactivée)
  alertLimitAt?: number
  alertContextBelow?: number
  alertLoopEnd?: boolean
}

/** Les blocs qu'on range dans le bandeau. */
export type BlockId =
  | 'etat'
  | 'modele'
  | 'projet'
  | 'git'
  | 'duree'
  | 'cout'
  | 'activite'
  | 'contexte'
  | 'limite5h'
  | 'limite7j'
  | 'autres'
  | 'boucles'
  | 'taches'
  | 'arriereplan'

export type PanelTab = 'disposition' | 'style' | 'pixel' | 'alertes'

export type Prefs = {
  isHidden: boolean
  overrides: { [K in InfoKey]?: boolean }
  style?: StyleOverrides
  /** Les lignes du bandeau, chacune avec ses blocs dans l'ordre ; un bloc absent est masqué. */
  layout?: BlockId[][]
  /** `/bandeau diagnostic` : note ce que Claude Code transmet pour les boucles. */
  diagnostic?: boolean
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
      /** Alertes déjà envoyées, pour n'en envoyer qu'une par seuil. */
      alerts: string[]
      /** Le panneau de réglages : onglet ouvert et bloc sélectionné. */
      panel: { tab: PanelTab; selected: BlockId | null }
      tick: number
    }
  }
}
