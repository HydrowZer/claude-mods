import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  Register,
  SessionContextUsage,
  SessionCost,
  SessionRateLimit,
  TextProps,
} from 'claude-code'

import type { Activity, GitState, Info, InfoKey, Limit, Mascot, Mood, Prefs, Usage } from '../types'
import { MASCOT_HEIGHT, MASCOT_WIDTH, MOODS, mascotSvg } from './mascot'

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
  mascotte: true, // Pixel, tout à droite
}

const SETTINGS = {
  /** Nombre de segments par jauge. */
  segments: 10,
  /** Segments dessinés dans l'app desktop, en pixels. */
  segment: { width: 6, height: 9, gap: 2, radius: 1.5 },
  /** Opacité des segments vides dans l'app desktop (0 à 1). */
  trackOpacity: 0.3,
  /** Segments dans le terminal, où le dessin n'existe pas : plein, vide. */
  full: '▰',
  empty: '▱',
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
  },
  /** Noms courts des limites. */
  limitLabels: { five_hour: '5 h', seven_day: '7 j', spend_limit: 'Plafond' } as Record<string, string>,
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

/** Ce que fait Pixel quand on clique dessus, à tour de rôle. */
const POKE_MOODS: Mood[] = ['giggle', 'boing', 'surprise', 'love']

/** La zone tactile posée sur Pixel. */
const TOUCH_KEY = 'pixel-touch'

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
  prix: 'cout',
  ctx: 'contexte',
}

const EDITORS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

type Span = { text: string; color?: string; bold?: boolean; dim?: boolean }
type Meter = { filled: number; color: string; alt: string }
type Part = Span | Meter
type Chunk = { key: string; gap: number; full: Part[]; short: Part[] }

const dim = (text: string): Span => ({ text, dim: true })
const same = (key: string, parts: Part[]): Chunk => ({ key, gap: 0, full: parts, short: parts })
const isMeter = (part: Part): part is Meter => 'filled' in part

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
  const { isHidden, overrides } = value as Record<string, unknown>

  return typeof isHidden === 'boolean' && typeof overrides === 'object' && overrides !== null
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
  return `${usd.toFixed(2).replace('.', ',')} $`
}

function pct(left: number): string {
  const value = left < 10 ? Math.round(left * 10) / 10 : Math.round(left)

  return `${String(value).replace('.', ',')} %`
}

function minutes(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ${String(min % 60).padStart(2, '0')}`

  return `${Math.floor(h / 24)} j ${h % 24} h`
}

function untilReset(resetsAt: string | undefined, now: number): string | null {
  if (!resetsAt) return null
  const ms = Date.parse(resetsAt) - now

  return ms > 0 ? minutes(Math.round(ms / 60_000)) : null
}

function toneFor(used: number): string {
  const { ok, warn, alert } = SETTINGS.colors

  return used >= SETTINGS.alertAt ? alert : used >= SETTINGS.warnAt ? warn : ok
}

function gauge(key: string, label: string, used: number, tail: string | null): Chunk {
  const color = toneFor(used)
  const left = Math.min(100, Math.max(0, 100 - used))
  const filled = Math.round((left / 100) * SETTINGS.segments)
  const parts: Part[] = [
    dim(label),
    { filled, color, alt: `${label} : ${pct(left)} restant` },
    { text: pct(left), bold: true, color },
    ...(tail ? [dim(tail)] : []),
  ]

  return { key, gap: 1, full: parts, short: parts }
}

function meterSvg({ filled, color }: Meter): string {
  const { width, height, gap, radius } = SETTINGS.segment
  const total = SETTINGS.segments * width + (SETTINGS.segments - 1) * gap
  const rects = Array.from({ length: SETTINGS.segments }, (_, i) => {
    const fill = i < filled ? `fill="${color}"` : `fill="${SETTINGS.colors.track}" fill-opacity="${SETTINGS.trackOpacity}"`

    return `<rect x="${i * (width + gap)}" y="0" width="${width}" height="${height}" rx="${radius}" ${fill}/>`
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${height}" viewBox="0 0 ${total} ${height}">${rects.join('')}</svg>`
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

function moodFor(m: Mascot, isWorking: boolean, u: Usage | null, now: number): Mood {
  const running = Object.values(m.running)
  const tool = running[running.length - 1]
  if (tool) return tool
  if (m.flash && m.flash.until > now) return m.flash.mood
  if (m.hoverUntil != null && m.hoverUntil > now) return 'hello'
  if (isWorking) return 'think'

  const { alertContextFree, sleepAfterMinutes } = SETTINGS.mascot
  const isTight =
    u !== null &&
    (u.limits.some(limit => limit.percentUsed >= SETTINGS.alertAt) ||
      (u.contextPercent != null && 100 - u.contextPercent < alertContextFree))
  if (isTight) return 'alert'
  if (m.lastActivity != null && now - m.lastActivity > sleepAfterMinutes * 60_000) return 'sleep'

  return 'idle'
}

async function touch($: EngineInterface, change: (m: Mascot) => Mascot = m => m): Promise<void> {
  const now = await $.clock.now()
  await update($, mascot, (m): Mascot => ({ ...change(m), lastActivity: now }))
}

async function flash(
  $: EngineInterface,
  mood: Mood,
  seconds = SETTINGS.mascot.flashSeconds,
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
    out.push(same('modele', [{ text: i.model, color: colors.model }]))
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
    const value = { text: money(u.costUsd), bold: true }
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
    out.push(gauge('contexte', 'Ctx', u.contextPercent, null))
  }
  if (show.limites) {
    for (const limit of u.limits) {
      const label = SETTINGS.limitLabels[limit.kind] ?? limit.kind
      const reset = show.reset ? untilReset(limit.resetsAt, now) : null
      out.push(gauge(limit.kind, label, limit.percentUsed, reset ? `· ${reset}` : null))
    }
  }

  return out
}

function lineWidth(chunks: Chunk[]): number {
  const cells = chunks.reduce(
    (n, chunk) =>
      n +
      chunk.gap * Math.max(0, chunk.full.length - 1) +
      chunk.full.reduce((m, part) => m + (isMeter(part) ? SETTINGS.segments : [...part.text].length), 0),
    0,
  )

  return cells + SETTINGS.gap * Math.max(0, chunks.length - 1)
}

function textProps(span: Span): TextProps {
  const props: TextProps = {}
  if (span.color !== undefined) props.color = span.color
  if (span.bold) props.bold = true
  if (span.dim) props.dimColor = true

  return props
}

function describe(p: Prefs): string {
  const show = { ...DEFAULT_SHOW, ...p.overrides }
  const marks = KEYS.map(key => `${show[key] ? '✓' : '✗'} ${key}`).join('   ')

  return [
    `Bandeau d'utilisation : ${p.isHidden ? 'masqué' : 'affiché'}`,
    marks,
    '',
    '/bandeau masquer | afficher               le bandeau entier',
    '/bandeau masquer | afficher <info…>       une ou plusieurs infos (ex. /bandeau masquer cout outils)',
    '/bandeau reset                            revient aux réglages par défaut',
    'Couleurs, largeur des barres et seuils : en haut de hooks/register.tsx',
  ].join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'bandeau',
      description: "Masque, affiche ou règle les infos du bandeau d'utilisation",
      argumentHint: '[masquer|afficher|reset] [info…]',
      immediate: true,
    })

    const saved = await $.store.get('prefs')
    if (isPrefs(saved)) await update($, prefs, () => saved)

    $.clock.every(60_000, () => void update($, tick, n => n + 1))
    await touch($, m => ({ ...m, running: {}, flash: null }))
    const started = await next(e)
    void refresh($)

    return started
  })

  on('prompt.submit', async ($, e, next) => {
    void refresh($)
    const isThanks = e.origin.kind === 'composer' && THANKS.test(normalize(e.text))
    await (isThanks ? flash($, 'love') : touch($))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    void refresh($)

    const now = await $.clock.now()
    const m = await read($, mascot)
    const isPartying = m.flash?.mood === 'party' && m.flash.until > now
    await update($, mascot, (state): Mascot => ({ ...state, running: {} }))
    if (e.reason === 'error') await flash($, 'error')
    else if (e.reason === 'answer' && !isPartying) await flash($, 'done')
    else await touch($)

    return done
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, u => toUsage(e.rateLimits, e.cost, e.context, u?.startedAt ?? null))

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

    const command = (e as { command?: unknown }).command
    if (ran.isError === true) await flash($, 'error')
    else if (e.tool === 'Bash' && typeof command === 'string' && PARTY.test(command)) await flash($, 'party')

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
    const save = async (p: Prefs) => {
      await update($, prefs, () => p)
      await $.store.set('prefs', p)
    }

    if (verb === undefined || verb === 'aide') {
      return { text: describe(current) }
    }
    if (verb === 'reset' || verb === 'defaut') {
      await save({ isHidden: false, overrides: {} })

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
    await save({ isHidden: isShown ? false : current.isHidden, overrides })

    return { text: `${isShown ? 'Affiché' : 'Masqué'} : ${rest.join(', ')}.` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const p = await read($, prefs)
    if (e.props.hasSurvey || p.isHidden) return next(e)

    const u = await read($, usage)
    const i = await read($, info)
    const a = await read($, activity)
    const m = await read($, mascot)
    await read($, tick)
    const now = await $.clock.now()
    const show = { ...DEFAULT_SHOW, ...p.overrides }
    const mood = show.mascotte ? moodFor(m, e.props.isWorking, u, now) : null

    const lines = [
      { key: 'infos', chunks: topChunks(show, u, i, a, now, e.props.isWorking) },
      { key: 'jauges', chunks: gaugeChunks(show, u, now) },
    ].filter(line => line.chunks.length > 0)

    if (lines.length === 0 && mood === null) return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const Svg = e.surface === 'desktop' && 'Svg' in ui ? ui.Svg : undefined
    const Client = 'Client' in ui ? ui.Client : undefined
    const { width, height, gap } = SETTINGS.segment
    const meterWidth = SETTINGS.segments * width + (SETTINGS.segments - 1) * gap
    const empty = SETTINGS.segments
    const mascotCells = mood === null ? 0 : (Svg ? 10 : [...MOODS[mood].kao].length) + 2
    const room = e.props.bodyColumns - mascotCells

    const drawMeter = (meter: Meter) => {
      if (Svg) {
        return <Svg source={meterSvg(meter)} alt={meter.alt} width={meterWidth} height={height} />
      }

      const glyphs = [
        { text: SETTINGS.full.repeat(meter.filled), color: meter.color },
        { text: SETTINGS.empty.repeat(empty - meter.filled), color: SETTINGS.colors.track, dim: true },
      ].filter(glyph => glyph.text !== '')

      return (
        <Box flexDirection="row">
          {glyphs.map(glyph => (
            <Text {...textProps(glyph)}>{glyph.text}</Text>
          ))}
        </Box>
      )
    }

    const draw = (part: Part) =>
      isMeter(part) ? drawMeter(part) : <Text {...textProps(part)}>{part.text}</Text>

    const drawMascot = (current: Mood) =>
      Svg ? (
        <Svg
          source={mascotSvg(current)}
          alt={`Mascotte : ${MOODS[current].label}`}
          width={MASCOT_WIDTH}
          height={MASCOT_HEIGHT}
        />
      ) : (
        <Text color={SETTINGS.mascot.color} bold>
          {MOODS[current].kao}
        </Text>
      )

    return (
      <Box flexDirection="row" alignItems="center" columnGap={2}>
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          {lines.map(line => {
            const isShort = lineWidth(line.chunks) > room

            return (
              <Box key={line.key} flexDirection="row" flexWrap="wrap" columnGap={SETTINGS.gap}>
                {line.chunks.map(chunk => (
                  <Box
                    key={`${line.key}-${chunk.key}`}
                    flexDirection="row"
                    alignItems="center"
                    columnGap={chunk.gap}
                  >
                    {(isShort ? chunk.short : chunk.full)
                      .filter(part => isMeter(part) || part.text !== '')
                      .map(draw)}
                  </Box>
                ))}
              </Box>
            )
          })}
        </Box>
        {mood !== null && (
          <Box key="mascotte" flexShrink={0}>
            {drawMascot(mood)}
            {Client && (
              <Box position="absolute" top={0} left={0} right={0} bottom={0}>
                <Client key={TOUCH_KEY} module="./touch.ts" width="100%" height="100%" />
              </Box>
            )}
          </Box>
        )}
      </Box>
    )
  })
}
