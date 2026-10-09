// Boucles, réveils et tâches : les calculs du bandeau, sans `$`.

const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

/** Une durée en minutes, lisible : « 42 min », « 1 h 05 », « 2 j 3 h ». */
export function minutes(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ${String(min % 60).padStart(2, '0')}`

  return `${Math.floor(h / 24)} j ${h % 24} h`
}

/** Le temps qui reste avant `ms` millisecondes : « dans 4 min », « maintenant ». */
export function until(ms: number): string {
  if (ms <= 30_000) return 'maintenant'

  return `dans ${minutes(Math.ceil(ms / 60_000))}`
}

export function shorten(text: string, max: number): string {
  const chars = [...text.trim()]

  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('')
}

/** Ce qu'une boucle lance, en quelques mots : `/loop 5m /babysit` → `/babysit`. */
export function loopLabel(prompt: string | null | undefined, max = 28): string {
  const first = (prompt ?? '').split('\n')[0]?.trim() ?? ''
  if (first === '' || first.includes('<<autonomous-loop')) return 'boucle autonome'

  const text = first.replace(/^\/loop\s+/, '').replace(/^\d+\s*[smhd]\s+/, '')

  return shorten(text === '' ? 'boucle' : text, max)
}

type Fields = {
  minute: Set<number>
  hour: Set<number>
  day: Set<number>
  month: Set<number>
  weekday: Set<number>
  isDayAny: boolean
  isWeekdayAny: boolean
}

function field(spec: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>()
  for (const part of spec.split(',')) {
    const [range, stepText] = part.split('/')
    const step = stepText === undefined ? 1 : Number(stepText)
    if (range === undefined || !Number.isInteger(step) || step < 1) return null

    let lo = min
    let hi = max
    if (range !== '*') {
      const [a, b] = range.split('-')
      lo = Number(a)
      hi = b === undefined ? (stepText === undefined ? lo : max) : Number(b)
      if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) return null
    }
    for (let value = lo; value <= hi; value += step) out.add(value)
  }

  return out
}

function parse(cron: string): Fields | null {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [m, h, dom, mon, dow] = parts as [string, string, string, string, string]

  const minute = field(m, 0, 59)
  const hour = field(h, 0, 23)
  const day = field(dom, 1, 31)
  const month = field(mon, 1, 12)
  const weekdayRaw = field(dow, 0, 7)
  if (!minute || !hour || !day || !month || !weekdayRaw) return null

  const weekday = new Set([...weekdayRaw].map(d => (d === 7 ? 0 : d)))

  return { minute, hour, day, month, weekday, isDayAny: dom === '*', isWeekdayAny: dow === '*' }
}

function isDayMatch(f: Fields, date: Date): boolean {
  const isDay = f.day.has(date.getDate())
  const isWeekday = f.weekday.has(date.getDay())
  if (f.isDayAny && f.isWeekdayAny) return true
  if (f.isDayAny) return isWeekday
  if (f.isWeekdayAny) return isDay

  return isDay || isWeekday
}

/** Le prochain déclenchement d'une expression cron (heure locale) après `from`. */
export function nextFire(cron: string, from: number): number | null {
  const f = parse(cron)
  if (f === null) return null

  let d = new Date(Math.floor(from / 60_000) * 60_000 + 60_000)
  for (let step = 0; step < 5000; step += 1) {
    if (!f.month.has(d.getMonth() + 1)) {
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0)
    } else if (!isDayMatch(f, d)) {
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0)
    } else if (!f.hour.has(d.getHours())) {
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1, 0)
    } else if (!f.minute.has(d.getMinutes())) {
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes() + 1)
    } else {
      return d.getTime()
    }
  }

  return null
}

/** Le rythme d'une expression cron en français, quand il est simple. */
export function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return cron
  const [m, h, dom, mon, dow] = parts as [string, string, string, string, string]
  const isEveryDay = dom === '*' && mon === '*'
  const at = (hour: string, min: string) => `${Number(hour)} h ${min.padStart(2, '0')}`
  const isNumber = (text: string) => /^\d+$/.test(text)

  if (m === '*' && h === '*' && isEveryDay && dow === '*') return 'chaque minute'
  const everyMin = /^\*\/(\d+)$/.exec(m)
  if (everyMin && h === '*' && isEveryDay && dow === '*') return `toutes les ${everyMin[1]} min`
  if (isNumber(m) && h === '*' && isEveryDay && dow === '*') return 'toutes les heures'
  const everyHour = /^\*\/(\d+)$/.exec(h)
  if (isNumber(m) && everyHour && isEveryDay && dow === '*') return `toutes les ${everyHour[1]} h`
  if (isNumber(m) && isNumber(h) && isEveryDay) {
    if (dow === '*') return `chaque jour à ${at(h, m)}`
    if (dow === '1-5') return `en semaine à ${at(h, m)}`
    const name = isNumber(dow) ? DAY_NAMES[Number(dow) % 7] : undefined
    if (name) return `chaque ${name} à ${at(h, m)}`
  }

  return cron
}
