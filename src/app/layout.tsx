import type { Metadata } from "next";
import "./globals.css"; // Tutaj ładują się nasze nowe style z globals.css
import { supabase } from "@/lib/supabase";
import Footer from "@/components/Footer";

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

async function getSettings() {
  try {
    const { data, error } = await supabase
      .from('news')
      .select('*')
      .eq('category', 'SystemSettings')
      .eq('title', 'global_settings')
      .maybeSingle();
    if (error || !data || !data.content) {
      return {
        font_family: 'Logik',
        custom_fonts: []
      };
    }
    return JSON.parse(data.content);
  } catch {
    return {
      font_family: 'Logik',
      custom_fonts: []
    };
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getSettings();
  const fontFamily = settings.font_family || 'Logik';
  const customFonts = (settings.custom_fonts || []) as { name: string; base64: string }[];

  const googleFonts = ['Inter', 'Roboto', 'Poppins', 'Montserrat'];
  const isGoogleFont = googleFonts.includes(fontFamily);

  // Generate CSS for custom fonts
  const fontStyles = customFonts
    .map((font) => `
      @font-face {
        font-family: '${font.name}';
        src: url(${font.base64}) format('woff2');
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }
    `)
    .join('\n');

  return (
    <html lang="pl">
      <head>
        {/* Preload critical hero font (Logik-SemiBold) for LCP text */}
        <link
          rel="preload"
          href="/fonts/Logik-SemiBold.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        {isGoogleFont && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link href={`https://fonts.googleapis.com/css2?family=${fontFamily}:wght@400;600;700;800&display=swap`} rel="stylesheet" />
          </>
        )}
        <style dangerouslySetInnerHTML={{ __html: `
          ${fontStyles}
          :root {
            --font-sans: '${fontFamily}', sans-serif;
          }
          body {
            font-family: var(--font-sans) !important;
          }
        ` }} />
      </head>
      <body className="antialiased bg-[#050505]">
        {children}
        <Footer />
      </body>
    </html>
  );
}