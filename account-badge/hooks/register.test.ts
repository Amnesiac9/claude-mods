import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const START = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const MODES = { plugin: 'account-badge', component: 'SessionMode', props: { modes: [] } } as const

const world = (on: On, config: object) => {
  mock.clock(on)
  mock.env(on, { USERPROFILE: 'C:/Users/me' })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.render', () => ({ type: 'engine', ref: 0 }))
  on('fs.read', (_$, e) => {
    expect(e.path.replaceAll('\\', '/')).toBe('C:/Users/me/.claude.json')

    return { value: JSON.stringify(config) }
  })
}

const CASES = [
  ['CSC', 'CSC'],
  ['Acme Widgets Inc', 'AW'],
  ['Northwind', 'NOR'],
  ["me@example.com's Organization", 'PERS'],
] as const

for (const [org, label] of CASES) {
  test(`org "${org}" shows as ${label}`, async ($, on) => {
    world(on, { oauthAccount: { emailAddress: 'me@example.com', organizationName: org } })
    await $.session.start(START)

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...MODES, surface })
      expect((await ui.find({ type: 'Text', text: label }))?.props.color).toBe('success')
      await ui.unmount()
    }
  })
}

test('no account reads as signed out', async ($, on) => {
  world(on, {})
  await $.session.start(START)

  const ui = await $.ui.mount({ ...MODES, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: 'signed out' }))?.props.color).toBe('error')
})
