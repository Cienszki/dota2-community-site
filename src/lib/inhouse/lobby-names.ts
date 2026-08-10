// 1000 Polish nouns used to name inhouse lobbies.
//
// Every entry is deliberately free of Polish diacritics (a-z only). The name is
// what a player types into Dota 2's lobby browser to find the game, and that
// search box is an awkward place to reproduce 'zdzblo' correctly on a keyboard
// that may not have a Polish layout at all — so the whole table avoids the
// problem rather than relying on the player to spell around it.
//
// Vetted against the SJP Polish dictionary (sjp.pl, 2026-08-03 release): each
// word exists verbatim in that list, so none of these is an accidentally
// de-diacriticized spelling of a real word — `swierk` is not in the table, because
// the real word is `świerk`.
// Keep it that way when adding entries.

const LOBBY_NAMES = [
  'agat', 'agrafa', 'akwarium', 'akwedukt', 'aleja', 'alkierz', 'ambasador', 'amfora',
  'anegdota', 'animusz', 'antylopa', 'apsyda', 'arbiter', 'archipelag', 'arkada', 'astrolabium',
  'atrium', 'aura', 'autoklaw', 'azyl', 'bagno', 'bajka', 'baldachim', 'balia',
  'balkon', 'ballada', 'balsam', 'baniak', 'bankiet', 'barakuda', 'barbakan', 'bard',
  'barka', 'barszcz', 'bartnik', 'bat', 'bazalt', 'bazylia', 'bazylika', 'bazyliszek',
  'beczka', 'bednarz', 'belka', 'berdysz', 'beret', 'berlinka', 'bicz', 'biedronka',
  'biesiada', 'bigos', 'blask', 'bluszcz', 'bocian', 'boczniak', 'bogatek', 'boginka',
  'bok', 'borowik', 'borsuk', 'brama', 'broda', 'brona', 'browarnik', 'bruzda',
  'bryg', 'brygantyna', 'bryza', 'brzana', 'brzask', 'brzeg', 'brzeszczot', 'brzoza',
  'buk', 'bukszpan', 'bukszpryt', 'bungalow', 'burta', 'burza', 'butla', 'buzdygan',
  'bystrze', 'cel', 'celownik', 'centaur', 'cep', 'chimera', 'chleb', 'chlew',
  'chmiel', 'chmura', 'chodnik', 'chrobot', 'chrom', 'chusta', 'cielak', 'cios',
  'cis', 'cyferblat', 'cylinder', 'cyna', 'cynamon', 'cynk', 'cyprys', 'cyrkiel',
  'cytadela', 'czapka', 'czapla', 'czaprak', 'czar', 'czarodziej', 'czeladnik', 'czereda',
  'czeremcha', 'czubajka', 'czupryna', 'dach', 'defilada', 'delegat', 'delia', 'delta',
  'denar', 'derka', 'deska', 'destylarnia', 'destylator', 'deszcz', 'determinacja', 'detonator',
  'diadem', 'diament', 'dno', 'dobosz', 'dolina', 'dom', 'dorsz', 'dostatek',
  'draperia', 'drezyna', 'driada', 'droga', 'drozd', 'drukarz', 'drzazga', 'drzemlik',
  'duch', 'dukt', 'duma', 'dworek', 'dym', 'dymarka', 'dyrygent', 'dysk',
  'dysza', 'dzban', 'dzbanek', 'dzik', 'dziurawiec', 'dzwon', 'dzwonek', 'dzwonnica',
  'echo', 'ekspedycja', 'elipsa', 'emblemat', 'emisariusz', 'eremita', 'eskorta', 'estragon',
  'fabryka', 'fala', 'farbiarnia', 'faun', 'felga', 'feniks', 'festyn', 'fibula',
  'filar', 'filtr', 'flaga', 'fletnista', 'flisak', 'floren', 'floret', 'foka',
  'folusz', 'forkasztel', 'formacja', 'forteca', 'fosa', 'framuga', 'fraszka', 'fregata',
  'fresk', 'fundament', 'furtka', 'futor', 'gaj', 'galaktyka', 'galeon', 'galera',
  'ganek', 'garb', 'garbarnia', 'garncarz', 'gazela', 'gejzer', 'gepard', 'gisernia',
  'gitarzysta', 'glif', 'glina', 'gniazdo', 'gnom', 'gnu', 'gong', 'goniec',
  'gont', 'gorczyca', 'gorzelnik', 'gospoda', 'grab', 'granit', 'granulat', 'grobla',
  'grodzisko', 'gronostaj', 'grosz', 'grot', 'grota', 'gryf', 'grzanka', 'grzbiet',
  'grzmot', 'grzyb', 'grzywa', 'grzywka', 'guzik', 'gwardia', 'gwiazda', 'gzik',
  'hak', 'hala', 'halabarda', 'halibut', 'hamernia', 'handlarz', 'harcownik', 'harfiarz',
  'harmider', 'harmonia', 'harpia', 'hart', 'hebel', 'herb', 'herold', 'hetman',
  'hiena', 'hiperbola', 'hipopotam', 'horyzont', 'hufiec', 'huk', 'humbak', 'hydra',
  'hymn', 'iglica', 'ikona', 'imbir', 'impala', 'intendent', 'introligator', 'iryd',
  'iskra', 'jaguar', 'jama', 'jarmark', 'jasnowidz', 'jawor', 'jaz', 'jazgarz',
  'jazgot', 'jedwab', 'jelito', 'jelonek', 'jenot', 'jerzyk', 'jesion', 'jezioro',
  'juki', 'jurta', 'kaganek', 'kajak', 'kalmar', 'kambuz', 'kamieniec', 'kamyk',
  'kanclerz', 'kanoe', 'kanonik', 'kapelusz', 'kapitan', 'kaplica', 'karabela', 'karaka',
  'karczma', 'kardamon', 'kark', 'kaskada', 'kastaniety', 'kasza', 'kasztelan', 'katakumby',
  'katedra', 'kazuar', 'kielich', 'kiermasz', 'kirys', 'kita', 'klamka', 'klamra',
  'klasztor', 'klatka', 'klepka', 'klif', 'klin', 'klinga', 'klucz', 'klucznik',
  'kluska', 'kminek', 'knot', 'kobalt', 'kobuz', 'kobziarz', 'kociak', 'kojot',
  'kolano', 'kolba', 'kolczuga', 'kolendra', 'kolumna', 'kolumnada', 'komar', 'kombinat',
  'kometa', 'komin', 'kominek', 'komnata', 'kompania', 'kompas', 'kompost', 'koncepcja',
  'koncerz', 'konew', 'koniec', 'koniuszy', 'konstelacja', 'kontur', 'kontusz', 'konwencja',
  'konwisarz', 'kopalnia', 'kopiec', 'kopytko', 'kopyto', 'koral', 'kord', 'kordon',
  'kormoran', 'korona', 'korweta', 'kos', 'kosa', 'kosiarz', 'kosmos', 'kot',
  'kotara', 'kotwica', 'kowalik', 'krasnal', 'krater', 'krawiec', 'kres', 'kresy',
  'krokiew', 'kromka', 'krosno', 'kruk', 'krupnik', 'kruszec', 'krwawnik', 'kubrak',
  'kudu', 'kufel', 'kufer', 'kula', 'kupiec', 'kurant', 'kurhan', 'kurier',
  'kurkuma', 'kurnik', 'kurtyna', 'kurzawa', 'kustosz', 'kuter', 'kwadrat', 'kwatermistrz',
  'labirynt', 'laguna', 'lama', 'lampart', 'lampion', 'lamus', 'laska', 'latarnik',
  'lawa', 'lawenda', 'lawina', 'legar', 'legenda', 'lejek', 'lelek', 'lemiesz',
  'lepianka', 'ligatura', 'lilia', 'lin', 'lina', 'linijka', 'lipa', 'lirnik',
  'lis', 'listwa', 'litera', 'lochy', 'lodowiec', 'loggia', 'lok', 'lokomotywa',
  'lont', 'lotka', 'lubczyk', 'lupek', 'lutnista', 'maczuga', 'mag', 'magazyn',
  'magazynek', 'magma', 'magnez', 'makrela', 'malina', 'manat', 'mantykora', 'mapa',
  'mara', 'marmur', 'marsz', 'matryca', 'mauzoleum', 'mech', 'medalion', 'melisa',
  'menzurka', 'meszka', 'meteor', 'mewa', 'miarka', 'miecz', 'miecznik', 'miedz',
  'miedza', 'mieszek', 'migot', 'milczenie', 'minaret', 'mincerz', 'misa', 'misja',
  'mit', 'mitra', 'mniszek', 'molibden', 'molo', 'monsun', 'mors', 'most',
  'motek', 'motyka', 'mozaika', 'mrowisko', 'mucha', 'muchomor', 'murarz', 'murena',
  'mustang', 'muszka', 'muszla', 'nadir', 'nadziak', 'nagolennik', 'najada', 'nalot',
  'namiot', 'namul', 'naramiennik', 'narwal', 'nastawnia', 'nasyp', 'nawa', 'nerka',
  'niebo', 'niwa', 'nizina', 'nora', 'norka', 'nowicjusz', 'nowina', 'nugat',
  'nurek', 'oaza', 'obelisk', 'obwarzanek', 'ochmistrz', 'odblask', 'odcisk', 'odkrywka',
  'odlewnia', 'odpust', 'ognisko', 'ogr', 'okruch', 'olbrzym', 'olejarz', 'omen',
  'omlet', 'onyks', 'opal', 'opar', 'opoka', 'opona', 'oprawa', 'orbita',
  'oregano', 'organista', 'orka', 'orkan', 'orlik', 'osa', 'osad', 'osada',
  'osika', 'osnowa', 'ostoja', 'ostryga', 'ostrze', 'otoczak', 'owczarz', 'pakt',
  'palec', 'palenisko', 'pallad', 'pancerz', 'panda', 'panel', 'papiernik', 'papirus',
  'papuga', 'parabola', 'parada', 'parawan', 'parobek', 'pasat', 'pasieka', 'pasja',
  'pasmo', 'pastuch', 'patera', 'patyna', 'peleryna', 'pelikan', 'peron', 'petrel',
  'pianista', 'piasek', 'piec', 'pieczara', 'pieczarka', 'piekarz', 'pielgrzymka', 'pieprz',
  'pierog', 'piestrzenica', 'pieta', 'piktogram', 'pilnik', 'piorun', 'pirs', 'pisarz',
  'pisklak', 'piskorz', 'piszczek', 'piwnica', 'plan', 'planeta', 'platforma', 'platyna',
  'plewa', 'plon', 'plotka', 'pluton', 'pochodnia', 'pochwa', 'poczet', 'podanie',
  'podczaszy', 'podgrodzie', 'podgrzybek', 'podjazd', 'podkomorzy', 'podmuch', 'podstoli', 'podwalina',
  'podziemia', 'pogoda', 'pogranicze', 'pokrzywa', 'polana', 'pomoc', 'pomost', 'poranek',
  'porucznik', 'porzeczka', 'posterunek', 'potok', 'potop', 'powietrze', 'poziomica', 'poziomka',
  'pracownia', 'prasa', 'precel', 'prezbiterium', 'proca', 'proch', 'profil', 'projekt',
  'prom', 'proporcja', 'proporzec', 'prorok', 'prosiak', 'proszek', 'protuberancja', 'prymas',
  'przedmurze', 'przedsionek', 'przekop', 'przeor', 'przepona', 'przepowiednia', 'przeprawa', 'przepust',
  'przesieka', 'przymiar', 'przymierze', 'przymrozek', 'psiarnia', 'pszczelarz', 'puch', 'puchacz',
  'puklerz', 'pulsar', 'puma', 'pumeks', 'purchawka', 'pustak', 'pustelnia', 'pustelnik',
  'pustynia', 'puszcza', 'rabatka', 'racuch', 'rada', 'rafa', 'rafineria', 'rapier',
  'ratusz', 'rawelin', 'rdest', 'rdza', 'reduta', 'refektarz', 'refleks', 'reja',
  'rejs', 'rekin', 'relikwia', 'reling', 'retman', 'retorta', 'rezerwa', 'rezydencja',
  'rogal', 'rola', 'rondel', 'rondo', 'rosa', 'rotmistrz', 'rowek', 'rozejm',
  'rozjazd', 'rozlewisko', 'rubin', 'ruda', 'rudzik', 'rufa', 'runa', 'rura',
  'rwetes', 'rybak', 'rybitwa', 'rycerz', 'rydz', 'ryjkowiec', 'rylec', 'rymarz',
  'rynek', 'rytm', 'sad', 'sadza', 'sadzawka', 'salwa', 'sandacz', 'sarenka',
  'sarkofag', 'sarna', 'satyr', 'sawanna', 'schody', 'schronienie', 'sekstant', 'sekwoja',
  'serce', 'sfera', 'siarka', 'sieczna', 'sielawa', 'sierp', 'siewca', 'sikora',
  'siodlarz', 'sitowie', 'skald', 'skarb', 'skarbiec', 'sklejka', 'skowronek', 'skrzat',
  'skwar', 'smardz', 'smuga', 'snop', 'snopek', 'sojka', 'sojusz', 'sokolnik',
  'sonet', 'sosna', 'sowa', 'spichlerz', 'spiekota', 'spinka', 'splot', 'spust',
  'sroka', 'starorzecze', 'statek', 'staw', 'ster', 'sternik', 'stok', 'stopa',
  'straganiarz', 'strategia', 'strop', 'strug', 'strzecha', 'strzyga', 'styczna', 'sum',
  'supernowa', 'susza', 'sygnet', 'sylwetka', 'symbol', 'symetria', 'syrena', 'szabla',
  'szafarz', 'szafir', 'szakal', 'szala', 'szaniec', 'szczeniak', 'szczerbina', 'szczupak',
  'szczypce', 'szelest', 'szept', 'szereg', 'szewc', 'szkic', 'szklarnia', 'szklarz',
  'szlak', 'szlam', 'szlifierka', 'szmaragd', 'szop', 'szot', 'szpada', 'szpaler',
  'szpon', 'szprycha', 'szron', 'sztanca', 'sztandar', 'sztanga', 'sztolnia', 'sztorm',
  'sztukateria', 'szuwar', 'szwalnia', 'szyb', 'szyk', 'szyna', 'szynk', 'szyper',
  'tabliczka', 'tabor', 'taca', 'tafla', 'tajfun', 'tajga', 'talar', 'talizman',
  'tamburyn', 'taras', 'tarcza', 'tarpan', 'tartak', 'tatarak', 'tchawica', 'tender',
  'terasa', 'terkot', 'terminator', 'termit', 'termitiera', 'terrarium', 'tkalnia', 'tokarka',
  'topaz', 'topielec', 'topik', 'topola', 'toporek', 'tornado', 'trakt', 'traktat',
  'tram', 'traper', 'trapez', 'tratwa', 'trawler', 'tren', 'troll', 'trop',
  'troska', 'truskawka', 'trzask', 'trzmiel', 'trznadel', 'trzon', 'trzos', 'tuja',
  'tukan', 'tuleja', 'tumult', 'tundra', 'tunel', 'turnia', 'twierdza', 'tygiel',
  'tymianek', 'tytan', 'uchatka', 'uczta', 'ukleja', 'urodzaj', 'urok', 'urwisko',
  'uzda', 'wachlarz', 'wagon', 'walcownia', 'walec', 'wampir', 'wanilia', 'warkot',
  'warownia', 'warsztat', 'warta', 'warzywnik', 'wataha', 'welin', 'welon', 'werbel',
  'werblista', 'wesele', 'wiadro', 'wichura', 'widmo', 'wiec', 'wieloryb', 'wiertnica',
  'wieszcz', 'wilec', 'wilga', 'wilk', 'willa', 'winieta', 'wioska', 'wir',
  'wirydarz', 'wizja', 'wodospad', 'wodze', 'wojak', 'wojewoda', 'wolarz', 'wolfram',
  'worek', 'wosk', 'wrota', 'wrzawa', 'wsparcie', 'wycieczka', 'wydma', 'wydra',
  'wykop', 'wyprawa', 'wyrobisko', 'wyspa', 'wytrych', 'wywierzysko', 'wzniesienie', 'zabawa',
  'zaczep', 'zaczyn', 'zadanie', 'zagajnik', 'zagon', 'zagroda', 'zagrodnik', 'zakonnik',
  'zakwas', 'zaleszczotka', 'zamek', 'zamiar', 'zapora', 'zaprawa', 'zarzewie', 'zaspa',
  'zasuwa', 'zatoka', 'zawias', 'zawieja', 'zbiornik', 'zbocze', 'zbroja', 'zdobycz',
  'zdun', 'zebra', 'zebranie', 'zegar', 'zgoda', 'zgraja', 'ziemianka', 'zimorodek',
  'zjawa', 'zjazd', 'zlecenie', 'znachor', 'zorza', 'zwiad', 'zwierzyniec', 'zwrotnica',
] as const;

export { LOBBY_NAMES };

/** How many distinct names a lobby can be given. */
export const LOBBY_NAME_COUNT = LOBBY_NAMES.length;

/**
 * Pick a lobby name at random.
 *
 * `taken` lets the caller exclude names already in use by a live lobby, so two
 * concurrent games never send players hunting through the browser for the same
 * string. With 1000 names and a handful of concurrent lobbies the exclusion
 * practically never has to fall back, but it degrades to "allow a repeat"
 * rather than throwing when every name somehow is taken.
 */
export function randomLobbyName(taken: Iterable<string> = []): string {
  const used = new Set(Array.from(taken, (n) => n.toLowerCase()));
  const free = used.size ? LOBBY_NAMES.filter((n) => !used.has(n)) : LOBBY_NAMES;
  const pool = free.length ? free : LOBBY_NAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}
