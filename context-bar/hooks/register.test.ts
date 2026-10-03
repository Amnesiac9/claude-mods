import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionContextUsage } from 'claude-code'

const START = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const MODES = { plugin: 'context-bar', component: 'SessionMode', props: { modes: [] } } as const

// 50% of 200k: 30k system prompt + 70k messages; 45k autocompact buffer.
const BREAKDOWN = {
  totalTokens: 100000,
  rawMaxTokens: 200000,
  percentage: 50,
  categories: [
    { name: 'System prompt', tokens: 30000, color: 'promptBorder', isDeferred: false, kind: 'used' },
    { name: 'Messages', tokens: 70000, color: 'permission', isDeferred: false, kind: 'used' },
    { name: 'Deferred tools', tokens: 9000, color: 'inactive', isDeferred: true, kind: 'deferred' },
    { name: 'Free space', tokens: 55000, color: 'inactive', isDeferred: false, kind: 'free' },
    { name: 'Autocompact buffer', tokens: 45000, color: 'inactive', isDeferred: false, kind: 'buffer' },
  ],
}

const world = async ($: Engine, on: On, context: SessionContextUsage) => {
  mock.clock(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.render', () => ({ type: 'engine', ref: 0 }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('session.usage', (_$, e) => ({
    value: { startedAt: 0, context: e.breakdown ? { ...context, breakdown: BREAKDOWN as never } : context, rateLimits: [] },
  }))
  await $.session.start(START)
}

const glyphs = async (ui: { findAll: (q: { type: string; text: RegExp }) => Promise<{ text: string; props: Record<string, unknown> }[]> }) =>
  (await ui.findAll({ type: 'Text', text: /^[█▓▚▄▀▞▌▐░▒]+$/ })).map(t => `${t.text}:${String(t.props.color ?? 'dim')}`)

test('usage: fill, color and size in the footer', async ($, on) => {
  await world($, on, { window: 200000 })
  await $.session.measure({ context: { tokens: 130000, window: 200000, percent: 65 }, rateLimits: [], changed: ['context'] })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...MODES, surface })
    expect((await ui.find({ type: 'Text', text: '65%' }))?.props.color).toBe('warning')
    expect(await ui.find({ type: 'Text', text: /130k\/200k/ })).toBeDefined()
    expect(await glyphs(ui)).toEqual(['████████:warning', '░░░░:dim'])
    await ui.unmount()
  }
})

test('usage: empty before the first response', async ($, on) => {
  await world($, on, { window: 1000000 })

  const ui = await $.ui.mount({ ...MODES, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /--\/1M/ })).toBeDefined()
  expect(await glyphs(ui)).toEqual(['░'.repeat(12) + ':dim'])
})

test('usage: textures change the pattern by band, width is configurable', { options: { textures: true, width: 20 } }, async ($, on) => {
  await world($, on, { tokens: 170000, window: 200000, percent: 85 })

  const ui = await $.ui.mount({ ...MODES, surface: 'terminal' })
  expect(await glyphs(ui)).toEqual([`${'▚'.repeat(17)}:error`, `${'░'.repeat(3)}:dim`])
})

test('sources: a segment per source, buffer at the end, hover legend', { options: { style: 'sources' } }, async ($, on) => {
  await world($, on, { tokens: 100000, window: 200000, percent: 50 })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...MODES, surface })
    // 12 cells: 6 used split 30/70 -> 2 + 4, buffer 45k -> 3, free 3. Legend rows follow.
    expect((await glyphs(ui)).slice(0, 4)).toEqual(['██:promptBorder', '████:permission', '░░░:dim', '▒▒▒:inactive'])
    expect(await ui.find({ type: 'Text', text: /Messages\s+70k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Deferred tools/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('sources: textures give each source its own pattern', { options: { style: 'sources', textures: true } }, async ($, on) => {
  await world($, on, { tokens: 100000, window: 200000, percent: 50 })

  const ui = await $.ui.mount({ ...MODES, surface: 'terminal' })
  expect((await glyphs(ui)).slice(0, 2)).toEqual(['██:promptBorder', '▓▓▓▓:permission'])
})
