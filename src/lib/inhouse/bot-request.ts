import 'server-only';
import crypto from 'crypto';
import { getInhouseStore } from '@/lib/inhouse/store';
import type { HostIdentity } from '@/lib/inhouse/open-lobby';

// Shared plumbing for `/api/inhouse/bot/*` — the surface the Discord gateway
// calls so that pressing a button in Discord runs the website's own code paths
// instead of a second implementation of them.
//
// Same shared secret and the same fixed-length comparison as the match webhook
// (`/api/inhouse/matches/finished`), because it is the same trust relationship
// in the other direction.

export function botAuthorized(request: Request): boolean {
  const secret = process.env.INHOUSE_BOT_WEBHOOK_SECRET;
  if (!secret) return false;

  const header = request.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : header;

  // Compare over fixed-length digests so the check can't be timed, and so
  // mismatched lengths don't throw inside timingSafeEqual.
  const a = crypto.createHash('sha256').update(presented).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Build the same identity the website resolves from cookies, for a Discord user.
 *
 * The Steam id is looked up here rather than accepted from the caller: it is
 * what every ban check and every reservation keys on, and the authoritative
 * copy is the player document. The bot only supplies who is pressing the
 * button, never what they own.
 *
 * `discordName` is refreshed opportunistically, because the per-server nickname
 * is the name every surface prefers and the website has no other way to learn
 * it (docs/discord-bot-integration.md §4). Only for players who already have a
 * document — a player who never linked has none, and that is normal, not
 * something to fix by creating an empty one.
 */
export async function identityForDiscord(
  discordId: string,
  discordName?: string | null
): Promise<HostIdentity> {
  const store = getInhouseStore();

  let player = null;
  try {
    player = await store.getPlayer(discordId);
  } catch (err) {
    console.error('identityForDiscord', err);
  }

  if (player && discordName && player.discordName !== discordName) {
    try {
      await store.upsertPlayer(discordId, { discordName });
    } catch {
      // A stale nickname is not worth failing the interaction over.
    }
  }

  return {
    discordId,
    discordName: discordName ?? player?.discordName ?? null,
    steamId32: player?.steamId32 ?? null,
  };
}

/** Reads a required string field, trimmed. Returns null when absent or empty. */
export function requiredString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}
