'use server';

import { getInhouseViewer } from '@/lib/inhouse/session';
import { openLobbyFor, type CreateResult } from '@/lib/inhouse/open-lobby';
import { rememberHostedGame } from '@/lib/inhouse/host-token';

// Create a game from the website (§5.4, §7.3). One press: everything but the
// host comes from admin defaults, so a first-time host opens a correctly
// configured lobby without a settings form. Hosts change settings later with
// lobby chat commands (!mode, !delay), never here.
//
// The lobby itself is opened by `openLobbyFor`, which the Discord bot calls too
// — see lib/inhouse/open-lobby.ts. What stays here is the browser-shaped part:
// the cookie identity, and the host token.

export type { CreateResult };

/**
 * Open a lobby. **No account required.**
 *
 * Website lobbies auto-publish: someone who opened a lobby from the public
 * board has already decided it is for everyone, and there is no private-game
 * decision to attribute. The private option lives in Discord, where a host has
 * somewhere to tell their friends.
 *
 * A host token cookie (host-token.ts) is set either way, so whoever opened the
 * lobby can still cancel it without an account.
 */
export async function createInhouseGame(opts: { newcomerFriendly: boolean }): Promise<CreateResult> {
  const viewer = await getInhouseViewer();

  const result = await openLobbyFor(
    {
      discordId: viewer.discordId,
      discordName: viewer.discordName,
      steamId32: viewer.steamId32,
    },
    { newcomerFriendly: opts.newcomerFriendly, published: true }
  );

  // How an account-less host keeps control of the lobby they just opened.
  if (result.status === 'ok') await rememberHostedGame(result.gameId);

  return result;
}
