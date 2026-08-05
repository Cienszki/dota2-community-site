import type { Metadata } from 'next';
import { CheckCircle2, KeyRound, Link2, Gamepad2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { FaDiscord, FaSteam } from 'react-icons/fa';
import InhouseShell from '@/components/inhouse/InhouseShell';
import SkewButton from '@/components/inhouse/SkewButton';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { getInhouseViewer } from '@/lib/inhouse/session';
import { getInhouseStore } from '@/lib/inhouse/store';
import LinkCodeForm from './LinkCodeForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Połącz konto',
  description:
    'Połącz konto Discord i Steam z ligą inhouse — trzymamy Ci miejsce w lobby, zapraszamy automatycznie i odzyskujemy całą historię Twoich gier.',
};

const ERROR_MESSAGES: Record<string, string> = {
  state: 'Sesja logowania wygasła. Spróbuj ponownie.',
  token: 'Nie udało się zalogować przez Discord. Spróbuj ponownie.',
  me: 'Nie udało się pobrać danych z Discorda. Spróbuj ponownie.',
  unconfigured: 'Integracja z botem jest w trakcie konfiguracji.',
  claimed: 'To konto Steam jest już przypisane do innego profilu Discord.',
  store: 'Coś poszło nie tak przy zapisie. Spróbuj ponownie za chwilę.',
  steam: 'Weryfikacja logowania Steam nie powiodła się.',
  nosession: 'Najpierw zaloguj się przez Discord.',
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function LinkPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const error = first(sp.error);
  const linked = first(sp.linked);
  const games = first(sp.games);
  const connectionNone = first(sp.connection) === 'none';

  const configured = isInhouseConfigured();
  const viewer = await getInhouseViewer();

  // Totals for the "we found N games" reveal, resolved across all their alts.
  let totals: { gamesPlayed: number; nightsPlayed: number; heroesPlayed: number } | null = null;
  if (configured && viewer.linked && viewer.steamId32) {
    try {
      totals = await getInhouseStore().getStatsForSteamId(viewer.steamId32);
    } catch {
      totals = null;
    }
  }

  return (
    <InhouseShell width="narrow">
      <div className="mb-8">
        <h1 className="text-4xl font-black tracking-tight uppercase">Połącz konto</h1>
        <p className="text-slate-400 mt-2 text-lg">
          Połącz Discord i Steam, a liga zacznie dla Ciebie pracować.
        </p>
      </div>

      {/* status banners */}
      {error && ERROR_MESSAGES[error] && (
        <Banner tone="error" icon={<AlertTriangle className="w-5 h-5" />}>
          {ERROR_MESSAGES[error]}
        </Banner>
      )}
      {linked === '1' && (
        <Banner tone="success" icon={<CheckCircle2 className="w-5 h-5" />}>
          Połączono konto Steam!{' '}
          {games && Number(games) > 0
            ? `Znaleźliśmy Twoje ${games} wcześniejszych gier.`
            : 'Od teraz Twoje gry będą się liczyć.'}
        </Banner>
      )}
      {linked === 'already' && (
        <Banner tone="success" icon={<CheckCircle2 className="w-5 h-5" />}>
          To konto było już połączone — wszystko gotowe.
        </Banner>
      )}

      {!configured ? (
        <Card>
          <p className="text-slate-300">
            Integracja z botem lobby jest w trakcie konfiguracji. Zajrzyj tu wkrótce.
          </p>
        </Card>
      ) : viewer.linked ? (
        <LinkedState name={viewer.discordName} totals={totals} />
      ) : viewer.discordId ? (
        <StepTwo name={viewer.discordName} connectionNone={connectionNone} />
      ) : (
        <StepOne />
      )}

      <Benefits />
    </InhouseShell>
  );
}

/* ─── States ─────────────────────────────────────────────────────────────── */

function StepOne() {
  return (
    <Card>
      <StepBadge n={1} label="Zaloguj się przez Discord" />
      <p className="text-slate-400 text-sm mt-3 mb-6 leading-relaxed">
        Discord to Twoja tożsamość w społeczności. Jeśli masz już podpięty Steam w ustawieniach
        Discorda, połączymy konta automatycznie — bez żadnego dodatkowego kroku.
      </p>
      <SkewButton href="/api/inhouse/auth/discord?next=/inhouse/link" variant="discord" prefetch={false}>
        <FaDiscord className="w-5 h-5" />
        Zaloguj przez Discord
      </SkewButton>
    </Card>
  );
}

function StepTwo({ name, connectionNone }: { name: string | null; connectionNone: boolean }) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold mb-5">
        <CheckCircle2 className="w-4 h-4" />
        Discord połączony{name ? ` jako ${name}` : ''}
      </div>

      <StepBadge n={2} label="Dodaj konto Steam" />
      {connectionNone && (
        <p className="text-slate-400 text-sm mt-3 leading-relaxed">
          Nie znaleźliśmy Steama w Twoich połączeniach Discord. Zaloguj się przez Steam poniżej albo
          wpisz kod z lobby.
        </p>
      )}

      <div className="mt-5 flex flex-col gap-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">Przez Steam</p>
          <SkewButton href="/api/inhouse/auth/steam" variant="red" prefetch={false}>
            <FaSteam className="w-5 h-5" />
            Zaloguj przez Steam
          </SkewButton>
        </div>

        <div className="flex items-center gap-3 text-slate-600 text-xs uppercase tracking-widest">
          <span className="h-px flex-1 bg-white/10" /> albo <span className="h-px flex-1 bg-white/10" />
        </div>

        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5" /> Kod z lobby
          </p>
          <p className="text-slate-400 text-sm mb-3 leading-relaxed">
            W lobby wpisz <code className="text-slate-200 bg-white/10 px-1.5 py-0.5 rounded">!link</code>, a
            bot poda Ci 4-znakowy kod. Wpisz go tutaj.
          </p>
          <LinkCodeForm />
        </div>
      </div>
    </Card>
  );
}

function LinkedState({
  name,
  totals,
}: {
  name: string | null;
  totals: { gamesPlayed: number; nightsPlayed: number; heroesPlayed: number } | null;
}) {
  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Konto połączone</h2>
          <p className="text-slate-400 text-sm">{name ? `Cześć, ${name}!` : 'Wszystko gotowe.'}</p>
        </div>
      </div>

      {totals && totals.gamesPlayed > 0 ? (
        <div className="grid grid-cols-3 gap-3 mt-5">
          <Stat value={totals.gamesPlayed} label="rozegranych gier" />
          <Stat value={totals.nightsPlayed} label="wieczorów gry" />
          <Stat value={totals.heroesPlayed} label="bohaterów" />
        </div>
      ) : (
        <p className="text-slate-400 text-sm mt-2">
          Od teraz każda Twoja gra w lidze będzie się liczyć do statystyk.
        </p>
      )}

      <div className="mt-6">
        <SkewButton href="/inhouse" variant="redSolid" prefetch={false}>
          <Gamepad2 className="w-5 h-5" />
          Zobacz gry na żywo
        </SkewButton>
      </div>
    </Card>
  );
}

/* ─── Bits ───────────────────────────────────────────────────────────────── */

function Benefits() {
  const items = [
    { icon: <ShieldCheck className="w-4 h-4" />, text: 'Trzymamy Ci miejsce w lobby przez 5 minut i zapraszamy automatycznie.' },
    { icon: <Link2 className="w-4 h-4" />, text: 'Automatyczne zaproszenia i promocja z listy oczekujących.' },
    { icon: <Gamepad2 className="w-4 h-4" />, text: 'Odzyskujemy całą historię Twoich gier — nawet sprzed połączenia.' },
  ];
  return (
    <div className="mt-8 grid gap-3">
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-3 text-slate-400 text-sm">
          <span className="text-[#E7000B] mt-0.5">{it.icon}</span>
          {it.text}
        </div>
      ))}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900/40 border border-white/10 rounded-2xl p-6 sm:p-8 backdrop-blur-md">
      {children}
    </div>
  );
}

function StepBadge({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-7 h-7 shrink-0 rounded-full bg-[#E7000B] text-white text-sm font-black flex items-center justify-center -skew-x-[8deg]">
        {n}
      </span>
      <h2 className="text-lg font-bold text-white">{label}</h2>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-black/30 border border-white/10 rounded-xl px-3 py-4 text-center">
      <div className="text-3xl font-black text-white">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 mt-1">{label}</div>
    </div>
  );
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: 'error' | 'success';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const styles =
    tone === 'error'
      ? 'bg-red-500/10 border-red-500/30 text-red-300'
      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300';
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 mb-6 text-sm ${styles}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </div>
  );
}
