import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Limit, Usage } from '../types'

const usage = atom({ plugin: 'usage-band', key: 'usage' } as const, null)

const LABELS: Record<string, string> = {
  five_hour: '5 h',
  seven_day: '7 j',
  spend_limit: 'Plafond',
}

const BAR = 10

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

function bar(used: number): string {
  const full = Math.min(BAR, Math.max(0, Math.round((used / 100) * BAR)))
  return '█'.repeat(full) + '░'.repeat(BAR - full)
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

    return (
      <Box flexDirection="row" flexWrap="wrap" columnGap={3}>
        {u.costUsd !== null && (
          <Box flexDirection="row">
            <Text dimColor>{'Session ≈ '}</Text>
            <Text bold>{money(u.costUsd)}</Text>
          </Box>
        )}
        {u.limits.map(limit => {
          const used = limit.percentUsed
          const left = Math.max(0, Math.round((100 - used) * 10) / 10)
          const reset = untilReset(limit.resetsAt, now)

          return (
            <Box flexDirection="row">
              <Text dimColor>{`${LABELS[limit.kind] ?? limit.kind} `}</Text>
              <Text color={colorFor(used)}>{bar(used)}</Text>
              <Text>{' reste '}</Text>
              <Text bold color={colorFor(used)}>{`${String(left).replace('.', ',')} %`}</Text>
              {reset !== null && <Text dimColor>{` · reset dans ${reset}`}</Text>}
            </Box>
          )
        })}
      </Box>
    )
  })
}
