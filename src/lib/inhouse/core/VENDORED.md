# Vendored — `@dota2inhouse/core`

These files are a **verbatim copy** of `packages/core/src/*` from the lobby bot
repo (`dota2-lobby-bot`), not a reimplementation. They are vendored rather than
installed from GitHub Packages because that registry is auth-gated and would not
resolve on every deploy target.

- **Source repo:** `dota2-lobby-bot`
- **Source path:** `packages/core/src/`
- **Copied from commit:** `d2760b7`
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

## No local divergence

Every file here is byte-identical to the bot's copy. There was briefly one
hand-edit — an account-leasing fix — and it is worth recording how it resolved,
because it is the pattern to follow next time.

`leaseAccount` refused an account only when its `status` was `offline` or
`error`. The Steam pool is **shared with the tournament bot**, which cycles
`status` through busy values of its own (`starting`, `creating_lobby`,
`in_game`, `post_game`, …), so an inhouse lobby could lease an account
mid-tournament-match — both processes log into the same Steam account and Steam
kicks each in turn, crash-looping both.

It was fixed here first, as a knowing exception, because the bug was live. But
the fix was only ever half of one: **the bot runs its own copy of this
function**, so the website going quiet did not stop the bot from doing it. It
was sent upstream, and the version that came back is materially better than
ours — it exempts a *reclaimable* lease (stale heartbeat) from the `idle`
requirement, which our version did not. Ours would have stranded every crashed
lease permanently, silently disabling the stale-heartbeat recovery the whole
function exists for. It also honours the tournament side's `cooldownUntil`,
a field we did not know about.

**The lesson: a hand-edit here is a stopgap, not a fix.** Send it upstream the
same day, and take their version back — they know the other half of the system.

## Re-syncing

When the bot's `packages/core` changes, re-copy and re-strip:

```bash
cp "<bot-repo>/packages/core/src/"*.ts src/lib/inhouse/core/
node -e "const fs=require('fs');const d='src/lib/inhouse/core';for(const f of fs.readdirSync(d)){if(!f.endsWith('.ts'))continue;const p=d+'/'+f;fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/(from\s+'\.\.?\/[^']+?)\.js'/g,\"$1'\"));}"
```

Do **not** hand-edit these files. Fix bugs in the bot's `packages/core` and
re-sync, so both halves stay in step.
