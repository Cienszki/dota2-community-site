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

## Re-syncing

When the bot's `packages/core` changes, re-copy and re-strip:

```bash
cp "<bot-repo>/packages/core/src/"*.ts src/lib/inhouse/core/
node -e "const fs=require('fs');const d='src/lib/inhouse/core';for(const f of fs.readdirSync(d)){if(!f.endsWith('.ts'))continue;const p=d+'/'+f;fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/(from\s+'\.\.?\/[^']+?)\.js'/g,\"$1'\"));}"
```

Do **not** hand-edit these files. Fix bugs in the bot's `packages/core` and
re-sync, so both halves stay in step.
