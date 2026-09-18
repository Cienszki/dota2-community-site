'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, TrendingUp, TrendingDown, Minus, Flame, Info, ExternalLink, Trophy, ChevronDown, Lock, ArrowUp } from 'lucide-react';

// Kept in sync with FORM_WINDOWS_DAYS in scripts/sync-player-stats.mjs and
// FORM_WINDOW_DAYS in ranking/page.tsx — those decide which form_<days>
// columns exist and get fetched; this decides which of them the user can
// switch between.
const FORM_DAY_OPTIONS = [1, 3, 7, 14, 30] as const;
const DEFAULT_FORM_DAYS: (typeof FORM_DAY_OPTIONS)[number] = 14;

interface PlayerData {
  id: number;
  steam_id: string;
  name: string;
  avatar: string;
  rankTier: number;
  leaderboardRank: number | null;
  winRate: string | null;
  form: Record<number, number | null>;
  hasPublicMatches: boolean;
  isOfficial: boolean;
}

interface RankingControlsProps {
  players: PlayerData[];
}

const getRankName = (tier: number, leaderRank: number | null) => {
  if (leaderRank && leaderRank > 0) return `Rank #${leaderRank}`;
  if (tier === 0) return 'Nieznana';
  if (tier >= 80) return 'Immortal';
  const badges = ['Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine', 'Immortal'];
  return `${badges[Math.floor(tier / 10) - 1] || 'Ranga'} ${tier % 10}`;
};

// ── Portal Tooltip ──

function InfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const iconRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(handle);
  }, []);

  const handleMouseEnter = () => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setPos({
        top: rect.top + window.scrollY,
        left: rect.left + rect.width / 2,
      });
    }
    setVisible(true);
  };

  return (
    <div
      ref={iconRef}
      className="inline-flex items-center cursor-help ml-1 align-middle"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setVisible(false)}
    >
      <Info className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 transition-colors" />

      {mounted && visible && createPortal(
        <span
          style={{
            position: 'absolute',
            top: pos.top,
            left: pos.left,
            transform: 'translate(-50%, calc(-100% - 10px))',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
          className="w-72 p-4 bg-slate-800 border border-slate-700 text-base text-slate-200 rounded-xl shadow-2xl transition-all duration-200"
        >
          {/* Strzałka tooltipa */}
          <span
            style={{
              position: 'absolute',
              bottom: -5,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 10,
              height: 10,
              background: '#1e293b',
              borderRight: '1px solid #334155',
              borderBottom: '1px solid #334155',
              rotate: '45deg',
            }}
          />
          {text}
        </span>,
        document.body
      )}
    </div>
  );
}

// ── Rank cell ──

const MEDAL_STYLES: Record<number, string> = {
  1: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 shadow-[0_0_10px_rgba(234,179,8,0.35)]',
  2: 'bg-slate-300/15 text-slate-300 border border-slate-300/30 shadow-[0_0_10px_rgba(203,213,225,0.25)]',
  3: 'bg-orange-700/15 text-orange-400 border border-orange-600/30 shadow-[0_0_10px_rgba(194,120,3,0.3)]',
};

function RankCell({ position }: { position: number }) {
  const medalClass = MEDAL_STYLES[position];
  if (medalClass) {
    return (
      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${medalClass}`}>
        <Trophy className="w-4 h-4" />
      </span>
    );
  }
  return (
    <span className="font-black text-base text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">
      #{position}
    </span>
  );
}

// ── Scroll to top ──

const SCROLL_TOP_BUTTON_WIDTH = 48;
const SCROLL_TOP_GAP_FROM_TABLE = 100;
// The table's own right-hand gutter (from its max-w-5xl vs. the section's
// max-w-7xl/px-6) only exceeds a full button-plus-gap width once the
// viewport is roughly 1200px+ — comfortably true at ordinary laptop/desktop
// resolutions, but not at some narrower "still desktop-table" widths. There
// the table has less than 48+16px of room beside it inside the viewport at
// all, so some overlap with its last column is geometrically unavoidable —
// this floor only keeps the button off the literal edge of the screen.
const SCROLL_TOP_MIN_MARGIN = 8;

function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);
  // CSS `right` value, in px. Measured off the actual table element rather
  // than assumed from a matching max-w wrapper — the table's own max-w-5xl
  // only leaves room beside it once the viewport is well past that width;
  // below that (a very common laptop width) a CSS-only gutter collapses to
  // zero and the button lands back on top of the table. Recomputed on
  // scroll/resize since that gutter's width depends on both.
  const [rightOffset, setRightOffset] = useState(SCROLL_TOP_MIN_MARGIN);

  useEffect(() => {
    let frame: number | null = null;

    const update = () => {
      frame = null;
      setVisible(window.scrollY > 400);

      // On mobile this node exists in the DOM but is `hidden md:block` —
      // still findable by querySelector, but getBoundingClientRect on a
      // display:none element returns an all-zero rect rather than null, so
      // presence alone isn't enough; check it's actually laid out.
      const table = document.querySelector('[data-ranking-table]');
      const rect = table?.getBoundingClientRect();
      if (rect && rect.width > 0) {
        const desired = window.innerWidth - SCROLL_TOP_BUTTON_WIDTH - SCROLL_TOP_GAP_FROM_TABLE - rect.right;
        setRightOffset(Math.max(desired, SCROLL_TOP_MIN_MARGIN));
      } else {
        // Mobile: no desktop table to sit beside — the usual floating corner.
        setRightOffset(SCROLL_TOP_MIN_MARGIN);
      }
    };

    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  if (!visible) return null;

  // Portalled straight to <body>: nested inside the ranking page's own
  // `relative z-10` section, this button's z-40 only out-ranks its siblings
  // *within* that section — it can't out-rank the footer (a separate
  // `relative z-10` sibling rendered after `{children}` in layout.tsx), so
  // near the bottom of the page the footer was silently eating its clicks
  // despite sitting visually "under" it. Escaping to `document.body` makes
  // it a true sibling of the footer, where z-40 actually wins.
  return createPortal(
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Powrót do góry"
      style={{ right: rightOffset }}
      className="fixed bottom-6 z-40 flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-red-600 to-orange-500 text-white shadow-[0_4px_20px_rgba(239,68,68,0.4)] hover:scale-110 transition-transform"
    >
      <ArrowUp className="w-5 h-5" />
    </button>,
    document.body
  );
}

export default function RankingControls({ players }: RankingControlsProps) {
  const [search, setSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [rankFilter, setRankFilter] = useState('all');
  const [formDays, setFormDays] = useState<number>(DEFAULT_FORM_DAYS);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Players with an official top-5000 leaderboard rank (whether tracked via
  // their own steam_id or as a name-only top-5000 entry) are always Immortal
  // by definition of being on Valve's own Immortal-only leaderboard — their
  // stored rankTier can be 0 (no linked Steam account), so filtering must
  // treat them as tier 8 rather than relying on rankTier alone.
  const getBaseRank = (p: PlayerData) =>
    p.isOfficial || (p.leaderboardRank !== null && p.leaderboardRank > 0) ? 8 : Math.floor(p.rankTier / 10);

  // Which badge to show. Immortal-tier players split into two icons by how
  // deep into the official numbered leaderboard they are — immortal2 for the
  // very top (rank < 500), plain immortal for the rest — rather than on
  // whether the row happens to carry live OpenDota stats (isOfficial), which
  // was just an accident of how the two ranking sources merge and had
  // nothing to do with actual rank (e.g. a #4 who hasn't linked Steam yet
  // showed immortal2, while a linked #227 showed the plain badge).
  const getRankIconSrc = (p: PlayerData) => {
    if (p.leaderboardRank !== null && p.leaderboardRank > 0) {
      return p.leaderboardRank < 500 ? '/ranks/immortal2.png' : '/ranks/immortal.png';
    }
    if (p.rankTier === 0) return '/ranks/unranked.png';
    const badges = ['herald', 'guardian', 'crusader', 'archon', 'legend', 'ancient', 'divine', 'immortal'];
    const idx = Math.floor(p.rankTier / 10) - 1;
    return `/ranks/${badges[idx] || 'unranked'}.png`;
  };

  // Global position must reflect each player's rank in the FULL leaderboard,
  // not their index within whatever subset the filters currently show —
  // filtering (e.g. down to just Ancient players) must not renumber #1..#N.
  const playersWithPosition = players.map((p, i) => ({ ...p, position: i + 1 }));

  const filteredPlayers = playersWithPosition.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesRank = rankFilter === 'all' || getBaseRank(p) === parseInt(rankFilter);
    return matchesSearch && matchesRank;
  });

  const suggestions = players
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 5);

  const handleSuggestionClick = (name: string) => {
    setSearch(name);
    setShowSuggestions(false);
  };

  return (
    <div className="space-y-6">

      <div className="flex flex-col md:flex-row gap-4 mt-6 md:max-w-5xl md:mx-auto">
        <div className="relative flex-1" ref={searchContainerRef}>
          <Search className="absolute left-4 top-4 w-5 h-5 text-slate-500" />
          <input
            type="text"
            value={search}
            placeholder="Wpisz nick gracza..."
            className="w-full bg-slate-900/40 border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-slate-200 placeholder:text-slate-500 focus:border-red-500 outline-none transition-all"
            onChange={(e) => {
              setSearch(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
          />

          {showSuggestions && search.length > 0 && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-[#0a0a0a] border border-white/10 rounded-xl overflow-hidden z-50 shadow-2xl backdrop-blur-md">
              {suggestions.map(p => (
                <div
                  key={p.id}
                  className="px-5 py-3 hover:bg-white/[0.05] cursor-pointer flex items-center gap-4 transition-colors"
                  onClick={() => handleSuggestionClick(p.name)}
                >
                  <img src={p.avatar} alt="Avatar" className="w-8 h-8 rounded-lg border border-white/10" />
                  <div>
                    <span className="block text-slate-200 font-bold">{p.name}</span>
                    <span className="block text-xs text-slate-500">{getRankName(p.rankTier, p.leaderboardRank)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="relative min-w-[200px]">
          <select
            className="w-full appearance-none bg-slate-900/40 border border-white/10 rounded-xl pl-4 pr-9 py-3.5 text-slate-200 outline-none focus:border-red-500 transition-all cursor-pointer"
            value={rankFilter}
            onChange={(e) => setRankFilter(e.target.value)}
          >
            <option value="all">Wszystkie rangi</option>
            <option value="0">Brak rangi / Nieznana</option>
            <option value="1">Herald</option>
            <option value="2">Guardian</option>
            <option value="3">Crusader</option>
            <option value="4">Archon</option>
            <option value="5">Legend</option>
            <option value="6">Ancient</option>
            <option value="7">Divine</option>
            <option value="8">Immortal</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        </div>

        <div className="flex items-center gap-2 bg-slate-900/40 border border-white/10 rounded-xl px-3 py-2">
          <span className="text-slate-400 text-sm font-medium whitespace-nowrap">Forma:</span>
          <div className="flex items-center gap-1">
            {FORM_DAY_OPTIONS.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setFormDays(days)}
                aria-pressed={formDays === days}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                  formDays === days
                    ? 'bg-red-600 text-white'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop table */}
      <div data-ranking-table className="hidden md:block max-w-5xl mx-auto bg-[linear-gradient(135deg,rgba(43,43,43,0.8)_0%,rgba(5,5,5,0.8)_100%)] border border-white/[0.08] rounded-2xl backdrop-blur-md shadow-2xl overflow-x-auto">
        <table className="w-full text-left border-collapse table-fixed text-sm">
          <thead>
            <tr className="border-b border-white/[0.08] text-slate-400 text-sm font-bold uppercase tracking-wider bg-white/5">
              <th className="py-1.5 px-3 text-right w-[10%] whitespace-nowrap">Pozycja</th>
              <th className="py-1.5 pl-6 pr-3 text-left w-[37%] whitespace-nowrap">Gracz</th>
              <th className="py-1.5 pl-6 pr-3 text-left w-[21%] whitespace-nowrap">Ranga</th>
              <th className="py-1.5 px-3 w-[14%] text-center whitespace-nowrap">
                Winrate
                <InfoTooltip text="Ostatnie 50 meczów. Widoczne tylko dla graczy, którzy połączyli swój profil Steam." />
              </th>
              <th className="py-1.5 px-3 w-[18%] text-center whitespace-nowrap">
                Forma ({formDays}d)
                <InfoTooltip text="Bilans wygranych i przegranych meczy w wybranym okresie (patrz przełącznik nad tabelą). Widoczne tylko dla graczy, którzy połączyli swój profil Steam." />
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredPlayers.length > 0 ? (
              filteredPlayers.map((player) => {
                const trend = player.form[formDays] ?? null;
                return (
                <tr
                  key={player.id}
                  className="border-b border-white/[0.08] hover:bg-white/[0.03] transition-colors"
                >
                  <td className="py-1.5 px-3 text-center">
                    <RankCell position={player.position} />
                  </td>

                  <td className="py-1.5 pl-6 pr-3 text-left min-w-0">
                    <div className="flex items-center justify-start gap-3">
                      <img
                        src={player.avatar}
                        alt=""
                        className="w-8 h-8 rounded-lg border border-white/10 object-cover shrink-0"
                      />
                      <div className="text-left min-w-0">
                        {player.isOfficial ? (
                          <span className="font-bold text-base text-slate-200 truncate block">
                            {player.name}
                          </span>
                        ) : (
                          <a
                            href={`https://www.dotabuff.com/players/${player.steam_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex items-center gap-2 min-w-0"
                          >
                            <span className="font-bold text-base text-slate-200 group-hover:text-red-400 transition-colors truncate">
                              {player.name}
                            </span>
                            <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0" />
                          </a>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="py-1.5 pl-6 pr-3 text-left">
                    <div className="flex items-center justify-start gap-3">
                      <img
                        src={getRankIconSrc(player)}
                        alt=""
                        className="w-8 h-8 object-contain shrink-0"
                      />
                      <span className="text-slate-300 font-medium text-base text-left truncate">
                        {getRankName(player.rankTier, player.leaderboardRank)}
                      </span>
                    </div>
                  </td>

                  <td className="py-1.5 px-3 text-center font-mono font-bold text-lg text-emerald-400">
                    {player.isOfficial ? (
                      <span className="text-slate-500 text-lg">—</span>
                    ) : player.winRate === null ? (
                      <span
                        className="inline-flex items-center justify-center gap-1 text-slate-500 text-xs font-normal"
                        title={player.hasPublicMatches ? undefined : 'Profil gracza jest ustawiony jako prywatny'}
                      >
                        {player.hasPublicMatches ? 'Brak danych' : (<>Profil prywatny <Lock className="w-3 h-3 shrink-0" /></>)}
                      </span>
                    ) : (
                      player.winRate
                    )}
                  </td>

                  <td className="py-1.5 px-3 text-center font-mono">
                    {player.isOfficial ? (
                      <span className="text-slate-500 text-lg">—</span>
                    ) : trend === null ? (
                      <span
                        className="inline-flex items-center justify-center gap-1 text-slate-500 text-xs font-normal"
                        title={player.hasPublicMatches ? undefined : 'Profil gracza jest ustawiony jako prywatny'}
                      >
                        {player.hasPublicMatches ? 'Brak danych' : (<>Profil prywatny <Lock className="w-3 h-3 shrink-0" /></>)}
                      </span>
                    ) : trend >= 5 ? (
                      <div className="flex items-center justify-center gap-1.5 text-orange-400 drop-shadow-[0_0_12px_rgba(251,146,60,0.8)] font-black text-lg" title="ON FIRE! Niesamowity bilans!">
                        <Flame className="w-4 h-4 fill-orange-500 animate-pulse" />
                        <span>+{trend}</span>
                      </div>
                    ) : trend > 0 ? (
                      <div className="flex items-center justify-center gap-1 text-emerald-400 font-bold text-lg" title="Więcej wygranych niż przegranych">
                        <TrendingUp className="w-4 h-4" />
                        <span>+{trend}</span>
                      </div>
                    ) : trend < 0 ? (
                      <div className="flex items-center justify-center gap-1 text-red-500 font-bold text-lg" title="Więcej przegranych niż wygranych">
                        <TrendingDown className="w-4 h-4" />
                        <span>{trend}</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1 text-slate-500 font-bold text-lg" title="Brak zmian / Równy bilans">
                        <Minus className="w-4 h-4" />
                      </div>
                    )}
                  </td>
                </tr>
              );})
            ) : (
              <tr>
                <td colSpan={5} className="py-10 text-center text-slate-400 font-medium">
                  Brak graczy spełniających kryteria wyszukiwania.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {filteredPlayers.length > 0 ? (
          filteredPlayers.map((player) => {
            const trend = player.form[formDays] ?? null;
            return (
            <div
              key={player.id}
              className="bg-[linear-gradient(135deg,rgba(43,43,43,0.8)_0%,rgba(5,5,5,0.8)_100%)] border border-white/[0.08] rounded-2xl p-3"
            >
              <div className="flex items-center gap-2.5">
                <RankCell position={player.position} />
                <img
                  src={player.avatar}
                  alt=""
                  className="w-8 h-8 rounded-lg border border-white/10 object-cover shrink-0"
                />
                <div className="min-w-0 flex-1">
                  {player.isOfficial ? (
                    <span className="font-bold text-sm text-slate-200 truncate block">
                      {player.name}
                    </span>
                  ) : (
                    <a
                      href={`https://www.dotabuff.com/players/${player.steam_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-1 min-w-0"
                    >
                      <span className="font-bold text-sm text-slate-200 group-hover:text-red-400 transition-colors truncate">
                        {player.name}
                      </span>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-red-400 transition-colors flex-shrink-0" />
                    </a>
                  )}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <img
                      src={getRankIconSrc(player)}
                      alt=""
                      className="w-4 h-4 object-contain shrink-0"
                    />
                    <span className="text-slate-400 font-medium text-xs truncate">
                      {getRankName(player.rankTier, player.leaderboardRank)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <span className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/5 border border-white/[0.08] py-1.5 font-mono font-bold text-xs text-emerald-400">
                  {player.isOfficial ? (
                    'Winrate: —'
                  ) : player.winRate === null ? (
                    <span className="inline-flex items-center gap-1 font-normal text-slate-500" title={player.hasPublicMatches ? undefined : 'Profil gracza jest ustawiony jako prywatny'}>
                      {player.hasPublicMatches ? 'Brak danych meczowych' : (<>Profil prywatny <Lock className="w-3 h-3 shrink-0" /></>)}
                    </span>
                  ) : (
                    `Winrate: ${player.winRate}`
                  )}
                </span>
                <span className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/5 border border-white/[0.08] py-1.5 font-mono text-xs">
                  {player.isOfficial ? (
                    <span className="text-slate-500">Forma: —</span>
                  ) : trend === null ? (
                    <span className="inline-flex items-center gap-1 text-slate-500" title={player.hasPublicMatches ? undefined : 'Profil gracza jest ustawiony jako prywatny'}>
                      {player.hasPublicMatches ? 'Brak danych' : (<>Profil prywatny <Lock className="w-3 h-3 shrink-0" /></>)}
                    </span>
                  ) : trend >= 5 ? (
                    <span className="flex items-center gap-1 text-orange-400 font-black" title="ON FIRE! Niesamowity bilans!">
                      <Flame className="w-3.5 h-3.5 fill-orange-500" />+{trend}
                    </span>
                  ) : trend > 0 ? (
                    <span className="flex items-center gap-1 text-emerald-400 font-bold" title="Więcej wygranych niż przegranych">
                      <TrendingUp className="w-3.5 h-3.5" />+{trend}
                    </span>
                  ) : trend < 0 ? (
                    <span className="flex items-center gap-1 text-red-500 font-bold" title="Więcej przegranych niż wygranych">
                      <TrendingDown className="w-3.5 h-3.5" />{trend}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-500 font-bold" title="Brak zmian / Równy bilans">
                      <Minus className="w-3.5 h-3.5" />
                    </span>
                  )}
                </span>
              </div>
            </div>
          );})
        ) : (
          <div className="bg-[linear-gradient(135deg,rgba(43,43,43,0.8)_0%,rgba(5,5,5,0.8)_100%)] border border-white/[0.08] rounded-2xl py-10 text-center text-slate-400 font-medium text-sm">
            Brak graczy spełniających kryteria wyszukiwania.
          </div>
        )}
      </div>

      <ScrollToTopButton />

    </div>
  );
}
