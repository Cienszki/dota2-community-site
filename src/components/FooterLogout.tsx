'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// The footer's sign-out link.
//
// Renders nothing at all until /api/auth/session confirms someone is signed in,
// which is why this is a client component: the Footer sits in the root layout,
// and reading the cookie there would make every static page on the site render
// dynamically just to decide whether to show one link.
//
// Deliberately plain — a text link the same weight as the privacy policy beside
// it. People who are signed in already know they are; this only has to be
// findable, not prominent.

export default function FooterLogout() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.signedIn) setSignedIn(true);
      })
      .catch(() => {
        // Not being able to tell means not showing the link, which is the
        // harmless way to be wrong.
      });
    return () => {
      active = false;
    };
  }, []);

  if (!signedIn) return null;

  const logout = async () => {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setSignedIn(false);
      // Server components hold the signed-in view (the inhouse profile, most
      // visibly), so the tree has to be re-fetched — clearing the cookie alone
      // would leave the old page on screen.
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {' · '}
      <button
        type="button"
        onClick={logout}
        disabled={busy}
        className="relative text-slate-400 transition-all duration-300 after:absolute after:bottom-0 after:left-0
                   after:h-0.5 after:w-0 after:bg-red-600 after:transition-all after:duration-300
                   hover:text-white hover:after:w-full disabled:opacity-50"
      >
        {busy ? 'Wylogowywanie…' : 'Wyloguj się'}
      </button>
    </>
  );
}
