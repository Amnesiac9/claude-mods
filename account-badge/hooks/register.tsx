import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Account } from '../types'

type GlobalConfig = { oauthAccount?: { emailAddress?: string; organizationName?: string } }

const account = atom({ plugin: 'account-badge', key: 'account' } as const, null)
const SUFFIXES = new Set(['INC', 'LLC', 'LTD', 'CORP', 'CO'])

// "CSC" -> "CSC", "Acme Widgets Inc" -> "AW", "Northwind" -> "NOR"; personal orgs are "x@y's Organization".
const abbreviate = (org: string) => {
  if (org.includes('@')) {
    return 'PERS'
  }

  const words = org.toUpperCase().split(/[^A-Z0-9]+/).filter(w => w && !SUFFIXES.has(w))
  const [first = '?'] = words

  if (words.length > 1) {
    return words.slice(0, 4).map(w => w[0]).join('')
  }

  return first.length <= 5 ? first : first.slice(0, 3)
}

// The OAuth account lives in the global config, not settings.
const configPath = async ($: EngineInterface) => {
  const dir = await $.env.get('CLAUDE_CONFIG_DIR')
  const home = dir ?? (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))

  return home === undefined ? undefined : `${home}/.claude.json`
}

const lookup = async ($: EngineInterface): Promise<Account> => {
  const path = await configPath($)
  const text = path === undefined ? undefined : await $.fs.read(path).catch(() => undefined)
  const oauth = text === undefined ? undefined : (JSON.parse(text) as GlobalConfig).oauthAccount
  const email = oauth?.emailAddress

  if (email) {
    // No org name: fall back to the email's domain.
    return { label: abbreviate(oauth?.organizationName ?? email.split('@')[1]?.split('.')[0] ?? email), isSignedIn: true }
  }

  return (await $.env.get('ANTHROPIC_API_KEY'))
    ? { label: 'API', isSignedIn: true }
    : { label: 'signed out', isSignedIn: false }
}

const sync = async ($: EngineInterface) => {
  const next = await lookup($).catch(() => null)
  const prev = await read($, account)

  if (next !== null && (prev?.label !== next.label || prev.isSignedIn !== next.isSignedIn)) {
    await update($, account, () => next)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await sync($)
    // Picks up /login and /logout.
    $.clock.every(15000, () => void sync($))

    return next(e)
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const modes = await next(e)
    const acct = await read($, account)

    if (acct === null) {
      return modes
    }

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box gap={1}>
        {modes}
        <Text color={acct.isSignedIn ? 'success' : 'error'} bold>
          {acct.label}
        </Text>
      </Box>
    )
  })
}
