import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionRateLimit } from 'claude-code'

const START = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const MODES = { plugin: 'usage-limits', component: 'SessionMode', props: { modes: [] } } as const
const HOUR = 3600000

const LIMITS: SessionRateLimit[] = [
  { kind: 'five_hour', percentUsed: 42, resetsAt: new Date(2 * HOUR + 13 * 60000).toISOString() },
  { kind: 'seven_day', percentUsed: 85, resetsAt: new Date(76 * HOUR).toISOString() },
  { kind: 'spend_limit', percentUsed: 10 },
]

const world = async ($: Engine, on: On, rateLimits: SessionRateLimit[]) => {
  const clock = mock.clock(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.render', () => ({ type: 'engine', ref: 0 }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits } }))
  await $.session.start(START)

  return clock
}

type Ui = { findAll: (q: { type: string; text?: RegExp }) => Promise<{ text: string; props: Record<string, unknown> }[]> }

const texts = async (ui: Ui) => (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')

const bars = async (ui: Ui) =>
  (await ui.findAll({ type: 'Text', text: /^[█▓▚░]+$/ })).map(t => `${t.text}:${String(t.props.color ?? 'dim')}`)

test('both windows with bars, colors and reset times', async ($, on) => {
  await world($, on, LIMITS)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...MODES, surface })
    expect(await texts(ui)).toBe('5h ███░░░░░ 42% 2h13mwk ███████░ 85% 3d4h')
    expect(await bars(ui)).toEqual(['███:success', '░░░░░:dim', '███████:error', '░:dim'])
    await ui.unmount()
  }
})

test('hidden window, no bar, no reset time', { options: { weekly: false, glyphs: 'none', resets: false } }, async ($, on) => {
  await world($, on, LIMITS)

  const ui = await $.ui.mount({ ...MODES, surface: 'terminal' })
  expect(await texts(ui)).toBe('5h 42%')
})

test('textures and width', { options: { fiveHour: false, textures: true, width: 10 } }, async ($, on) => {
  await world($, on, LIMITS)

  const ui = await $.ui.mount({ ...MODES, surface: 'terminal' })
  expect(await bars(ui)).toEqual(['▚▚▚▚▚▚▚▚▚:error', '░:dim'])
})

test('nothing off a subscription', async ($, on) => {
  await world($, on, [])

  const ui = await $.ui.mount({ ...MODES, surface: 'terminal' })
  expect(await ui.findAll({ type: 'Text', text: /%/ })).toHaveLength(0)
})

test('a measure updates the reading; a passed reset reads 0%', async ($, on) => {
  const clock = await world($, on, LIMITS)
  await $.session.measure({
    context: { window: 200000 },
    rateLimits: [{ ...LIMITS[0]!, percentUsed: 61 }],
    changed: ['rateLimits'],
  })

  const ui = await $.ui.mount({ ...MODES, surface: 'terminal' })
  expect(await texts(ui)).toBe('5h █████░░░ 61% 2h13m')

  await clock.advance(3 * HOUR)
  expect(await texts(ui)).toBe('5h ░░░░░░░░ 0%wk ███████░ 85% 3d1h')
})
