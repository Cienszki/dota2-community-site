import { ImageResponse } from 'next/og';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { getInhouseStore, InhouseStore } from '@/lib/inhouse/store';
import { resolveDisplayName, formatDuration } from '@/lib/inhouse/display';
import type { Membership } from '@/lib/inhouse/core/types';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Inhouse 5v5';

// Shareable card for a match page (§10.4) — what members paste into other Dota
// communities. Host, date, result, both rosters. NO performance numbers
// (invariant 0.3). Node runtime because it reads Firestore via the Admin SDK.

const BG = '#050505';
const RED = '#E7000B';

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: BG,
        color: '#fff',
        padding: 64,
        fontFamily: 'sans-serif',
      }}
    >
      {children}
    </div>
  );
}

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const generic = () =>
    new ImageResponse(
      (
        <Frame>
          <div style={{ display: 'flex', flexDirection: 'column', margin: 'auto', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 20, fontSize: 96, fontWeight: 900, letterSpacing: -2 }}>
              <span>INHOUSE</span>
              <span style={{ color: RED }}>5v5</span>
            </div>
            <div style={{ fontSize: 32, color: '#94a3b8', marginTop: 12 }}>dota2inhouse.pl</div>
          </div>
        </Frame>
      ),
      { ...size },
    );

  if (!isInhouseConfigured()) return generic();

  let host = '';
  let gameNumber = 0;
  let resultLine = '';
  let radiant: Membership[] = [];
  let dire: Membership[] = [];
  try {
    const store = getInhouseStore();
    const game = await store.getGame(id);
    if (!game || !InhouseStore.isPubliclyVisible(game)) return generic();
    host = game.initiatorName;
    gameNumber = game.gameNumber;
    if (game.result) {
      resultLine = `${game.result.radiantWin ? 'Radiant' : 'Dire'} wygrywa · ${formatDuration(game.result.durationSeconds)}`;
    }
    const memberships = await store.listMemberships(id, false);
    radiant = memberships.filter((m) => m.side === 'radiant').slice(0, 5);
    dire = memberships.filter((m) => m.side === 'dire').slice(0, 5);
  } catch {
    return generic();
  }

  const name = (m: Membership) =>
    resolveDisplayName({ displayName: m.displayName, playerName: m.playerName, steamId32: m.steamId32 });

  return new ImageResponse(
    (
      <Frame>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 28, color: '#64748b' }}>#{gameNumber}</div>
          <div style={{ fontSize: 28, color: '#94a3b8' }}>· inhouse 5v5</div>
        </div>
        <div style={{ fontSize: 64, fontWeight: 900, marginTop: 8 }}>{host}</div>
        {resultLine ? (
          <div style={{ fontSize: 40, fontWeight: 700, color: RED, marginTop: 4 }}>{resultLine}</div>
        ) : (
          <div style={{ fontSize: 40, color: '#94a3b8', marginTop: 4 }}>Rozegrana</div>
        )}

        <div style={{ display: 'flex', gap: 48, marginTop: 40 }}>
          {[
            { title: 'Radiant', players: radiant, color: '#34d399' },
            { title: 'Dire', players: dire, color: '#f87171' },
          ].map((team) => (
            <div key={team.title} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: team.color, marginBottom: 10 }}>
                {team.title}
              </div>
              {team.players.map((m) => (
                <div key={m.steamId32} style={{ fontSize: 26, color: '#e2e8f0', marginBottom: 6 }}>
                  {name(m)}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', fontSize: 26, color: '#64748b' }}>dota2inhouse.pl</div>
      </Frame>
    ),
    { ...size },
  );
}
