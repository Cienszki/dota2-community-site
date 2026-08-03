import HomeClient, { type TestimonialCard, type TournamentCard } from '@/components/HomeClient';
import { supabase } from '@/lib/supabase';
import { getGlobalSettings } from '@/lib/global-settings';

const MOCK_TOURNAMENTS: TournamentCard[] = [
  { name: 'Wiosenna Furia', tag: 'Zapisy otwarte', desc: 'Sezonowy puchar dla wszystkich poziomów MMR — graj o nagrody i chwałę.', href: 'https://dota2inhouse.pl/wiosenna', image: null },
  { name: 'PDL #1', tag: 'Liga drużynowa', desc: 'Pierwsza edycja Polskiej Ligi Dota 2 — regularne rozgrywki drużynowe.', href: 'https://dota2inhouse.pl/pdl', image: null },
];

const MOCK_TESTIMONIALS: TestimonialCard[] = [
  { id: 1, name: "Kamil", rating: 5, headline: "Najlepsze inhouse'y w Polsce", text: "Świetna organizacja turniejów i super poziom. Polecam każdemu kto chce się rozwijać!", avatar_url: null },
  { id: 2, name: "Zadymka", rating: 5, headline: "Świetna społeczność", text: "Znalazłem tu stałą ekipę do gry. Zero toksyczności, pełen profesjonalizm i super zabawa.", avatar_url: null },
  { id: 3, name: "Ciptok", rating: 5, headline: "Liga PDL wymiata", text: "Rozgrywki w lidze to czysta przyjemność. Admini zawsze pomocni i bardzo szybko reagują na problemy.", avatar_url: null },
  { id: 4, name: "Pocieszny", rating: 5, headline: "Super atmosfera", text: "Nigdy nie widziałem tak dobrze zorganizowanego discorda do Doty w Polsce. Mega szacun dla ekipy.", avatar_url: null },
  { id: 5, name: "Damianexis", rating: 5, headline: "Czegoś takiego szukałem", text: "Codziennie mnóstwo ludzi do grania. Od kiedy dołączyłem, w ogóle nie gram już solo matchmakingu.", avatar_url: null },
];

const DEFAULT_PARTNER_LINK = 'https://dreammachines.pl/pl/?utm_content=dota2';

export default async function Home() {
  const [testimonialsResult, tournamentsResult, settings] = await Promise.all([
    supabase.from('testimonials').select('*').order('created_at', { ascending: true }),
    supabase
      .from('tournaments')
      .select('*')
      .eq('is_visible', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false }),
    getGlobalSettings(),
  ]);

  const testimonials: TestimonialCard[] =
    testimonialsResult.data && testimonialsResult.data.length > 0
      ? testimonialsResult.data
      : MOCK_TESTIMONIALS;

  const tournaments: TournamentCard[] =
    tournamentsResult.data && tournamentsResult.data.length > 0
      ? tournamentsResult.data.map((row) => ({
          name: row.name,
          tag: row.tag,
          desc: row.description,
          href: row.href,
          image: row.image_url,
        }))
      : MOCK_TOURNAMENTS;

  const partnerLink = settings.partner_link || DEFAULT_PARTNER_LINK;

  return <HomeClient tournaments={tournaments} testimonials={testimonials} partnerLink={partnerLink} />;
}
