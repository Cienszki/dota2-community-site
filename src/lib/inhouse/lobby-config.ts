import 'server-only';
import { getDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from './core/store';

// The shared lobby password (§7.2), held in `inhouseConfig/lobby`.
//
// Deliberately its own document rather than a field on `inhouseConfig/global`:
// the admin defaults are written with a whole-document `set(resolved)`, and
// `resolveSettings` only ever returns the keys it knows about, so a password
// parked there would be silently dropped the next time anyone saved the
// settings form.
//
// One password covers every lobby. That is a real trade against the per-game
// secret the bot generates — it cannot be rotated by ending a game, and anyone
// who has seen it once can walk into any future lobby from the in-game browser.
// It is the admin's call, and it is why `getJoinInfo` still runs the ban check
// before handing it over.
//
// ── There is a second reader of this document ───────────────────────────────
// The vendored core now carries its own `InhouseStore.getLobbyConfig()` (and
// `DEFAULT_MAX_OPEN_LOBBIES`), added bot-side so the worker can read the same
// settings. The two agree today — same document, same `maxOpenLobbies` default
// of 2, same field names — and this file is a superset, since only it writes.
//
// They are not shared code, so **a change to the document's shape has to be
// made in both places**: this file for the website and the admin panel that
// writes it, and `core/store.ts` for the bot. Renaming a field or changing the
// default here alone would leave the bot reading the old shape and silently
// falling back to its own defaults.

const DOC = 'lobby';

/** How many lobbies may recruit at once when nothing is configured. */
export const DEFAULT_MAX_OPEN_LOBBIES = 2;

export interface LobbyConfig {
  /** Password players type into Dota's lobby browser. Empty means "unset". */
  password: string;
  /**
   * Published lobbies allowed to recruit simultaneously. A third splits the
   * same players three ways and none of them reaches ten — but the right
   * number depends on how big the community has got, so it is a setting.
   */
  maxOpenLobbies: number;
  updatedAt: string | null;
}

const FALLBACK: LobbyConfig = {
  password: '',
  maxOpenLobbies: DEFAULT_MAX_OPEN_LOBBIES,
  updatedAt: null,
};

export async function getLobbyConfig(): Promise<LobbyConfig> {
  try {
    const snap = await getDb().collection(COLLECTIONS.config).doc(DOC).get();
    const data = snap.exists ? snap.data() ?? {} : {};
    const max = Number(data.maxOpenLobbies);
    return {
      password: typeof data.password === 'string' ? data.password : '',
      maxOpenLobbies:
        Number.isInteger(max) && max >= 1 ? max : DEFAULT_MAX_OPEN_LOBBIES,
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
    };
  } catch (err) {
    // A config read that fails must not take hosting down with it.
    console.error('inhouse lobby config read failed', err);
    return FALLBACK;
  }
}

export async function saveLobbyConfig(patch: {
  password?: string;
  maxOpenLobbies?: number;
}): Promise<void> {
  await getDb()
    .collection(COLLECTIONS.config)
    .doc(DOC)
    .set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true });
}
