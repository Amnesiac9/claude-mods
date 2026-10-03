# claude-mods

Claude Code mods (function-hook plugins). Needs a recent Claude Code build (written on 2.1.287).

| Mod | What it does |
| --- | --- |
| `context-bar` | Colored context-window fill bar in the prompt footer: green, yellow from 60%, red from 80%. |
| `account-badge` | Signed-in org as a short abbreviation (`CSC`, `PERS` for personal accounts), red when signed out. |

## Install

```
/plugin marketplace add Amnesiac9/claude-mods
/plugin install context-bar@amnesiac9
/plugin install account-badge@amnesiac9
```

Update later with `/plugin marketplace update amnesiac9`.

## Develop

Load the folders live instead of installing, in `~/.claude/settings.json` (`;` on Windows, `:` on Mac/Linux):

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "C:/dev/claude-mods/context-bar;C:/dev/claude-mods/account-badge" } }
```

Saves hot-reload. Check with `claude plugin validate <mod>` and `claude plugin test <mod>`.
