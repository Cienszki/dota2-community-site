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

const DOC = 'lobby';

export interface LobbyConfig {
  /** Password players type into Dota's lobby browser. Empty means "unset". */
  password: string;
  updatedAt: string | null;
}

export async function getLobbyConfig(): Promise<LobbyConfig> {
  try {
    const snap = await getDb().collection(COLLECTIONS.config).doc(DOC).get();
    const data = snap.exists ? snap.data() ?? {} : {};
    return {
      password: typeof data.password === 'string' ? data.password : '',
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
    };
  } catch (err) {
    console.error('inhouse lobby config read failed', err);
    return { password: '', updatedAt: null };
  }
}

export async function setLobbyPassword(password: string): Promise<void> {
  await getDb()
    .collection(COLLECTIONS.config)
    .doc(DOC)
    .set({ password, updatedAt: new Date().toISOString() }, { merge: true });
}
