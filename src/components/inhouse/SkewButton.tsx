import Link from 'next/link';

// The site's signature skewed CTA (see globals.css .btn-hero and
// JoinSteamButton). Three variants cover every inhouse call-to-action:
//   red      — outline red (secondary), like "Zaloguj przez Steam"
//   redSolid — filled red (primary)
//   discord  — filled Discord blurple, for the OAuth entry point

type Variant = 'red' | 'redSolid' | 'discord';

const VARIANT: Record<Variant, string> = {
  red: 'border-[1.5px] border-[#E7000B] bg-transparent text-white hover:bg-[#E7000B]/15',
  redSolid: 'bg-[#E7000B] text-white hover:bg-[#c10009]',
  discord: 'bg-[#5865F2] text-white hover:bg-[#4752c4]',
};

interface Props {
  href?: string;
  children: React.ReactNode;
  variant?: Variant;
  prefetch?: boolean;
  className?: string;
  external?: boolean;
}

export default function SkewButton({
  href,
  children,
  variant = 'red',
  prefetch = false,
  className = '',
  external = false,
}: Props) {
  const inner = (
    <span
      className={`inline-flex items-center h-12 px-7 font-extrabold text-sm uppercase tracking-wide -skew-x-[12deg] transition-colors duration-300 ${VARIANT[variant]} ${className}`}
    >
      <span className="flex items-center gap-2.5 skew-x-[12deg] whitespace-nowrap">
        {children}
      </span>
    </span>
  );

  const glow =
    'inline-flex drop-shadow-[0_0_8px_rgba(220,38,38,0.25)] hover:drop-shadow-[0_0_15px_rgba(220,38,38,0.45)] transition-[filter] duration-300';

  if (!href) return inner;

  if (external) {
    return (
      <a href={href} className={glow} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} prefetch={prefetch} className={glow}>
      {inner}
    </Link>
  );
}
