# Medal artwork

One PNG per medal, named after its `id` in `src/lib/inhouse/medal-catalogue.ts`.

    public/images/medals/filantrop.png
    public/images/medals/wizjoner.png
    public/images/medals/kupiec-wardow.png
    …

Nothing else to wire up: `MedalArt` requests `/images/medals/{id}.png` and falls
back to the medal's lucide icon when the file 404s. Drop a file in and it
appears; delete one and the icon comes back.

Rendered at 34px on the profile and 24px in the Top gracze row, so square
transparent PNGs at 128px or larger cover every display density with room to
spare. Anything much bigger is wasted bytes — these are small circles.

Run `node scripts/inhouse-medal-manifest.mjs` to list which files are still
missing.
