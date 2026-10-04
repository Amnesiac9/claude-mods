import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage } from 'claude-code'

import type { ContextBreakdown, ContextFill, ContextSource } from '../types'
import { colorFor, legendRows, readOptions, short, sourceSegments, usageSegments } from './bar'
import type { BarOptions, Segment } from './bar'

const fill = atom({ plugin: 'context-bar', key: 'fill' } as const, null)
// The prompt box's three rows; the notice row above it paints over anything taller.
const LEGEND_ROWS = 3

const toFill = (c: SessionContextUsage, breakdown: ContextBreakdown | null): ContextFill => {
  const tokens = c.tokens ?? null
  const percent = c.percent ?? (tokens === null ? null : Math.round((tokens / c.window) * 100))

  return { tokens, window: c.window, percent, breakdown }
}

// "summary" estimates locally; "full" would send a token-count request per tool.
const loadBreakdown = async ($: EngineInterface): Promise<ContextBreakdown | null> => {
  const b = (await $.session.usage({ breakdown: 'summary' })).context.breakdown

  if (b === undefined) {
    return null
  }

  const sources = b.categories
    .filter(c => !c.isDeferred && c.kind !== 'deferred')
    .map(c => ({ name: c.name, tokens: c.tokens, color: c.color, kind: c.kind as ContextSource['kind'] }))

  return { total: b.totalTokens, window: b.rawMaxTokens, percent: b.percentage, sources }
}

// Writes only on change so the footer doesn't redraw every tick.
const save = async ($: EngineInterface, c: SessionContextUsage, opts: BarOptions) => {
  const prev = await read($, fill)
  // The breakdown is recounted only when the fill moved.
  const kept = prev?.tokens === (c.tokens ?? null) ? prev.breakdown : null
  const breakdown = opts.style === 'sources' ? (kept ?? (await loadBreakdown($))) : null
  const next = toFill(c, breakdown)

  if (JSON.stringify(prev) !== JSON.stringify(next)) {
    await update($, fill, () => next)
  }
}

export const register: Register = (on, options) => {
  const opts = readOptions(options)

  on('session.start', async ($, e, next) => {
    const sync = async () => save($, (await $.session.usage()).context, opts)
    await sync()
    // Catches /clear, /compact and model switches, which raise no measure.
    $.clock.every(3000, () => void sync())

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await save($, e.context, opts)
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
    const b = opts.style === 'sources' ? (ctx.breakdown ?? null) : null
    const pct = b === null ? ctx.percent : b.percent
    const color = pct === null ? 'inactive' : colorFor(pct)
    const used = b === null ? (ctx.tokens === null ? '--' : short(ctx.tokens)) : short(b.total)
    const segments = b === null ? usageSegments(pct, opts) : sourceSegments(b, opts)
    const rows = b === null ? [] : legendRows(b, opts)
    // Column-major grid of LEGEND_ROWS rows.
    const columns = Array.from({ length: Math.ceil(rows.length / LEGEND_ROWS) }, (_, c) =>
      rows.slice(c * LEGEND_ROWS, (c + 1) * LEGEND_ROWS),
    )
    const widths = columns.map(col => Math.max(...col.map(r => r.name.length)))

    const paint = (s: Pick<Segment, 'color' | 'isDim'>, text: string) =>
      s.color === null ? <Text dimColor={s.isDim}>{text}</Text> : <Text color={s.color} dimColor={s.isDim}>{text}</Text>

    return (
      <Box gap={2}>
        <Box key="bar">
          {segments.map(s => paint(s, s.glyph.repeat(s.cells)))}
          <Text color={color} bold>
            {' '}
            {pct === null ? '--' : `${Math.round(pct)}%`}
          </Text>
          <Text dimColor>
            {' '}
            {used}/{short(b === null ? ctx.window : b.window)}
          </Text>
          {rows.length > 0 && (
            // Hover legend over the prompt box, the only rows above the footer nothing paints over.
            <Box position="absolute" bottom={1} right={0} display="none" hover={{ display: 'flex' }} flexDirection="column">
              {Array.from({ length: LEGEND_ROWS }, (_, i) => (
                <Box>
                  {columns.map((col, c) => {
                    const r = col[i]

                    // Blank cells still overwrite the border line beneath them.
                    return r === undefined ? (
                      <Text>{' '.repeat((widths[c] ?? 0) + 12)}</Text>
                    ) : (
                      <Box>
                        <Text> </Text>
                        {paint(r, r.glyph.repeat(2))}
                        <Text>
                          {' '}
                          {r.name.padEnd(widths[c] ?? 0)} {short(r.tokens).padStart(6)}{' '}
                        </Text>
                      </Box>
                    )
                  })}
                </Box>
              ))}
            </Box>
          )}
        </Box>
        {beneath}
      </Box>
    )
  })
}
