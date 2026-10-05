import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Limit, LimitKind, Limits } from '../types'
import { LABELS, colorFor, current, readOptions, segments, until } from './bar'

const limits = atom({ plugin: 'usage-limits', key: 'limits' } as const, null)

const isKind = (k: string): k is LimitKind => k in LABELS

const toLimit = (r: SessionRateLimit & { kind: LimitKind }): Limit => {
  const at = r.resetsAt === undefined ? NaN : Date.parse(r.resetsAt)

  return { kind: r.kind, percent: r.percentUsed, resetsAt: Number.isNaN(at) ? null : at }
}

// Writes only on change so the footer doesn't redraw every tick.
const save = async ($: EngineInterface, rateLimits: SessionRateLimit[]) => {
  const now = Math.floor((await $.clock.now()) / 60000) * 60000
  const windows = rateLimits.filter((r): r is SessionRateLimit & { kind: LimitKind } => isKind(r.kind)).map(toLimit)
  const next: Limits = { windows, now }

  if (JSON.stringify(await read($, limits)) !== JSON.stringify(next)) {
    await update($, limits, () => next)
  }
}

export const register: Register = (on, options) => {
  const opts = readOptions(options)

  if (opts.kinds.length === 0) {
    return
  }

  on('session.start', async ($, e, next) => {
    const sync = async () => save($, (await $.session.usage()).rateLimits)
    await sync()
    // Moves the reset countdown along; readings themselves arrive with session.measure.
    $.clock.every(30000, () => void sync())

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await save($, e.rateLimits)
    }

    return next(e)
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const beneath = await next(e)
    const state = await read($, limits)
    const shown = opts.kinds.flatMap(k => state?.windows.filter(w => w.kind === k) ?? [])

    // Off a subscription, or before the first response.
    if (state === null || shown.length === 0) {
      return beneath
    }

    const { Box, Text } = $.ui.resolve(e)

    const bars = (
      <Box key="limits" gap={2}>
        {shown.map(w => {
          const l = current(w, state.now)
          const pct = Math.round(l.percent)

          return (
            <Box key={l.kind}>
              <Text dimColor>{LABELS[l.kind]} </Text>
              {segments(l.percent, opts).map(s =>
                s.color === null ? (
                  <Text dimColor={s.isDim}>{s.glyph.repeat(s.cells)}</Text>
                ) : (
                  <Text color={s.color}>{s.glyph.repeat(s.cells)}</Text>
                ),
              )}
              <Text color={colorFor(pct)} bold>
                {opts.glyphs === null ? '' : ' '}
                {pct}%
              </Text>
              {opts.hasResets && l.resetsAt !== null && <Text dimColor> {until(l.resetsAt, state.now)}</Text>}
            </Box>
          )
        })}
      </Box>
    )

    return opts.position === 'start' ? (
      <Box gap={2}>
        {bars}
        {beneath}
      </Box>
    ) : (
      <Box gap={2}>
        {beneath}
        {bars}
      </Box>
    )
  })
}
