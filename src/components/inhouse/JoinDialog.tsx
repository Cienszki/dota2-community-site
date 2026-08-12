'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  X,
  Loader2,
  Copy,
  Check,
  Ban,
  Clock,
  Search,
  Lock,
  Wand2,
  LogIn,
  Trophy,
  MapPin,
} from 'lucide-react';
import { FaDiscord, FaSteam } from 'react-icons/fa';
import { getJoinInfo, joinGame, type JoinInfo, type JoinResult } from '@/app/inhouse/actions';
import { modeName, regionName } from '@/lib/inhouse/display';

// The Join dialog (§7.2).
//
// Two ways in, side by side, because they serve two different people. The left
// column is the majority path — open Dota, find the lobby in the browser, type
// the password — and it must work for someone who has never touched Discord or
// this website. The right column is the upgrade: link once and the bot drags
// you into the lobby without you searching for anything.
//
// Neither is the "real" one, which is why they sit as equals either side of an
// "albo" rather than as a primary action and a fallback link.

export default function JoinDialog({
  gameId,
  lobbyName,
  full,
  children,
}: {
  gameId: string;
  lobbyName: string | null;
  full?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Stable, so the dialog's mount effects don't re-run on a parent re-render —
  // the live board re-renders this card on every SSE frame.
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-[30px] px-5 font-bold text-[13px] uppercase tracking-wide
                   bg-[#E7000B] text-white hover:bg-[#c10009] -skew-x-[12deg] transition-colors"
      >
        <span className="flex items-center gap-2 skew-x-[12deg]">
          {children ?? (full ? 'Dołącz do kolejki' : 'Dołącz')}
        </span>
      </button>
      {open && <Modal gameId={gameId} lobbyName={lobbyName} onClose={close} />}
    </>
  );
}

/* ─── Shell ──────────────────────────────────────────────────────────────── */

function Modal({
  gameId,
  lobbyName,
  onClose,
}: {
  gameId: string;
  lobbyName: string | null;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void getJoinInfo(gameId).then((res) => {
      if (!cancelled) setInfo(res);
    });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  // Escape closes, and the page behind must not scroll away under the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center overflow-y-auto
                 bg-black/80 backdrop-blur-sm p-4 sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Jak dołączyć do lobby"
        tabIndex={-1}
        className="relative w-full max-w-4xl my-auto rounded-2xl border border-white/10 overflow-hidden
                   bg-[linear-gradient(135deg,rgba(43,43,43,0.8)_0%,rgba(5,5,5,0.8)_100%)] backdrop-blur-md
                   shadow-[0_30px_80px_rgba(0,0,0,0.6)] outline-none"
      >
        <div className="h-1 w-full bg-[linear-gradient(90deg,#E7000B,rgba(231,0,11,0))]" />

        <button
          onClick={onClose}
          aria-label="Zamknij"
          className="absolute right-4 top-5 z-10 rounded-lg p-1.5 text-slate-400 hover:text-white
                     hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="px-6 pt-8 pb-2 sm:px-8">
          <h2 className="text-[28px] sm:text-[34px] font-black uppercase tracking-tight leading-none text-white">
            {lobbyName ? (
              <>
                Dołącz do <span className="text-[#f87171]">{lobbyName}</span>
              </>
            ) : (
              'Dołącz do lobby'
            )}
          </h2>
          <p className="text-slate-400 text-sm mt-1.5">Wejdź ręcznie albo daj się zaprosić.</p>
          {info?.status === 'ok' && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <Trophy className="h-4 w-4 text-slate-500" />
                {modeName(info.gameMode)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-slate-500" />
                {regionName(info.serverRegion)}
              </span>
            </div>
          )}
        </div>

        {info === null ? (
          <div className="flex items-center justify-center gap-3 px-8 py-20 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Wczytywanie…
          </div>
        ) : info.status !== 'ok' ? (
          <Blocked info={info} />
        ) : (
          <Columns gameId={gameId} info={info} />
        )}
      </div>
    </div>,
    document.body,
  );
}

function Blocked({ info }: { info: Exclude<JoinInfo, { status: 'ok' }> }) {
  const copy: Record<string, { title: string; body: string }> = {
    banned: {
      title: 'Nie możesz dołączyć do tej gry',
      body: 'Jeśli uważasz, że to pomyłka, odezwij się do administracji na Discordzie.',
    },
    not_open: {
      title: 'Ta gra już nie przyjmuje graczy',
      body: 'Zerknij na listę obecnych meczów — może ktoś właśnie otworzył nowe lobby.',
    },
    not_found: {
      title: 'Nie znaleziono tej gry',
      body: 'Mogła zostać zamknięta, zanim zdążyłeś kliknąć.',
    },
    unavailable: {
      title: 'Chwilowo niedostępne',
      body: 'Integracja z botem lobby nie odpowiada. Spróbuj za chwilę.',
    },
  };
  const c = copy[info.status] ?? copy.unavailable;

  return (
    <div className="px-6 pb-8 sm:px-8">
      <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-4">
        <Ban className="w-5 h-5 shrink-0 text-red-300 mt-0.5" />
        <div>
          <p className="font-bold text-red-200">{c.title}</p>
          <p className="text-slate-300 text-sm mt-1">{c.body}</p>
        </div>
      </div>
    </div>
  );
}

/* ─── The two columns ────────────────────────────────────────────────────── */

function Columns({
  gameId,
  info,
}: {
  gameId: string;
  info: Extract<JoinInfo, { status: 'ok' }>;
}) {
  return (
    <div className="grid md:grid-cols-[1fr_auto_1fr] gap-6 md:gap-2 px-6 pb-8 sm:px-8">
          <ManualColumn info={info} />
      <Divider />
      <InviteColumn gameId={gameId} info={info} />
    </div>
  );
}

function Divider() {
  return (
    <div className="flex md:flex-col items-center gap-3 text-slate-600 text-xs uppercase tracking-[0.2em]">
      <span className="h-px md:h-auto md:w-px flex-1 bg-white/10" />
      albo
      <span className="h-px md:h-auto md:w-px flex-1 bg-white/10" />
    </div>
  );
}

function ManualColumn({ info }: { info: Extract<JoinInfo, { status: 'ok' }> }) {
  const { lobbyName, password } = info;
  const steps = [
    <>
      Odpal <b className="text-white">Dotę 2</b>
    </>,
    <>
      Wejdź w <b className="text-white">Zagraj</b> → <b className="text-white">Lobby prywatne</b>
    </>,
    <>
      Kliknij <b className="text-white">Przeglądaj</b>
    </>,
    // Dota's browser lists every public lobby, so the name alone is a needle in
    // a haystack — the server and mode filters are what make it findable.
    <>
      Wybierz serwer <b className="text-white">{regionName(info.serverRegion)}</b> albo tryb gry{' '}
      <b className="text-white">{modeName(info.gameMode)}</b>
      {lobbyName ? (
        <>
          {' '}i wyszukaj lobby <b className="text-white">{lobbyName}</b>
        </>
      ) : (
        <> i wyszukaj lobby po nazwie z karty</>
      )}
    </>,
    <>Dołącz, podając hasło poniżej</>,
  ];

  return (
    <section className="md:pr-6">
      <ColumnHeading icon={<Search className="w-4 h-4" />} title="Wejdź sam" />
      <p className="text-slate-400 text-sm mb-4 leading-relaxed">
        Nie musisz mieć niczego połączonego. Znajdź lobby w grze i wpisz hasło.
      </p>

      <ol className="space-y-2.5 mb-5">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-sm text-slate-300 leading-relaxed">
            <span
              className="shrink-0 w-5 h-5 mt-px rounded-full bg-[#E7000B]/15 border border-[#E7000B]/40
                         text-[11px] font-black text-[#f87171] flex items-center justify-center"
            >
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <PasswordBox password={password} />
    </section>
  );
}

function PasswordBox({ password }: { password: string | null }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    if (!password) return;
    void navigator.clipboard?.writeText(password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [password]);

  if (!password) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <p className="text-sm text-slate-400">
          Hasło nie zostało jeszcze ustawione. Zapytaj na Discordzie albo połącz konto — bot wpuści
          Cię bez hasła.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#E7000B]/30 bg-[#E7000B]/10 px-4 py-3">
      <Lock className="w-4 h-4 shrink-0 text-[#f87171]" />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Hasło</div>
        <div className="text-[22px] font-black tracking-[0.18em] text-white truncate">{password}</div>
      </div>
      <button
        onClick={copy}
        className="ml-auto shrink-0 inline-flex -skew-x-[12deg] items-center bg-white/[0.12] hover:bg-white/20
                   px-3.5 py-2 transition-colors"
      >
        <span className="flex skew-x-[12deg] items-center gap-1.5 text-xs font-semibold text-slate-200 whitespace-nowrap">
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Skopiowano' : 'Kopiuj'}
        </span>
      </button>
    </div>
  );
}

function InviteColumn({
  gameId,
  info,
}: {
  gameId: string;
  info: Extract<JoinInfo, { status: 'ok' }>;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<JoinResult | null>(null);

  const invite = () =>
    start(async () => {
      setResult(await joinGame(gameId));
    });

  return (
    <section className="md:pl-6">
      <ColumnHeading icon={<Wand2 className="w-4 h-4" />} title="Daj się zaprosić" />
      <p className="text-slate-400 text-sm mb-4 leading-relaxed">
        Z połączonymi kontami nie szukasz niczego w przeglądarce lobby. Trzymamy Ci miejsce na 5
        minut, a bot zaprasza Cię sam — wystarczy, że masz odpaloną Dotę.
      </p>

      {result ? (
        <InviteOutcome result={result} onRetry={() => setResult(null)} />
      ) : info.canBeInvited ? (
        <>
          <p className="flex items-center gap-2 text-sm text-emerald-300 mb-4">
            <Check className="w-4 h-4" />
            Konta połączone{info.name ? ` — cześć, ${info.name}!` : ''}
          </p>
          <button
            onClick={invite}
            disabled={pending}
            className="flex w-full items-center justify-center h-11 font-extrabold text-sm uppercase tracking-wide
                       bg-[#E7000B] text-white hover:bg-[#c10009] disabled:opacity-60 -skew-x-[12deg]
                       transition-colors"
          >
            <span className="flex items-center gap-2 skew-x-[12deg]">
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              Zaproś mnie
            </span>
          </button>
        </>
      ) : (
        <LinkOffer info={info} />
      )}
    </section>
  );
}

/**
 * The link offer, shown only for the half the viewer is actually missing.
 *
 * Steam OpenID attaches to a Discord profile, so Discord has to come first —
 * offering the Steam button to someone with no Discord session just bounces
 * them through an OAuth redirect they didn't ask for.
 */
function LinkOffer({ info }: { info: Extract<JoinInfo, { status: 'ok' }> }) {
  const next = encodeURIComponent('/inhouse');

  return (
    <div className="flex flex-col gap-3">
      {!info.hasDiscord ? (
        <LinkButton
          href={`/api/inhouse/auth/discord?next=${next}`}
          className="bg-[#5865F2] hover:bg-[#4752c4]"
          icon={<FaDiscord className="w-4 h-4" />}
          label="Zaloguj przez Discord"
        />
      ) : (
        <p className="flex items-center gap-2 text-sm text-emerald-300">
          <Check className="w-4 h-4" /> Discord połączony
          {info.name ? ` jako ${info.name}` : ''}
        </p>
      )}

      {info.hasDiscord && !info.hasSteam && (
        <LinkButton
          href="/api/inhouse/auth/steam"
          className="bg-[#E7000B] hover:bg-[#c10009]"
          icon={<FaSteam className="w-4 h-4" />}
          label="Zaloguj przez Steam"
        />
      )}

      <p className="text-slate-500 text-xs leading-relaxed">
        Jeśli masz Steam podpięty w ustawieniach Discorda, połączymy konta same — bez drugiego kroku.
        Możesz też wpisać kod z lobby na{' '}
        <Link
          href="/inhouse/link"
          prefetch={false}
          className="text-slate-300 underline underline-offset-2 hover:text-white"
        >
          stronie łączenia kont
        </Link>
        .
      </p>
    </div>
  );
}

function LinkButton({
  href,
  className,
  icon,
  label,
}: {
  href: string;
  className: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <a
      href={href}
      className={`inline-flex w-fit items-center h-11 px-6 font-extrabold text-sm uppercase tracking-wide
                  text-white -skew-x-[12deg] transition-colors ${className}`}
    >
      <span className="flex items-center gap-2.5 skew-x-[12deg]">
        {icon}
        {label}
      </span>
    </a>
  );
}

function InviteOutcome({ result, onRetry }: { result: JoinResult; onRetry: () => void }) {
  switch (result.status) {
    case 'reserved':
    case 'already_reserved':
    case 'in_lobby':
      return (
        <Panel tone="success">
          <p className="font-bold text-white">
            {result.status === 'in_lobby' ? 'Jesteś już w lobby' : 'Miejsce zarezerwowane!'}
          </p>
          <p className="text-slate-300 text-sm mt-1">
            Otwórz Dotę — zaproszenie do lobby już do Ciebie leci.
          </p>
        </Panel>
      );
    case 'waitlisted':
      return (
        <Panel tone="accent">
          <p className="flex items-center gap-2 font-bold text-white">
            <Clock className="w-4 h-4" /> Lobby pełne — jesteś na liście
            {result.position ? ` (#${result.position})` : ''}.
          </p>
          <p className="text-slate-300 text-sm mt-1">Zaprosimy Cię, gdy tylko zwolni się miejsce.</p>
        </Panel>
      );
    case 'banned':
      return (
        <Panel tone="error">
          <p className="flex items-center gap-2 font-bold text-red-300">
            <Ban className="w-4 h-4" /> Nie możesz dołączyć do tej gry.
          </p>
        </Panel>
      );
    case 'needs_link':
      return (
        <Panel tone="accent">
          <p className="text-slate-200 text-sm">
            Musisz mieć połączone oba konta, żeby bot mógł Cię zaprosić.
          </p>
          <Retry onRetry={onRetry} />
        </Panel>
      );
    case 'not_open':
      return (
        <Panel tone="muted">
          <p className="text-slate-300 text-sm">Ta gra już nie przyjmuje graczy.</p>
        </Panel>
      );
    case 'locked':
      return (
        <Panel tone="muted">
          <p className="text-slate-300 text-sm">Lobby jest chwilowo zablokowane.</p>
          <Retry onRetry={onRetry} />
        </Panel>
      );
    default:
      return (
        <Panel tone="muted">
          <p className="text-slate-300 text-sm">Coś poszło nie tak.</p>
          <Retry onRetry={onRetry} />
        </Panel>
      );
  }
}

/* ─── Bits ───────────────────────────────────────────────────────────────── */

function ColumnHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h3 className="flex items-center gap-2 text-white font-black uppercase tracking-wide text-sm mb-2">
      <span className="text-[#E7000B]">{icon}</span>
      {title}
    </h3>
  );
}

function Retry({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      onClick={onRetry}
      className="mt-2 text-xs text-slate-400 underline underline-offset-2 hover:text-slate-200"
    >
      Spróbuj ponownie
    </button>
  );
}

function Panel({
  tone,
  children,
}: {
  tone: 'accent' | 'error' | 'success' | 'muted';
  children: React.ReactNode;
}) {
  const styles = {
    accent: 'bg-[#E7000B]/10 border-[#E7000B]/30',
    error: 'bg-red-500/10 border-red-500/30',
    success: 'bg-emerald-500/10 border-emerald-500/30',
    muted: 'bg-white/5 border-white/10',
  }[tone];
  return <div className={`rounded-xl border px-4 py-3 ${styles}`}>{children}</div>;
}
