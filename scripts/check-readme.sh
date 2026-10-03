#!/bin/sh
# Fails when README.md's Mods table or marketplace.json doesn't list exactly the plugin folders here.
# --stop-hook: Claude Code Stop hook mode, where exit 2 hands the problem back to Claude.
cd "$(dirname "$0")/.." || exit 1

problems=""
add() { problems="$problems
- $1"; }

plugins=$(for f in */.claude-plugin/plugin.json; do [ -f "$f" ] && echo "${f%%/*}"; done)
listed=$(sed -nE 's/^\| `([^`]+)` \|.*/\1/p' README.md)
market=$(sed -nE 's/.*"source": *"\.\/([^"]+)".*/\1/p' .claude-plugin/marketplace.json)

for p in $plugins; do
  echo "$listed" | grep -qx "$p" || add "README.md has no Mods table row for \`$p\`"
  echo "$market" | grep -qx "$p" || add ".claude-plugin/marketplace.json has no entry for ./$p"
done
for p in $listed; do echo "$plugins" | grep -qx "$p" || add "README.md lists \`$p\`, which has no plugin folder"; done
for p in $market; do echo "$plugins" | grep -qx "$p" || add "marketplace.json lists ./$p, which has no plugin folder"; done

[ -z "$problems" ] && exit 0

msg="Plugin list out of sync:$problems"

if [ "$1" = "--stop-hook" ]; then
  # One nudge per stop; the pre-commit hook and CI still catch it.
  grep -q '"stop_hook_active": *true' && exit 0
  echo "$msg
Update the Mods table in README.md and .claude-plugin/marketplace.json." >&2
  exit 2
fi

echo "$msg" >&2
exit 1
