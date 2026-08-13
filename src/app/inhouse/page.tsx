import type { Metadata } from 'next';
import InhouseShell from '@/components/inhouse/InhouseShell';
import InhouseBoard from '@/components/inhouse/InhouseBoard';
import InhousePulse from '@/components/inhouse/InhousePulse';
import FaqSection from '@/components/inhouse/FaqSection';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { getBoard } from '@/lib/inhouse/live';
import { getLobbyConfig, DEFAULT_MAX_OPEN_LOBBIES } from '@/lib/inhouse/lobby-config';
import { getLeaderboards } from '@/lib/inhouse/stats';
import { getInhousePulse, type PulseReading } from '@/lib/inhouse/pulse-stats';
import { getInhouseProfile, type InhouseProfile } from '@/lib/inhouse/profile';
import { getInhouseViewer } from '@/lib/inhouse/session';
import { getFaqs } from '@/lib/inhouse/faq';
import PlayerProfile from '@/components/inhouse/PlayerProfile';
import type { PublicGame } from '@/lib/inhouse/public';
import type { Medal } from '@/lib/inhouse/medals';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Inhouse 5v5',
  description:
    'Prawdziwi ludzie, prawie każdego wieczoru. Zobacz, które lobby właśnie się zapełnia, dołącz jednym kliknięciem i sprawdź historię rozegranych meczów.',
  alternates: { canonical: '/inhouse' },
};

const STEPS = [
  <>
    Kliknij &quot;Dołącz&quot; poniżej, pokażemy ci jak wejść do lobby w Docie - to bardzo proste.
  </>,
  <>
    Gdy zbierze się 10 graczy, Gra wystartuje.
  </>,
  <>
    Składy wybieracie już w grze. Powodzenia!
  </>,
];

export default async function InhousePage() {
  let live: PublicGame[] = [];
  let recent: PublicGame[] = [];
  let topPlayers: Array<{ name: string; value: number; medals: Medal[] }> = [];
  let maxOpenLobbies = DEFAULT_MAX_OPEN_LOBBIES;
  // null means the reading never loaded (Firestore down) — distinct from a
  // loaded reading whose `score` is null because the league is still too young.
  let pulse: PulseReading | null = null;
  // The profile takes the instructions' place for anyone who has linked. Loaded
  // separately from the board so a slow Steam fetch can't hold up the lobbies.
  let profile: InhouseProfile | null = null;
  // Supabase-backed, unrelated to the Firestore bot integration — fetched
  // unconditionally so the FAQ still shows while that integration is down.
  const faqs = await getFaqs();

  if (isInhouseConfigured()) {
    try {
      const [board, leaderboards, lobbyConfig, pulseReading] = await Promise.all([
        getBoard(),
        getLeaderboards(),
        getLobbyConfig(),
        getInhousePulse(),
      ]);
      maxOpenLobbies = lobbyConfig.maxOpenLobbies;
      live = board.live;
      recent = board.recent;
      topPlayers = leaderboards.gamesPlayed.slice(0, 5).map((row) => ({
        name: row.name,
        value: row.value,
        medals: row.medals,
      }));
      pulse = pulseReading;
    } catch (err) {
      console.error('inhouse landing data load failed', err);
    }

    try {
      const viewer = await getInhouseViewer();
      profile = await getInhouseProfile(viewer.discordId);
    } catch (err) {
      // Falls back to the instructions, which is the right thing anyway.
      console.error('inhouse profile load failed', err);
    }
  }

  return (
    <InhouseShell width="wide">
      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <section className="max-w-3xl">
        <h1 className="text-4xl font-black tracking-tighter uppercase leading-[0.95]">
          Inhouse <span className="text-[#E7000B]">5v5</span>
        </h1>
        <p className="text-slate-300 text-lg mt-4 leading-relaxed">
          Prywatne gry 5v5 dla społeczności PD2IH, każdy może dołączyć! Luźna atmosfera, ciekawe wyzwania, bez tryhardu.
        </p>
      </section>

      {/* ─── Profile (or how to join), and the pulse ──────────────────────── */}
      {/* One three-column strip. Signed in: identity | match history | pulse.
          Signed out: the steps take the first two columns and the pulse keeps
          the third, so the gauge sits in the same place either way.

          The pulse used to float beside the h1, which left it reading as page
          furniture rather than as one of the numbers about the league. */}
      <section className="mt-10 grid items-start gap-x-10 gap-y-8 lg:grid-cols-3">
        {profile ? (
          <PlayerProfile profile={profile} />
        ) : (
          <div className="lg:col-span-2">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-5">
              Jak dołączyć
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {STEPS.map((step, i) => (
                <div key={i} className="flex gap-3.5">
                  <span
                    className="shrink-0 w-8 h-8 rounded-full bg-[#E7000B]/15 border border-[#E7000B]/40
                               text-[#f87171] font-black text-[15px] flex items-center justify-center"
                  >
                    {i + 1}
                  </span>
                  <p className="text-[15px] text-slate-200 leading-relaxed">{step}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {pulse && <InhousePulse score={pulse.score} />}
      </section>

      {/* Board and history are one feed sliced in two, so they live together. */}
      <InhouseBoard
        initialLive={live}
        initialRecent={recent}
        topPlayers={topPlayers}
        maxOpenLobbies={maxOpenLobbies}
      />

      <FaqSection faqs={faqs} />
    </InhouseShell>
  );
}
