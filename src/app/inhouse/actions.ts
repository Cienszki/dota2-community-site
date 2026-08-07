'use server';

import { getInhouseViewer } from '@/lib/inhouse/session';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { getInhouseStore } from '@/lib/inhouse/store';
import { getLobbyConfig } from '@/lib/inhouse/lobby-config';
import { requestInvite } from '@/lib/inhouse/commands';
import { InhouseStore } from '@/lib/inhouse/core';

// Web Join (§7.2). This is ban-enforcement point 3 of 4 (invariant 0.4): the
// API rejects a banned user independently of any disabled button, and the
// lobby password is only ever returned here — to a signed-in, non-banned user
// who pressed Join. The reservation itself is the shared store's race-safe
// transaction (re-checks committed < 10 inside the tx).

export type JoinResult =
  | { status: 'needs_link' }
  | { status: 'unavailable' }
  | { status: 'banned' }
  | { status: 'not_open' }
  | { status: 'locked' }
  | { status: 'error' }
  | { status: 'waitlisted'; position: number }
  | {
      status: 'reserved' | 'already_reserved' | 'in_lobby';
      password: string | null;
      lobbyName: string | null;
      expiresAt: string | null;
      slotsOpen: number | null;
    };

/** What the join dialog needs to render both of its columns. */
export type JoinInfo =
  | { status: 'unavailable' | 'not_found' | 'not_open' }
  | { status: 'banned' }
  | {
      status: 'ok';
      /** Name to search for in Dota's lobby browser. */
      lobbyName: string | null;
      /** Null only when no password has been configured yet. */
      password: string | null;
      /** Whether the bot can pull this viewer in without them typing anything. */
      canBeInvited: boolean;
      hasSteam: boolean;
      hasDiscord: boolean;
      name: string | null;
    };

/**
 * Everything the join dialog shows, resolved in one round trip.
 *
 * This is a reveal point for the lobby password, so it repeats the ban check
 * rather than trusting the button that opened the dialog (invariant 0.4), and
 * it refuses games that aren't publicly visible and taking players.
 *
 * Note the password reaches anyone who can open the dialog, not only linked
 * players — that follows from the password being one shared admin-set value
 * rather than a per-game secret. The manual "find it in the lobby browser" path
 * is the majority join path (§3.1) and it cannot work without it.
 */
export async function getJoinInfo(gameId: string): Promise<JoinInfo> {
  if (!isInhouseConfigured()) return { status: 'unavailable' };

  const store = getInhouseStore();

  try {
    const [viewer, game] = await Promise.all([getInhouseViewer(), store.getGame(gameId)]);
    if (!game) return { status: 'not_found' };
    if (!InhouseStore.isPubliclyVisible(game)) return { status: 'not_found' };
    if (game.state !== 'open' && game.state !== 'ready') return { status: 'not_open' };

    const ban = await store.checkBan({
      discordId: viewer.discordId,
      steamId32: viewer.steamId32,
    });
    if (ban.banned) return { status: 'banned' };

    // Prefer the password the bot actually set on this lobby; fall back to the
    // configured shared one for a lobby the worker hasn't finished creating.
    const configured = await getLobbyConfig();

    return {
      status: 'ok',
      lobbyName: game.lobbyName,
      password: game.lobbyPassword || configured.password || null,
      // A reservation is keyed on Discord and needs a Steam ID to invite, so an
      // automatic invite needs both halves — the same test `joinGame` applies.
      canBeInvited: Boolean(viewer.discordId && viewer.steamId32),
      hasSteam: Boolean(viewer.steamId32),
      hasDiscord: Boolean(viewer.discordId),
      name: viewer.discordName,
    };
  } catch (err) {
    console.error('getJoinInfo', err);
    return { status: 'unavailable' };
  }
}

export async function joinGame(gameId: string): Promise<JoinResult> {
  if (!isInhouseConfigured()) return { status: 'unavailable' };

  const viewer = await getInhouseViewer();
  // A reservation is keyed on the Discord ID and needs a Steam ID to invite —
  // so both must be present. Missing either is the link offer (§7.2), the
  // highest-converting moment in the product.
  if (!viewer.discordId || !viewer.steamId32) return { status: 'needs_link' };

  const store = getInhouseStore();

  // Ban check FIRST, and independently of the button (invariant 0.4). Follows
  // the person across every linked account.
  const ban = await store.checkBan({ discordId: viewer.discordId, steamId32: viewer.steamId32 });
  if (ban.banned) return { status: 'banned' };

  const game = await store.getGame(gameId);
  if (!game) return { status: 'error' };
  if (game.state !== 'open') return { status: 'not_open' };

  // Falls back to the shared admin password for a lobby the worker hasn't
  // finished creating yet — a reservation with no password to show is a dead end.
  const password = game.lobbyPassword || (await getLobbyConfig()).password || null;

  const reveal = (status: 'reserved' | 'already_reserved' | 'in_lobby', slotsOpen: number | null, expiresAt: string | null): JoinResult => ({
    status,
    password,
    lobbyName: game.lobbyName,
    expiresAt,
    slotsOpen,
  });

  const res = await store.createReservation(gameId, {
    discordId: viewer.discordId,
    steamId32: viewer.steamId32,
    playerName: viewer.discordName,
    ttlSeconds: game.settings.reservationTtlSeconds,
  });

  if (res.ok) {
    // Pull the player in — fire the Steam invite so they actually get dragged
    // into the lobby, not just counted (§5.3).
    await requestInvite(game, {
      steamId32: viewer.steamId32,
      discordId: viewer.discordId,
      playerName: viewer.discordName,
    });
    return reveal('reserved', res.slotsOpen, res.reservation.expiresAt);
  }

  switch (res.reason) {
    case 'full': {
      await store.addToWaitlist(gameId, {
        discordId: viewer.discordId,
        steamId32: viewer.steamId32,
        playerName: viewer.discordName,
      });
      // Invited even from the waitlist: the lobby can empty out between the
      // reservation failing and the player opening Dota, and an invite they
      // already hold is what lets them walk straight in when it does.
      await requestInvite(game, {
        steamId32: viewer.steamId32,
        discordId: viewer.discordId,
        playerName: viewer.discordName,
      });
      const waitlist = await store.listWaitlist(gameId);
      const position = waitlist.findIndex((w) => w.discordId === viewer.discordId) + 1;
      return { status: 'waitlisted', position: position > 0 ? position : waitlist.length };
    }
    case 'already_reserved':
      // They already hold a slot — just show them the credentials again.
      return reveal('already_reserved', null, null);
    case 'already_in_lobby':
      return reveal('in_lobby', null, null);
    case 'locked':
      return { status: 'locked' };
    default:
      return { status: 'error' };
  }
}
