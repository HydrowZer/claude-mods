import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const NOW = Date.parse('2026-10-09T12:00:00Z')
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString()

const CONTEXT = { window: 200_000, tokens: 76_000, percent: 38 }
const LIMITS = [
  { kind: 'five_hour', percentUsed: 28, resetsAt: at(2 * 60 + 14) },
  { kind: 'seven_day', percentUsed: 81, resetsAt: at((3 * 24 + 4) * 60) },
]

const STATUS = [
  '# branch.oid 3c63755a1b2c3d4e5f60718293a4b5c6d7e8f901',
  '# branch.head main',
  '# branch.upstream origin/main',
  '# branch.ab +2 -1',
  '1 .M N... 100644 100644 100644 aaaaaaa bbbbbbb hooks/register.tsx',
  '1 M. N... 100644 100644 100644 ccccccc ddddddd README.md',
  '? notes.txt',
  '',
].join('\n')
const NUMSTAT = '120\t30\thooks/register.tsx\n4\t7\tREADME.md\n-\t-\tlogo.png\n'

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 20,
  bodyColumns: 160,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
}

const COMMAND = {
  command: 'bandeau',
  origin: { kind: 'composer' } as const,
  presentation: { isFullscreen: false, columns: 160 },
}

function world(on: On, cwd = '/Users/moi/Developer/Bouilles') {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW - 42 * 60_000,
      context: CONTEXT,
      rateLimits: LIMITS,
      cost: { usd: 1.84 },
    },
  }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: cwd }))
  on('process.run', (_$, e) => ({
    value: {
      exitCode: 0,
      stdout: e.argv.includes('status') ? STATUS : e.argv.includes('diff') ? NUMSTAT : '',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))

  return clock
}

async function shown(
  $: Engine,
  surface: 'terminal' | 'desktop' = 'terminal',
  props: Partial<typeof PROPS> = {},
): Promise<string> {
  const band = await $.ui.mount({
    plugin: 'usage-band',
    surface,
    component: 'AbovePrompt',
    props: { ...PROPS, ...props },
  })
  const texts = await band.findAll({ type: 'Text' })

  return texts.map(found => found.text).join('')
}

async function measure($: Engine) {
  await $.session.measure({
    context: CONTEXT,
    rateLimits: LIMITS,
    cost: { usd: 1.84 },
    changed: ['context', 'rateLimits', 'cost'],
  })
}

test('dessine les segments en texte dans le terminal', async ($, on) => {
  world(on)
  await measure($)
  const text = await shown($, 'terminal')

  expect(text).toContain('Session ≈ 1,84 $')
  expect(text).toContain('Ctx▰▰▰▰▰▰▱▱▱▱62 %')
  expect(text).toContain('5 h▰▰▰▰▰▰▰▱▱▱72 %· 2 h 14')
  expect(text).toContain('7 j▰▰▱▱▱▱▱▱▱▱19 %· 3 j 4 h')
})

test("dessine les segments en SVG dans l'app desktop", async ($, on) => {
  world(on)
  await measure($)
  const band = await $.ui.mount({ plugin: 'usage-band', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  const meters = (await band.findAll({ type: 'Svg' })).filter(
    found => !String(found.props.alt).startsWith('Mascotte'),
  )
  const text = (await band.findAll({ type: 'Text' })).map(found => found.text).join('')

  expect(meters.map(meter => meter.props.alt)).toEqual([
    'Ctx : 62 % restant',
    '5 h : 72 % restant',
    '7 j : 19 % restant',
  ])
  const lit = meters.map(meter => String(meter.props.source).match(/<rect[^>]*fill="#/g)?.length ?? 0)
  const litGreen = meters.map(meter => String(meter.props.source).split('fill="#4ade80"').length - 1)
  expect(lit).toEqual([10, 10, 10])
  expect(litGreen).toEqual([6, 7, 0])
  expect(String(meters[2]?.props.source).split('fill="#fb923c"').length - 1).toBe(2)
  expect(text).not.toContain('▰')
  expect(text).toContain('72 %· 2 h 14')
})

test('le démarrage remplit modèle, projet, branche et durée', async ($, on) => {
  const clock = world(on)
  await $.session.start({ cwd: '/Users/moi/Developer/Bouilles', surface: 'terminal', isInteractive: true })
  await clock.advance(1)
  const text = await shown($)

  expect(text).toContain('Opus 5.5')
  expect(text).toContain('Bouilles · main')
  expect(text).toContain('42 min')
})

test('compte les outils et les fichiers modifiés', async ($, on) => {
  world(on)
  on('tool.call', () => ({ result: null, text: 'ok' }))
  await measure($)
  await $.tool.call({ tool: 'Edit', file_path: '/a.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Edit', file_path: '/a.ts', old_string: 'b', new_string: 'c' })
  await $.tool.call({ tool: 'Read', file_path: '/b.ts' })

  expect(await shown($)).toContain('3 outils · 1 fichier')
})

test('/bandeau masquer coût retire le coût, /bandeau reset le remet', async ($, on) => {
  world(on)
  await measure($)

  const hidden = await $.command.run({ ...COMMAND, args: 'masquer coût outils' })
  expect(hidden.text).toContain('Masqué')
  expect(await shown($)).not.toContain('1,84 $')
  expect(await shown($)).toContain('72 %')

  await $.command.run({ ...COMMAND, args: 'reset' })
  expect(await shown($)).toContain('1,84 $')
})

test('/bandeau masquer cache tout le bandeau', async ($, on) => {
  world(on)
  await measure($)
  await $.command.run({ ...COMMAND, args: 'masquer' })

  expect(await shown($)).toBe('')
})

test("affiche l'état git à côté de la branche", async ($, on) => {
  const clock = world(on)
  await $.session.start({ cwd: '/Users/moi/Developer/Bouilles', surface: 'terminal', isInteractive: true })
  await clock.advance(1)
  const text = await shown($)

  expect(text).toContain('Bouilles · main')
  expect(text).toContain('+124−37')
  expect(text).toContain('3 non commités')
  expect(text).toContain('↑2↓1')
})

test('Pixel est au repos dans le terminal et dessiné dans l\'app desktop', async ($, on) => {
  world(on)
  await measure($)

  expect(await shown($, 'terminal')).toContain('(•ᴗ•)')

  const band = await $.ui.mount({ plugin: 'usage-band', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  const pixel = (await band.findAll({ type: 'Svg' })).find(found => found.props.alt === 'Mascotte : au repos')
  expect(pixel?.props.isInteractive).toBeUndefined()
  expect(String(pixel?.props.source)).toContain('<title>Pixel au repos</title>')
})

test('Pixel réfléchit pendant un tour, puis réagit aux erreurs et aux commits', async ($, on) => {
  const clock = world(on)
  let isError = true
  on('tool.call', () => (isError ? { result: null, isError: true, text: 'boom' } : { result: null, text: 'ok' }))
  await measure($)

  expect(await shown($, 'terminal', { isWorking: true })).toContain('(•_•)…')

  await $.tool.call({ tool: 'Bash', command: 'false' })
  expect(await shown($)).toContain('(×_×)')

  isError = false
  await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  expect(await shown($)).toContain('\\(^o^)/')

  await clock.advance(5000)
  expect(await shown($)).toContain('(•ᴗ•)')
})

test('Pixel fond quand on dit merci, et s\'endort après 10 minutes', async ($, on) => {
  const clock = world(on)
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await measure($)

  await $.prompt.submit({ text: 'Merci, génial !', wait: false, origin: { kind: 'composer' } })
  expect(await shown($)).toContain('(♥ᴗ♥)')

  await clock.advance(11 * 60_000)
  expect(await shown($)).toContain('(-_-) zᶻ')
})

test('/bandeau masquer mascotte retire Pixel', async ($, on) => {
  world(on)
  await measure($)
  await $.command.run({ ...COMMAND, args: 'masquer mascotte' })

  expect(await shown($)).not.toContain('(•ᴗ•)')
  expect(await shown($)).toContain('72 %')
})

test('sous Windows, affiche seulement le nom du dossier', async ($, on) => {
  const clock = world(on, 'C:\\Users\\jaluc\\OneDrive\\Bureau\\PROJET IA\\SCUBILOODMAINONEDRIVE')
  await $.session.start({ cwd: 'C:\\Users\\jaluc', surface: 'desktop', isInteractive: true })
  await clock.advance(1)
  const text = await shown($, 'desktop')

  expect(text).toContain('SCUBILOODMAINONEDRIVE · main')
  expect(text).not.toContain('C:')
  expect(text).toContain('Session ≈ 1,84 $')
})

test('coupe un nom de projet trop long', async ($, on) => {
  const clock = world(on, '/home/moi/un-nom-de-projet-vraiment-beaucoup-trop-long')
  await $.session.start({ cwd: '/home/moi', surface: 'terminal', isInteractive: true })
  await clock.advance(1)

  expect(await shown($)).toContain('un-nom-de-projet-vraiment-bea… · main')
})

const CLICK = { type: 'down', x: 1, y: 0, button: 'left', in: 'pixel-touch' } as const

async function mountDesktop($: Engine) {
  return $.ui.mount({ plugin: 'usage-band', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
}

async function pixelLabel(band: Awaited<ReturnType<typeof mountDesktop>>): Promise<string | undefined> {
  const svgs = await band.findAll({ type: 'Svg' })
  const pixel = svgs.find(found => String(found.props.alt).startsWith('Mascotte'))

  return pixel === undefined ? undefined : String(pixel.props.alt)
}

test('cliquer sur Pixel le fait réagir, à tour de rôle', async ($, on) => {
  const clock = world(on)
  await measure($)
  const band = await mountDesktop($)

  const seen: Array<string | undefined> = []
  for (let i = 0; i < 4; i += 1) {
    await band.pointer(CLICK)
    seen.push(await pixelLabel(band))
    await clock.advance(1000)
  }

  expect(seen).toEqual([
    'Mascotte : rigole',
    'Mascotte : saute de joie',
    'Mascotte : est surpris',
    'Mascotte : est content',
  ])

  await clock.advance(3000)
  expect(await pixelLabel(band)).toBe('Mascotte : au repos')
})

test('Pixel a la tête qui tourne si on clique 5 fois de suite', async ($, on) => {
  world(on)
  await measure($)
  const band = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', component: 'AbovePrompt', props: PROPS })

  for (let i = 0; i < 5; i += 1) await band.pointer(CLICK)

  const text = (await band.findAll({ type: 'Text' })).map(found => found.text).join('')
  expect(text).toContain('(@_@)')
})

test('Pixel fait coucou quand la souris passe dessus', async ($, on) => {
  world(on)
  await measure($)
  const band = await mountDesktop($)

  await band.pointer({ type: 'enter', x: 0, y: 0, in: 'pixel-touch' })
  expect(await pixelLabel(band)).toBe('Mascotte : te fait coucou')

  await band.pointer({ type: 'leave', x: 0, y: 0, in: 'pixel-touch' })
  expect(await pixelLabel(band)).toBe('Mascotte : au repos')
})

function tools(on: On) {
  let created = 0
  on('tool.call', (_$, e) => {
    switch (e.tool) {
      case 'CronCreate':
        return { result: { id: 'c1', humanSchedule: 'Every 5 minutes', recurring: true }, text: 'ok' }
      case 'ScheduleWakeup':
        return { result: { scheduledFor: NOW + 12 * 60_000, clampedDelaySeconds: 720, wasClamped: false }, text: 'ok' }
      case 'TaskCreate': {
        created += 1
        const subject = String((e as { subject?: unknown }).subject)
        return { result: { task: { id: 'ABC'.charAt(created - 1), subject } }, text: 'ok' }
      }
      default:
        return { result: null, text: 'ok' }
    }
  })
}

test('affiche une /loop avec son rythme, le prochain passage et ses tours', async ($, on) => {
  world(on)
  tools(on)
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await measure($)

  await $.tool.call({ tool: 'CronCreate', cron: '*/5 * * * *', prompt: '/babysit-prs', recurring: true })
  let text = await shown($)
  expect(text).toContain('⟳/babysit-prstoutes les 5 mindans 5 min')

  await $.prompt.submit({ text: '/babysit-prs', wait: false, origin: { kind: 'scheduled-trigger' } })
  await $.prompt.submit({ text: '/babysit-prs', wait: false, origin: { kind: 'scheduled-trigger' } })
  expect(await shown($)).toContain('· 2×')

  await $.tool.call({ tool: 'CronDelete', id: 'c1' })
  text = await shown($)
  expect(text).not.toContain('⟳')
})

test('affiche le réveil d\'une boucle dynamique avec sa raison', async ($, on) => {
  world(on)
  tools(on)
  await measure($)

  await $.tool.call({
    tool: 'ScheduleWakeup',
    delaySeconds: 720,
    reason: 'surveille la CI du déploiement',
    prompt: '<<autonomous-loop-dynamic>>',
  })
  expect(await shown($)).toContain('◷boucle autonomedans 12 min· surveille la CI du déploiement')

  await $.tool.call({ tool: 'ScheduleWakeup', stop: true })
  expect(await shown($)).not.toContain('◷')
})

test('affiche la progression des tâches et celle en cours', async ($, on) => {
  world(on)
  tools(on)
  await measure($)

  for (const subject of ['Ajouter les tests', 'Corriger Windows', 'Publier']) {
    await $.tool.call({ tool: 'TaskCreate', subject, description: subject })
  }
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'A', status: 'completed' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'C', status: 'in_progress', activeForm: 'Publication en cours' })

  const text = await shown($)
  expect(text).toContain('Tâches▰▰▰▱▱▱▱▱▱▱1/3· Publication en cours')

  for (const id of ['B', 'C']) await $.tool.call({ tool: 'TaskUpdate', taskId: id, status: 'completed' })
  expect(await shown($)).not.toContain('Tâches')
})

test('la fin de tour synchronise les boucles et le travail en arrière-plan', async ($, on) => {
  world(on)
  on('classic.Stop', () => ({}))
  await measure($)

  await $.classic.Stop({
    stop_hook_active: false,
    session_crons: [{ id: 'x', schedule: '0 9 * * 1-5', recurring: true, prompt: 'Résume les PR ouvertes' }],
    background_tasks: [
      { id: 'b1', type: 'shell', status: 'running', description: 'npm run dev' },
      { id: 'b2', type: 'subagent', status: 'running', description: 'Revue de code' },
      { id: 'b3', type: 'shell', status: 'completed', description: 'npm test' },
    ],
  })

  const text = await shown($)
  expect(text).toContain('⟳Résume les PR ouvertesen semaine à 9 h 00')
  expect(text).toContain('2 en arrière-plan (shell, subagent)')
})

const PANE_PROPS = {
  title: 'Bandeau',
  isFocused: true,
  bodyColumns: 60,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}

async function mountPane($: Engine, surface: 'terminal' | 'desktop' = 'terminal') {
  return $.ui.mount({ plugin: 'usage-band', surface, component: 'Pane', requestId: 'usage-band-reglages', props: PANE_PROPS })
}

test('/bandeau ouvre le panneau de réglages', async ($, on) => {
  world(on)
  const opened: string[] = []
  on('ui.open', (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true as const } }
  })

  const ran = await $.command.run({ ...COMMAND, args: '' })

  expect(opened).toEqual(['usage-band-reglages'])
  expect(ran.text).toContain('Réglages du bandeau ouverts')
})

test('le panneau montre un aperçu et masque un bloc en direct', async ($, on) => {
  world(on)
  await measure($)
  const pane = await mountPane($)

  const preview = (await pane.findAll({ type: 'Text' })).map(found => found.text).join('')
  expect(preview).toContain('Session ≈ 1,84 $')

  await pane.press({ key: 'bloc-cout' })
  await pane.press({ key: 'action-masquer' })
  expect(await shown($)).not.toContain('1,84 $')
  expect((await pane.findAll({ type: 'Text' })).map(found => found.text)).toContain('Masqués')

  await pane.press({ key: 'action-afficher' })
  expect(await shown($)).toContain('1,84 $')
})

test('le panneau change les segments et les couleurs en direct', async ($, on) => {
  world(on)
  await measure($)
  const pane = await mountPane($)

  await pane.press({ key: 'onglet-style' })
  await pane.select({ key: 'segments', value: '5' })
  expect(await shown($)).toContain('Ctx▰▰▰▱▱62 %')

  await pane.select({ key: 'palette', value: 'ocean' })
  const band = await $.ui.mount({ plugin: 'usage-band', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  const ctx = (await band.findAll({ type: 'Svg' })).find(found => found.props.alt === 'Ctx : 62 % restant')
  expect(String(ctx?.props.source)).toContain('fill="#7cc4ff"')

  await pane.press({ key: 'defaut' })
  expect(await shown($)).toContain('Ctx▰▰▰▰▰▰▱▱▱▱62 %')
})

test('dans le panneau, Pixel peut ne jamais s\'endormir', async ($, on) => {
  const clock = world(on)
  await measure($)
  await $.tool.call({ tool: 'Read', file_path: '/a.ts' }).catch(() => undefined)
  const pane = await mountPane($)

  await pane.press({ key: 'onglet-pixel' })
  await pane.select({ key: 'sleepAfterMinutes', value: '0' })
  await clock.advance(30 * 60_000)

  expect(await shown($)).toContain('(•ᴗ•)')
})

async function texts(band: { findAll: (q: { type: string }) => Promise<Array<{ text: string }>> }): Promise<string[]> {
  return (await band.findAll({ type: 'Text' })).map(found => found.text)
}

test('profil Minimal : une ligne, des points ronds, juste le coût et les jauges', async ($, on) => {
  world(on)
  await measure($)
  const pane = await mountPane($)

  await pane.press({ key: 'profil-minimal' })
  const text = await shown($)

  expect(text).toContain('Ctx●●●●●○○○62 %')
  expect(text).toContain('1,84 $')
  expect(text).not.toContain('outils')
  expect(text).not.toContain('Opus')
})

test('formes des jauges dans l\'app desktop : pilule et points', async ($, on) => {
  world(on)
  await measure($)
  const pane = await mountPane($)
  const ctxSvg = async () => {
    const band = await $.ui.mount({ plugin: 'usage-band', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
    const ctx = (await band.findAll({ type: 'Svg' })).find(found => found.props.alt === 'Ctx : 62 % restant')

    return String(ctx?.props.source)
  }

  await pane.press({ key: 'onglet-style' })
  await pane.select({ key: 'shape', value: 'pill' })
  expect((await ctxSvg()).match(/<rect/g)?.length).toBe(2)

  await pane.select({ key: 'shape', value: 'dots' })
  await pane.select({ key: 'size', value: 'large' })
  expect((await ctxSvg()).match(/<circle[^>]*r="6"/g)?.length).toBe(10)
})

test('libellés longs, % consommé et coût en euros', async ($, on) => {
  world(on)
  await measure($)
  const pane = await mountPane($)

  await pane.select({ key: 'labels', value: 'long' })
  await pane.select({ key: 'currency', value: 'eur' })
  await pane.press({ key: 'onglet-style' })
  await pane.select({ key: 'percent', value: 'used' })
  const text = await shown($)

  expect(text).toContain('Contexte▰▰▰▰▰▰▱▱▱▱38 %')
  expect(text).toContain('5 heures')
  expect(text).toContain('Session ≈ 1,69 €')
})

test('séparateur en barre, et Pixel à gauche, bleu et grand', async ($, on) => {
  world(on)
  await measure($)
  const pane = await mountPane($)

  await pane.select({ key: 'separator', value: 'bar' })
  expect(await texts(await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', component: 'AbovePrompt', props: PROPS }))).toContain('│')

  await pane.press({ key: 'onglet-pixel' })
  await pane.select({ key: 'pixelSide', value: 'left' })
  await pane.select({ key: 'pixelColor', value: '#60a5fa' })
  await pane.select({ key: 'pixelSize', value: 'large' })
  const band = await $.ui.mount({ plugin: 'usage-band', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  const svgs = await band.findAll({ type: 'Svg' })
  const pixel = svgs.find(found => String(found.props.alt).startsWith('Mascotte'))

  expect(svgs[0]).toBe(pixel)
  expect(pixel?.props.width).toBe(83)
  expect(String(pixel?.props.source)).toContain('#60a5fa')
})

test('on peut couper les réactions de Pixel au clic', async ($, on) => {
  world(on)
  await measure($)
  const pane = await mountPane($)
  await pane.press({ key: 'onglet-pixel' })
  await pane.press({ key: 'reaction-click' })

  const band = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  await band.pointer(CLICK)

  expect((await texts(band)).join('')).toContain('(•ᴗ•)')
})

test('alertes : une notification par seuil franchi', async ($, on) => {
  const clock = world(on)
  const toasts: string[] = []
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  const tight = {
    context: { window: 200_000, tokens: 170_000, percent: 85 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 92, resetsAt: at(62) }],
    cost: { usd: 1.84 },
    changed: ['context', 'rateLimits', 'cost'] as Array<'context' | 'rateLimits' | 'cost'>,
  }

  await $.session.measure(tight)
  await clock.advance(1)
  await $.session.measure(tight)
  await clock.advance(1)

  expect(toasts).toEqual([
    '⚠ Limite 5 h à 92 % · reset dans 1 h 02',
    '⚠ Contexte presque plein : 15 % libre. Pense à /compact.',
  ])
})

test('alertes : prévient quand une boucle est arrêtée', async ($, on) => {
  const clock = world(on)
  tools(on)
  const toasts: string[] = []
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await measure($)

  await $.tool.call({ tool: 'CronCreate', cron: '*/5 * * * *', prompt: '/babysit-prs', recurring: true })
  await $.prompt.submit({ text: '/babysit-prs', wait: false, origin: { kind: 'scheduled-trigger' } })
  await $.tool.call({ tool: 'CronDelete', id: 'c1' })
  await clock.advance(1)

  expect(toasts).toEqual(['⟳ Boucle terminée : /babysit-prs (1 passage)'])
})

async function layoutText($: Engine): Promise<string> {
  return (await $.command.run({ ...COMMAND, args: 'aide' })).text ?? ''
}

test('les flèches changent l\'ordre, et passent à la ligne voisine au bord', async ($, on) => {
  world(on)
  await measure($)
  const pane = await mountPane($)

  await pane.press({ key: 'bloc-limite7j' })
  await pane.press({ key: 'action-gauche' })
  let text = await shown($)
  expect(text.indexOf('7 j')).toBeLessThan(text.indexOf('5 h'))

  await pane.press({ key: 'bloc-contexte' })
  await pane.press({ key: 'action-gauche' })
  expect(await layoutText($)).toContain('Ligne 1 : Modèle · Projet et branche · État git · Durée · Coût · Outils et fichiers · Contexte')

  await pane.press({ key: 'action-droite' })
  text = await layoutText($)
  expect(text).toContain('Ligne 2 : Contexte · Limite 7 j · Limite 5 h · Autres limites')
})

test('chaque bloc se place sur la ligne voulue, et tout se range d\'un coup', async ($, on) => {
  world(on)
  await measure($)
  const pane = await mountPane($)

  await pane.press({ key: 'bloc-limite7j' })
  await pane.press({ key: 'action-descendre' })
  expect(await layoutText($)).toContain('Ligne 3 : Boucles et réveils · Tâches · Arrière-plan · Limite 7 j')

  await pane.press({ key: 'ranger-1' })
  const text = await layoutText($)
  expect(text).toContain('Ligne 1 : Modèle · Projet et branche · État git · Durée · Coût · Outils et fichiers · Contexte · Limite 5 h')
  expect(text).toContain('Ligne 2 : (vide)')

  await pane.press({ key: 'ranger-3' })
  expect(await layoutText($)).toContain('Ligne 2 : Contexte · Limite 5 h · Autres limites · Limite 7 j')
})

test('un bloc masqué dans le panneau revient avec /bandeau afficher', async ($, on) => {
  world(on)
  await measure($)
  const pane = await mountPane($)

  await pane.press({ key: 'bloc-cout' })
  await pane.press({ key: 'action-masquer' })
  expect(await shown($)).not.toContain('1,84 $')

  await $.command.run({ ...COMMAND, args: 'afficher cout' })
  expect(await shown($)).toContain('1,84 $')
  expect(await layoutText($)).toContain('Ligne 1 : Modèle · Projet et branche · État git · Durée · Outils et fichiers · Coût')
})

test('les onglets n\'affichent qu\'une partie des réglages à la fois', async ($, on) => {
  world(on)
  await measure($)
  const pane = await mountPane($)

  expect(await pane.find({ key: 'bloc-cout' })).toBeDefined()
  expect(await pane.find({ key: 'shape' })).toBeUndefined()
  expect((await pane.find({ key: 'onglet-disposition' }))?.props.variant).toBe('primary')

  await pane.press({ key: 'onglet-style' })
  expect(await pane.find({ key: 'shape' })).toBeDefined()
  expect(await pane.find({ key: 'bloc-cout' })).toBeUndefined()

  await pane.press({ key: 'onglet-alertes' })
  expect(await pane.find({ key: 'alertLimitAt' })).toBeDefined()
  expect(await pane.find({ key: 'shape' })).toBeUndefined()
})
