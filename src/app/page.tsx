'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import ClientLightPillar from '@/components/ClientLightPillar';
import Navbar from '@/components/Navbar';
import SplitText from '@/components/SplitText';
import WardClicker from '@/components/WardClicker';
import BorderGlow from '@/components/ui/BorderGlow';
import { supabase } from '@/lib/supabase';

const MOCK_TOURNAMENTS = [
  { name: 'Wiosenna Furia', tag: 'Zapisy otwarte', desc: 'Sezonowy puchar dla wszystkich poziomów MMR — graj o nagrody i chwałę.', href: 'https://dota2inhouse.pl/wiosenna', image: null },
  { name: 'PDL #1', tag: 'Liga drużynowa', desc: 'Pierwsza edycja Polskiej Ligi Dota 2 — regularne rozgrywki drużynowe.', href: 'https://dota2inhouse.pl/pdl', image: null },
];

const MOCK_TESTIMONIALS = [
  { id: 1, name: "Kamil", handle: "@kamil_dota", rating: 5, headline: "Najlepsze inhouse'y w Polsce", text: "Świetna organizacja turniejów i super poziom. Polecam każdemu kto chce się rozwijać!", avatar_url: null },
  { id: 2, name: "Zadymka", handle: "@zadymka", rating: 5, headline: "Świetna społeczność", text: "Znalazłem tu stałą ekipę do gry. Zero toksyczności, pełen profesjonalizm i super zabawa.", avatar_url: null },
  { id: 3, name: "Ciptok", handle: "@ciptok3", rating: 5, headline: "Liga PDL wymiata", text: "Rozgrywki w lidze to czysta przyjemność. Admini zawsze pomocni i bardzo szybko reagują na problemy.", avatar_url: null },
  { id: 4, name: "Pocieszny", handle: "@pocieszny", rating: 5, headline: "Super atmosfera", text: "Nigdy nie widziałem tak dobrze zorganizowanego discorda do Doty w Polsce. Mega szacun dla ekipy.", avatar_url: null },
  { id: 5, name: "Damianexis", handle: "@damian", rating: 5, headline: "Czegoś takiego szukałem", text: "Codziennie mnóstwo ludzi do grania. Od kiedy dołączyłem, w ogóle nie gram już solo matchmakingu.", avatar_url: null },
];

export default function Home() {
  const [testimonials, setTestimonials] = useState(MOCK_TESTIMONIALS);
  const [tournaments, setTournaments] = useState(MOCK_TOURNAMENTS);

  useEffect(() => {
    async function fetchTestimonials() {
      const { data } = await supabase.from('testimonials').select('*').order('created_at', { ascending: true });
      if (data && data.length > 0) {
        setTestimonials(data);
      }
    }
    fetchTestimonials();
  }, []);

  useEffect(() => {
    async function fetchTournaments() {
      const { data } = await supabase
        .from('tournaments')
        .select('*')
        .eq('is_visible', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (data && data.length > 0) {
        setTournaments(
          data.map((row) => ({
            name: row.name,
            tag: row.tag,
            desc: row.description,
            href: row.href,
            image: row.image_url,
          }))
        );
      }
    }
    fetchTournaments();
  }, []);
  const [discordCount, setDiscordCount] = useState(2400);
  const [partnerLink, setPartnerLink] = useState('https://dreammachines.pl/pl/?utm_content=dota2');

  useEffect(() => {
    async function fetchAll() {
      try {
        const res = await fetch(
          'https://discord.com/api/guilds/947158056381337630/widget.json'
        );
        if (res.ok) {
          const data = await res.json();
          setDiscordCount(Math.floor(data.presence_count / 100) * 100);
        }
      } catch {
        // fallback
      }

      try {
        const { data, error } = await supabase
          .from('news')
          .select('*')
          .eq('category', 'SystemSettings')
          .eq('title', 'global_settings')
          .maybeSingle();
        if (!error && data && data.content) {
          const val = JSON.parse(data.content);
          if (val.partner_link) setPartnerLink(val.partner_link);
        }
      } catch {
        // fallback
      }
    }
    fetchAll();
  }, []);

  return (
    <main className="relative bg-[#050505] text-slate-100 overflow-x-clip">
      
      {/* ─── TECH GRID OVERLAY ─── */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />

      {/* ─── RED RADIAL GLOW ─── */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-red-600/15 rounded-full blur-[120px] pointer-events-none" />

      {/* ─── LIGHT PILLAR BACKGROUND ─── */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-60">
        <ClientLightPillar
          topColor="#ff0000"
          bottomColor="#ff5500"
          intensity={0.7}
          rotationSpeed={0.2}
          glowAmount={0.002}
          pillarWidth={2.5}
          pillarHeight={0.3}
          noiseIntensity={0.5}
          pillarRotation={90}
          interactive={false}
          mixBlendMode="screen"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#050505]/50 to-[#050505]" />
      </div>

      <Navbar />

      <div className="relative">
        <img
          src="/images/ET.webp"
          alt="Elder Titan"
          width={300}
          height={600}
          loading="lazy"
          className="hidden lg:block absolute top-0 bottom-0 h-full w-auto max-w-[22%] object-contain object-bottom opacity-50 pointer-events-none select-none z-0"
          style={{ left: 'calc(4% + 300px)' }}
        />
        <img
          src="/images/Zeus.webp"
          alt="Zeus"
          width={300}
          height={600}
          loading="lazy"
          className="hidden lg:block absolute top-0 bottom-0 h-full w-auto max-w-[22%] object-contain object-bottom opacity-50 pointer-events-none select-none z-0"
          style={{ right: 'calc(4% + 300px)' }}
        />

        {/* ─── HERO SECTION ─── */}
        <section className="relative z-10 max-w-7xl mx-auto px-6 pt-[60px] pb-12 flex flex-col items-center text-center">
          {/* Animated headings wrapper — only SplitText headings, NOT the LCP paragraph */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-4xl relative z-10"
          >
            <div className="flex flex-col items-center justify-center space-y-1">
              <div className="flex flex-wrap items-center justify-center gap-x-3">
                <SplitText
                  text="POLISH"
                  tag="h1"
                  className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter uppercase"
                  delay={40}
                  duration={0.6}
                  ease="power4.out"
                  splitType="chars"
                />
                <SplitText
                  text="DOTA2"
                  tag="h1"
                  className="text-3xl sm:text-4xl md:text-5xl font-black text-red-600 tracking-tighter uppercase"
                  delay={60}
                  duration={0.6}
                  ease="power4.out"
                  splitType="chars"
                />
                <img
                  src="/images/dota2.png"
                  alt="Dota 2 logo"
                  width={40}
                  height={40}
                  fetchPriority="high"
                  className="inline-block w-6 sm:w-8 md:w-10 h-6 sm:h-8 md:h-10 object-contain align-middle"
                />
              </div>
              <SplitText
                text="INHOUSE"
                tag="h1"
                className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter uppercase"
                delay={70}
                duration={0.6}
                ease="power4.out"
                splitType="chars"
              />
            </div>
          </motion.div>

          <p className="text-slate-400 text-xs md:text-sm font-semibold tracking-[0.2em] uppercase mt-3">
            Polska Społeczność Dota 2
          </p>

          {/* LCP paragraph — fully visible from server render, no opacity-0 delay */}
          <p className="text-slate-300 text-lg md:text-lg max-w-3xl mx-auto leading-relaxed drop-shadow-md mb-12 mt-8">
            Zorganizowana społeczność dla polskich graczy Dota 2. Regularne turnieje, liga drużynowa lub poprostu miejsce gdzie znajdziesz kompanów do gry. Dołącz do nas na Discordzie!
          </p>

          {/* ─── CALL-TO-ACTION BUTTONS ─── */}
          <div className="flex flex-wrap justify-center gap-6 mt-6">
            <div className="glow-container">
              <a href="https://discord.com/invite/ZxgmF7Kr4t" target="_blank" rel="noopener noreferrer" className="btn-hero h-12 flex items-center px-8 gap-3 text-xl">
                <span>DOŁĄCZ DO NAS <img src="/images/discord_logo.png" alt="Discord" className="w-7 h-7 object-contain shrink-0" /></span>
              </a>
            </div>
          </div>
        </section>

        {/* ─── SKEWED STATS BAR (12°) ─── */}
        <div className="relative mt-6 z-10 max-w-[1088px] mx-auto px-16 md:px-6">
          <div className="bg-[#111]/60 border skew-x-0 md:-skew-x-[12deg] shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-white/10 stats-glow h-auto md:h-22">

            {/* Stat 1: Discord */}
            <div className="hover:bg-white/[0.02] transition-colors flex">
              <div className="flex-1 py-3 md:py-2 px-4 flex flex-row items-center justify-center gap-3 skew-x-0 md:skew-x-[12deg] text-left">
                <img src="/images/statsbar_1.png" alt="Społeczność Discord" width={44} height={44} className="h-11 w-11 object-contain flex-shrink-0" />
                <div className="flex flex-col justify-center">
                  <div className="text-lg font-black text-white leading-none whitespace-nowrap">{discordCount}+</div>
                  <div className="text-[11px] font-bold tracking-wider text-slate-400 mt-1 uppercase whitespace-nowrap">
                    <div>Użytkowników</div>
                    <div>społeczności</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Stat 2: Tournaments */}
            <div className="hover:bg-white/[0.02] transition-colors flex">
              <div className="flex-1 py-3 md:py-2 px-4 flex flex-row items-center justify-center gap-3 skew-x-0 md:skew-x-[12deg] text-left">
                <img src="/images/statsbar_2.png" alt="Turnieje" width={44} height={44} className="h-11 w-11 object-contain flex-shrink-0" />
                <div className="flex flex-col justify-center">
                  <div className="text-lg font-black text-white uppercase tracking-tight leading-none whitespace-nowrap">Regularne</div>
                  <div className="text-[11px] font-bold tracking-wider text-slate-400 mt-1 uppercase whitespace-nowrap">Turnieje dla <br /> każdego</div>
                </div>
              </div>
            </div>

            {/* Stat 3: PDL */}
            <div className="hover:bg-white/[0.02] transition-colors flex">
              <div className="flex-1 py-3 md:py-2 px-4 flex flex-row items-center justify-center gap-3 skew-x-0 md:skew-x-[12deg] text-left">
                <img src="/images/statsbar_3.png" alt="PDL" className="h-11 w-11 object-contain flex-shrink-0" />
                <div className="flex flex-col justify-center">
                  <div className="text-lg font-black text-white leading-none whitespace-nowrap">PDL</div>
                  <div className="text-[11px] font-bold tracking-wider text-slate-400 mt-1 uppercase whitespace-nowrap">Polska Liga Dota 2</div>
                </div>
              </div>
            </div>

            {/* Stat 4: LANs & offline events */}
            <div className="hover:bg-white/[0.02] transition-colors flex">
              <div className="flex-1 py-3 md:py-2 px-4 flex flex-row items-center justify-center gap-3 skew-x-0 md:skew-x-[12deg] text-left">
                <img src="/images/statsbar_4.png" alt="LANy i wydarzenia offline" width={44} height={44} className="h-11 w-11 object-contain flex-shrink-0" />
                <div className="flex flex-col justify-center">
                  <div className="text-lg font-black text-white uppercase tracking-tight leading-none whitespace-nowrap">LANy</div>
                  <div className="text-[11px] font-bold tracking-wider text-slate-400 mt-1 uppercase whitespace-nowrap">oraz wydarzenia <br /> offline</div>
                </div>
              </div>
            </div>

            {/* Stat 5: Community */}
            <div className="hover:bg-white/[0.02] transition-colors flex">
              <div className="flex-1 py-3 md:py-2 px-4 flex flex-row items-center justify-center gap-3 skew-x-0 md:skew-x-[12deg] text-left">
                <img src="/images/statsbar_5.png" alt="Przyjazna społeczność" className="h-11 w-11 object-contain flex-shrink-0" />
                <div className="flex flex-col justify-center">
                  <div className="text-lg font-black text-white uppercase tracking-tight leading-none whitespace-nowrap">Przyjazna</div>
                  <div className="text-[11px] font-bold tracking-wider text-slate-400 mt-1 uppercase whitespace-nowrap">Społeczność</div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ─── CO JEST GRANE? (TOURNAMENTS) ─── */}
      <section id="turnieje" className="relative z-10 max-w-7xl mx-auto px-6 mt-10">
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-black uppercase text-white">Co jest grane?</h2>
          <p className="text-slate-400 text-sm mt-2">Dołącz do rozgrywek lub sprawdź trwającą rywalizację</p>
        </div>
        <div className="flex flex-wrap gap-6 justify-center">
          {tournaments.map((t) => (
            <BorderGlow
              key={t.name}
              className="flex-1 min-w-[320px] max-w-[460px]"
              colors={["#ff0000", "#fff700", "#ff0000"]}
              backgroundColor="#17181c"
              borderRadius={16}
              edgeSensitivity={30}
              glowRadius={40}
              glowIntensity={1.2}
            >
              <div className="p-7 flex flex-col gap-3 h-full">
                {t.image && (
                  <img src={t.image} alt={t.name} className="absolute top-4 right-4 w-[210px] h-[70px] object-cover rounded-lg" />
                )}
                <span className="self-start px-2.5 py-1 bg-red-600/15 text-red-400 text-[11px] font-extrabold uppercase tracking-wider rounded-sm">{t.tag}</span>
                <h3 className="text-xl font-extrabold text-white max-w-[65%]">{t.name}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{t.desc}</p>
                <a href={t.href} target="_blank" rel="noopener noreferrer" className="self-start text-white font-bold text-sm uppercase tracking-wide border-b-2 border-red-600 pb-0.5">
                  Zobacz szczegóły →
                </a>
              </div>
            </BorderGlow>
          ))}
        </div>
      </section>

      {/* ─── WARD CLICKER ─── */}
      <div className="mt-8 mb-6 md:mt-12 md:mb-8">
        <WardClicker />
      </div>

      {/* ─── TESTIMONIALS MARQUEE ─── */}
      <section className="relative z-10 w-full mt-12 mb-10 flex flex-col items-center">
        <div className="max-w-7xl mx-auto px-6 mb-2 text-center w-full">
          <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.2em] mb-1">Głosy społeczności</p>
          <p className="text-slate-500 text-xs">Opinie graczy z naszego serwera Discord</p>
        </div>

        <div
          className="relative w-full max-w-7xl mx-auto overflow-hidden"
          style={{
            maskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
            WebkitMaskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
          }}
        >
          <div className="animate-marquee gap-6 px-3 hover:[animation-play-state:paused]">
            {[...testimonials, ...testimonials].map((review, idx) => (
              <BorderGlow
                key={`${review.id}-${idx}`}
                className="w-[280px] md:w-[400px] shrink-0"
                colors={["#ff0000", "#fff700", "#ff0000"]}
                backgroundColor="#17181c"
                borderRadius={16}
                edgeSensitivity={30}
                glowRadius={40}
                glowIntensity={1.2}
              >
              <a
                href="https://disboard.org/server/947158056381337630"
                target="_blank"
                rel="noopener noreferrer"
                className="p-6 flex flex-col gap-4 cursor-pointer h-full"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {review.avatar_url ? (
                      <img
                        src={review.avatar_url}
                        alt={review.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold bg-gradient-to-br ${
                        idx % 3 === 0 ? 'from-red-500 to-purple-600' :
                        idx % 3 === 1 ? 'from-blue-500 to-emerald-500' :
                        'from-orange-500 to-red-600'
                      }`}>
                        {review.name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <div className="text-white font-bold text-base">{review.name}</div>
                    </div>
                  </div>
                  <div className="flex gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-5 h-5 fill-yellow-500 text-yellow-500" />
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-slate-200 text-base mb-1.5">{review.headline}</div>
                  <div className="text-slate-400 text-sm leading-relaxed">&ldquo;{review.text}&rdquo;</div>
                </div>
              </a>
              </BorderGlow>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PARTNERS SECTION ─── */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 mt-16">
        <p className="text-center text-slate-500 text-xs font-bold uppercase tracking-[0.3em] mb-8">Nasz partner</p>
        <div className="max-w-2xl mx-auto border border-white/10 rounded-xl p-8 flex items-center gap-6 flex-wrap justify-center hover:border-red-500/40 transition-colors duration-300">
          <a href={partnerLink} target="_blank" rel="noopener noreferrer" className="shrink-0">
            <img
              src="/DM.png"
              alt="Dream Machines"
              className="h-14 w-auto object-contain brightness-90 hover:brightness-110 transition-all"
            />
          </a>
          <div className="flex-1 min-w-[200px]">
            <div className="text-white font-bold text-base">Dream Machines</div>
            <p className="text-slate-400 text-sm leading-relaxed mt-1">Sprzęt gamingowy wspierający nasze turnieje i wydarzenia.</p>
          </div>
        </div>
      </section>

    </main>
  );
}
