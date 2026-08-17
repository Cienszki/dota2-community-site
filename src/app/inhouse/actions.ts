'use server';

import { getInhouseViewer } from '@/lib/inhouse/session';
import { joinInfoFor, joinLobbyFor } from '@/lib/inhouse/join-lobby';
import type { JoinInfo, JoinResult } from '@/lib/inhouse/public';

// Web Join (§7.2). The reservation, waitlist, ban checks and invite all live in
// lib/inhouse/join-lobby.ts, because Discord's Dołącz button has to do exactly
// the same thing — see docs/discord-bot-integration.md §4.1. What is left here
// is the cookie identity.
//
// **Exports nothing but async functions.** A `'use server'` file registers every
// export as a server function, and this fork's compiler does that before erasing
// a TypeScript type-only re-export — so `export type { JoinInfo }` here emitted a
// reference to a type as a value and killed the module on load. Callers import
// these types from '@/lib/inhouse/public' instead.

export async function getJoinInfo(gameId: string): Promise<JoinInfo> {
  const viewer = await getInhouseViewer();
  return joinInfoFor(viewer, gameId);
}

export async function joinGame(gameId: string): Promise<JoinResult> {
  const viewer = await getInhouseViewer();
  return joinLobbyFor(viewer, gameId);
}
