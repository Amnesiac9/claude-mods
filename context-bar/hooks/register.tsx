import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage } from 'claude-code'

import type { ContextFill } from '../types'

const CELLS = 12
const fill = atom({ plugin: 'context-bar', key: 'fill' } as const, null)

const toFill = (c: SessionContextUsage): ContextFill => {
  const tokens = c.tokens ?? null
  const percent = c.percent ?? (tokens === null ? null : Math.round((tokens / c.window) * 100))

  return { tokens, window: c.window, percent }
}

const isSame = (a: ContextFill | null, b: ContextFill) =>
  a !== null && a.tokens === b.tokens && a.window === b.window && a.percent === b.percent

const short = (n: number) =>
  n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`

const colorFor = (pct: number) => (pct >= 80 ? 'error' : pct >= 60 ? 'warning' : 'success')

// Writes only on change so the hint line doesn't redraw every tick.
const save = async ($: EngineInterface, c: SessionContextUsage) => {
  const next = toFill(c)

  if (!isSame(await read($, fill), next)) {
    await update($, fill, () => next)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const sync = async () => save($, (await $.session.usage()).context)
    await sync()
    // Catches /clear, /compact and model switches, which raise no measure.
    $.clock.every(3000, () => void sync())

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await save($, e.context)
    }

    return next(e)
  })

  // Prepends, so it sits left of whatever the footer's right side holds (modes, account badge).
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const beneath = await next(e)
    const ctx = await read($, fill)

    if (ctx === null) {
      return beneath
    }

    const { Box, Text } = $.ui.resolve(e)
    const pct = ctx.percent
    const filled = pct === null ? 0 : Math.min(CELLS, Math.round((pct / 100) * CELLS))
    const color = pct === null ? 'inactive' : colorFor(pct)
    const used = ctx.tokens === null ? '--' : short(ctx.tokens)

    return (
      <Box gap={2}>
        <Box>
          <Text color={color}>{'█'.repeat(filled)}</Text>
          <Text dimColor>{'░'.repeat(CELLS - filled)}</Text>
          <Text color={color} bold>
            {' '}
            {pct === null ? '--' : `${pct}%`}
          </Text>
          <Text dimColor>
            {' '}
            {used}/{short(ctx.window)}
          </Text>
        </Box>
        {beneath}
      </Box>
    )
  })
}
