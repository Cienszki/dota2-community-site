import {
  Trophy, Flame, Star, Shield, Crown, Target, Zap, Heart, Coins, Eye, Clock, Swords,
} from 'lucide-react';
import type { CSSProperties } from 'react';

// The icon a medal names, resolved.
//
// Shared by the profile shelf and the Top gracze badges so the same award
// cannot render as two different symbols in two places on one page. Closed set
// on purpose — a medal record is written by an admin task, and letting it name
// an arbitrary component would mean a typo renders nothing at all.

const ICONS: Record<string, typeof Trophy> = {
  trophy: Trophy, flame: Flame, star: Star, shield: Shield,
  crown: Crown, target: Target, zap: Zap, heart: Heart,
  coins: Coins, eye: Eye, clock: Clock, swords: Swords,
};

export default function MedalIcons({
  icon,
  className,
  style,
}: {
  icon: string;
  className?: string;
  style?: CSSProperties;
}) {
  const Icon = ICONS[icon] ?? Trophy;
  return <Icon className={className} style={style} />;
}
