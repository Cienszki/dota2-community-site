'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, TrendingUp, TrendingDown, Minus, Flame, Info, ExternalLink } from 'lucide-react';

interface PlayerData {
  id: number;
  steam_id: string;
  name: string;
  avatar: string;
  rankTier: number;
  leaderboardRank: number | null;
  winRate: string;
  mmr: number;
  trend: number;
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

function RankCell({ position }: { position: number }) {
  if (position === 1) {
    return <span className="text-2xl drop-shadow-[0_0_8px_rgba(255,215,0,0.8)]">🥇</span>;
  }
  if (position === 2) {
    return <span className="text-2xl drop-shadow-[0_0_8px_rgba(192,192,192,0.8)]">🥈</span>;
  }
  if (position === 3) {
    return <span className="text-2xl drop-shadow-[0_0_8px_rgba(205,127,50,0.8)]">🥉</span>;
  }
  return (
    <span className="font-black text-base text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">
      #{position}
    </span>
  );
}

export default function RankingControls({ players }: RankingControlsProps) {
  const [search, setSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [rankFilter, setRankFilter] = useState('all');

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

  const filteredPlayers = players.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const baseRank = Math.floor(p.rankTier / 10);
    const matchesRank = rankFilter === 'all' || baseRank === parseInt(rankFilter);
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

      <div className="flex flex-col md:flex-row gap-4 mt-6">
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

        <select
          className="bg-slate-900/40 border border-white/10 rounded-xl px-4 py-3.5 text-slate-200 outline-none focus:border-red-500 transition-all cursor-pointer min-w-[200px]"
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
      </div>

      <div className="bg-slate-900/20 border border-white/5 rounded-3xl backdrop-blur-md shadow-2xl overflow-x-auto">
        <table className="w-full text-left border-collapse table-fixed text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-white/5 text-slate-400 text-xs sm:text-sm font-bold uppercase tracking-wider bg-white/5">
              <th className="py-1.5 px-1 sm:px-3 text-right w-[10%] whitespace-nowrap">Pozycja</th>
              <th className="py-1.5 pl-2 pr-1 sm:pl-6 sm:pr-3 text-left w-[30%] whitespace-nowrap">Gracz</th>
              <th className="py-1.5 pl-2 pr-1 sm:pl-6 sm:pr-3 text-left w-[25%] whitespace-nowrap">Ranga</th>
              <th className="py-1.5 px-1 sm:px-3 w-[15%] text-center whitespace-nowrap hidden md:table-cell">
                Winrate
                <InfoTooltip text="Ostatnie 100 Meczów" />
              </th>
              <th className="py-1.5 px-1 sm:px-3 w-[20%] text-center whitespace-nowrap hidden md:table-cell">
                Forma
                <InfoTooltip text="Ostatnie 7 dni" />
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredPlayers.length > 0 ? (
              filteredPlayers.map((player, index) => (
                <tr
                  key={player.id}
                  className="border-b border-white/5 hover:bg-white/[0.03] transition-colors"
                >
                  <td className="py-1.5 px-1 sm:px-3 text-center">
                    <RankCell position={index + 1} />
                  </td>
                  
                  <td className="py-1.5 pl-2 pr-1 sm:pl-6 sm:pr-3 text-left min-w-0">
                    <div className="flex items-center justify-start gap-1.5 sm:gap-3">
                      <img
                        src={player.avatar}
                        alt=""
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg border border-white/10 object-cover shrink-0"
                      />
                      <div className="text-left min-w-0 max-w-[100px] xs:max-w-[130px] sm:max-w-none">
                        {player.isOfficial ? (
                          <span className="font-bold text-xs sm:text-base text-slate-200 truncate block">
                            {player.name}
                          </span>
                        ) : (
                          <a
                            href={`https://www.dotabuff.com/players/${player.steam_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex items-center gap-1 sm:gap-2 min-w-0"
                          >
                            <span className="font-bold text-xs sm:text-base text-slate-200 group-hover:text-red-400 transition-colors truncate">
                              {player.name}
                            </span>
                            <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4 text-slate-500 group-hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0" />
                          </a>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="py-1.5 pl-2 pr-1 sm:pl-6 sm:pr-3 text-left">
                    <div className="flex items-center justify-start gap-1.5 sm:gap-3">
                      <img
                        src={player.isOfficial ? '/ranks/immortal2.png' : `/ranks/${(() => {
                          if (player.rankTier === 0) return 'unranked';
                          const badges = ['herald','guardian','crusader','archon','legend','ancient','divine','immortal'];
                          const idx = Math.floor(player.rankTier / 10) - 1;
                          return badges[idx] || 'unranked';
                        })()}.png`}
                        alt=""
                        className="w-7 h-7 sm:w-8 sm:h-8 object-contain shrink-0"
                      />
                      <span className="text-slate-300 font-medium text-xs sm:text-base text-left truncate">
                        {getRankName(player.rankTier, player.leaderboardRank)}
                      </span>
                    </div>
                  </td>

                  <td className="py-1.5 px-1 sm:px-3 text-center font-mono font-bold text-xs sm:text-lg text-emerald-400 hidden md:table-cell">
                    {player.isOfficial ? (
                      <span className="text-slate-500 text-xs sm:text-lg">—</span>
                    ) : (
                      player.winRate
                    )}
                  </td>

                  <td className="py-1.5 px-1 sm:px-3 text-center font-mono hidden md:table-cell">
                    {player.isOfficial ? (
                      <span className="text-slate-500 text-lg">—</span>
                    ) : player.trend >= 5 ? (
                      <div className="flex items-center justify-center gap-1.5 text-orange-400 drop-shadow-[0_0_12px_rgba(251,146,60,0.8)] font-black text-sm" title="ON FIRE! Niesamowity winstreak!">
                        <Flame className="w-4 h-4 fill-orange-500 animate-pulse" />
                        <span>+{player.trend}</span>
                      </div>
                    ) : player.trend > 0 ? (
                      <div className="flex items-center justify-center gap-1 text-emerald-400 font-bold text-lg" title="Więcej wygranych niż przegranych">
                        <TrendingUp className="w-4 h-4" />
                        <span>+{player.trend}</span>
                      </div>
                    ) : player.trend < 0 ? (
                      <div className="flex items-center justify-center gap-1 text-red-500 font-bold text-lg" title="Więcej przegranych niż wygranych">
                        <TrendingDown className="w-4 h-4" />
                        <span>{player.trend}</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1 text-slate-500 font-bold text-lg" title="Brak zmian / Równy bilans">
                        <Minus className="w-4 h-4" />
                      </div>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <>
                  <td colSpan={5} className="py-10 text-center text-slate-400 font-medium hidden md:table-cell">
                    Brak graczy spełniających kryteria wyszukiwania.
                  </td>
                  <td colSpan={3} className="py-10 text-center text-slate-400 font-medium md:hidden">
                    Brak graczy spełniających kryteria wyszukiwania.
                  </td>
                </>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}