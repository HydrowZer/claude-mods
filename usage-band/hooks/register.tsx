import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Limit, Usage } from '../types'

const usage = atom({ plugin: 'usage-band', key: 'usage' } as const, null)

const LABELS: Record<string, string> = {
  five_hour: '5 h',
  seven_day: '7 j',
  spend_limit: 'Plafond',
}

const BAR = 8
const GAP = 3

function toUsage(limits: Limit[], cost: { usd: number } | undefined): Usage {
  return {
    limits: limits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt })),
    costUsd: cost?.usd ?? null,
  }
}

function money(usd: number): string {
  return `${usd.toFixed(2).replace('.', ',')} $`
}

function colorFor(used: number): string {
  return used >= 90 ? 'red' : used >= 70 ? 'yellow' : 'green'
}

function bar(used: number): [string, string] {
  const left = Math.min(BAR, Math.max(0, Math.round(((100 - used) / 100) * BAR)))
  return ['━'.repeat(left), '━'.repeat(BAR - left)]
}

function width(parts: string[]): number {
  return parts.reduce((n, part) => n + [...part].length, 0)
}

function untilReset(resetsAt: string | undefined, now: number): string | null {
  if (!resetsAt) return null
  const ms = Date.parse(resetsAt) - now
  if (!(ms > 0)) return null
  const min = Math.round(ms / 60_000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ${String(min % 60).padStart(2, '0')}`
  return `${Math.floor(h / 24)} j ${h % 24} h`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const u = await $.session.usage()
    await update($, usage, () => toUsage(u.rateLimits, u.cost))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, () => toUsage(e.rateLimits, e.cost))

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const u = await read($, usage)

    if (e.props.hasSurvey || u === null || (u.costUsd === null && u.limits.length === 0)) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()

    const cost = u.costUsd === null ? null : { label: 'Session ≈ ', value: money(u.costUsd) }
    const limits = u.limits.map(limit => {
      const used = limit.percentUsed
      const left = Math.max(0, Math.round((100 - used) * 10) / 10)
      const reset = untilReset(limit.resetsAt, now)

      return {
        key: limit.kind,
        label: `${LABELS[limit.kind] ?? limit.kind} `,
        bar: bar(used),
        value: `${String(left).replace('.', ',')} %`,
        rest: reset === null ? ' restant' : ` restant · reset ${reset}`,
        short: reset === null ? '' : ` · ${reset}`,
        color: colorFor(used),
      }
    })

    const rowWidth = (isShort: boolean) =>
      width(cost ? [cost.label, cost.value] : []) +
      limits.reduce(
        (n, l) => n + width([l.label, `${l.bar.join('')} `, l.value, isShort ? l.short : l.rest]),
        0,
      ) +
      GAP * (limits.length + (cost ? 1 : 0) - 1)

    const room = e.props.bodyColumns
    const isRow = rowWidth(true) <= room
    const isShort = isRow && rowWidth(false) > room

    return (
      <Box flexDirection={isRow ? 'row' : 'column'} columnGap={GAP}>
        {cost && (
          <Box flexDirection="row">
            <Text dimColor>{cost.label}</Text>
            <Text bold>{cost.value}</Text>
          </Box>
        )}
        {limits.map(l => (
          <Box key={l.key} flexDirection="row">
            <Text dimColor>{l.label}</Text>
            <Text color={l.color}>{l.bar[0]}</Text>
            <Text dimColor>{`${l.bar[1]} `}</Text>
            <Text bold color={l.color}>{l.value}</Text>
            <Text dimColor wrap="truncate-end">{isShort ? l.short : l.rest}</Text>
          </Box>
        ))}
      </Box>
    )
  })
}
