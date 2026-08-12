import type { Metadata } from 'next';
import { ChevronDown } from 'lucide-react';
import InhouseShell from '@/components/inhouse/InhouseShell';
import InhouseBoard from '@/components/inhouse/InhouseBoard';
import FaqSection from '@/components/inhouse/FaqSection';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { getBoard } from '@/lib/inhouse/live';
import { getLobbyConfig, DEFAULT_MAX_OPEN_LOBBIES } from '@/lib/inhouse/lobby-config';
import { getLeaderboards } from '@/lib/inhouse/stats';
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
  // The profile takes the instructions' place for anyone who has linked. Loaded
  // separately from the board so a slow Steam fetch can't hold up the lobbies.
  let profile: InhouseProfile | null = null;
  // Supabase-backed, unrelated to the Firestore bot integration — fetched
  // unconditionally so the FAQ still shows while that integration is down.
  const faqs = await getFaqs();

  if (isInhouseConfigured()) {
    try {
      const [board, leaderboards, lobbyConfig] = await Promise.all([
        getBoard(),
        getLeaderboards(),
        getLobbyConfig(),
      ]);
      maxOpenLobbies = lobbyConfig.maxOpenLobbies;
      live = board.live;
      recent = board.recent;
      topPlayers = leaderboards.gamesPlayed.slice(0, 5).map((row) => ({
        name: row.name,
        value: row.value,
        medals: row.medals,
      }));
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
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h1 className="text-5xl md:text-6xl font-black tracking-tighter uppercase leading-[0.95]">
            Inhouse <span className="text-[#E7000B]">5v5</span>
          </h1>
          {/* A plain anchor, not a Link: this is a same-page jump, and the
              smooth scroll comes from `scroll-behavior` already set globally. */}
          {/* Deliberately the same skewed outline as the board's own buttons —
              as muted text it read as a caption rather than something to press. */}
          <a
            href="#faq"
            className="inline-flex h-[35px] items-center gap-2 border-[1.5px] border-[#E7000B] px-5
                       text-sm font-extrabold uppercase tracking-wide text-white
                       -skew-x-[12deg] transition-colors hover:bg-[#E7000B]/15"
          >
            <span className="flex skew-x-[12deg] items-center gap-2">
              FAQ
              <ChevronDown className="h-4 w-4" />
            </span>
          </a>
        </div>
        <p className="text-slate-300 text-xl mt-4 leading-relaxed">
          Luźne mecze 5v5 z kolegami i członkami społeczności. Sami wybieracie składy, a dołączysz jednym kliknięciem.
        </p>
      </section>

      {/* ─── Profile, or how to join ──────────────────────────────────────── */}
      {/* Same slot, two audiences: the steps are worth reading exactly once, so
          anyone who has linked gets their own record there instead. */}
      {profile ? (
        <PlayerProfile profile={profile} />
      ) : (
        <section className="mt-10">
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
        </section>
      )}

      {/* Board and history are one feed sliced in two, so they live together. */}
      <InhouseBoard
        initialLive={live}
        initialRecent={recent}
        topPlayers={topPlayers}
        maxOpenLobbies={maxOpenLobbies}
      />

      <FaqSection faqs={faqs} />

      {!isInhouseConfigured() && (
        <p className="mt-10 text-sm text-slate-500">
          Integracja z botem lobby jest w trakcie konfiguracji — ten widok odżyje, gdy wszystko będzie
          podłączone.
        </p>
      )}
    </InhouseShell>
  );
}
