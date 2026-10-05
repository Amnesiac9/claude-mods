import type { PluginOptions } from 'claude-code'

import type { Limit, LimitKind } from '../types'

export type Segment = { glyph: string; cells: number; color: string | null; isDim: boolean }

const GLYPHS = {
  blocks: { fill: '█', empty: '░' },
  bars: { fill: '▰', empty: '▱' },
  squares: { fill: '■', empty: '□' },
  line: { fill: '━', empty: '─' },
} as const

const BAND_TEXTURES = ['█', '▓', '▚']

export const LABELS: Record<LimitKind, string> = { five_hour: '5h', seven_day: 'wk' }

export type BarOptions = ReturnType<typeof readOptions>

export const readOptions = (o: PluginOptions) => ({
  kinds: [...(o.fiveHour === false ? [] : ['five_hour' as const]), ...(o.weekly === false ? [] : ['seven_day' as const])],
  position: o.position === 'end' ? ('end' as const) : ('start' as const),
  // null: percent only.
  glyphs: o.glyphs === 'none' ? null : (GLYPHS[o.glyphs as keyof typeof GLYPHS] ?? GLYPHS.blocks),
  width: typeof o.width === 'number' ? Math.max(4, Math.min(20, Math.round(o.width))) : 8,
  hasTextures: o.textures === true,
  hasResets: o.resets !== false,
})

const band = (pct: number) => (pct >= 80 ? 2 : pct >= 60 ? 1 : 0)

export const colorFor = (pct: number) => ['success', 'warning', 'error'][band(pct)] ?? 'success'

export const segments = (pct: number, opts: BarOptions): Segment[] => {
  if (opts.glyphs === null) {
    return []
  }

  const filled = Math.max(0, Math.min(opts.width, Math.round((pct / 100) * opts.width)))
  const glyph = opts.hasTextures ? (BAND_TEXTURES[band(pct)] ?? opts.glyphs.fill) : opts.glyphs.fill

  return [
    { glyph, cells: filled, color: colorFor(pct), isDim: false },
    { glyph: opts.glyphs.empty, cells: opts.width - filled, color: null, isDim: true },
  ].filter(s => s.cells > 0)
}

// A window past its reset reads 0% until the next response reports the new one.
export const current = (l: Limit, now: number) =>
  l.resetsAt !== null && l.resetsAt <= now ? { ...l, percent: 0, resetsAt: null } : l

// 42m, 2h13m, 3d4h.
export const until = (resetsAt: number, now: number) => {
  const m = Math.max(1, Math.ceil((resetsAt - now) / 60000))

  if (m < 60) {
    return `${m}m`
  }

  const h = Math.floor(m / 60)

  return h < 24 ? `${h}h${String(m % 60).padStart(2, '0')}m` : `${Math.floor(h / 24)}d${h % 24}h`
}
