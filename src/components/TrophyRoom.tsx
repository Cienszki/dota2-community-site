'use client';

import { motion } from 'framer-motion';
import { User, ExternalLink, Trophy } from 'lucide-react';
import LaserFlow from '@/components/ui/LaserFlow';
import BorderGlow from '@/components/ui/BorderGlow';

export interface PlayerInfo {
  friendId?: number;
  name: string;
  personaname: string | null;
  avatarfull: string | null;
  isSubstitute?: boolean;
}

export interface TournamentData {
  name: string;
  date: string;
  teamName: string;
  dotabuffLink: string;
  tournamentId: string;
  players: PlayerInfo[];
  imageUrl?: string | null;
  teamLogoUrl?: string | null;
}

interface TrophyRoomProps {
  tournaments: TournamentData[];
}

function PlayerAvatar({ player, compact }: { player: PlayerInfo; compact?: boolean }) {
  const displayName = player.personaname ?? player.name;
  const hasFriendId = player.friendId != null;
  const size = compact ? 'w-16 h-16 md:w-20 md:h-20' : 'w-20 h-20 md:w-24 md:h-24';

  const img = player.avatarfull ? (
    <img src={player.avatarfull} alt={displayName} className="w-full h-full object-cover" />
  ) : (
    <div className="w-full h-full bg-slate-700 flex items-center justify-center">
      <User className="w-8 h-8 text-slate-400" />
    </div>
  );

  const avatar = (
    <div className={`${size} rounded-full overflow-hidden border-2 border-slate-600/50 shrink-0 ${hasFriendId ? 'group-hover:border-amber-400' : ''} transition-all duration-300 relative`}>
      {img}
      {player.isSubstitute && (
        <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 bg-amber-600/90 text-[10px] font-bold text-white px-2 py-0.5 rounded-full whitespace-nowrap leading-none">
          R
        </span>
      )}
    </div>
  );

  const label = (
    <span className={`font-semibold truncate text-center leading-tight ${compact ? 'max-w-[70px] text-sm' : 'max-w-[120px]'} ${player.isSubstitute ? 'text-slate-400' : 'text-slate-200'}`}>
      {displayName}
    </span>
  );

  if (hasFriendId) {
    return (
      <a
        href={`https://www.dotabuff.com/players/${player.friendId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex flex-col items-center gap-1.5"
      >
        {avatar}
        {label}
      </a>
    );
  }

  return <div className="flex flex-col items-center gap-1.5">{avatar}{label}</div>;
}

function extractYear(dateStr: string): string {
  const m = dateStr.match(/\d{4}/);
  return m ? m[0] : dateStr;
}

// ── Just the tournament name + date (no image) ──

function TournamentHeader({
  name,
  date,
  url,
  alignRight,
}: {
  name: string;
  date: string;
  url: string | null;
  alignRight: boolean;
}) {
  const linkClass =
    'inline-flex items-center gap-2 text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-orange-500 hover:brightness-110 transition-all duration-300';

  const inner = url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {name}
      <ExternalLink className="w-5 h-5 text-amber-400/80 inline shrink-0" />
    </a>
  ) : (
    <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-orange-500">
      {name}
    </span>
  );

  return (
    <div className={`h-full flex flex-col justify-end ${alignRight ? 'items-end' : 'items-start'}`}>
      <div className={alignRight ? 'text-right' : 'text-left'}>
        <h2 className="text-3xl md:text-4xl font-extrabold drop-shadow-lg leading-tight">
          {inner}
        </h2>
        <p className="text-base text-slate-400 mt-1 mb-4">{date}</p>
      </div>
    </div>
  );
}

// ── Just the team name + logo (or trophy icon fallback) — no box ──

function TeamHeader({
  teamName,
  teamLogoUrl,
  alignRight,
}: {
  teamName: string;
  teamLogoUrl?: string | null;
  alignRight: boolean;
}) {
  return (
    <div className={`h-full flex flex-col justify-end ${alignRight ? 'items-end' : 'items-start'}`}>
      <div className={alignRight ? 'text-right' : 'text-left'}>
        <h3 className="text-3xl md:text-4xl font-extrabold text-slate-200 flex items-center gap-2 leading-tight">
          {teamLogoUrl ? (
            <img src={teamLogoUrl} alt="" className="w-8 h-8 md:w-9 md:h-9 object-contain shrink-0" />
          ) : (
            <Trophy className="w-6 h-6 text-amber-400 shrink-0" />
          )}
          {teamName}
        </h3>
        {/* invisible spacer mirroring the date line so both headers share
            the same shape and the name text itself lands on the same
            baseline, not just the header block as a whole */}
        <p className="text-base mt-1 mb-4 invisible">&nbsp;</p>
      </div>
    </div>
  );
}

// ── Just the tournament image (no heading) ──

function TournamentImage({
  imageUrl,
  name,
}: {
  imageUrl?: string | null;
  name: string;
}) {
  return (
    <div className="relative w-full max-w-[600px] h-[200px] mx-auto">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={name}
          className="absolute inset-0 w-full h-full object-cover rounded-xl border border-white/10 shadow-lg"
        />
      ) : (
        <div className="absolute inset-0 w-full h-full rounded-xl border border-white/5 shadow-lg bg-gradient-to-br from-slate-800 to-slate-900" />
      )}
    </div>
  );
}

// ── Team box ──

function TeamBox({ players, fullWidth }: { players: PlayerInfo[]; fullWidth?: boolean }) {
  const mainPlayers = players.filter((p) => !p.isSubstitute);

  return (
    <BorderGlow
      className={fullWidth ? 'w-full h-[200px]' : 'w-full max-w-[600px] h-[200px] mx-auto'}
      colors={["#ff0000", "#fff700", "#ff0000"]}
      backgroundColor="#050505"
      background="linear-gradient(135deg, rgba(43,43,43,0.8) 0%, rgba(5,5,5,0.8) 100%)"
      borderRadius={16}
      glowRadius={6}
      coneSpread={8}
      glowIntensity={0.35}
      fillOpacity={0.2}
    >
      <div className="p-6 h-full flex items-center justify-center overflow-y-auto">
        <div className="flex flex-wrap gap-4 md:gap-6 justify-center items-start">
          {mainPlayers.map((player, i) => (
            <PlayerAvatar key={player.friendId ?? `player-${i}`} player={player} compact />
          ))}
        </div>
      </div>
    </BorderGlow>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function TrophyRoom({ tournaments }: TrophyRoomProps) {
  return (
    <div className="relative z-10 max-w-7xl mx-auto px-6 py-12">

      {/* ── Laser timeline spine (hidden on mobile) ── */}
      <div
        className="absolute top-0 bottom-0 left-8 w-16 md:left-[calc(50%-2rem)] pointer-events-none z-10 hidden md:block"
        aria-hidden="true"
      >
        <LaserFlow
          color="#ef4444"
          wispDensity={2.7}
          wispIntensity={2.7}
          flowStrength={0.4}
          fogIntensity={1.00}
        />
      </div>

      {tournaments.map((tournament, index) => {
        const year = extractYear(tournament.date);
        const isEven = index % 2 === 0;
        const tournamentUrl =
          tournament.dotabuffLink ||
          (tournament.tournamentId
            ? `https://www.dotabuff.com/esports/tournaments/${tournament.tournamentId}`
            : null);

        return (
          <motion.div
            key={tournament.name}
            className="relative mb-12 md:mb-16 last:mb-0"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, delay: index * 0.1 }}
          >
            {/* ── Year node ── */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 z-30">
              <div className="w-14 h-14 md:w-20 md:h-20 rounded-full border-2 border-amber-500 bg-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/20">
                <span className="text-amber-400 font-bold text-lg md:text-xl">{year}</span>
              </div>
            </div>

            {/* ── Horizontal connector lines (hidden on mobile) ── */}
            {isEven ? (
              <div
                aria-hidden="true"
                className="hidden md:block absolute z-20 h-[3px]"
                style={{
                  top: 40,
                  right: 'calc(50% + 40px)',
                  left: 0,
                  background: 'linear-gradient(to left, rgba(239,68,68,0.9) 0%, rgba(239,68,68,0.3) 60%, transparent 100%)',
                }}
              />
            ) : (
              <div
                aria-hidden="true"
                className="hidden md:block absolute z-20 h-[3px]"
                style={{
                  top: 40,
                  left: 'calc(50% + 40px)',
                  right: 0,
                  background: 'linear-gradient(to right, rgba(239,68,68,0.9) 0%, rgba(239,68,68,0.3) 60%, transparent 100%)',
                }}
              />
            )}

            {/* ── Mobile: centered stack (title+date → team name → team box, no image) ── */}
            <div className="flex flex-col items-center text-center gap-3 md:hidden pt-20">
              <div>
                <h2 className="text-2xl font-extrabold drop-shadow-lg leading-tight">
                  {tournamentUrl ? (
                    <a
                      href={tournamentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-orange-500 hover:brightness-110 transition-all duration-300"
                    >
                      {tournament.name}
                      <ExternalLink className="w-4 h-4 text-amber-400/80 inline shrink-0" />
                    </a>
                  ) : (
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-orange-500">
                      {tournament.name}
                    </span>
                  )}
                </h2>
                <p className="text-slate-500 text-sm mt-1">{tournament.date}</p>
              </div>
              <h3 className="text-2xl font-extrabold text-slate-200 flex items-center gap-2">
                {tournament.teamLogoUrl ? (
                  <img src={tournament.teamLogoUrl} alt="" className="w-7 h-7 object-contain shrink-0" />
                ) : (
                  <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
                )}
                {tournament.teamName}
              </h3>
              <TeamBox players={tournament.players} fullWidth />
            </div>

            {/* ── Desktop: single grid so header row + content row each align across
                 both columns, regardless of which header/content is taller ── */}
            <div className="hidden md:grid md:grid-cols-2 gap-x-6 md:gap-x-8 gap-y-0 pt-20">
              {isEven ? (
                <>
                  <div className="md:pr-10"><TeamHeader teamName={tournament.teamName} teamLogoUrl={tournament.teamLogoUrl} alignRight /></div>
                  <div className="md:pl-10"><TournamentHeader name={tournament.name} date={tournament.date} url={tournamentUrl} alignRight={false} /></div>
                  <div className="md:pr-10"><TeamBox players={tournament.players} /></div>
                  <div className="md:pl-10"><TournamentImage imageUrl={tournament.imageUrl} name={tournament.name} /></div>
                </>
              ) : (
                <>
                  <div className="md:pr-10"><TournamentHeader name={tournament.name} date={tournament.date} url={tournamentUrl} alignRight /></div>
                  <div className="md:pl-10"><TeamHeader teamName={tournament.teamName} teamLogoUrl={tournament.teamLogoUrl} alignRight={false} /></div>
                  <div className="md:pr-10"><TournamentImage imageUrl={tournament.imageUrl} name={tournament.name} /></div>
                  <div className="md:pl-10"><TeamBox players={tournament.players} /></div>
                </>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
