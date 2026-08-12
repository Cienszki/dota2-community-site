'use client';

import { useState } from 'react';
import { medalImagePath } from '@/lib/inhouse/medal-catalogue';
import MedalIcons from './MedalIcons';

// A medal's artwork, or its icon if the artwork isn't there yet.
//
// Deliberately optimistic: it asks for /images/medals/{id}.png and falls back
// to the lucide icon only when the browser reports the file missing. That means
// adding art is dropping a file into the folder — no manifest to update, no
// imageUrl to backfill onto medals already awarded, and no half-state where the
// file exists but nothing points at it.
//
// The cost is one 404 per missing medal per page load, which is cheap and
// self-resolving as the set fills in.

export default function MedalArt({
  id,
  icon,
  size,
  colour,
}: {
  id: string;
  icon: string;
  size: number;
  colour: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <MedalIcons
        icon={icon}
        className=""
        style={{ color: colour, width: size * 0.5, height: size * 0.5 }}
      />
    );
  }

  return (
    /* Plain <img>: these are small transparent PNGs on our own origin, so the
       optimizer buys nothing, and onError is the whole mechanism here. */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={medalImagePath(id)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full rounded-full object-contain"
    />
  );
}
