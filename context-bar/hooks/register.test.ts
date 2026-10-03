import { expect, mock, test } from 'claude-code/testing'

const START = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const MODES = { plugin: 'context-bar', component: 'SessionMode', props: { modes: [] } } as const

test('bar shows fill, color and size in the footer', async ($, on) => {
  mock.clock(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.render', () => ({ type: 'engine', ref: 0 }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  await $.session.start(START)
  await $.session.measure({ context: { tokens: 130000, window: 200000, percent: 65 }, rateLimits: [], changed: ['context'] })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...MODES, surface })
    const pct = await ui.find({ type: 'Text', text: '65%' })
    expect(pct?.props.color).toBe('warning')
    expect(await ui.find({ type: 'Text', text: /130k\/200k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '████████' })).toBeDefined()
    await ui.unmount()
  }
})

test('before the first response the bar is empty', async ($, on) => {
  mock.clock(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.render', () => ({ type: 'engine', ref: 0 }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000 }, rateLimits: [] } }))
  await $.session.start(START)

  const ui = await $.ui.mount({ ...MODES, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /--\/1M/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '░'.repeat(12) })).toBeDefined()
})
