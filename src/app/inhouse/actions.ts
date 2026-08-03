'use server';

import { getInhouseViewer } from '@/lib/inhouse/session';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { getInhouseStore } from '@/lib/inhouse/store';

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

  const reveal = (status: 'reserved' | 'already_reserved' | 'in_lobby', slotsOpen: number | null, expiresAt: string | null): JoinResult => ({
    status,
    password: game.lobbyPassword,
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
    if (game.botAccountId) {
      await store.enqueueBotCommand(game.botAccountId, {
        type: 'invite_player',
        gameId,
        steamId32: viewer.steamId32,
      });
    }
    return reveal('reserved', res.slotsOpen, res.reservation.expiresAt);
  }

  switch (res.reason) {
    case 'full': {
      await store.addToWaitlist(gameId, {
        discordId: viewer.discordId,
        steamId32: viewer.steamId32,
        playerName: viewer.discordName,
      });
      if (game.botAccountId) {
        await store.enqueueBotCommand(game.botAccountId, {
          type: 'invite_player',
          gameId,
          steamId32: viewer.steamId32,
        });
      }
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
