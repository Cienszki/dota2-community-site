#!/usr/bin/env node
// Erase inhouse games that never happened.
//
// The sweeper (src/lib/inhouse/sweep.ts) marks a stuck lobby `failed`, which is
// enough to stop it blocking: `failed` is outside the board states and the
// recruiting states, so the game vanishes from the site and frees its cap slot,
// while the record survives for whoever is debugging the worker.
//
// This is the other thing — for when you want them gone as if they had never
// been created, including the game numbers they consumed. Written for the two
// zombie lobbies from the old tournament-only worker deployment, but it is
// general.
//
// Deliberately a script rather than an admin button. Deleting a game is
// unreviewable and irreversible, it is needed roughly never, and a button that
// does it is a button someone eventually presses by accident.
//
// Usage:
//   node scripts/inhouse-purge-games.mjs --stuck              # dry run
//   node scripts/inhouse-purge-games.mjs --stuck --apply
//   node scripts/inhouse-purge-games.mjs --id abc --id def --apply
//   …--apply --keep-counter    # leave the game counter alone
//
// Required env: FIREBASE_SERVICE_ACCOUNT_BASE64

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const STUCK = args.includes('--stuck');
const KEEP_COUNTER = args.includes('--keep-counter');
const IDS = args.reduce((acc, a, i) => (a === '--id' && args[i + 1] ? [...acc, args[i + 1]] : acc), []);

/**
 * States a game may be purged from.
 *
 * Anything that reached `in_progress` was played by real people, and deleting
 * it would silently detach the attendance ledger from the game it came from.
 * The attendance check below is the real guard; this is the cheap one.
 */
const PURGEABLE = ['draft', 'lobby_creating', 'failed', 'cancelled', 'expired'];

const SUBCOLLECTIONS = ['memberships', 'reservations', 'waitlist'];

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
if (!b64) die('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set.');
if (!STUCK && IDS.length === 0) die('Pass --stuck, or one or more --id <gameId>.');

let serviceAccount;
try {
  serviceAccount = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
} catch {
  die('FIREBASE_SERVICE_ACCOUNT_BASE64 is not valid base64-encoded JSON.');
}

initializeApp({
  credential: cert({
    projectId: serviceAccount.project_id,
    clientEmail: serviceAccount.client_email,
    privateKey: serviceAccount.private_key,
  }),
});
const db = getFirestore();

console.log(`\nProject: ${serviceAccount.project_id}`);
console.log(APPLY ? 'Mode:    APPLY — changes will be written\n' : 'Mode:    DRY RUN — nothing will be written\n');

// ── Collect targets ─────────────────────────────────────────────────────────

const targets = [];

if (STUCK) {
  const snap = await db.collection('inhouseGames').where('state', '==', 'lobby_creating').get();
  for (const doc of snap.docs) targets.push(doc.data());
}
for (const id of IDS) {
  if (targets.some((g) => g.id === id)) continue;
  const snap = await db.collection('inhouseGames').doc(id).get();
  if (!snap.exists) {
    console.warn(`  ! ${id} — no such game, skipping`);
    continue;
  }
  targets.push(snap.data());
}

if (targets.length === 0) {
  console.log('Nothing to purge.\n');
  process.exit(0);
}

// ── Vet each one ────────────────────────────────────────────────────────────

const safe = [];
for (const game of targets) {
  const label = `#${game.gameNumber} ${JSON.stringify(game.lobbyName ?? null)} (${game.id}) state=${game.state}`;

  if (!PURGEABLE.includes(game.state)) {
    console.warn(`  SKIP ${label} — state is not purgeable`);
    continue;
  }

  // The guard that actually matters. Attendance is the ledger every
  // participation stat is derived from; a game with rows in it was played.
  const attendance = await db
    .collection('inhouseAttendance')
    .where('gameId', '==', game.id)
    .limit(1)
    .get();
  if (!attendance.empty) {
    console.warn(`  SKIP ${label} — has attendance rows, this game was played`);
    continue;
  }

  const matches = await db
    .collection('inhouseMatches')
    .where('gameId', '==', game.id)
    .limit(1)
    .get();
  if (!matches.empty) {
    console.warn(`  SKIP ${label} — has a match record`);
    continue;
  }

  safe.push(game);
  console.log(`  PURGE ${label}${game.botAccountId ? ` bot=${game.botAccountId}` : ''}`);
}

if (safe.length === 0) {
  console.log('\nNothing safe to purge.\n');
  process.exit(0);
}

// ── Execute ─────────────────────────────────────────────────────────────────

async function deleteSubcollection(gameRef, name) {
  let removed = 0;
  for (;;) {
    const snap = await gameRef.collection(name).limit(400).get();
    if (snap.empty) return removed;
    if (!APPLY) return snap.size;
    const batch = db.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
    removed += snap.size;
  }
}

console.log('');
for (const game of safe) {
  const ref = db.collection('inhouseGames').doc(game.id);

  for (const name of SUBCOLLECTIONS) {
    const n = await deleteSubcollection(ref, name);
    if (n) console.log(`  ${game.id}: ${APPLY ? 'deleted' : 'would delete'} ${n} ${name}`);
  }

  // Pending commands naming a game that no longer exists would have the worker
  // acting on a ghost the moment it comes back up.
  if (game.botAccountId) {
    const queue = await db
      .collection('botCommands')
      .doc(game.botAccountId)
      .collection('queue')
      .get();
    const mine = queue.docs.filter((d) => d.data()?.command?.gameId === game.id);
    if (mine.length) {
      console.log(`  ${game.id}: ${APPLY ? 'deleted' : 'would delete'} ${mine.length} queued command(s)`);
      if (APPLY) {
        const batch = db.batch();
        for (const doc of mine) batch.delete(doc.ref);
        await batch.commit();
      }
    }

    console.log(`  ${game.id}: ${APPLY ? 'released' : 'would release'} bot account ${game.botAccountId}`);
    if (APPLY) {
      await db.collection('botAccounts').doc(game.botAccountId).set(
        { status: 'idle', leasedByGameId: null, leasedAt: null, leaseHeartbeatAt: null },
        { merge: true },
      );
    }
  }

  console.log(`  ${game.id}: ${APPLY ? 'deleted' : 'would delete'} the game document`);
  if (APPLY) await ref.delete();
}

// ── Rewind the game counter ─────────────────────────────────────────────────
//
// "As if they never existed" includes the numbers they took. Set the counter to
// the highest number still in use, so the next real game continues the sequence
// rather than leaving a permanent gap where the zombies were.

if (!KEEP_COUNTER) {
  // On a dry run nothing has actually been deleted yet, so the games about to
  // go are still in this query and would report a counter that never happens.
  // A dry run that misstates its own effect is worse than not having one.
  const purged = new Set(safe.map((g) => g.id));
  const snap = await db.collection('inhouseGames').orderBy('gameNumber', 'desc').limit(50).get();
  const highest = snap.docs
    .filter((d) => !purged.has(d.id))
    .reduce((max, d) => Math.max(max, d.data().gameNumber ?? 0), 0);
  console.log(`\n  counter: ${APPLY ? 'set' : 'would set'} inhouseCounters/games to ${highest} (next game is #${highest + 1})`);
  if (APPLY) {
    await db
      .collection('inhouseCounters')
      .doc('games')
      .set({ value: highest, updatedAt: new Date().toISOString() }, { merge: true });
  }
}

console.log(
  APPLY
    ? `\n✓ Purged ${safe.length} game(s).\n`
    : `\nDry run complete — ${safe.length} game(s) would be purged. Re-run with --apply.\n`,
);
