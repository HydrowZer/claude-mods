import { atom, read, update } from 'claude-code'
import type {
  BoxProps,
  ClientProps,
  ElementConstructor,
  EngineInterface,
  Register,
  RenderElement,
  SessionContextUsage,
  SessionCost,
  SessionRateLimit,
  SvgProps,
  TextProps,
} from 'claude-code'

import type {
  Activity,
  BlockId,
  CronJob,
  GitState,
  Info,
  InfoKey,
  Limit,
  Mascot,
  Mood,
  PanelTab,
  Prefs,
  Schedule,
  StyleOverrides,
  TaskItem,
  Usage,
} from '../types'
import { MASCOT_HEIGHT, MASCOT_WIDTH, MOODS, mascotSvg } from './mascot'
import { describeCron, loopLabel, minutes, nextFire, shorten, until } from './schedule'

// ─── Réglages ────────────────────────────────────────────────────────────────
// Tout se personnalise ici : le bandeau se recharge à chaque enregistrement.
// `/bandeau masquer <info>` et `/bandeau afficher <info>` changent ce qui est
// affiché sans toucher au code, et s'en souviennent d'une session à l'autre.

/** Infos affichées par défaut, dans l'ordre du bandeau. */
const DEFAULT_SHOW: Record<InfoKey, boolean> = {
  etat: false, // ● en cours / ● prêt
  modele: true, // Opus 5.5
  projet: true, // nom du dossier
  branche: true, // branche git
  git: true, // +124 −37 · 3 non commités · ↑2 ↓1
  duree: true, // durée de la session
  cout: true, // Session ≈ 5,92 $
  outils: true, // nombre d'appels d'outils
  fichiers: true, // fichiers modifiés
  contexte: true, // place libre dans la fenêtre de contexte
  limites: true, // limites 5 h, 7 j…
  reset: true, // temps avant le reset de chaque limite
  boucles: true, // ⟳ /loop, tâches programmées et réveils, avec le prochain passage
  taches: true, // Tâches ▰▰▰▱▱ 3/7 · ce que Claude fait en ce moment
  arriereplan: true, // ▸ commandes et agents qui tournent en arrière-plan
  mascotte: true, // Pixel, tout à droite
}

const SETTINGS = {
  /** Nombre de segments par jauge. */
  segments: 10,
  /** Segments dessinés dans l'app desktop, en pixels. */
  segment: { width: 6, height: 9, gap: 2, radius: 1.5 },
  /** Opacité des segments vides dans l'app desktop (0 à 1). */
  trackOpacity: 0.3,
  /** % consommé à partir duquel une jauge passe en orange, puis en rouge. */
  warnAt: 70,
  alertAt: 90,
  /** Espace entre deux infos, en caractères. */
  gap: 3,
  /** Au-delà de cette longueur, le nom du projet est coupé avec « … ». */
  projectMaxLength: 30,
  /** Couleurs : un nom (`green`) ou de l'hexadécimal. */
  colors: {
    ok: '#4ade80',
    warn: '#fb923c',
    alert: '#f87171',
    model: '#a78bfa',
    track: '#8a8a85',
    working: '#4ade80',
    added: '#4ade80',
    removed: '#f87171',
    ahead: '#7cc4ff',
    behind: '#fb923c',
    loop: '#7cc4ff',
    tasks: '#a78bfa',
  },
  /** Noms courts des limites. */
  limitLabels: { contexte: 'Ctx', five_hour: '5 h', seven_day: '7 j', spend_limit: 'Plafond' } as Record<string, string>,
  longLabels: { contexte: 'Contexte', five_hour: '5 heures', seven_day: '7 jours', spend_limit: 'Plafond' } as Record<string, string>,
  /** Taux utilisé quand le coût est affiché en euros (à ajuster). */
  eurPerUsd: 0.92,
  mascot: {
    /** Couleur du visage dans le terminal. */
    color: '#D97757',
    /** Durée des réactions (fin de tour, erreur, fête, merci), en secondes. */
    flashSeconds: 4,
    /** Pixel s'endort après ce nombre de minutes sans activité. */
    sleepAfterMinutes: 10,
    /** Pixel s'inquiète sous ce % de contexte libre (et dès qu'une limite passe `alertAt`). */
    alertContextFree: 15,
    /** Durée d'une réaction quand on clique sur Pixel, en secondes. */
    pokeSeconds: 2.5,
    /** Au bout de tant de clics en 3 secondes, Pixel a la tête qui tourne. */
    dizzyAfterClicks: 5,
  },
}

/** Couleurs des jauges au choix dans le panneau : beaucoup de marge, ça baisse, limite proche. */
const PALETTES: Record<string, { label: string; ok: string; warn: string; alert: string }> = {
  classique: { label: 'Classique', ok: '#4ade80', warn: '#fb923c', alert: '#f87171' },
  ocean: { label: 'Océan', ok: '#7cc4ff', warn: '#a78bfa', alert: '#f472b6' },
  neon: { label: 'Néon', ok: '#22d3ee', warn: '#facc15', alert: '#e879f9' },
  pastel: { label: 'Pastel', ok: '#86efac', warn: '#fcd34d', alert: '#fca5a5' },
  sobre: { label: 'Sobre', ok: '#d4d4d8', warn: '#a1a1aa', alert: '#f87171' },
  sunset: { label: 'Coucher de soleil', ok: '#fbbf24', warn: '#fb7185', alert: '#e11d48' },
}

/** Couleurs d'accent (modèle, tâches) et de Pixel au choix dans le panneau. */
const ACCENTS: Record<string, string> = {
  '#a78bfa': 'Violet',
  '#7cc4ff': 'Bleu',
  '#4ade80': 'Vert',
  '#fb923c': 'Orange',
  '#f472b6': 'Rose',
}
const PIXEL_COLORS: Record<string, string> = {
  '#D97757': 'Orange Claude',
  '#60a5fa': 'Bleu',
  '#4ade80': 'Vert',
  '#a78bfa': 'Violet',
  '#f472b6': 'Rose',
  '#a1a1aa': 'Gris',
}

const SIZES = { small: 6, medium: 9, large: 12 } as const
const PIXEL_SCALES = { small: 0.75, normal: 1, large: 1.3 } as const
/** Segments dans le terminal, où le dessin n'existe pas : plein, vide. */
const GLYPHS = { squares: ['▰', '▱'], pill: ['━', '─'], dots: ['●', '○'], thin: ['▪', '▫'] } as const

type Style = Required<Omit<StyleOverrides, 'reactions' | 'palette'>> & {
  palette: string
  ok: string
  warn: string
  alert: string
  reactions: { click: boolean; thanks: boolean; party: boolean; errors: boolean }
}

function resolveStyle(o: StyleOverrides | undefined): Style {
  const palette = o?.palette && PALETTES[o.palette] ? o.palette : 'classique'
  const colors = PALETTES[palette] ?? { ok: SETTINGS.colors.ok, warn: SETTINGS.colors.warn, alert: SETTINGS.colors.alert }

  return {
    separator: o?.separator ?? 'dot',
    labels: o?.labels ?? 'short',
    currency: o?.currency ?? 'usd',
    shape: o?.shape ?? 'squares',
    segments: o?.segments ?? SETTINGS.segments,
    size: o?.size ?? 'medium',
    percent: o?.percent ?? 'left',
    warnAt: o?.warnAt ?? SETTINGS.warnAt,
    alertAt: o?.alertAt ?? SETTINGS.alertAt,
    palette,
    ok: colors.ok,
    warn: colors.warn,
    alert: colors.alert,
    accent: o?.accent ?? SETTINGS.colors.model,
    costAccent: o?.costAccent ?? false,
    pixelColor: o?.pixelColor ?? SETTINGS.mascot.color,
    pixelSize: o?.pixelSize ?? 'normal',
    pixelSide: o?.pixelSide ?? 'right',
    reactions: { click: true, thanks: true, party: true, errors: true, ...o?.reactions },
    flashSeconds: o?.flashSeconds ?? SETTINGS.mascot.flashSeconds,
    sleepAfterMinutes: o?.sleepAfterMinutes ?? SETTINGS.mascot.sleepAfterMinutes,
    alertLimitAt: o?.alertLimitAt ?? 90,
    alertContextBelow: o?.alertContextBelow ?? 20,
    alertLoopEnd: o?.alertLoopEnd ?? true,
  }
}

/** Les réglages en vigueur : ceux du code, corrigés par ceux du panneau. */
let style = resolveStyle(undefined)

/** Les blocs du bandeau, dans l'ordre où le panneau les propose. */
const BLOCKS: BlockId[] = [
  'etat',
  'modele',
  'projet',
  'git',
  'duree',
  'cout',
  'activite',
  'contexte',
  'limite5h',
  'limite7j',
  'autres',
  'boucles',
  'taches',
  'arriereplan',
]

const BLOCK_LABELS: Record<BlockId, string> = {
  etat: 'État (● en cours)',
  modele: 'Modèle',
  projet: 'Projet et branche',
  git: 'État git',
  duree: 'Durée',
  cout: 'Coût',
  activite: 'Outils et fichiers',
  contexte: 'Contexte',
  limite5h: 'Limite 5 h',
  limite7j: 'Limite 7 j',
  autres: 'Autres limites',
  boucles: 'Boucles et réveils',
  taches: 'Tâches',
  arriereplan: 'Arrière-plan',
}

/** Les noms courts des blocs, sur les pastilles du panneau. */
const BLOCK_CHIPS: Record<BlockId, string> = {
  etat: 'État',
  modele: 'Modèle',
  projet: 'Projet',
  git: 'Git',
  duree: 'Durée',
  cout: 'Coût',
  activite: 'Outils',
  contexte: 'Contexte',
  limite5h: '5 h',
  limite7j: '7 j',
  autres: 'Autres limites',
  boucles: 'Boucles',
  taches: 'Tâches',
  arriereplan: 'Arrière-plan',
}

const TABS: Array<[PanelTab, string]> = [
  ['disposition', 'Disposition'],
  ['style', 'Style'],
  ['pixel', 'Pixel'],
  ['alertes', 'Alertes'],
]

/** Les infos qu'un bloc affiche : le placer sur une ligne les réactive. */
const BLOCK_KEYS: Record<BlockId, InfoKey[]> = {
  etat: ['etat'],
  modele: ['modele'],
  projet: ['projet'],
  git: ['git'],
  duree: ['duree'],
  cout: ['cout'],
  activite: ['outils', 'fichiers'],
  contexte: ['contexte'],
  limite5h: ['limites'],
  limite7j: ['limites'],
  autres: ['limites'],
  boucles: ['boucles'],
  taches: ['taches'],
  arriereplan: ['arriereplan'],
}

const INFO_BLOCKS: BlockId[] = ['etat', 'modele', 'projet', 'git', 'duree', 'cout', 'activite']
const GAUGE_BLOCKS: BlockId[] = ['contexte', 'limite5h', 'limite7j', 'autres']

const DEFAULT_LAYOUT: BlockId[][] = [
  ['modele', 'projet', 'git', 'duree', 'cout', 'activite'],
  ['contexte', 'limite5h', 'limite7j', 'autres'],
  ['boucles', 'taches', 'arriereplan'],
]

/** La disposition enregistrée, nettoyée : trois lignes, chaque bloc une fois au plus. */
function resolveLayout(p: Prefs): BlockId[][] {
  const seen = new Set<BlockId>()
  const source = Array.isArray(p.layout) ? p.layout : DEFAULT_LAYOUT
  const lines = [0, 1, 2].map(n =>
    (source[n] ?? []).filter((block): block is BlockId => {
      if (!BLOCKS.includes(block) || seen.has(block)) return false
      seen.add(block)

      return true
    }),
  )
  if (!Array.isArray(p.layout) && p.overrides.etat === true) lines[0]?.unshift('etat')

  return lines
}

function lineOf(layout: BlockId[][], block: BlockId): number {
  return layout.findIndex(line => line.includes(block)) + 1
}

/** Place un bloc au bout d'une ligne (1 à 3), ou le masque (0). */
function setLine(layout: BlockId[][], block: BlockId, line: number): BlockId[][] {
  const next = layout.map(blocks => blocks.filter(b => b !== block))
  if (line >= 1 && line <= 3) next[line - 1]?.push(block)

  return next
}

/** Avance ou recule un bloc ; au bord d'une ligne, il passe à la ligne voisine. */
function moveBlock(layout: BlockId[][], block: BlockId, delta: -1 | 1): BlockId[][] {
  const next = layout.map(blocks => [...blocks])
  const line = next.findIndex(blocks => blocks.includes(block))
  const blocks = next[line]
  if (line < 0 || blocks === undefined) return layout

  const at = blocks.indexOf(block)
  const to = at + delta
  if (to >= 0 && to < blocks.length) {
    blocks.splice(at, 1)
    blocks.splice(to, 0, block)

    return next
  }

  const target = next[line + delta]
  if (target === undefined) return layout
  blocks.splice(at, 1)
  if (delta < 0) target.push(block)
  else target.unshift(block)

  return next
}

/** Range les blocs affichés sur 1, 2 ou 3 lignes, en gardant leur ordre. */
function arrange(layout: BlockId[][], lines: 1 | 2 | 3): BlockId[][] {
  const all = layout.flat()
  if (lines === 1) return [all, [], []]
  if (lines === 2) return [all.filter(b => INFO_BLOCKS.includes(b)), all.filter(b => !INFO_BLOCKS.includes(b)), []]

  return [
    all.filter(b => INFO_BLOCKS.includes(b)),
    all.filter(b => GAUGE_BLOCKS.includes(b)),
    all.filter(b => !INFO_BLOCKS.includes(b) && !GAUGE_BLOCKS.includes(b)),
  ]
}

/** Les profils rapides du panneau : réglages, disposition et détails affichés, en un clic. */
const PROFILES: Record<string, { label: string; style: StyleOverrides; layout: BlockId[][]; details: InfoKey[] }> = {
  complet: {
    label: 'Complet',
    style: { shape: 'squares', segments: 10, size: 'medium', pixelSize: 'normal' },
    layout: DEFAULT_LAYOUT,
    details: ['branche', 'reset', 'outils', 'fichiers'],
  },
  equilibre: {
    label: 'Équilibré',
    style: { shape: 'pill', segments: 10, size: 'medium', pixelSize: 'normal' },
    layout: [['modele', 'projet', 'cout'], ['contexte', 'limite5h', 'limite7j', 'boucles', 'taches'], []],
    details: ['reset'],
  },
  minimal: {
    label: 'Minimal',
    style: { shape: 'dots', segments: 8, size: 'small', pixelSize: 'small' },
    layout: [['cout', 'contexte', 'limite5h', 'limite7j'], [], []],
    details: [],
  },
  focus: {
    label: 'Focus',
    style: { shape: 'thin', segments: 12, size: 'medium', pixelSize: 'normal' },
    layout: [['contexte', 'limite5h', 'limite7j'], [], []],
    details: ['reset'],
  },
}

/** Les réglages fins qui ne sont pas des blocs : ce qu'un bloc montre en plus. */
const DETAILS: Array<[InfoKey, string]> = [
  ['branche', 'Branche git'],
  ['reset', 'Temps avant reset'],
  ['outils', "Nombre d'outils"],
  ['fichiers', 'Fichiers modifiés'],
]

/** Ce que fait Pixel quand on clique dessus, à tour de rôle. */
const POKE_MOODS: Mood[] = ['giggle', 'boing', 'surprise', 'love']

/** La zone tactile posée sur Pixel. */
const TOUCH_KEY = 'pixel-touch'

/** Le panneau de réglages, ouvert par `/bandeau`. */
const PANE = 'usage-band-reglages'

const INFO_LABELS: Record<InfoKey, string> = {
  etat: 'État',
  modele: 'Modèle',
  projet: 'Projet',
  branche: 'Branche',
  git: 'Git',
  duree: 'Durée',
  cout: 'Coût',
  outils: 'Outils',
  fichiers: 'Fichiers',
  contexte: 'Contexte',
  limites: 'Limites',
  reset: 'Resets',
  boucles: 'Boucles',
  taches: 'Tâches',
  arriereplan: 'Arrière-plan',
  mascotte: 'Pixel',
}

/** Ce que fait Pixel pendant chaque outil ; les autres le font réfléchir. */
const TOOL_MOODS: Record<string, Mood> = {
  Edit: 'code',
  Write: 'code',
  MultiEdit: 'code',
  NotebookEdit: 'code',
  Read: 'read',
  Grep: 'read',
  Glob: 'read',
  LS: 'read',
  NotebookRead: 'read',
  Bash: 'bash',
  BashOutput: 'bash',
  KillShell: 'bash',
  WebFetch: 'web',
  WebSearch: 'web',
  Agent: 'agent',
  Task: 'agent',
}

/** Commandes qui font la fête quand elles réussissent : commit, push, tests. */
const PARTY =
  /\bgit\s+(commit|push)\b|\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\b(pytest|vitest|jest)\b|\b(cargo|go|swift)\s+test\b|\bclaude\s+plugin\s+test\b/

/** Mots qui font plaisir à Pixel (comparés sans accents). */
const THANKS = /\b(merci|thanks|thank you|thx|bravo|genial|parfait|nickel|trop bien)\b|♥|❤/

// ─────────────────────────────────────────────────────────────────────────────

const usage = atom({ plugin: 'usage-band', key: 'usage' } as const, null)
const info = atom({ plugin: 'usage-band', key: 'info' } as const, {
  model: null,
  project: null,
  branch: null,
  git: null,
})
const activity = atom({ plugin: 'usage-band', key: 'activity' } as const, {
  since: null,
  tools: 0,
  files: [],
})
const prefs = atom({ plugin: 'usage-band', key: 'prefs' } as const, {
  isHidden: false,
  overrides: {},
})
const mascot = atom({ plugin: 'usage-band', key: 'mascot' } as const, {
  running: {},
  flash: null,
  lastActivity: null,
  hoverUntil: null,
  pokes: [],
  pokeCount: 0,
})
const schedule = atom({ plugin: 'usage-band', key: 'schedule' } as const, {
  crons: [],
  wakeup: null,
  fires: {},
  tasks: [],
  background: [],
})
const alerts = atom({ plugin: 'usage-band', key: 'alerts' } as const, [])
const panel = atom({ plugin: 'usage-band', key: 'panel' } as const, { tab: 'disposition', selected: null })
const tick = atom({ plugin: 'usage-band', key: 'tick' } as const, 0)

let lastGitAt = 0

const KEYS = Object.keys(DEFAULT_SHOW) as InfoKey[]

const ALIASES: Record<string, InfoKey> = {
  ...Object.fromEntries(KEYS.map(key => [key, key])),
  model: 'modele',
  dossier: 'projet',
  temps: 'duree',
  mascot: 'mascotte',
  pixel: 'mascotte',
  loop: 'boucles',
  loops: 'boucles',
  cron: 'boucles',
  reveil: 'boucles',
  tasks: 'taches',
  todo: 'taches',
  goal: 'taches',
  objectif: 'taches',
  background: 'arriereplan',
  prix: 'cout',
  ctx: 'contexte',
}

const EDITORS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

type Span = { text: string; color?: string; bold?: boolean; dim?: boolean }
type Meter = { ratio: number; color: string; alt: string }
type Part = Span | Meter
type Chunk = { key: string; gap: number; full: Part[]; short: Part[]; block?: BlockId }

const dim = (text: string): Span => ({ text, dim: true })
const same = (key: string, parts: Part[]): Chunk => ({ key, gap: 0, full: parts, short: parts })
const isMeter = (part: Part): part is Meter => 'ratio' in part

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[éèêë]/g, 'e')
    .replace(/[àâä]/g, 'a')
    .replace(/[ûùü]/g, 'u')
    .replace(/[ôö]/g, 'o')
    .replace(/[îï]/g, 'i')
    .replace(/ç/g, 'c')
}

function isPrefs(value: unknown): value is Prefs {
  if (typeof value !== 'object' || value === null) return false
  const { isHidden, overrides, style: saved } = value as Record<string, unknown>

  return (
    typeof isHidden === 'boolean' &&
    typeof overrides === 'object' &&
    overrides !== null &&
    (saved === undefined || (typeof saved === 'object' && saved !== null))
  )
}

function prettyModel(id: string): string {
  if (/\s/.test(id)) return id

  const parts = id
    .replace(/\[.*\]$/, '')
    .replace(/^claude-/, '')
    .replace(/-\d{8}$/, '')
    .split('-')
  const words = parts.filter(part => !/^\d+$/.test(part))
  const numbers = parts.filter(part => /^\d+$/.test(part))
  if (words.length === 0) return id

  const name = words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')

  return numbers.length > 0 ? `${name} ${numbers.join('.')}` : name
}

function basename(path: string): string | null {
  const name = path.split(/[\\/]/).filter(Boolean).pop()
  if (name === undefined) return null

  const chars = [...name]
  const max = SETTINGS.projectMaxLength

  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : name
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? 's' : ''}`
}

function money(usd: number): string {
  const isEuro = style.currency === 'eur'
  const amount = isEuro ? usd * SETTINGS.eurPerUsd : usd

  return `${amount.toFixed(2).replace('.', ',')} ${isEuro ? '€' : '$'}`
}

function pct(left: number): string {
  const value = left < 10 ? Math.round(left * 10) / 10 : Math.round(left)

  return `${String(value).replace('.', ',')} %`
}

function untilReset(resetsAt: string | undefined, now: number): string | null {
  if (!resetsAt) return null
  const ms = Date.parse(resetsAt) - now

  return ms > 0 ? minutes(Math.round(ms / 60_000)) : null
}

function toneFor(used: number): string {
  return used >= style.alertAt ? style.alert : used >= style.warnAt ? style.warn : style.ok
}

function gauge(key: string, label: string, used: number, tail: string | null): Chunk {
  const color = toneFor(used)
  const left = Math.min(100, Math.max(0, 100 - used))
  const shown = style.percent === 'used' ? 100 - left : left
  const parts: Part[] = [
    dim(label),
    { ratio: left / 100, color, alt: `${label} : ${pct(left)} restant` },
    { text: pct(shown), bold: true, color },
    ...(tail ? [dim(tail)] : []),
  ]

  return { key, gap: 1, full: parts, short: parts }
}

/** Le nom d'une jauge, court ou long selon le réglage. */
function gaugeLabel(kind: string): string {
  const names = style.labels === 'long' ? SETTINGS.longLabels : SETTINGS.limitLabels

  return names[kind] ?? kind
}

function meterWidth(): number {
  const height = SIZES[style.size]
  if (style.shape === 'dots') return style.segments * (height + 2) - 2

  return style.segments * (SETTINGS.segment.width + SETTINGS.segment.gap) - SETTINGS.segment.gap
}

function filledSegments(meter: Meter): number {
  return Math.round(meter.ratio * style.segments)
}

function meterSvg(meter: Meter): string {
  const { width, gap, radius } = SETTINGS.segment
  const height = SIZES[style.size]
  const total = meterWidth()
  const track = `fill="${SETTINGS.colors.track}" fill-opacity="${SETTINGS.trackOpacity}"`
  const lit = `fill="${meter.color}"`
  const filled = filledSegments(meter)
  let body = ''

  if (style.shape === 'pill') {
    const r = height / 2
    const length = Math.round(total * meter.ratio)
    body = `<rect width="${total}" height="${height}" rx="${r}" ${track}/>` + (length > 0 ? `<rect width="${Math.max(length, height)}" height="${height}" rx="${r}" ${lit}/>` : '')
  } else if (style.shape === 'dots') {
    const r = height / 2
    body = Array.from({ length: style.segments }, (_, i) => `<circle cx="${i * (height + 2) + r}" cy="${r}" r="${r}" ${i < filled ? lit : track}/>`).join('')
  } else {
    const h = style.shape === 'thin' ? 3 : height
    const y = (height - h) / 2
    body = Array.from(
      { length: style.segments },
      (_, i) => `<rect x="${i * (width + gap)}" y="${y}" width="${width}" height="${h}" rx="${Math.min(radius, h / 2)}" ${i < filled ? lit : track}/>`,
    ).join('')
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${height}" viewBox="0 0 ${total} ${height}">${body}</svg>`
}

function toUsage(
  limits: readonly SessionRateLimit[],
  cost: SessionCost | undefined,
  context: SessionContextUsage,
  startedAt: number | null,
): Usage {
  const fill =
    context.percent ??
    (context.tokens !== undefined && context.window > 0
      ? (context.tokens / context.window) * 100
      : null)

  return {
    limits: limits.map(({ kind, percentUsed, resetsAt }): Limit => ({ kind, percentUsed, resetsAt })),
    costUsd: cost?.usd ?? null,
    contextPercent: fill,
    startedAt,
  }
}

function editedFile(e: { tool: string }): string | undefined {
  if (!EDITORS.has(e.tool)) return undefined
  const { file_path, notebook_path } = e as { file_path?: unknown; notebook_path?: unknown }
  const path = file_path ?? notebook_path

  return typeof path === 'string' ? path : undefined
}

type Repo = { branch: string | null; git: GitState | null }

async function readRepo($: EngineInterface, cwd: string): Promise<Repo> {
  const opts = { cwd, timeoutMs: 3000 }
  const status = await $.process.run(['git', 'status', '--porcelain=v2', '--branch'], opts)
  if (status.exitCode !== 0) return { branch: null, git: null }

  let branch: string | null = null
  let oid = ''
  const git: GitState = { added: 0, removed: 0, dirty: 0, ahead: 0, behind: 0 }
  for (const line of status.stdout.split('\n')) {
    if (line.startsWith('# branch.head ')) branch = line.slice('# branch.head '.length).trim()
    else if (line.startsWith('# branch.oid ')) oid = line.slice('# branch.oid '.length).trim()
    else if (line.startsWith('# branch.ab ')) {
      const ab = /\+(\d+) -(\d+)/.exec(line)
      git.ahead = Number(ab?.[1] ?? 0)
      git.behind = Number(ab?.[2] ?? 0)
    } else if (/^[12u?] /.test(line)) git.dirty += 1
  }
  if (branch === '(detached)') branch = oid && oid !== '(initial)' ? oid.slice(0, 7) : null

  const diff = await $.process.run(['git', 'diff', 'HEAD', '--numstat'], opts)
  if (diff.exitCode === 0) {
    for (const line of diff.stdout.split('\n')) {
      const [added, removed] = line.split('\t')
      if (added && removed && added !== '-') {
        git.added += Number(added) || 0
        git.removed += Number(removed) || 0
      }
    }
  }

  return { branch, git }
}

async function refreshGit($: EngineInterface): Promise<void> {
  try {
    const now = await $.clock.now()
    if (now - lastGitAt < 2000) return
    lastGitAt = now

    const repo = await readRepo($, await $.session.cwd())
    await update($, info, (i): Info => ({ ...i, ...repo }))
  } catch {
    // L'état git garde ses dernières valeurs.
  }
}

async function refresh($: EngineInterface): Promise<void> {
  try {
    const u = await $.session.usage()
    const model = await $.session.model()
    const cwd = await $.session.cwd()
    const repo = await readRepo($, cwd).catch((): Repo => ({ branch: null, git: null }))
    const next: Info = { model: prettyModel(model), project: basename(cwd), ...repo }

    await update($, usage, () => toUsage(u.rateLimits, u.cost, u.context, u.startedAt))
    await update($, info, () => next)
    await update($, activity, (a): Activity =>
      a.since === u.startedAt ? a : { since: u.startedAt, tools: 0, files: [] },
    )
  } catch {
    // Le bandeau garde ses dernières valeurs.
  }
}

type Call = { tool: string } & Record<string, unknown>

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const isStatus = (value: unknown): value is TaskItem['status'] =>
  value === 'pending' || value === 'in_progress' || value === 'completed'

/** Ce qu'un appel d'outil réussi change aux boucles, au réveil et aux tâches. */
function scheduleAfter(s: Schedule, e: Call, result: unknown): Schedule {
  const r = (typeof result === 'object' && result !== null ? result : {}) as Record<string, unknown>

  switch (e.tool) {
    case 'CronCreate': {
      const id = asString(r.id)
      const cron = asString(e.cron)
      if (id === null || cron === null) return s
      const job: CronJob = { id, cron, prompt: asString(e.prompt) ?? '', recurring: e.recurring !== false }

      return { ...s, crons: [...s.crons.filter(c => c.id !== id), job] }
    }
    case 'CronDelete':
      return { ...s, crons: s.crons.filter(c => c.id !== e.id) }
    case 'CronList': {
      if (!Array.isArray(r.jobs)) return s
      const crons = (r.jobs as Array<Record<string, unknown>>).flatMap((job): CronJob[] => {
        const id = asString(job.id)
        const cron = asString(job.cron)

        return id && cron ? [{ id, cron, prompt: asString(job.prompt) ?? '', recurring: job.recurring !== false }] : []
      })

      return { ...s, crons }
    }
    case 'ScheduleWakeup': {
      const at = typeof r.scheduledFor === 'number' ? r.scheduledFor : null
      if (e.stop === true || r.stopped === true || at === null) return { ...s, wakeup: null }

      return { ...s, wakeup: { at, reason: asString(e.reason), prompt: asString(e.prompt) } }
    }
    case 'TaskCreate': {
      const task = (r.task ?? {}) as Record<string, unknown>
      const id = asString(task.id)
      if (id === null) return s
      const item: TaskItem = {
        id,
        subject: asString(task.subject) ?? asString(e.subject) ?? '',
        activeForm: asString(e.activeForm),
        status: 'pending',
      }

      return { ...s, tasks: [...s.tasks.filter(t => t.id !== id), item] }
    }
    case 'TaskUpdate': {
      if (e.status === 'deleted') return { ...s, tasks: s.tasks.filter(t => t.id !== e.taskId) }

      return {
        ...s,
        tasks: s.tasks.map(t =>
          t.id !== e.taskId
            ? t
            : {
                ...t,
                subject: asString(e.subject) ?? t.subject,
                activeForm: asString(e.activeForm) ?? t.activeForm,
                status: isStatus(e.status) ? e.status : t.status,
              },
        ),
      }
    }
    case 'TaskList': {
      if (!Array.isArray(r.tasks)) return s
      const tasks = (r.tasks as Array<Record<string, unknown>>).flatMap((task): TaskItem[] => {
        const id = asString(task.id)
        if (id === null) return []
        const known = s.tasks.find(t => t.id === id)

        return [
          {
            id,
            subject: asString(task.subject) ?? known?.subject ?? '',
            activeForm: known?.activeForm ?? null,
            status: isStatus(task.status) ? task.status : 'pending',
          },
        ]
      })

      return { ...s, tasks }
    }
    case 'TodoWrite': {
      if (!Array.isArray(e.todos)) return s
      const tasks = (e.todos as Array<Record<string, unknown>>).map(
        (todo, i): TaskItem => ({
          id: `todo-${i}`,
          subject: asString(todo.content) ?? '',
          activeForm: asString(todo.activeForm),
          status: isStatus(todo.status) ? todo.status : 'pending',
        }),
      )

      return { ...s, tasks }
    }
    default:
      return s
  }
}

/** Une notification par seuil franchi ; elle se réarme quand on repasse en dessous. */
async function checkAlerts($: EngineInterface, u: Usage, now: number): Promise<void> {
  const sent = (await read($, alerts)) ?? []
  const active: string[] = []
  const toasts: string[] = []

  if (style.alertLimitAt > 0) {
    for (const limit of u.limits) {
      if (limit.percentUsed < style.alertLimitAt) continue
      const key = `limite:${limit.kind}:${limit.resetsAt ?? ''}`
      active.push(key)
      if (sent.includes(key)) continue
      const reset = untilReset(limit.resetsAt, now)
      toasts.push(`Limite ${gaugeLabel(limit.kind)} à ${Math.round(limit.percentUsed)} %${reset ? ` · reset dans ${reset}` : ''}`)
    }
  }
  if (style.alertContextBelow > 0 && u.contextPercent != null && 100 - u.contextPercent < style.alertContextBelow) {
    active.push('contexte')
    if (!sent.includes('contexte')) {
      toasts.push(`Contexte presque plein : ${Math.round(100 - u.contextPercent)} % libre. Pense à /compact.`)
    }
  }

  await update($, alerts, () => active)
  for (const text of toasts) $.ui.toast(`⚠ ${text}`)
}

/** Prévient quand une boucle s'arrête, si l'alerte est activée. */
function loopEnded($: EngineInterface, s: Schedule, prompt: string): void {
  if (!style.alertLoopEnd) return
  const n = s.fires?.[prompt] ?? 0
  $.ui.toast(`⟳ Boucle terminée : ${loopLabel(prompt)}${n > 0 ? ` (${n} passage${n > 1 ? 's' : ''})` : ''}`)
}

function moodFor(m: Mascot, isWorking: boolean, u: Usage | null, now: number): Mood {
  const running = Object.values(m.running)
  const tool = running[running.length - 1]
  if (tool) return tool
  if (m.flash && m.flash.until > now) return m.flash.mood
  if (m.hoverUntil != null && m.hoverUntil > now) return 'hello'
  if (isWorking) return 'think'

  const { alertContextFree } = SETTINGS.mascot
  const { sleepAfterMinutes } = style
  const isTight =
    u !== null &&
    (u.limits.some(limit => limit.percentUsed >= style.alertAt) ||
      (u.contextPercent != null && 100 - u.contextPercent < alertContextFree))
  if (isTight) return 'alert'
  const isAsleep = sleepAfterMinutes > 0 && m.lastActivity != null && now - m.lastActivity > sleepAfterMinutes * 60_000
  if (isAsleep) return 'sleep'

  return 'idle'
}

async function touch($: EngineInterface, change: (m: Mascot) => Mascot = m => m): Promise<void> {
  const now = await $.clock.now()
  await update($, mascot, (m): Mascot => ({ ...change(m), lastActivity: now }))
}

async function flash(
  $: EngineInterface,
  mood: Mood,
  seconds = style.flashSeconds,
  change: (m: Mascot) => Mascot = m => m,
): Promise<void> {
  const now = await $.clock.now()
  const ms = seconds * 1000
  await update($, mascot, (m): Mascot => ({ ...change(m), flash: { mood, until: now + ms }, lastActivity: now }))
  $.clock.after(ms + 50, () => void update($, tick, n => n + 1))
}

async function poke($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  const m = await read($, mascot)
  const recent = [...(m.pokes ?? []).filter(at => now - at < 3000), now]
  const count = m.pokeCount ?? 0

  if (recent.length >= SETTINGS.mascot.dizzyAfterClicks) {
    await flash($, 'dizzy', 3, state => ({ ...state, pokes: [], pokeCount: count + 1 }))

    return
  }

  const mood = POKE_MOODS[count % POKE_MOODS.length] ?? 'giggle'
  await flash($, mood, SETTINGS.mascot.pokeSeconds, state => ({ ...state, pokes: recent, pokeCount: count + 1 }))
}

function topChunks(
  show: Record<InfoKey, boolean>,
  u: Usage | null,
  i: Info,
  a: Activity,
  now: number,
  isWorking: boolean,
): Chunk[] {
  const out: Chunk[] = []
  const { colors } = SETTINGS

  if (show.etat) {
    out.push(same('etat', isWorking ? [{ text: '● en cours', color: colors.working }] : [dim('● prêt')]))
  }
  if (show.modele && i.model) {
    out.push(same('modele', [{ text: i.model, color: style.accent }]))
  }

  const project = show.projet ? i.project : null
  const branch = show.branche ? i.branch : null
  if (project || branch) {
    out.push(
      same('projet', [
        ...(project ? [{ text: project, bold: true }] : []),
        ...(project && branch ? [dim(' · ')] : []),
        ...(branch ? [{ text: branch }] : []),
      ]),
    )
  }

  const git = show.git ? (i.git ?? null) : null
  if (git) {
    const parts: Part[] = [
      ...(git.added > 0 ? [{ text: `+${git.added}`, color: colors.added }] : []),
      ...(git.removed > 0 ? [{ text: `−${git.removed}`, color: colors.removed }] : []),
      ...(git.dirty > 0 ? [dim(`${git.dirty} non commité${git.dirty > 1 ? 's' : ''}`)] : []),
      ...(git.ahead > 0 ? [{ text: `↑${git.ahead}`, color: colors.ahead }] : []),
      ...(git.behind > 0 ? [{ text: `↓${git.behind}`, color: colors.behind }] : []),
    ]
    if (parts.length > 0) out.push({ key: 'git', gap: 1, full: parts, short: parts })
  }

  if (show.duree && u?.startedAt != null && now >= u.startedAt) {
    out.push(same('duree', [dim(minutes(Math.floor((now - u.startedAt) / 60_000)))]))
  }
  if (show.cout && u?.costUsd != null) {
    const value: Span = { text: money(u.costUsd), bold: true, ...(style.costAccent ? { color: style.accent } : {}) }
    out.push({ key: 'cout', gap: 0, full: [dim('Session ≈ '), value], short: [dim('≈ '), value] })
  }

  const counts = [
    show.outils && a.tools > 0 ? plural(a.tools, 'outil') : null,
    show.fichiers && a.files.length > 0 ? plural(a.files.length, 'fichier') : null,
  ].filter((part): part is string => part !== null)
  if (counts.length > 0) {
    out.push(same('activite', [dim(counts.join(' · '))]))
  }

  return out
}

function gaugeChunks(show: Record<InfoKey, boolean>, u: Usage | null, now: number): Chunk[] {
  if (u === null) return []
  const out: Chunk[] = []

  if (show.contexte && u.contextPercent != null) {
    out.push(gauge('contexte', gaugeLabel('contexte'), u.contextPercent, null))
  }
  if (show.limites) {
    for (const limit of u.limits) {
      const label = gaugeLabel(limit.kind)
      const reset = show.reset ? untilReset(limit.resetsAt, now) : null
      const block: BlockId = limit.kind === 'five_hour' ? 'limite5h' : limit.kind === 'seven_day' ? 'limite7j' : 'autres'
      out.push({ ...gauge(limit.kind, label, limit.percentUsed, reset ? `· ${reset}` : null), block })
    }
  }

  return out
}

function scheduleChunks(show: Record<InfoKey, boolean>, s: Schedule, now: number): Chunk[] {
  const out: Chunk[] = []
  const { colors } = SETTINGS
  const fires = (prompt: string | null) => {
    const n = prompt === null ? 0 : (s.fires?.[prompt] ?? 0)

    return n > 0 ? [dim(`· ${n}×`)] : []
  }

  if (show.boucles) {
    for (const job of s.crons ?? []) {
      if (!job.recurring && s.wakeup) continue
      const at = nextFire(job.cron, now)
      const parts: Part[] = [
        { text: job.recurring ? '⟳' : '◷', color: colors.loop },
        { text: loopLabel(job.prompt) },
        dim(job.recurring ? describeCron(job.cron) : 'rappel'),
        ...(at === null ? [] : [{ text: until(at - now), color: colors.loop }]),
        ...fires(job.prompt),
      ]
      out.push({ key: `cron-${job.id}`, gap: 1, full: parts, short: parts.filter((_, i) => i !== 2), block: 'boucles' })
    }

    const wakeup = s.wakeup
    if (wakeup) {
      const parts: Part[] = [
        { text: '◷', color: colors.loop },
        { text: wakeup.prompt ? loopLabel(wakeup.prompt) : 'réveil' },
        { text: until(wakeup.at - now), color: colors.loop },
        ...fires(wakeup.prompt),
        ...(wakeup.reason ? [dim(`· ${shorten(wakeup.reason, 40)}`)] : []),
      ]
      out.push({ key: 'reveil', gap: 1, full: parts, short: parts.slice(0, 4), block: 'boucles' })
    }
  }

  const tasks = s.tasks ?? []
  if (show.taches && tasks.some(task => task.status !== 'completed')) {
    const done = tasks.filter(task => task.status === 'completed').length
    const current = tasks.find(task => task.status === 'in_progress')
    const parts: Part[] = [
      dim('Tâches'),
      { ratio: done / tasks.length, color: style.accent, alt: `Tâches : ${done} sur ${tasks.length}` },
      { text: `${done}/${tasks.length}`, bold: true, color: style.accent },
      ...(current ? [dim(`· ${shorten(current.activeForm ?? current.subject, 40)}`)] : []),
    ]
    out.push({ key: 'taches', gap: 1, full: parts, short: parts.slice(0, 3) })
  }

  const background = s.background ?? []
  if (show.arriereplan && background.length > 0) {
    const kinds = [...new Set(background.map(task => task.type))].join(', ')
    out.push(same('arriereplan', [{ text: '▸ ', color: colors.loop }, dim(`${background.length} en arrière-plan (${kinds})`)]))
  }

  return out
}

function lineWidth(chunks: Chunk[]): number {
  const cells = chunks.reduce(
    (n, chunk) =>
      n +
      chunk.gap * Math.max(0, chunk.full.length - 1) +
      chunk.full.reduce((m, part) => m + (isMeter(part) ? style.segments : [...part.text].length), 0),
    0,
  )
  const between = style.separator === 'space' ? SETTINGS.gap : 3

  return cells + between * Math.max(0, chunks.length - 1)
}

function textProps(span: Span): TextProps {
  const props: TextProps = {}
  if (span.color !== undefined) props.color = span.color
  if (span.bold) props.bold = true
  if (span.dim) props.dimColor = true

  return props
}

async function changePrefs($: EngineInterface, change: (p: Prefs) => Prefs): Promise<Prefs> {
  await update($, prefs, change)
  const saved = await read($, prefs)
  style = resolveStyle(saved.style)
  await $.store.set('prefs', saved)

  return saved
}

type Els = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Svg?: ElementConstructor<SvgProps>
  Client?: ElementConstructor<ClientProps>
}

type BandView = {
  show: Record<InfoKey, boolean>
  u: Usage | null
  i: Info
  a: Activity
  m: Mascot
  s: Schedule
  now: number
  isWorking: boolean
  /** Cellules disponibles pour le bandeau. */
  columns: number
  /** L'aperçu du panneau : pas de zone tactile sur Pixel. */
  isPreview: boolean
  layout: BlockId[][]
}

/** Le bandeau dessiné, pour le vrai bandeau comme pour l'aperçu du panneau. */
function drawBand({ Box, Text, Svg, Client }: Els, v: BandView): RenderElement | null {
  const mood = v.show.mascotte ? moodFor(v.m, v.isWorking, v.u, v.now) : null
  const byBlock = new Map<string, Chunk[]>()
  for (const chunk of [
    ...topChunks(v.show, v.u, v.i, v.a, v.now, v.isWorking),
    ...gaugeChunks(v.show, v.u, v.now),
    ...scheduleChunks(v.show, v.s, v.now),
  ]) {
    const block = chunk.block ?? chunk.key
    byBlock.set(block, [...(byBlock.get(block) ?? []), chunk])
  }
  const lines = v.layout
    .map((blocks, n) => ({ key: `ligne-${n}`, chunks: blocks.flatMap(block => byBlock.get(block) ?? []) }))
    .filter(line => line.chunks.length > 0)

  if (lines.length === 0 && mood === null) return null

  const height = SIZES[style.size]
  const scale = PIXEL_SCALES[style.pixelSize]
  const mascotCells = mood === null ? 0 : (Svg ? Math.round(10 * scale) : [...MOODS[mood].kao].length) + 2
  const room = v.columns - mascotCells
  const [full, empty] = GLYPHS[style.shape]

  const drawMeter = (meter: Meter) => {
    if (Svg) return <Svg source={meterSvg(meter)} alt={meter.alt} width={meterWidth()} height={height} />

    const filled = filledSegments(meter)
    const glyphs = [
      { text: full.repeat(filled), color: meter.color },
      { text: empty.repeat(style.segments - filled), color: SETTINGS.colors.track, dim: true },
    ].filter(glyph => glyph.text !== '')

    return (
      <Box flexDirection="row">
        {glyphs.map(glyph => (
          <Text {...textProps(glyph)}>{glyph.text}</Text>
        ))}
      </Box>
    )
  }

  const draw = (part: Part) => (isMeter(part) ? drawMeter(part) : <Text {...textProps(part)}>{part.text}</Text>)
  const separator = style.separator === 'dot' ? '·' : style.separator === 'bar' ? '│' : null
  const gap = separator === null ? SETTINGS.gap : 1

  const drawLine = (line: { key: string; chunks: Chunk[] }) => {
    const isShort = lineWidth(line.chunks) > room
    const items = line.chunks.flatMap((chunk, n) => {
      const box = (
        <Box key={`${line.key}-${chunk.key}`} flexDirection="row" alignItems="center" columnGap={chunk.gap}>
          {(isShort ? chunk.short : chunk.full).filter(part => isMeter(part) || part.text !== '').map(draw)}
        </Box>
      )

      return n > 0 && separator !== null
        ? [
            <Text key={`${line.key}-sep-${n}`} dimColor>
              {separator}
            </Text>,
            box,
          ]
        : [box]
    })

    return (
      <Box key={line.key} flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={gap}>
        {items}
      </Box>
    )
  }

  const pixel = mood !== null && (
    <Box key="mascotte" flexShrink={0}>
      {Svg ? (
        <Svg
          source={mascotSvg(mood, { color: style.pixelColor, scale })}
          alt={`Mascotte : ${MOODS[mood].label}`}
          width={Math.round(MASCOT_WIDTH * scale)}
          height={Math.round(MASCOT_HEIGHT * scale)}
        />
      ) : (
        <Text color={style.pixelColor} bold>
          {MOODS[mood].kao}
        </Text>
      )}
      {Client && !v.isPreview && (
        <Box position="absolute" top={0} left={0} right={0} bottom={0}>
          <Client key={TOUCH_KEY} module="./touch.ts" width="100%" height="100%" />
        </Box>
      )}
    </Box>
  )

  return (
    <Box flexDirection="row" alignItems="center" columnGap={2}>
      {style.pixelSide === 'left' && pixel}
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        {lines.map(drawLine)}
      </Box>
      {style.pixelSide === 'right' && pixel}
    </Box>
  )
}

function describe(p: Prefs): string {
  const show = { ...DEFAULT_SHOW, ...p.overrides }
  const marks = KEYS.map(key => `${show[key] ? '✓' : '✗'} ${key}`).join('   ')
  const lines = resolveLayout(p).map(
    (blocks, n) => `Ligne ${n + 1} : ${blocks.length === 0 ? '(vide)' : blocks.map(block => BLOCK_LABELS[block]).join(' · ')}`,
  )

  return [
    `Bandeau d'utilisation : ${p.isHidden ? 'masqué' : 'affiché'}`,
    ...lines,
    marks,
    '',
    '/bandeau                                  ouvre le panneau de réglages',
    '/bandeau masquer | afficher               le bandeau entier',
    '/bandeau masquer | afficher <info…>       une ou plusieurs infos (ex. /bandeau masquer cout outils)',
    '/bandeau reset                            revient aux réglages par défaut',
    'Couleurs, segments, seuils et Pixel : dans le panneau (/bandeau), ou en haut de hooks/register.tsx',
  ].join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'bandeau',
      description: "Ouvre les réglages du bandeau d'utilisation, ou masque et affiche ses infos",
      argumentHint: '[masquer|afficher|reset|aide] [info…]',
      immediate: true,
    })

    const saved = await $.store.get('prefs')
    if (isPrefs(saved)) await update($, prefs, () => saved)
    style = resolveStyle((await read($, prefs)).style)

    $.clock.every(60_000, () => void update($, tick, n => n + 1))
    await touch($, m => ({ ...m, running: {}, flash: null }))
    const started = await next(e)
    void refresh($)

    return started
  })

  on('prompt.submit', async ($, e, next) => {
    void refresh($)
    const isThanks = style.reactions.thanks && e.origin.kind === 'composer' && THANKS.test(normalize(e.text))
    await (isThanks ? flash($, 'love') : touch($))

    if (e.origin.kind === 'scheduled-trigger') {
      const now = await $.clock.now()
      const prompt = e.text
      await update($, schedule, (s): Schedule => ({
        ...s,
        fires: { ...s.fires, [prompt]: (s.fires?.[prompt] ?? 0) + 1 },
        wakeup: s.wakeup && s.wakeup.at - 5000 <= now ? null : s.wakeup,
      }))
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    void refresh($)

    const now = await $.clock.now()
    const m = await read($, mascot)
    const isPartying = m.flash?.mood === 'party' && m.flash.until > now
    await update($, mascot, (state): Mascot => ({ ...state, running: {} }))
    if (e.reason === 'error' && style.reactions.errors) await flash($, 'error')
    else if (e.reason === 'answer' && !isPartying) await flash($, 'done')
    else await touch($)

    return done
  })

  on('classic.Stop', async ($, e, next) => {
    const done = await next(e)
    const crons = e.session_crons ?? []
    const running = (e.background_tasks ?? []).filter(task => task.status === 'running' || task.status === 'pending')

    const before = await read($, schedule)
    for (const job of before.crons ?? []) {
      if (job.recurring && !crons.some(kept => kept.id === job.id)) loopEnded($, before, job.prompt)
    }

    await update($, schedule, (s): Schedule => {
      const known = new Map((s.crons ?? []).map(job => [job.id, job]))

      return {
        ...s,
        crons: crons.map(
          (job): CronJob => known.get(job.id) ?? { id: job.id, cron: job.schedule, prompt: job.prompt, recurring: job.recurring },
        ),
        wakeup: crons.some(job => !job.recurring) ? s.wakeup : null,
        background: running.map(task => ({ type: task.type, description: task.description })),
      }
    })

    return done
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, u => toUsage(e.rateLimits, e.cost, e.context, u?.startedAt ?? null))
    const measured = await read($, usage)
    if (measured) await checkAlerts($, measured, await $.clock.now())

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const id = e.tool_use_id
    await touch($, m => ({ ...m, running: { ...m.running, [id]: TOOL_MOODS[e.tool] ?? 'think' } }))

    let ran: Awaited<ReturnType<typeof next>>
    try {
      ran = await next(e)
    } finally {
      await touch($, m => ({
        ...m,
        running: Object.fromEntries(Object.entries(m.running).filter(([key]) => key !== id)),
      }))
    }
    if (ran.deny !== undefined) return ran

    if (ran.isError !== true) {
      const call = e as unknown as Call
      const result = (ran as { result?: unknown }).result
      const before = await read($, schedule)
      await update($, schedule, (s): Schedule => scheduleAfter(s, call, result))
      const after = await read($, schedule)

      for (const job of before.crons ?? []) {
        if (job.recurring && !(after.crons ?? []).some(kept => kept.id === job.id)) loopEnded($, before, job.prompt)
      }
      if (before.wakeup && !after.wakeup && call.stop === true) loopEnded($, before, before.wakeup.prompt ?? '')
    }

    const command = (e as { command?: unknown }).command
    const isParty = e.tool === 'Bash' && typeof command === 'string' && PARTY.test(command)
    if (ran.isError === true && style.reactions.errors) await flash($, 'error')
    else if (ran.isError !== true && isParty && style.reactions.party) await flash($, 'party')

    const file = ran.isError === true ? undefined : editedFile(e)
    await update($, activity, (a): Activity => ({
      ...a,
      tools: a.tools + 1,
      files: file === undefined || a.files.includes(file) ? a.files : [...a.files, file].slice(-500),
    }))
    if (EDITORS.has(e.tool) || e.tool === 'Bash') void refreshGit($)

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.message', async ($, e, next) => {
    if (e.element !== TOUCH_KEY) return next(e)
    if (!style.reactions.click) return {}

    const kind = typeof e.data === 'object' && e.data !== null ? (e.data as { kind?: unknown }).kind : undefined
    if (kind === 'poke') {
      await poke($)
    } else if (kind === 'enter') {
      const now = await $.clock.now()
      await update($, mascot, (m): Mascot => ({ ...m, hoverUntil: now + 30_000, lastActivity: now }))
      $.clock.after(30_050, () => void update($, tick, n => n + 1))
    } else if (kind === 'leave') {
      await update($, mascot, (m): Mascot => ({ ...m, hoverUntil: null }))
    }

    return {}
  })

  on('command.run', { command: 'bandeau' }, async ($, e) => {
    const [verb, ...rest] = normalize(e.args).split(/\s+/).filter(Boolean)
    const current = await read($, prefs)
    const save = (p: Prefs) => changePrefs($, () => p)

    if (verb === undefined || verb === 'reglages' || verb === 'panneau') {
      try {
        await $.ui.open({ id: PANE, title: 'Bandeau', focus: true, closeOnEscape: true, columns: 60 })
      } catch {
        return { text: describe(current) }
      }

      return { text: 'Réglages du bandeau ouverts : chaque changement s\'applique tout de suite.' }
    }
    if (verb === 'aide') {
      return { text: describe(current) }
    }
    if (verb === 'reset' || verb === 'defaut') {
      await save({ isHidden: false, overrides: {}, style: {} })

      return { text: 'Bandeau remis aux réglages par défaut.' }
    }

    const isShown = verb === 'afficher' || verb === 'montrer'
    if (!isShown && verb !== 'masquer' && verb !== 'cacher') {
      return { text: `Je ne connais pas « ${verb} ».\n\n${describe(current)}` }
    }

    if (rest.length === 0) {
      await save({ ...current, isHidden: !isShown })

      return { text: isShown ? 'Bandeau affiché.' : 'Bandeau masqué. /bandeau afficher pour le retrouver.' }
    }

    const unknown = rest.filter(word => ALIASES[word] === undefined)
    if (unknown.length > 0) {
      return { text: `Info inconnue : ${unknown.join(', ')}. Infos possibles : ${KEYS.join(', ')}.` }
    }

    const overrides = { ...current.overrides }
    for (const word of rest) {
      const key = ALIASES[word]
      if (key !== undefined) overrides[key] = isShown
    }
    let layout = resolveLayout(current)
    if (isShown) {
      for (const word of rest) {
        const key = ALIASES[word]
        const blocks = BLOCKS.filter(block => key !== undefined && BLOCK_KEYS[block].includes(key))
        for (const block of blocks.filter(b => lineOf(layout, b) === 0)) {
          const home = DEFAULT_LAYOUT.findIndex(line => line.includes(block)) + 1
          layout = setLine(layout, block, home > 0 ? home : 1)
        }
      }
    }
    await save({ ...current, isHidden: isShown ? false : current.isHidden, overrides, layout })

    return { text: `${isShown ? 'Affiché' : 'Masqué'} : ${rest.join(', ')}.` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const p = await read($, prefs)
    style = resolveStyle(p.style)
    if (e.props.hasSurvey || p.isHidden) return next(e)

    await read($, tick)
    const ui = $.ui.resolve(e)
    const band = drawBand(
      {
        Box: ui.Box,
        Text: ui.Text,
        Svg: e.surface === 'desktop' && 'Svg' in ui ? ui.Svg : undefined,
        Client: 'Client' in ui ? ui.Client : undefined,
      },
      {
        show: { ...DEFAULT_SHOW, ...p.overrides },
        u: await read($, usage),
        i: await read($, info),
        a: await read($, activity),
        m: await read($, mascot),
        s: await read($, schedule),
        now: await $.clock.now(),
        isWorking: e.props.isWorking,
        columns: e.props.bodyColumns,
        isPreview: false,
        layout: resolveLayout(p),
      },
    )

    return band ?? next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const p = await read($, prefs)
    style = resolveStyle(p.style)
    await read($, tick)
    const view = await read($, panel)
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const Select = 'Select' in ui ? ui.Select : undefined
    const show = { ...DEFAULT_SHOW, ...p.overrides }
    const layout = resolveLayout(p)

    const preview = drawBand(
      { Box, Text, Svg: e.surface === 'desktop' && 'Svg' in ui ? ui.Svg : undefined },
      {
        show,
        u: await read($, usage),
        i: await read($, info),
        a: await read($, activity),
        m: await read($, mascot),
        s: await read($, schedule),
        now: await $.clock.now(),
        isWorking: false,
        columns: Math.max(20, e.props.bodyColumns - 4),
        isPreview: true,
        layout,
      },
    )

    const setStyle = (change: StyleOverrides) =>
      void changePrefs($, cur => ({ ...cur, style: { ...cur.style, ...change } }))
    const setView = (change: Partial<typeof view>) => void update($, panel, cur => ({ ...cur, ...change }))
    const changeLayout = (change: (current: BlockId[][]) => BlockId[][], enable: InfoKey[] = []) =>
      void changePrefs($, cur => ({
        ...cur,
        layout: change(resolveLayout(cur)),
        overrides: { ...cur.overrides, ...Object.fromEntries(enable.map(key => [key, true])) },
      }))
    const list = (entries: Array<[string | number, string]>) => entries.map(([value, label]) => ({ value: String(value), label }))

    // Une liste de choix ; là où l'app n'en a pas (mobile), un bouton qui passe à l'option suivante.
    const choice = (
      key: string,
      label: string,
      value: string | number | boolean,
      options: Array<{ value: string; label: string }>,
      pick: (value: string) => void,
    ) => {
      const current = String(value)
      if (Select) return <Select key={key} label={label} value={current} options={options} onSelect={picked => pick(picked)} />

      const at = options.findIndex(option => option.value === current)
      const following = options[(at + 1) % options.length] ?? options[0]

      return (
        <Button key={key} label={`${label} : ${options[at]?.label ?? current} ▸`} onPress={() => following && pick(following.value)} />
      )
    }

    const toggle = (key: string, label: string, isOn: boolean, flip: () => void) => (
      <Button key={key} label={`${isOn ? '●' : '○'} ${label}`} dimColor={!isOn} onPress={flip} />
    )

    // Une rangée qui passe à la ligne quand la place manque.
    const row = (key: string, children: RenderElement[], gap = 2) => (
      <Box key={key} flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={gap} rowGap={1}>
        {children}
      </Box>
    )

    const caption = (key: string, text: string) => (
      <Text key={key} dimColor>
        {text}
      </Text>
    )

    const applyProfile = (id: string) => {
      const profile = PROFILES[id]
      if (!profile) return
      void changePrefs($, cur => ({
        ...cur,
        isHidden: false,
        layout: profile.layout.map(blocks => [...blocks]),
        overrides: {
          ...Object.fromEntries(KEYS.map(key => [key, true])),
          ...Object.fromEntries(DETAILS.map(([key]) => [key, profile.details.includes(key)])),
          etat: profile.layout.flat().includes('etat'),
          mascotte: { ...DEFAULT_SHOW, ...cur.overrides }.mascotte,
        },
        style: { ...cur.style, ...profile.style },
      }))
    }

    // ── Disposition : les lignes en pastilles, puis ce qu'on fait du bloc choisi ──
    const isOn = (block: BlockId) => BLOCK_KEYS[block].some(key => show[key])
    const lines = layout.map(blocks => blocks.filter(isOn))
    const hidden = BLOCKS.filter(block => lineOf(layout, block) === 0 || !isOn(block))
    const selected = view.selected
    const selectedLine = selected && isOn(selected) ? lineOf(layout, selected) : 0

    const chip = (block: BlockId) => (
      <Button
        key={`bloc-${block}`}
        label={BLOCK_CHIPS[block]}
        variant={selected === block ? 'primary' : 'secondary'}
        dimColor={hidden.includes(block) && selected !== block}
        onPress={() => setView({ selected: selected === block ? null : block })}
      />
    )

    const lineRow = (n: number, blocks: BlockId[], title: string) => (
      <Box key={`ligne-${n}`} flexDirection="row" alignItems="center" columnGap={1}>
        <Box width={9} flexShrink={0}>
          {n > 0 ? (
            <Text bold color={style.accent}>
              {title}
            </Text>
          ) : (
            <Text dimColor>{title}</Text>
          )}
        </Box>
        <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1} flexGrow={1}>
          {blocks.length > 0 ? blocks.map(chip) : [caption(`vide-${n}`, 'vide')]}
        </Box>
      </Box>
    )

    const actions = (block: BlockId): RenderElement[] => {
      if (selectedLine === 0) {
        return [
          caption('action-titre', `${BLOCK_LABELS[block]} est masqué`),
          <Button key="action-afficher" label="Afficher sur la ligne 1" variant="primary" onPress={() => changeLayout(current => setLine(current, block, 1), BLOCK_KEYS[block])} />,
        ]
      }

      return [
        caption('action-titre', BLOCK_LABELS[block]),
        <Button key="action-gauche" label="◀" onPress={() => changeLayout(current => moveBlock(current, block, -1))} />,
        <Button key="action-droite" label="▶" onPress={() => changeLayout(current => moveBlock(current, block, 1))} />,
        <Button key="action-monter" label="▲ Ligne" onPress={() => selectedLine > 1 && changeLayout(current => setLine(current, block, selectedLine - 1))} />,
        <Button key="action-descendre" label="▼ Ligne" onPress={() => selectedLine < 3 && changeLayout(current => setLine(current, block, selectedLine + 1))} />,
        <Button key="action-masquer" label="Masquer" onPress={() => changeLayout(current => setLine(current, block, 0))} />,
      ]
    }

    const disposition = [
      lineRow(1, lines[0] ?? [], 'Ligne 1'),
      lineRow(2, lines[1] ?? [], 'Ligne 2'),
      lineRow(3, lines[2] ?? [], 'Ligne 3'),
      ...(hidden.length > 0 ? [lineRow(0, hidden, 'Masqués')] : []),
      <Box key="actions" flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={1} rowGap={1} borderStyle="round" borderColor="#4a4a46" paddingX={1}>
        {selected ? actions(selected) : [caption('action-aide', 'Choisis un bloc pour le déplacer, le changer de ligne ou le masquer.')]}
      </Box>,
      row('ranger', [
        caption('ranger-titre', 'Tout ranger sur'),
        ...([1, 2, 3] as const).map(n => (
          <Button key={`ranger-${n}`} label={`${n} ligne${n > 1 ? 's' : ''}`} onPress={() => changeLayout(current => arrange(current, n))} />
        )),
      ], 1),
      row('details', [
        caption('details-titre', 'Détails'),
        ...DETAILS.map(([key, label]) =>
          toggle(`info-${key}`, label, show[key], () =>
            void changePrefs($, cur => ({ ...cur, overrides: { ...cur.overrides, [key]: !({ ...DEFAULT_SHOW, ...cur.overrides }[key]) } })),
          ),
        ),
      ], 1),
      row('textes', [
        choice('separator', 'Séparateur', style.separator, list([['space', 'Espace'], ['dot', 'Point ·'], ['bar', 'Barre │']]), v => setStyle({ separator: v as Style['separator'] })),
        choice('labels', 'Libellés', style.labels, list([['short', 'Courts'], ['long', 'Longs']]), v => setStyle({ labels: v as Style['labels'] })),
        choice('currency', 'Coût', style.currency, list([['usd', '$'], ['eur', '€']]), v => setStyle({ currency: v as Style['currency'] })),
      ]),
    ]

    // ── Style : jauges et couleurs ──
    const looks = [
      caption('jauges-titre', 'Jauges'),
      row('jauges-forme', [
        choice('shape', 'Forme', style.shape, list([['squares', 'Carrés'], ['pill', 'Pilule'], ['dots', 'Points'], ['thin', 'Traits']]), v => setStyle({ shape: v as Style['shape'] })),
        choice('size', 'Taille', style.size, list([['small', 'Petite'], ['medium', 'Moyenne'], ['large', 'Grande']]), v => setStyle({ size: v as Style['size'] })),
        choice('segments', 'Segments', style.segments, list([5, 8, 10, 12, 15, 20].map(n => [n, `${n}`])), v => setStyle({ segments: Number(v) })),
      ]),
      row('jauges-valeurs', [
        choice('percent', 'Afficher', style.percent, list([['left', '% restant'], ['used', '% consommé']]), v => setStyle({ percent: v as Style['percent'] })),
        choice('warnAt', 'Orange dès', style.warnAt, list([50, 60, 70, 80].map(n => [n, `${n} %`])), v => setStyle({ warnAt: Number(v) })),
        choice('alertAt', 'Rouge dès', style.alertAt, list([80, 85, 90, 95].map(n => [n, `${n} %`])), v => setStyle({ alertAt: Number(v) })),
      ]),
      caption('couleurs-titre', 'Couleurs'),
      row('couleurs', [
        choice('palette', 'Palette', style.palette, list(Object.entries(PALETTES).map(([id, palette]) => [id, palette.label])), v => setStyle({ palette: v })),
        choice('accent', 'Accent', style.accent, list(Object.entries(ACCENTS)), v => setStyle({ accent: v })),
        choice('costAccent', 'Coût', style.costAccent, list([['false', 'Normal'], ['true', 'Accent']]), v => setStyle({ costAccent: v === 'true' })),
      ]),
    ]

    // ── Pixel ──
    const reactions = style.reactions
    const setReaction = (key: keyof typeof reactions) => setStyle({ reactions: { ...reactions, [key]: !reactions[key] } })
    const pixel = [
      row('pixel-allure', [
        choice('mascotte', 'Afficher', show.mascotte, list([['true', 'Oui'], ['false', 'Non']]), v =>
          void changePrefs($, cur => ({ ...cur, overrides: { ...cur.overrides, mascotte: v === 'true' } })),
        ),
        choice('pixelColor', 'Couleur', style.pixelColor, list(Object.entries(PIXEL_COLORS)), v => setStyle({ pixelColor: v })),
      ]),
      row('pixel-place', [
        choice('pixelSize', 'Taille', style.pixelSize, list([['small', 'Petit'], ['normal', 'Normal'], ['large', 'Grand']]), v => setStyle({ pixelSize: v as Style['pixelSize'] })),
        choice('pixelSide', 'Côté', style.pixelSide, list([['right', 'Droite'], ['left', 'Gauche']]), v => setStyle({ pixelSide: v as Style['pixelSide'] })),
      ]),
      row('reactions', [
        caption('reactions-titre', 'Réagit'),
        toggle('reaction-click', 'au clic', reactions.click, () => setReaction('click')),
        toggle('reaction-thanks', 'aux mercis', reactions.thanks, () => setReaction('thanks')),
        toggle('reaction-party', 'aux commits', reactions.party, () => setReaction('party')),
        toggle('reaction-errors', 'aux erreurs', reactions.errors, () => setReaction('errors')),
      ], 1),
      row('pixel-temps', [
        choice('flashSeconds', 'Réactions', style.flashSeconds, list([2, 4, 6, 10].map(n => [n, `${n} s`])), v => setStyle({ flashSeconds: Number(v) })),
        choice('sleepAfterMinutes', "S'endort après", style.sleepAfterMinutes, list([5, 10, 30, 0].map(n => [n, n === 0 ? 'Jamais' : `${n} min`])), v =>
          setStyle({ sleepAfterMinutes: Number(v) }),
        ),
      ]),
    ]

    // ── Alertes ──
    const alerting = [
      choice('alertLimitAt', 'Limite qui dépasse', style.alertLimitAt, list([[0, 'Désactivée'], [75, '75 %'], [90, '90 %']]), v => setStyle({ alertLimitAt: Number(v) })),
      choice('alertContextBelow', 'Contexte sous', style.alertContextBelow, list([[0, 'Désactivée'], [20, '20 % libre'], [10, '10 % libre']]), v =>
        setStyle({ alertContextBelow: Number(v) }),
      ),
      choice('alertLoopEnd', "Fin d'une boucle", style.alertLoopEnd, list([['true', 'Notification'], ['false', 'Rien']]), v => setStyle({ alertLoopEnd: v === 'true' })),
      caption('alertes-note', 'Une notification discrète, une seule fois par seuil.'),
    ]

    const content = { disposition, style: looks, pixel, alertes: alerting }[view.tab] ?? disposition

    return (
      <Box flexDirection="column" rowGap={1}>
        <Box flexDirection="column" borderStyle="round" borderColor={style.accent} paddingX={1}>
          {preview ?? <Text dimColor>Rien à afficher : tout est masqué.</Text>}
        </Box>

        {row('profils', [
          caption('profils-titre', 'Profils'),
          ...Object.entries(PROFILES).map(([id, profile]) => (
            <Button key={`profil-${id}`} label={profile.label} onPress={() => applyProfile(id)} />
          )),
        ], 1)}

        {row('onglets', TABS.map(([tab, label]) => (
          <Button key={`onglet-${tab}`} label={label} variant={view.tab === tab ? 'primary' : 'secondary'} onPress={() => setView({ tab })} />
        )), 1)}

        <Box flexDirection="column" rowGap={1} paddingX={1}>
          {content}
        </Box>

        {row('pied', [
          <Button key="visible" label={p.isHidden ? 'Afficher le bandeau' : 'Masquer le bandeau'} onPress={() => void changePrefs($, cur => ({ ...cur, isHidden: !cur.isHidden }))} />,
          <Button key="defaut" label="Tout réinitialiser" onPress={() => void changePrefs($, () => ({ isHidden: false, overrides: {}, style: {} }))} />,
          <Button key="fermer" label="Fermer" role="dismiss" onPress={() => void $.ui.close({ id: PANE })} />,
        ], 1)}
      </Box>
    )
  })
}
