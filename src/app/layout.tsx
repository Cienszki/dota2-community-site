import type { Metadata } from "next";
import { Oxanium, Exo_2 } from "next/font/google";
import "./globals.css"; // Tutaj ładują się nasze nowe style z globals.css
import { getGlobalSettings } from "@/lib/global-settings";
import Footer from "@/components/Footer";

// Both fonts are always loaded together so rich-text content authored with
// either font (via the news editor's per-paragraph font picker) always
// renders correctly, regardless of which one is the active site default
// (see admin Settings → Czcionka serwisu). Self-hosted via next/font instead
// of a <link> tag — no external request to fonts.googleapis.com at runtime.
const oxanium = Oxanium({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-oxanium',
  display: 'swap',
});

const exo2 = Exo_2({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-exo2',
  display: 'swap',
});

// ISR: revalidate settings every 5 minutes instead of force-dynamic
export const revalidate = 300;

export const metadata: Metadata = {
  metadataBase: new URL('https://dota2inhouse.pl'),
  title: {
    default: 'Polish Dota2 Inhouse | Główna Polska Społeczność Dota 2',
    template: '%s | Polish Dota2 Inhouse',
  },
  description: 'Oficjalna strona polskiej społeczności Dota 2 istniejącej od 2022 roku. Turnieje, ranking MMR graczy, liga inhouse oraz aktualności.',
  keywords: [
    'Dota 2 Polska', 'Dota2.pl', 'turniej Dota 2', 'Dota2 turnieje',
    'społeczność dota 2 w Polsce', 'polacy w dota 2', 'szukam graczy dota 2',
    'jak grać inhouse dota 2', 'polska liga dota 2', 'PDL', 'dota2 discord',
    'dota 2 inhouse', 'ranking graczy dota 2', 'dota 2 mmr ranking polska',
  ],
  authors: [{ name: 'Polish Dota2 Inhouse Team' }],
  openGraph: {
    title: 'Polish Dota2 Inhouse | Główna Polska Społeczność Dota 2',
    description: 'Oficjalna strona polskiej społeczności Dota 2 istniejącej od 2022 roku. Dołącz do ligi inhouse, sprawdź ranking i bierz udział w turniejach!',
    url: 'https://dota2inhouse.pl',
    siteName: 'Polish Dota2 Inhouse',
    locale: 'pl_PL',
    type: 'website',
    images: [
      {
        url: '/images/og-image.png',
        width: 3840,
        height: 2160,
        alt: 'Polish Dota2 Inhouse Banner',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Polish Dota2 Inhouse | Polska Społeczność Dota 2',
    description: 'Oficjalna strona polskiej społeczności Dota 2. Turnieje, rankingi, magazyn Basher i liga inhouse.',
    images: ['/images/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

const FONT_VAR_BY_NAME: Record<string, string> = {
  Oxanium: 'var(--font-oxanium)',
  'Exo 2': 'var(--font-exo2)',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getGlobalSettings();
  const fontFamily = settings.font_family || 'Oxanium';
  const fontSansVar = FONT_VAR_BY_NAME[fontFamily] ?? FONT_VAR_BY_NAME.Oxanium;

  return (
    <html lang="pl" className={`${oxanium.variable} ${exo2.variable}`}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: `
          :root {
            --font-sans: ${fontSansVar};
          }
          body {
            font-family: var(--font-sans), sans-serif !important;
          }
        ` }} />
      </head>
      <body className="antialiased bg-[#050505]">
        {children}
        <Footer settings={settings} />
      </body>
    </html>
  );
}