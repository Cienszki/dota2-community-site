# Vendored — `@dota2inhouse/core`

These files are a **verbatim copy** of `packages/core/src/*` from the lobby bot
repo (`dota2-lobby-bot`), not a reimplementation. They are vendored rather than
installed from GitHub Packages because that registry is auth-gated and would not
resolve on every deploy target.

- **Source repo:** `dota2-lobby-bot`
- **Source path:** `packages/core/src/`
- **Copied from commit:** `e363d58`
- **Package version:** `1.0.0`

The only change applied on copy: relative import specifiers had their `.js`
extension stripped (`from './types.js'` → `from './types'`) so they resolve
under this project's `moduleResolution: "bundler"` + Next bundler. Nothing else
was edited.

## Why this must stay identical

Three functions are safety-critical and must not drift from the bot's copy —
drift produces bugs that only appear under load:

| Function | What breaks if it drifts |
|---|---|
| `InhouseStore.createReservation` | Overbooking — three people press Join at 9/10 and all three get a slot. |
| `InhouseStore.createModerationRecord` | A ban that silently doesn't enforce, because the index entries weren't written. |
| `InhouseStore.computeSlots` | A web joiner counted twice, so the lobby looks full at nine. |

## ⚠️ Local divergence — `lease.ts`

**There is currently one deliberate difference from the bot's copy.** It is the
only one; everything else is byte-identical.

`leaseAccount` originally refused an account only when its `status` was
`offline` or `error`. That is not enough here, because **this Steam-account pool
is shared with the tournament bot**, which cycles `status` through several busy
values of its own — `starting`, `connecting`, `creating_lobby`, `lobby_active`,
`ready_check`, `in_game`, `post_game` — none of which are `offline` or `error`.
So an inhouse lobby could lease an account in the middle of a tournament match.
Two processes then log into the same Steam account, and Steam kicks each in
turn: both sides crash-loop.

The local copy requires `status === 'idle'` instead — the one value both
systems use to mean "actually free".

**This is committed on purpose, against the no-hand-edits rule above**, because
the alternative was leaving a live production bug unfixed while waiting on the
other repo. It is a knowing exception, not an oversight.

**Two consequences to keep in mind:**

1. **A re-sync will silently revert it.** After running the command below,
   check `git diff` for `lease.ts` and re-apply if the fix is gone — until the
   upstream fix lands, at which point this section should be deleted.
2. **Our copy alone does not fully close the bug.** The bot runs its own copy of
   this same function, so it can still take an account the tournament bot is
   using. The real fix belongs in the bot repo's `packages/core/src/lease.ts`;
   this only stops *the website* from causing it.

## Re-syncing

When the bot's `packages/core` changes, re-copy and re-strip:

```bash
cp "<bot-repo>/packages/core/src/"*.ts src/lib/inhouse/core/
node -e "const fs=require('fs');const d='src/lib/inhouse/core';for(const f of fs.readdirSync(d)){if(!f.endsWith('.ts'))continue;const p=d+'/'+f;fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/(from\s+'\.\.?\/[^']+?)\.js'/g,\"$1'\"));}"
```

Do **not** hand-edit these files. Fix bugs in the bot's `packages/core` and
re-sync, so both halves stay in step.
