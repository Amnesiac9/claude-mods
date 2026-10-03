import type { PluginOptions } from 'claude-code'

import type { ContextBreakdown } from '../types'

export type Segment = { glyph: string; cells: number; color: string | null; isDim: boolean }
export type LegendRow = { glyph: string; color: string | null; isDim: boolean; name: string; tokens: number }

const GLYPHS = {
  blocks: { fill: '█', empty: '░' },
  bars: { fill: '▰', empty: '▱' },
  squares: { fill: '■', empty: '□' },
  line: { fill: '━', empty: '─' },
} as const

// Patterns that read without color. Skips ░ and ▒, which mark free space and the buffer.
const TEXTURES = ['█', '▓', '▚', '▄', '▀', '▞', '▌', '▐']
const BAND_TEXTURES = ['█', '▓', '▚']
const BUFFER = '▒'

export type BarOptions = ReturnType<typeof readOptions>

export const readOptions = (o: PluginOptions) => ({
  style: o.style === 'sources' ? ('sources' as const) : ('usage' as const),
  glyphs: GLYPHS[o.glyphs as keyof typeof GLYPHS] ?? GLYPHS.blocks,
  width: typeof o.width === 'number' ? Math.max(6, Math.min(40, Math.round(o.width))) : 12,
  hasTextures: o.textures === true,
})

const band = (pct: number) => (pct >= 80 ? 2 : pct >= 60 ? 1 : 0)

export const colorFor = (pct: number) => ['success', 'warning', 'error'][band(pct)] ?? 'success'

const filledCells = (pct: number, width: number) => Math.max(0, Math.min(width, Math.round((pct / 100) * width)))

// Largest-remainder split, so the parts always sum to `cells`.
const split = (weights: number[], cells: number) => {
  const total = weights.reduce((a, b) => a + b, 0)
  const exact = weights.map(w => (total > 0 ? (w / total) * cells : 0))
  const out = exact.map(Math.floor)
  let left = total > 0 ? cells - out.reduce((a, b) => a + b, 0) : 0

  for (const [, i] of exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0])) {
    if (left-- <= 0) break
    out[i] = (out[i] ?? 0) + 1
  }

  return out
}

export const usageSegments = (pct: number | null, opts: BarOptions): Segment[] => {
  const filled = pct === null ? 0 : filledCells(pct, opts.width)
  const glyph = opts.hasTextures && pct !== null ? (BAND_TEXTURES[band(pct)] ?? opts.glyphs.fill) : opts.glyphs.fill

  return [
    { glyph, cells: filled, color: pct === null ? null : colorFor(pct), isDim: false },
    { glyph: opts.glyphs.empty, cells: opts.width - filled, color: null, isDim: true },
  ]
}

export const legendRows = (b: ContextBreakdown, opts: BarOptions): LegendRow[] => {
  let used = 0

  return b.sources.map(s => {
    if (s.kind === 'free') {
      return { glyph: opts.glyphs.empty, color: null, isDim: true, name: s.name, tokens: s.tokens }
    }

    if (s.kind === 'buffer') {
      return { glyph: BUFFER, color: s.color, isDim: true, name: s.name, tokens: s.tokens }
    }

    const glyph = opts.hasTextures ? (TEXTURES[used % TEXTURES.length] ?? opts.glyphs.fill) : opts.glyphs.fill
    used += 1

    return { glyph, color: s.color, isDim: false, name: s.name, tokens: s.tokens }
  })
}

// Used sources fill from the left, the autocompact buffer sits at the right end, free space between.
export const sourceSegments = (b: ContextBreakdown, opts: BarOptions): Segment[] => {
  const rows = legendRows(b, opts)
  const used = rows.filter((_, i) => b.sources[i]?.kind === 'used')
  const buffer = rows.find((_, i) => b.sources[i]?.kind === 'buffer')
  const usedCells = filledCells(b.percent, opts.width)
  const bufferCells = buffer ? Math.min(opts.width - usedCells, Math.round((buffer.tokens / b.window) * opts.width)) : 0
  const cells = split(used.map(r => r.tokens), usedCells)

  return [
    ...used.map((r, i) => ({ glyph: r.glyph, cells: cells[i] ?? 0, color: r.color, isDim: false })),
    { glyph: opts.glyphs.empty, cells: opts.width - usedCells - bufferCells, color: null, isDim: true },
    ...(buffer ? [{ glyph: buffer.glyph, cells: bufferCells, color: buffer.color, isDim: true }] : []),
  ].filter(s => s.cells > 0)
}

export const short = (n: number) =>
  n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1000)}k` : `${+(n / 1000).toFixed(1)}k`
