'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Mail, Menu, X } from 'lucide-react';
import Link from 'next/link';

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const navLinks = [
    { href: '/newsy', label: 'Newsy' },
    { href: '#', label: 'Turnieje' },
    { href: '/ranking', label: 'Ranking' },
    { href: '/hall-of-fame', label: 'Hall of Fame' },
    { href: '/basher', label: 'Basher' },
    { href: '/streamy', label: 'Streamy' },
  ];

  const isActive = (href: string) => href !== '#' && pathname === href;

  return (
    <nav className="relative z-40 border-b border-white/10">
      <div className="flex items-center max-w-7xl mx-auto px-6 py-6">
        <Link href="/" className="hover:opacity-80 transition-opacity drop-shadow-md flex-shrink-0 mr-10">
          <img 
            src="/pd2ih_logo.png" 
            alt="Dota 2 Inhouse Logo" 
            width={56}
            height={56}
            fetchPriority="high"
            className="h-14 w-auto object-contain" 
          />
        </Link>

        {/* ─── DESKTOP NAV ─── */}
        <div className="hidden md:flex items-stretch flex-1">
          <div className="flex w-full">
            {navLinks.map((link) =>
              link.label === 'Turnieje' ? (
                <div key={link.href} className="relative flex-1 flex group">
                  <button className="btn-nav-tile text-lg tracking-wider px-3 py-2.5 not-italic flex-1">
                    <span className="not-italic">TURNIEJE</span>
                  </button>
                  <div className="absolute top-full left-0 flex flex-col bg-[#1A181A]/95 backdrop-blur-md border border-white/10 rounded-b-lg py-2 min-w-[200px] z-50 shadow-2xl opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150">
                    <a href="https://dota2inhouse.pl/wiosenna" className="px-4 py-2 text-base text-white hover:bg-white/10 hover:text-red-500 font-bold transition-colors">
                      Wiosenna Furia
                    </a>
                    <a href="https://dota2inhouse.pl/pdl" className="px-4 py-2 text-base text-white hover:bg-white/10 hover:text-red-500 font-bold transition-colors">
                      PDL #1
                    </a>
                  </div>
                </div>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`btn-nav-tile text-lg tracking-wider px-3 py-2.5 not-italic flex-1 ${isActive(link.href) ? 'is-active' : ''}`}
                >
                  <span className="not-italic">{link.label}</span>
                </Link>
              )
            )}
            <Link
              href="/kontakt"
              className={`btn-nav-tile text-lg tracking-wider px-4 py-2.5 not-italic hidden sm:inline-flex flex-1 ${isActive('/kontakt') ? 'is-active' : ''}`}
            >
              <span className="flex items-center gap-1.5 not-italic">
                Kontakt <Mail className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>
        </div>

        {/* ─── MOBILE HAMBURGER ─── */}
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="md:hidden ml-auto p-2 text-white hover:text-red-400 transition-colors"
          aria-label={mobileOpen ? 'Zamknij menu' : 'Otwórz menu'}
        >
          {mobileOpen ? <X className="w-7 h-7" /> : <Menu className="w-7 h-7" />}
        </button>
      </div>

      {/* ─── MOBILE DRAWER ─── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setMobileOpen(false)}
          />
          {/* Menu panel */}
          <div className="absolute right-0 top-0 h-full w-72 max-w-[80vw] bg-[#111] border-l border-white/10 shadow-2xl flex flex-col py-6 px-6 overflow-y-auto">
            <div className="flex flex-col gap-1 mt-4">
              {navLinks.map((link) =>
                link.label === 'Turnieje' ? (
                  <div key={link.href} className="flex flex-col">
                    <span className="btn-nav-tile text-lg tracking-wider px-4 py-3 not-italic text-left w-full">
                      TURNIEJE
                    </span>
                    <div className="flex flex-col pl-4 border-l border-white/10 ml-4 mt-1 mb-2">
                      <a
                        href="https://dota2inhouse.pl/wiosenna"
                        className="px-4 py-2.5 text-base text-slate-300 hover:text-red-400 font-bold transition-colors"
                        onClick={() => setMobileOpen(false)}
                      >
                        Wiosenna Furia
                      </a>
                      <a
                        href="https://dota2inhouse.pl/pdl"
                        className="px-4 py-2.5 text-base text-slate-300 hover:text-red-400 font-bold transition-colors"
                        onClick={() => setMobileOpen(false)}
                      >
                        PDL #1
                      </a>
                    </div>
                  </div>
                ) : (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`btn-nav-tile text-lg tracking-wider px-4 py-3 not-italic ${isActive(link.href) ? 'is-active' : ''}`}
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                  </Link>
                )
              )}
              <Link
                href="/kontakt"
                className={`btn-nav-tile text-lg tracking-wider px-4 py-3 not-italic flex items-center gap-2 ${isActive('/kontakt') ? 'is-active' : ''}`}
                onClick={() => setMobileOpen(false)}
              >
                Kontakt <Mail className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
