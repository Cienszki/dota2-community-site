'use server';

import { getDb, isInhouseConfigured } from '@/lib/firebase-admin';
import { getInhouseViewer } from '@/lib/inhouse/session';
import { getInhouseStore, resolveSettings, leaseAccount } from '@/lib/inhouse/store';
import { getLobbyConfig } from '@/lib/inhouse/lobby-config';
import { randomLobbyName } from '@/lib/inhouse/lobby-names';
import { countRecruitingLobbies } from '@/lib/inhouse/live';
import { requestLobbyCreation } from '@/lib/inhouse/commands';

// Create a game from the website (§5.4, §7.3). One press: everything but the
// host comes from admin defaults, so a first-time host opens a correctly
// configured lobby without a settings form. Hosts change settings later with
// lobby chat commands (!mode, !delay), never here.

export type CreateResult =
  | { status: 'ok'; gameId: string }
  | { status: 'needs_link' }
  | { status: 'banned' }
  | { status: 'no_bots' }
  | { status: 'too_many_open'; max: number }
  | { status: 'unavailable' }
  | { status: 'error' };

export async function createInhouseGame(opts: { newcomerFriendly: boolean }): Promise<CreateResult> {
  if (!isInhouseConfigured()) return { status: 'unavailable' };

  const viewer = await getInhouseViewer();
  if (!viewer.discordId) return { status: 'needs_link' };

  const store = getInhouseStore();

  // Don't let a banned person open lobbies either.
  const ban = await store.checkBan({ discordId: viewer.discordId, steamId32: viewer.steamId32 });
  if (ban.banned) return { status: 'banned' };

  try {
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
      initiatorDiscordId: viewer.discordId,
      initiatorName: viewer.discordName ?? 'Host',
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
      publishedByDiscordId: viewer.discordId,
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

    return { status: 'ok', gameId: game.id };
  } catch (err) {
    console.error('createInhouseGame', err);
    return { status: 'error' };
  }
}
