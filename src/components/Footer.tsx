import Image from 'next/image';
import { FaTwitch, FaYoutube, FaInstagram, FaDiscord } from 'react-icons/fa';
import Link from 'next/link';
import type { GlobalSettings } from '@/lib/global-settings';
import FooterLogout from './FooterLogout';

function Footer({ settings }: { settings: GlobalSettings }) {
  const twitchLink = settings.twitch_link ?? '';
  const youtubeLink = settings.youtube_link ?? '';
  const instagramLink = settings.instagram_link ?? '';
  const discordLink = settings.discord_link ?? 'https://discord.gg/ZxgmF7Kr4t';

  const navLinks: { name: string; href: string; external: boolean; icon?: string }[] = [
    { name: "Rekrutacja", href: "/rekrutacja", external: false },
    { name: "O nas", href: "/o-nas", external: false },
    { name: "Wesprzyj nas!", href: "/wesprzyj-nas", external: false, icon: "/images/midas.png" },
  ];

  return (
    <footer className="py-10 px-4 sm:px-6 lg:px-8 relative overflow-hidden bg-[#050505]">
      <div className="max-w-7xl mx-auto flex flex-col items-center relative z-10">
        <div className="mb-6 flex items-center justify-center">
          <img
            src="/images/pd2ih_footer.png"
            alt="Polish Dota 2 Inhouse"
            width={56}
            height={56}
            loading="lazy"
            className="h-14 w-auto object-contain"
          />
        </div>
        <nav className="mb-3 w-full">
          <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-base font-medium">
            {navLinks.map((link) => (
              <li key={link.name}>
                {link.external ? (
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white transition-all duration-300 relative after:absolute after:left-0 after:bottom-0 after:h-0.5 after:w-0 after:bg-red-600 after:transition-all after:duration-300 hover:after:w-full"
                  >
                    {link.icon && (
                      <Image src={link.icon} alt="" width={20} height={20} className="w-4 h-4 object-contain" />
                    )}
                    {link.name}
                  </a>
                ) : (
                  <Link
                    href={link.href}
                    className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white transition-all duration-300 relative after:absolute after:left-0 after:bottom-0 after:h-0.5 after:w-0 after:bg-red-600 after:transition-all after:duration-300 hover:after:w-full"
                  >
                    {link.icon && (
                      <Image src={link.icon} alt="" width={20} height={20} className="w-4 h-4 object-contain" />
                    )}
                    {link.name}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div className="my-3 flex flex-wrap justify-center gap-4 text-sm">
          {twitchLink && (
            <a href={twitchLink} target="_blank" rel="noopener noreferrer" aria-label="Twitch"
               className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-purple-400 hover:border-purple-500/40 transition-colors duration-300">
              <FaTwitch className="w-6 h-6" />
            </a>
          )}
          {youtubeLink && (
            <a href={youtubeLink} target="_blank" rel="noopener noreferrer" aria-label="YouTube"
               className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-red-500 hover:border-red-500/40 transition-colors duration-300">
              <FaYoutube className="w-6 h-6" />
            </a>
          )}
          {instagramLink && (
            <a href={instagramLink} target="_blank" rel="noopener noreferrer" aria-label="Instagram"
               className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-pink-400 hover:border-pink-500/40 transition-colors duration-300">
              <FaInstagram className="w-6 h-6" />
            </a>
          )}
          {discordLink && (
            <a href={discordLink} target="_blank" rel="noopener noreferrer" aria-label="Discord"
               className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-indigo-400 hover:border-indigo-500/40 transition-colors duration-300">
              <FaDiscord className="w-6 h-6" />
            </a>
          )}
        </div>
        <p className="text-center text-xs text-slate-500 mt-4">
          &copy; {new Date().getFullYear()} Polish Dota 2 Inhouse. Wszelkie prawa zastrzeżone.{' '}
          <Link
            href="/polityka-prywatnosci"
            className="text-slate-400 hover:text-white transition-all duration-300 relative after:absolute after:left-0 after:bottom-0 after:h-0.5 after:w-0 after:bg-red-600 after:transition-all after:duration-300 hover:after:w-full"
          >
            Polityka prywatności
          </Link>
          <FooterLogout />
        </p>
      </div>
    </footer>
  );
}

export default Footer;
