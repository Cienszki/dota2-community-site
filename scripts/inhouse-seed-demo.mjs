#!/usr/bin/env node
// Seed five played inhouses, so the profile card and match history can be seen
// working before any real game has been played.
//
// Everything it writes carries `seedTag: 'demo'`, and `--purge` removes exactly
// that and nothing else. Erasing is the whole reason the tag exists — this is
// demo data in a live database, and it needs to be removable without anyone
// having to remember which rows were fake.
//
// What it creates:
//   inhouseGames/{id}       ×5   finished, published — the board's match history
//   inhouseMatches/{id}     ×5   full rosters, hero picks, per-player stats
//   inhouseAttendance/…     ×50  the ledger, all ten players per match
//   inhousePlayers/{id}     ×10  your profile, plus nine others so the
//                                leaderboard and your rank have substance
//
// Usage:
//   node scripts/inhouse-seed-demo.mjs --discord-id 1234... # dry run
//   node scripts/inhouse-seed-demo.mjs --discord-id 1234... --apply
//   node scripts/inhouse-seed-demo.mjs --purge --apply
//
// Required env: FIREBASE_SERVICE_ACCOUNT_BASE64

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const APPLY = flag('--apply');
const PURGE = flag('--purge');
const DISCORD_ID = value('--discord-id');

/** Cienszki — resolved from https://steamcommunity.com/id/cienszki/ */
const HERO_STEAM_ID = value('--steam-id') ?? '35747920';
const HERO_NAME = 'Cienszki';

const SEED_TAG = 'demo';
/** Obviously-not-real match ids, so a stray one is recognisable at a glance. */
const MATCH_ID_BASE = 9_000_000_001;

const MATCHES = 5;

// Nine regulars to fill the other slots. Names come from the same register as
// the lobby-name table so the demo reads like the real thing.
const CAST = [
  { name: 'Zenith', steamId32: '900000001', games: 9 },
  { name: 'Kv1', steamId32: '900000002', games: 7 },
  { name: 'Suslik', steamId32: '900000003', games: 6 },
  { name: 'Nocnik', steamId32: '900000004', games: 4 },
  { name: 'Baszka', steamId32: '900000005', games: 3 },
  { name: 'Runowski', steamId32: '900000006', games: 3 },
  { name: 'Zryw', steamId32: '900000007', games: 2 },
  { name: 'Kaczor', steamId32: '900000008', games: 2 },
  { name: 'Wichura', steamId32: '900000009', games: 1 },
];

const LOBBY_NAMES = ['bursztyn', 'zorza', 'wichura', 'sopel', 'agat'];
// 3 wins, 2 losses — a demo where you win everything reads as fake.
const HERO_WON = [true, false, true, true, false];

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
if (!b64) die('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set.');
if (!PURGE && !DISCORD_ID) {
  die(
    'Pass --discord-id <your Discord user ID>.\n' +
      '  The profile card is keyed on it, so it must be the account you log in\n' +
      '  to the site with. Discord → Settings → Advanced → Developer Mode, then\n' +
      '  right-click your name → Copy User ID.',
  );
}

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
console.log(APPLY ? 'Mode:    APPLY\n' : 'Mode:    DRY RUN — nothing will be written\n');

const iso = (d) => new Date(d).toISOString();

/* ─── Purge ──────────────────────────────────────────────────────────────── */

async function deleteTagged(collection) {
  const snap = await db.collection(collection).where('seedTag', '==', SEED_TAG).get();
  if (snap.empty) {
    console.log(`  ${collection}: nothing tagged`);
    return 0;
  }
  console.log(`  ${collection}: ${APPLY ? 'deleting' : 'would delete'} ${snap.size}`);
  if (APPLY) {
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch();
      for (const doc of snap.docs.slice(i, i + 400)) batch.delete(doc.ref);
      await batch.commit();
    }
  }
  return snap.size;
}

if (PURGE) {
  for (const c of ['inhouseMatches', 'inhouseGames', 'inhouseAttendance', 'inhousePlayers']) {
    await deleteTagged(c);
  }

  // Your own player document is not tagged — you may have linked for real — so
  // it survives, but its counters have to stop claiming the seeded games.
  const owner = await db
    .collection('inhousePlayers')
    .where('steamIds', 'array-contains', HERO_STEAM_ID)
    .limit(1)
    .get();
  if (!owner.empty) {
    const doc = owner.docs[0];
    const remaining = await db
      .collection('inhouseAttendance')
      .where('steamId32', '==', HERO_STEAM_ID)
      .get();
    const nights = new Set(remaining.docs.map((d) => d.data().playedOn));
    console.log(
      `  inhousePlayers/${doc.id}: ${APPLY ? 'recomputing' : 'would recompute'} ` +
        `gamesPlayed → ${remaining.size}, nightsPlayed → ${nights.size}`,
    );
    if (APPLY) {
      await doc.ref.update({ gamesPlayed: remaining.size, nightsPlayed: nights.size });
    }
  }

  const left = await db.collection('inhouseGames').orderBy('gameNumber', 'desc').limit(1).get();
  const highest = left.empty ? 0 : (left.docs[0].data().gameNumber ?? 0);
  console.log(`  counter: ${APPLY ? 'set' : 'would set'} inhouseCounters/games to ${highest}`);
  if (APPLY) {
    await db
      .collection('inhouseCounters')
      .doc('games')
      .set({ value: highest, updatedAt: iso(Date.now()) }, { merge: true });
  }

  console.log(APPLY ? '\n✓ Seed data removed.\n' : '\nDry run complete. Re-run with --apply.\n');
  process.exit(0);
}

/* ─── Seed ───────────────────────────────────────────────────────────────── */

// Real hero ids, so the icons actually resolve on the profile.
const heroRes = await fetch('https://api.opendota.com/api/heroes');
if (!heroRes.ok) die('Could not fetch the OpenDota hero list.');
const heroes = (await heroRes.json()).map((h) => h.id);
if (heroes.length < 10) die('OpenDota returned too few heroes.');

const existing = await db.collection('inhouseMatches').where('seedTag', '==', SEED_TAG).limit(1).get();
if (!existing.empty) {
  die('Seed data is already present. Run with --purge --apply first.');
}

// Continue the real numbering rather than colliding with it.
const counterSnap = await db.collection('inhouseCounters').doc('games').get();
let nextNumber = (counterSnap.exists ? Number(counterSnap.data()?.value ?? 0) : 0) + 1;

const writes = { games: [], matches: [], attendance: [], players: [] };

for (let i = 0; i < MATCHES; i++) {
  // Evenings, one every couple of days, most recent first.
  const daysAgo = (MATCHES - i) * 2 - 1;
  const start = new Date();
  start.setDate(start.getDate() - daysAgo);
  start.setHours(21, 7, 0, 0);

  const duration = 1500 + Math.floor(Math.random() * 2100); // 25–60 min
  const end = new Date(start.getTime() + duration * 1000);
  const heroWon = HERO_WON[i];
  // Put the hero on Radiant every other game, so both sides show up.
  const heroSide = i % 2 === 0 ? 'radiant' : 'dire';
  const radiantWin = heroSide === 'radiant' ? heroWon : !heroWon;

  const picks = [...heroes].sort(() => Math.random() - 0.5).slice(0, 10);
  const cast = [...CAST].sort(() => Math.random() - 0.5);

  const roster = [];
  let castIndex = 0;
  for (let slot = 0; slot < 10; slot++) {
    const side = slot < 5 ? 'radiant' : 'dire';
    const isHero = side === heroSide && slot % 5 === 0;
    const who = isHero
      ? { name: HERO_NAME, steamId32: HERO_STEAM_ID }
      : cast[castIndex++ % cast.length];

    const kills = Math.floor(Math.random() * 15);
    const deaths = Math.floor(Math.random() * 12);
    const assists = Math.floor(Math.random() * 22);

    roster.push({
      steamId32: who.steamId32,
      discordId: isHero ? DISCORD_ID : null,
      playerName: who.name,
      heroId: picks[slot],
      side,
      won: side === 'radiant' ? radiantWin : !radiantWin,
      playerSlot: side === 'radiant' ? slot : 128 + (slot - 5),
      leaverStatus: 0,
      stats: {
        kills,
        deaths,
        assists,
        gold_per_min: 300 + Math.floor(Math.random() * 400),
        xp_per_min: 350 + Math.floor(Math.random() * 400),
        net_worth: 8000 + Math.floor(Math.random() * 20000),
        last_hits: Math.floor(Math.random() * 400),
        denies: Math.floor(Math.random() * 25),
        hero_damage: 5000 + Math.floor(Math.random() * 35000),
        courier_kills: Math.random() < 0.15 ? 1 : 0,
      },
    });
  }

  const radiantScore = roster.filter((r) => r.side === 'radiant').reduce((a, r) => a + r.stats.kills, 0);
  const direScore = roster.filter((r) => r.side === 'dire').reduce((a, r) => a + r.stats.kills, 0);

  const gameRef = db.collection('inhouseGames').doc();
  const gameNumber = nextNumber++;
  const dotaMatchId = MATCH_ID_BASE + i;
  const lobbyName = LOBBY_NAMES[i % LOBBY_NAMES.length];

  writes.games.push({
    ref: gameRef,
    data: {
      seedTag: SEED_TAG,
      id: gameRef.id,
      gameNumber,
      mode: 'inhouse',
      state: 'finished',
      initiatorDiscordId: DISCORD_ID,
      initiatorSteamId32: HERO_STEAM_ID,
      initiatorName: HERO_NAME,
      published: true,
      publishedAt: iso(start),
      publishedByDiscordId: DISCORD_ID,
      locked: false,
      settings: {
        mode: 'inhouse', published: true, locked: false,
        gameMode: 22, serverRegion: 3, dotaTvDelay: 120, leagueId: 0,
        selectionPriorityRules: 1, immortalDraft: false, cheatsEnabled: false,
        fillWithBots: false, allowSpectators: true, pauseSetting: 1,
        reservationTtlSeconds: 300, idleLobbyExpiryMinutes: 45,
        autoPublishNudgeMinutes: 20, publishGateGames: 0, publishesPerDay: 0,
        startCountdownSeconds: 30, banLadderDays: [7, 30, 0], newcomerReservedSlots: 2,
      },
      botAccountId: null,
      dotaLobbyId: null,
      lobbyName,
      lobbyPassword: null,
      dotaMatchId,
      newcomerFriendly: false,
      scheduledFor: null,
      discord: {
        hostPanelChannelId: null, hostPanelMessageId: null, cardChannelId: null,
        cardMessageId: null, voiceChannelId: null, scheduledEventId: null,
      },
      createdAt: iso(start.getTime() - 20 * 60_000),
      updatedAt: iso(end),
      endedAt: iso(end),
      endReason: null,
      lastActivityAt: iso(end),
      nudgedAt: null,
      result: {
        radiantWin,
        durationSeconds: duration,
        parsed: false,
        awards: [],
        abandoners: [],
        ingestedAt: iso(end),
      },
    },
  });

  writes.matches.push({
    ref: db.collection('inhouseMatches').doc(String(dotaMatchId)),
    data: {
      seedTag: SEED_TAG,
      dotaMatchId,
      gameId: gameRef.id,
      gameNumber,
      lobbyName,
      radiantWin,
      durationSeconds: duration,
      radiantScore,
      direScore,
      startedAt: iso(start),
      gameMode: 22,
      lobbyType: 1,
      leagueId: 0,
      roster,
      playerSteamIds: [...new Set(roster.map((r) => r.steamId32))],
      parseState: 'unparsed',
      parseJobId: null,
      parseRequestedAt: null,
      parsedAt: null,
      ingestedAt: iso(end),
      updatedAt: iso(end),
    },
  });

  for (const r of roster) {
    writes.attendance.push({
      ref: db.collection('inhouseAttendance').doc(`${gameRef.id}__${r.steamId32}`),
      data: {
        seedTag: SEED_TAG,
        gameId: gameRef.id,
        steamId32: r.steamId32,
        discordId: r.discordId,
        dotaMatchId,
        heroId: r.heroId,
        side: r.side,
        won: r.won,
        playedOn: iso(start).slice(0, 10),
        createdAt: iso(end),
      },
    });
  }
}

// The nine others, so "Top gracze" and your rank aren't a list of one. Tagged,
// so purge removes them outright.
for (const member of CAST) {
  writes.players.push({
    ref: db.collection('inhousePlayers').doc(`seed_${member.steamId32}`),
    data: {
      seedTag: SEED_TAG,
      discordId: `seed_${member.steamId32}`,
      discordName: member.name,
      steamIds: [member.steamId32],
      steamId32: member.steamId32,
      linkedAt: iso(Date.now()),
      linkSource: 'manual',
      pingOptIn: [],
      region: null,
      gamesPlayed: member.games,
      gamesPublished: 0,
      nightsPlayed: Math.max(1, Math.ceil(member.games / 2)),
      distinctTeammates: member.games * 3,
      heroesPlayed: member.games,
      firstSeenAt: iso(Date.now()),
      lastPlayedAt: iso(Date.now()),
      noShowCount: 0,
      lastNoShowAt: null,
    },
  });
}

console.log(`  inhouseGames:      ${writes.games.length} (#${writes.games[0].data.gameNumber}–#${writes.games.at(-1).data.gameNumber}, finished)`);
console.log(`  inhouseMatches:    ${writes.matches.length} (${MATCH_ID_BASE}–${MATCH_ID_BASE + MATCHES - 1})`);
console.log(`  inhouseAttendance: ${writes.attendance.length}`);
console.log(`  inhousePlayers:    ${writes.players.length} synthetic + 1 for you`);
console.log(`\n  ${HERO_NAME} (steam ${HERO_STEAM_ID}) plays in all ${MATCHES}, ` +
  `${HERO_WON.filter(Boolean).length}W-${HERO_WON.filter((w) => !w).length}L`);

if (!APPLY) {
  console.log('\nDry run complete. Re-run with --apply.\n');
  process.exit(0);
}

for (const group of [writes.games, writes.matches, writes.attendance, writes.players]) {
  for (let i = 0; i < group.length; i += 400) {
    const batch = db.batch();
    for (const w of group.slice(i, i + 400)) batch.set(w.ref, w.data);
    await batch.commit();
  }
}

// Your own player document: merged, not overwritten, and deliberately untagged
// so a purge leaves a real link intact. steamIds uses arrayUnion for the same
// reason — you may already have accounts linked.
const { FieldValue } = await import('firebase-admin/firestore');
const ownerRef = db.collection('inhousePlayers').doc(DISCORD_ID);
const owner = await ownerRef.get();
await ownerRef.set(
  {
    discordId: DISCORD_ID,
    discordName: owner.exists ? (owner.data().discordName ?? HERO_NAME) : HERO_NAME,
    steamIds: FieldValue.arrayUnion(HERO_STEAM_ID),
    steamId32: owner.data()?.steamId32 ?? HERO_STEAM_ID,
    linkedAt: owner.data()?.linkedAt ?? iso(Date.now()),
    linkSource: owner.data()?.linkSource ?? 'manual',
    pingOptIn: owner.data()?.pingOptIn ?? [],
    region: owner.data()?.region ?? null,
    gamesPlayed: (owner.data()?.gamesPlayed ?? 0) + MATCHES,
    gamesPublished: (owner.data()?.gamesPublished ?? 0) + MATCHES,
    nightsPlayed: (owner.data()?.nightsPlayed ?? 0) + MATCHES,
    distinctTeammates: owner.data()?.distinctTeammates ?? CAST.length,
    heroesPlayed: (owner.data()?.heroesPlayed ?? 0) + MATCHES,
    firstSeenAt: owner.data()?.firstSeenAt ?? iso(Date.now()),
    lastPlayedAt: iso(Date.now()),
    noShowCount: owner.data()?.noShowCount ?? 0,
    lastNoShowAt: owner.data()?.lastNoShowAt ?? null,
  },
  { merge: true },
);

await db
  .collection('inhouseCounters')
  .doc('games')
  .set({ value: nextNumber - 1, updatedAt: iso(Date.now()) }, { merge: true });

console.log(`\n✓ Seeded. Log in with Discord as ${DISCORD_ID} and open /inhouse.\n`);
