'use server';

import { getDb, isInhouseConfigured } from '@/lib/firebase-admin';
import { getInhouseViewer } from '@/lib/inhouse/session';
import { getInhouseStore, resolveSettings, leaseAccount } from '@/lib/inhouse/store';
import { getLobbyConfig } from '@/lib/inhouse/lobby-config';
import { randomLobbyName } from '@/lib/inhouse/lobby-names';
import { countRecruitingLobbies } from '@/lib/inhouse/live';
import { reconcileLobbies } from '@/lib/inhouse/sweep';
import { requestLobbyCreation } from '@/lib/inhouse/commands';
import { rememberHostedGame } from '@/lib/inhouse/host-token';
import { supabaseAdmin } from '@/lib/supabase-admin';

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

// Create a game from the website (§5.4, §7.3). One press: everything but the
// host comes from admin defaults, so a first-time host opens a correctly
// configured lobby without a settings form. Hosts change settings later with
// lobby chat commands (!mode, !delay), never here.

export type CreateResult =
  | { status: 'ok'; gameId: string }
  | { status: 'banned' }
  | { status: 'no_bots' }
  | { status: 'too_many_open'; max: number }
  | { status: 'unavailable' }
  | { status: 'error' };

/**
 * Open a lobby. **No account required.**
 *
 * Hosting used to demand a linked Discord account, which was friction with
 * nothing behind it: opening a lobby is the bot leasing a Steam account and
 * creating a Dota lobby, none of which needs to know who asked. Website lobbies
 * auto-publish, so there is no private-game decision to attribute either.
 *
 * Identity is used when it happens to be there and skipped when it isn't:
 *   - Discord session  → initiatorDiscordId, so the bot can DM the host panel
 *   - Steam session    → initiatorSteamId32, and the persona as the host name
 *   - neither          → an anonymous host, credited as "Gość"
 *
 * A host token cookie (host-token.ts) is set either way, so whoever opened the
 * lobby can still cancel it without an account.
 */
export async function createInhouseGame(opts: { newcomerFriendly: boolean }): Promise<CreateResult> {
  if (!isInhouseConfigured()) return { status: 'unavailable' };

  const viewer = await getInhouseViewer();
  const store = getInhouseStore();

  // Still enforced against whatever identity the viewer does have. A fully
  // anonymous visitor can't be matched against the ban index — but they also
  // can't play in the lobby they opened: the bot kicks banned Steam IDs on
  // sight (enforcement point 4 of 4), which is the check that actually holds.
  if (viewer.discordId || viewer.steamId32) {
    const ban = await store.checkBan({ discordId: viewer.discordId, steamId32: viewer.steamId32 });
    if (ban.banned) return { status: 'banned' };
  }

  try {
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
    // two people press Create at the same moment.
    const lobbyConfig = await getLobbyConfig();
    if ((await countRecruitingLobbies()) >= lobbyConfig.maxOpenLobbies) {
      return { status: 'too_many_open', max: lobbyConfig.maxOpenLobbies };
    }

    const defaults = await store.getAdminDefaults();
    const settings = resolveSettings(defaults, { mode: 'inhouse' });

    const game = await store.createGame({
      // Empty string, not null: the shared core types this as `string`, and an
      // empty value is what every "is this my game" check already treats as no
      // match. The Discord gateway's host-panel DM simply has nobody to send to.
      initiatorDiscordId: viewer.discordId ?? '',
      initiatorName: viewer.discordName ?? (await steamPersona(viewer.steamId32)) ?? 'Gość',
      initiatorSteamId32: viewer.steamId32,
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

    // Website lobbies are public from the moment they exist.
    //
    // Unpublished exists so a host can choose who to hear about a game first,
    // and that is a Discord affordance — someone who opened a lobby from the
    // public board has already decided it is for everyone. Leaving it private
    // meant a host pressed one button, saw an empty board, and never realised a
    // second press was needed while the lobby held a bot account.
    const nowPublished = new Date().toISOString();
    await store.updateGame(game.id, {
      lobbyName,
      lobbyPassword,
      published: true,
      publishedAt: nowPublished,
      publishedByDiscordId: viewer.discordId ?? null,
    });

    // Leasing must be transactional or two games claim the same account and one
    // silently never gets a lobby (§5.4). leaseAccount handles that.
    const lease = await leaseAccount(getDb(), game.id);
    const nowIso = new Date().toISOString();

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
    // `published: true` here is what makes the worker open the lobby as Public,
    // so it is findable in Dota's in-game browser straight away.
    await requestLobbyCreation({
      ...game,
      lobbyName,
      lobbyPassword,
      published: true,
      botAccountId: lease.botAccountId,
      settings,
    });

    // How an account-less host keeps control of the lobby they just opened.
    await rememberHostedGame(game.id);

    return { status: 'ok', gameId: game.id };
  } catch (err) {
    console.error('createInhouseGame', err);
    return { status: 'error' };
  }
}
