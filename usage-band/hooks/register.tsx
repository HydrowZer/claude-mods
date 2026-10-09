import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  Register,
  SessionContextUsage,
  SessionCost,
  SessionRateLimit,
  TextProps,
} from 'claude-code'

import type { Activity, Info, InfoKey, Limit, Prefs, Usage } from '../types'

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
  duree: true, // durée de la session
  cout: true, // Session ≈ 5,92 $
  outils: true, // nombre d'appels d'outils
  fichiers: true, // fichiers modifiés
  contexte: true, // place libre dans la fenêtre de contexte
  limites: true, // limites 5 h, 7 j…
  reset: true, // temps avant le reset de chaque limite
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
  /** Couleurs : un nom (`green`) ou de l'hexadécimal. */
  colors: {
    ok: '#4ade80',
    warn: '#fb923c',
    alert: '#f87171',
    model: '#a78bfa',
    track: '#8a8a85',
    working: '#4ade80',
  },
  /** Noms courts des limites. */
  limitLabels: { five_hour: '5 h', seven_day: '7 j', spend_limit: 'Plafond' } as Record<string, string>,
}

// ─────────────────────────────────────────────────────────────────────────────

const usage = atom({ plugin: 'usage-band', key: 'usage' } as const, null)
const info = atom({ plugin: 'usage-band', key: 'info' } as const, {
  model: null,
  project: null,
  branch: null,
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
const tick = atom({ plugin: 'usage-band', key: 'tick' } as const, 0)

const KEYS = Object.keys(DEFAULT_SHOW) as InfoKey[]

const ALIASES: Record<string, InfoKey> = {
  ...Object.fromEntries(KEYS.map(key => [key, key])),
  model: 'modele',
  dossier: 'projet',
  git: 'branche',
  temps: 'duree',
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
  return path.split('/').filter(Boolean).pop() ?? null
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

async function gitBranch($: EngineInterface, cwd: string): Promise<string | null> {
  const opts = { cwd, timeoutMs: 3000 }
  const named = await $.process.run(['git', 'symbolic-ref', '--short', '-q', 'HEAD'], opts)
  if (named.exitCode === 0 && named.stdout.trim()) return named.stdout.trim()

  const detached = await $.process.run(['git', 'rev-parse', '--short', 'HEAD'], opts)

  return detached.exitCode === 0 && detached.stdout.trim() ? detached.stdout.trim() : null
}

async function refresh($: EngineInterface): Promise<void> {
  try {
    const u = await $.session.usage()
    const model = await $.session.model()
    const cwd = await $.session.cwd()
    const branch = await gitBranch($, cwd).catch(() => null)
    const next: Info = { model: prettyModel(model), project: basename(cwd), branch }

    await update($, usage, () => toUsage(u.rateLimits, u.cost, u.context, u.startedAt))
    await update($, info, () => next)
    await update($, activity, (a): Activity =>
      a.since === u.startedAt ? a : { since: u.startedAt, tools: 0, files: [] },
    )
  } catch {
    // Le bandeau garde ses dernières valeurs.
  }
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
    const started = await next(e)
    void refresh($)

    return started
  })

  on('prompt.submit', ($, e, next) => {
    void refresh($)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    void refresh($)

    return done
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, u => toUsage(e.rateLimits, e.cost, e.context, u?.startedAt ?? null))

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined) return ran

    const file = ran.isError === true ? undefined : editedFile(e)
    await update($, activity, (a): Activity => ({
      ...a,
      tools: a.tools + 1,
      files: file === undefined || a.files.includes(file) ? a.files : [...a.files, file].slice(-500),
    }))

    return ran
  }).catch(($, e, next) => next(e))

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
    await read($, tick)
    const now = await $.clock.now()
    const show = { ...DEFAULT_SHOW, ...p.overrides }

    const lines = [
      { key: 'infos', chunks: topChunks(show, u, i, a, now, e.props.isWorking) },
      { key: 'jauges', chunks: gaugeChunks(show, u, now) },
    ].filter(line => line.chunks.length > 0)

    if (lines.length === 0) return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const Svg = e.surface === 'desktop' && 'Svg' in ui ? ui.Svg : undefined
    const room = e.props.bodyColumns
    const { width, height, gap } = SETTINGS.segment
    const meterWidth = SETTINGS.segments * width + (SETTINGS.segments - 1) * gap
    const empty = SETTINGS.segments

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

    return (
      <Box flexDirection="column">
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
    )
  })
}
