import type { Metadata } from 'next';
import Navbar from '@/components/Navbar';
import ClientLightPillar from '@/components/ClientLightPillar';
import BorderGlow from '@/components/ui/BorderGlow';
import { supabase } from '@/lib/supabase';
import { ExternalLink, Play } from 'lucide-react';
import { getLiveChannels } from '@/lib/twitch';

export const metadata: Metadata = {
  title: 'Streamy Dota 2 Na Żywo',
  description: 'Lista zaprzyjaźnionych streamerów Dota 2 oraz transmisje live z turniejów i meczów inhouse.',
};

interface Streamer {
  id: string;
  nick: string;
  motto: string;
  stream_url: string;
}

function getTwitchChannel(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('twitch.tv')) {
      return u.pathname.replace(/^\//, '').split('/')[0];
    }
  } catch {
    // ignore
  }
  return null;
}

export default async function StreamyPage() {
  const { data: streamers, error } = await supabase
    .from('streamers')
    .select('*')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch streamers:', error.message);
  }

  const allStreamers = (streamers ?? []) as Streamer[];

  const twitchLogins = Array.from(
    new Set(
      allStreamers
        .map((s) => getTwitchChannel(s.stream_url))
        .filter((c): c is string => c !== null)
        .map((c) => c.toLowerCase())
    )
  );
  const liveChannels = await getLiveChannels(twitchLogins);

  return (
    <main className="relative bg-[#050505] text-slate-100 overflow-x-hidden">
      <div className="absolute inset-0 z-0 pointer-events-none opacity-50">
        <ClientLightPillar
          topColor="#8b5cf6"
          bottomColor="#ef4444"
          intensity={0.5}
          rotationSpeed={0.15}
          glowAmount={0.003}
          pillarWidth={3}
          pillarHeight={0.2}
          noiseIntensity={0.6}
          pillarRotation={90}
          interactive={false}
          mixBlendMode="screen"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#050505]/50 to-[#050505]" />
      </div>

      <Navbar />

      <section className="relative z-10 max-w-7xl mx-auto px-6 pb-20">
        <div className="text-center mb-12 pt-[30px]">
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-4 drop-shadow-lg">
            Streamy
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Oglądaj i wspieraj naszych zaprzyjaźnionych streamerów!
          </p>
        </div>

        {allStreamers.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-slate-500 text-lg">Brak streamerów w bazie. Wróć później.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {allStreamers.map((streamer) => {
              const twitchChannel = getTwitchChannel(streamer.stream_url);
              const isLive = twitchChannel ? liveChannels.has(twitchChannel.toLowerCase()) : false;

              return (
                <BorderGlow
                  key={streamer.id}
                  className="w-full h-full"
                  colors={["#ef4444", "#f59e0b", "#8b5cf6"]}
                  backgroundColor="#17181c"
                  borderRadius={16}
                  edgeSensitivity={30}
                  glowRadius={40}
                  glowIntensity={1.2}
                >
                  <div className="p-5 flex flex-col h-full">
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <a
                          href={streamer.stream_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xl font-bold text-white hover:text-purple-400 transition-colors group/nick min-w-0"
                        >
                          <span className="truncate">{streamer.nick}</span>
                          <ExternalLink className="w-4 h-4 text-slate-500 opacity-50 group-hover/nick:opacity-100 transition-all shrink-0" />
                        </a>
                        {isLive && (
                          <span className="flex items-center gap-1.5 shrink-0 bg-red-600/15 border border-red-500/40 text-red-400 text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                            </span>
                            Na żywo
                          </span>
                        )}
                      </div>
                      {streamer.motto && (
                        <p className="text-sm text-slate-400 leading-relaxed mb-4 line-clamp-3">
                          {streamer.motto.length > 250
                            ? streamer.motto.slice(0, 250) + '…'
                            : streamer.motto}
                        </p>
                      )}
                    </div>

                    {twitchChannel && isLive ? (
                      <div
                        className="relative w-full rounded-xl overflow-hidden bg-slate-800 mt-3"
                        style={{ aspectRatio: '16 / 9' }}
                      >
                        <iframe
                          src={`https://player.twitch.tv/?channel=${twitchChannel}&parent=localhost&parent=dota2inhouse.pl&parent=www.dota2inhouse.pl&muted=true`}
                          allowFullScreen
                          className="absolute inset-0 w-full h-full"
                          title={`${streamer.nick} — Twitch`}
                          sandbox="allow-scripts allow-same-origin allow-presentation"
                        />
                      </div>
                    ) : twitchChannel && !isLive ? (
                      <div
                        className="relative w-full rounded-xl overflow-hidden bg-slate-800 mt-3"
                        style={{ aspectRatio: '16 / 9' }}
                      >
                        <img
                          src="/images/offline-placeholder.png"
                          alt={`${streamer.nick} jest offline`}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <a
                        href={streamer.stream_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block w-full rounded-xl overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900 border border-white/5 mt-3 relative"
                        style={{ aspectRatio: '16 / 9' }}
                      >
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                          <div className="w-14 h-14 rounded-full bg-red-600/80 flex items-center justify-center group-hover:bg-red-500 transition-colors">
                            <Play className="w-6 h-6 text-white ml-0.5" />
                          </div>
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            Otwórz stream <ExternalLink className="w-3 h-3" />
                          </span>
                        </div>
                      </a>
                    )}
                  </div>
                </BorderGlow>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
