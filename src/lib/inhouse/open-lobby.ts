import 'server-only';
import { getDb, isInhouseConfigured } from '@/lib/firebase-admin';
import { getInhouseStore, resolveSettings, leaseAccount } from '@/lib/inhouse/store';
import { getLobbyConfig } from '@/lib/inhouse/lobby-config';
import { randomLobbyName } from '@/lib/inhouse/lobby-names';
import { countRecruitingLobbies } from '@/lib/inhouse/live';
import { reconcileLobbies } from '@/lib/inhouse/sweep';
import { requestLobbyCreation } from '@/lib/inhouse/commands';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Opening a lobby, independent of who asked and from where.
//
// Extracted from the `/inhouse/new` server action so the Discord bot can run
// the *same* code rather than a second implementation of it. Everything that
// makes a lobby correct lives here — the forced reconcile, the open-lobby cap,
// the lobby-name table, the shared password, the transactional lease, the
// create command — and there is no second copy to drift.
//
// The action keeps only what is genuinely browser-shaped: reading the viewer
// from cookies, and remembering the host token.

export interface HostIdentity {
  /** Empty/absent for an anonymous website host; always present from Discord. */
  discordId: string | null;
  discordName: string | null;
  steamId32: string | null;
}

// Declared in public.ts, not here, because the client components that render it
// need to name it and this module is server-only. See the note there.
// Imported as well as re-exported — a re-export does not bind the name locally,
// and `openLobbyFor` is typed with it.
import type { CreateResult } from './public';
export type { CreateResult };

/**
 * Steam persona for a host who signed in with Steam but never linked Discord.
 *
 * Read from `ranking_leaderboard`, which the site's existing Steam login
 * already upserts a name into — so this costs one indexed lookup rather than a
 * Steam API call, and only runs for the no-Discord case. Falls back to null;
 * the caller then credits the game to "Gość".
 */
async function steamPersona(steamId32: string | null): Promise<string | null> {
  if (!steamId32) return null;
  try {
    const { data } = await supabaseAdmin
      .from('ranking_leaderboard')
      .select('name')
      .eq('steam_id', steamId32)
      .maybeSingle();
    return (data?.name as string | undefined)?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Open a lobby for whoever asked. **No account required.**
 *
 * Identity is used when it happens to be there and skipped when it isn't:
 *   - Discord id  → initiatorDiscordId, so the host panel has somewhere to go
 *   - Steam id    → initiatorSteamId32, and the persona as the host name
 *   - neither     → an anonymous host, credited as "Gość"
 *
 * `published` is the one thing that differs by surface. The website publishes
 * unconditionally: someone who opened a lobby from the public board has already
 * decided it is for everyone, and leaving it private meant a host pressed one
 * button, saw an empty board, and never realised a second press was needed
 * while the lobby held a bot account. Discord is where the private option
 * belongs, because that is where a host can tell their friends directly.
 */
export async function openLobbyFor(
  host: HostIdentity,
  opts: { newcomerFriendly: boolean; published: boolean }
): Promise<CreateResult> {
  if (!isInhouseConfigured()) return { status: 'unavailable' };

  const store = getInhouseStore();

  try {
    // Still enforced against whatever identity the caller does have. A fully
    // anonymous visitor can't be matched against the ban index — but they also
    // can't play in the lobby they opened: the bot kicks banned Steam IDs on
    // sight (enforcement point 4 of 4), which is the check that actually holds.
    //
    // Inside the try: it was outside, which meant a Firestore hiccup here threw
    // straight through the caller and out of the server action, replacing the
    // page with the root error boundary instead of the inline message this
    // function's own `error` status already renders.
    if (host.discordId || host.steamId32) {
      const ban = await store.checkBan({ discordId: host.discordId, steamId32: host.steamId32 });
      if (ban.banned) return { status: 'banned' };
    }

    // Forced past the throttle, because the cap below is counted from
    // recruiting games and a lobby the worker abandoned keeps occupying a slot.
    // That is not hypothetical: two games stuck in `lobby_creating` once
    // refused every new lobby site-wide for 55 hours. This is also the caller
    // that must not trust a recent reconcile from the page it was pressed on —
    // the whole point is to be right at the moment of the decision.
    await reconcileLobbies({ force: true });

    // Two lobbies filling at once is already a stretch for the player pool; a
    // third splits it three ways and none of them reach ten. Enforced here
    // rather than only in the UI — this is the check that actually holds when
    // two people press Create at the same moment, from either surface.
    //
    // Only *published* lobbies are counted (a private game never blocks
    // anyone), but the cap applies to whatever is being opened: the constraint
    // it protects is the pool of people, not the visibility of the card.
    const lobbyConfig = await getLobbyConfig();
    if ((await countRecruitingLobbies()) >= lobbyConfig.maxOpenLobbies) {
      return { status: 'too_many_open', max: lobbyConfig.maxOpenLobbies };
    }

    const defaults = await store.getAdminDefaults();
    const settings = resolveSettings(defaults, { mode: 'inhouse' });

    const game = await store.createGame({
      // Empty string, not null: the shared core types this as `string`, and an
      // empty value is what every "is this my game" check already treats as no
      // match.
      initiatorDiscordId: host.discordId ?? '',
      initiatorName: host.discordName ?? (await steamPersona(host.steamId32)) ?? 'Gość',
      initiatorSteamId32: host.steamId32,
      settings,
      newcomerFriendly: opts.newcomerFriendly,
    });

    // Name and password the lobby up front, so both are decided before the
    // worker touches the Game Coordinator. The name is what players type into
    // Dota's lobby browser, so it is drawn from the diacritic-free table rather
    // than derived from the host's nickname — which may be unsearchable, or
    // taken by three other people.
    //
    // Names in play right now are excluded so two live lobbies can't collide in
    // that search box.
    const taken = (await store.listPublishedOpenGames())
      .map((g) => g.lobbyName)
      .filter((n): n is string => Boolean(n));

    const lobbyName = randomLobbyName(taken);
    const lobbyPassword = lobbyConfig.password || null;
    const nowIso = new Date().toISOString();

    await store.updateGame(game.id, {
      lobbyName,
      lobbyPassword,
      published: opts.published,
      publishedAt: opts.published ? nowIso : null,
      publishedByDiscordId: opts.published ? (host.discordId ?? null) : null,
    });

    // Leasing must be transactional or two games claim the same account and one
    // silently never gets a lobby (§5.4). leaseAccount handles that.
    const lease = await leaseAccount(getDb(), game.id);

    if (!lease.ok || !lease.botAccountId) {
      await store.updateGame(game.id, {
        state: 'failed',
        endedAt: nowIso,
        endReason: 'Wszystkie boty lobby są zajęte',
        updatedAt: nowIso,
      });
      return { status: 'no_bots' };
    }

    await store.updateGame(game.id, {
      botAccountId: lease.botAccountId,
      state: 'lobby_creating',
      updatedAt: nowIso,
    });

    // Everything the worker needs to open the lobby travels with the command.
    // The game document stays authoritative — this is so the create contract is
    // one legible payload rather than an implied second read.
    //
    // `published` is what decides the lobby's visibility in Dota's own browser:
    // a published game is created Public and findable by name, an unpublished
    // one Unlisted, so a private game is private in Dota too and not only on
    // the board.
    await requestLobbyCreation({
      ...game,
      lobbyName,
      lobbyPassword,
      published: opts.published,
      botAccountId: lease.botAccountId,
      settings,
    });

    return { status: 'ok', gameId: game.id, lobbyName, lobbyPassword };
  } catch (err) {
    console.error('openLobbyFor', err);
    return { status: 'error' };
  }
}
