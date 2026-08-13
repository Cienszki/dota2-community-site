'use server';

import { getInhouseViewer } from '@/lib/inhouse/session';
import {
  joinInfoFor,
  joinLobbyFor,
  type JoinInfo,
  type JoinResult,
} from '@/lib/inhouse/join-lobby';

// Web Join (§7.2). The reservation, waitlist, ban checks and invite all live in
// lib/inhouse/join-lobby.ts, because Discord's Dołącz button has to do exactly
// the same thing — see docs/discord-bot-integration.md §4.1. What is left here
// is the cookie identity.

export type { JoinInfo, JoinResult };

export async function getJoinInfo(gameId: string): Promise<JoinInfo> {
  const viewer = await getInhouseViewer();
  return joinInfoFor(viewer, gameId);
}

export async function joinGame(gameId: string): Promise<JoinResult> {
  const viewer = await getInhouseViewer();
  return joinLobbyFor(viewer, gameId);
}
