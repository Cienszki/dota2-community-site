import 'server-only';
import { getDb } from '@/lib/firebase-admin';
import { InhouseStore } from './core';

// Server-side accessor for the shared domain layer. Import this from route
// handlers, server components and server actions:
//
//   import { getInhouseStore } from '@/lib/inhouse/store';
//   const store = getInhouseStore();
//   const games = await store.listPublishedOpenGames();
//
// Domain *types* should be imported type-only from '@/lib/inhouse/core' (or
// '@/lib/inhouse/public' for the browser-safe shapes) so client components
// never pull the Admin SDK into their bundle.

let cached: InhouseStore | null = null;

export function getInhouseStore(): InhouseStore {
  if (!cached) cached = new InhouseStore(getDb());
  return cached;
}

// Re-export the domain surface for server code convenience. These carry the
// Admin-SDK dependency transitively, which is why this module is server-only.
export * from './core';
