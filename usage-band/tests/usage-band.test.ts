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

function world(on: On) {
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
  on('session.cwd', () => ({ value: '/Users/moi/Developer/Bouilles' }))
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
