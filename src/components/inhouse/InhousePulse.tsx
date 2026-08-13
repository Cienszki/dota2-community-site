'use client';

import { useEffect, useRef } from 'react';
import { pulseStatusFor, type PulseTier } from '@/lib/inhouse/pulse';

// The gauge from the designer's simulator (ZMIANY/gemini-code-*.html),
// ported to React. The sliders and the math-parameter debug grid from that
// file are gone on purpose — this is the read-only, public-facing version.
//
// Stripped of the tier emoji that used to sit next to the heading. The tier
// *name* stays — "Mocne inhousy", "Przeciążenie ligi!" — because that is the
// part people read; a bare 7.4/10 says nothing about whether 7.4 is good.
//
// `score` is fixed for the component's lifetime (one server-rendered number,
// cached 15 min upstream in pulse-stats.ts) — there is no slider re-driving
// it here, so the whole particle/icicle/lightning system is seeded once from
// the prop rather than re-read every frame from live state.
//
// A null score means the league is too young for the baseline to mean anything
// (see pulse-stats.ts). That renders as a dead grey dial rather than a zero,
// because 0.0 is itself a real reading — "nobody played this week" — and the
// two must not look alike.

const TIER_TEXT_COLOR: Record<PulseTier, string> = {
  'deep-freeze': 'text-sky-300',
  freeze: 'text-sky-400',
  cooldown: 'text-cyan-400',
  active: 'text-emerald-400',
  strong: 'text-amber-400',
  blazing: 'text-red-500',
  overload: 'text-purple-400',
};

const TIER_DOT_COLOR: Record<PulseTier, string> = {
  'deep-freeze': 'bg-sky-300',
  freeze: 'bg-sky-400',
  cooldown: 'bg-cyan-400',
  active: 'bg-emerald-400',
  strong: 'bg-amber-400',
  blazing: 'bg-red-500',
  overload: 'bg-purple-400',
};

const TIER_PULSE_ANIM: Partial<Record<PulseTier, string>> = {
  'deep-freeze': 'animate-pulse',
  blazing: 'animate-pulse',
  overload: 'animate-pulse',
};

/** Ice/frost/fire/purple ring overlays, and the glow class, for a score — a
 *  direct port of `updateCalculator`'s DOM-mutating if-chain into pure data. */
function overlaysFor(score: number) {
  if (score <= 0.3) {
    return { ice: 1, frost: 0.7, fire: 0, purple: 0, glow: 'pulse-deep-freeze-glow', solidStroke: '#0284c7' };
  }
  if (score <= 1.5) {
    const intensity = (1.5 - score) / 1.2;
    return { ice: 0.5 + intensity * 0.5, frost: intensity * 0.5, fire: 0, purple: 0, glow: '', solidStroke: null };
  }
  if (score <= 3.0) {
    const intensity = (3.0 - score) / 1.5;
    return { ice: intensity * 0.5, frost: 0, fire: 0, purple: 0, glow: '', solidStroke: null };
  }
  if (score <= 7.0) {
    return { ice: 0, frost: 0, fire: 0, purple: 0, glow: '', solidStroke: null };
  }
  if (score <= 8.5) {
    const fireIntensity = (score - 7.0) / 1.5;
    return { ice: 0, frost: 0, fire: fireIntensity * 0.6, purple: 0, glow: '', solidStroke: null };
  }
  if (score <= 9.7) {
    const fireIntensity = (score - 8.5) / 1.2;
    return { ice: 0, frost: 0, fire: 0.6 + fireIntensity * 0.4, purple: 0, glow: '', solidStroke: null };
  }
  return { ice: 0, frost: 0, fire: 0, purple: 1, glow: 'pulse-overload-glow', solidStroke: null };
}

type ParticleType = 'fire' | 'snow';

class Particle {
  type: ParticleType;
  x = 0;
  y = 0;
  size = 0;
  speedX = 0;
  speedY = 0;
  opacity = 0;
  color = '#38bdf8';
  maxY = 0;

  constructor(type: ParticleType, private width: number, private height: number) {
    this.type = type;
    this.reset();
  }

  reset() {
    if (this.type === 'fire') {
      this.x = Math.random() * this.width;
      this.y = Math.random() * (this.height * 0.8);
      this.size = Math.random() * 2.5 + 1;
      this.speedY = Math.random() * 2.5 + 1.2;
      this.speedX = (Math.random() - 0.5) * 1.5;
      this.opacity = Math.random() * 0.8 + 0.2;
      this.color = Math.random() > 0.35 ? '#f59e0b' : '#ef4444';
    } else {
      this.x = Math.random() * this.width;
      this.y = Math.random() * 10;
      this.size = Math.random() * 2.2 + 1;
      this.speedY = Math.random() * 0.8 + 0.4;
      this.speedX = Math.sin(Math.random() * Math.PI) * 0.5;
      this.opacity = Math.random() * 0.8 + 0.2;
      this.color = '#38bdf8';
      this.maxY = this.height * 0.7 + Math.random() * 25;
    }
  }

  update() {
    this.y += this.speedY;
    this.x += this.speedX;
    if (this.type === 'fire') {
      this.opacity -= 0.012;
      if (this.opacity <= 0 || this.y > this.height) this.reset();
    } else {
      this.opacity -= 0.008;
      if (this.opacity <= 0 || this.y >= this.maxY) this.reset();
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.globalAlpha = Math.max(this.opacity, 0);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }
}

const ICICLE_ANGLES_DEG = [175, 167, 158, 149, 140, 131, 122, 113, 104, 95, 85, 76, 67, 58, 49, 40, 31, 22, 13, 5];

function drawIcicles(ctx: CanvasRenderingContext2D, width: number, height: number, score: number) {
  if (score > 3.0) return;
  const iceIntensity = (3.0 - score) / 3.0;
  if (iceIntensity <= 0) return;

  const centerX = width / 2;
  const centerY = height;
  const arcRadius = 125;

  ICICLE_ANGLES_DEG.forEach((deg, idx) => {
    const rad = (deg * Math.PI) / 180;
    const bx = centerX + arcRadius * Math.cos(rad);
    const by = centerY - arcRadius * Math.sin(rad);

    const dir = idx % 2 === 0 ? -1 : 1;
    const maxH = 14 + (idx % 5) * 7;
    const boostMultiplier = score <= 0.3 ? 1.4 : 1.0;
    const h = maxH * iceIntensity * boostMultiplier * dir;
    const w = 5 + (idx % 3) * 3;

    ctx.save();
    ctx.translate(bx, by);
    const tilt = ((idx % 3) - 1) * 8;
    ctx.rotate(((deg - 90 + tilt) * Math.PI) / 180);

    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(w / 2, 0);
    ctx.lineTo(0, h);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#f0f9ff');
    grad.addColorStop(0.5, '#38bdf8');
    grad.addColorStop(1, '#0284c7');

    ctx.fillStyle = grad;
    ctx.globalAlpha = Math.min(0.95 * iceIntensity, 1.0);
    ctx.fill();

    ctx.strokeStyle = score <= 0.3 ? '#e0f2fe' : '#ffffff';
    ctx.lineWidth = score <= 0.3 ? 1.0 : 0.6;
    ctx.stroke();

    ctx.restore();
  });
}

function drawLightning(ctx: CanvasRenderingContext2D, width: number, score: number) {
  if (score < 9.7) return;
  if (Math.random() > 0.25) return;

  let curX = Math.random() * width;
  let curY = Math.random() * 30;

  ctx.beginPath();
  ctx.moveTo(curX, curY);

  const segments = Math.floor(Math.random() * 4) + 3;
  for (let i = 0; i < segments; i++) {
    curX += (Math.random() - 0.5) * 35;
    curY += Math.random() * 20 + 10;
    ctx.lineTo(curX, curY);
  }

  ctx.strokeStyle = '#e9d5ff';
  ctx.lineWidth = Math.random() * 2 + 1.5;
  ctx.stroke();
}

export default function InhousePulse({ score }: { score: number | null }) {
  const pending = score === null;
  const clamped = Math.min(Math.max(score ?? 0, 0), 10);
  const status = pulseStatusFor(clamped);
  const overlays = pending
    ? { ice: 0, frost: 0, fire: 0, purple: 0, glow: '', solidStroke: '#334155' }
    : overlaysFor(clamped);
  const angleDeg = pending ? -90 : -90 + (clamped / 10) * 180;
  const shiver = !pending && status.tier === 'overload';

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Nothing to animate while the score is withheld — no particles, no
    // icicles, and no rAF loop left spinning behind a static grey dial.
    if (pending) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particles: Particle[] = [];
    let rafId: number;

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    let particleType: ParticleType | null = null;
    let targetCount = 0;
    if (clamped >= 7.0) {
      particleType = 'fire';
      targetCount = Math.floor(((clamped - 7.0) / 3.0) * 65);
    } else if (clamped <= 3.0) {
      particleType = 'snow';
      targetCount = Math.floor(((3.0 - clamped) / 3.0) * 75);
    }

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (particleType) {
        while (particles.length < targetCount) particles.push(new Particle(particleType, canvas.width, canvas.height));
        while (particles.length > targetCount) particles.pop();
        for (const p of particles) {
          p.update();
          p.draw(ctx);
        }
      }

      drawIcicles(ctx, canvas.width, canvas.height, clamped);
      drawLightning(ctx, canvas.width, clamped);
      rafId = requestAnimationFrame(render);
    };
    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      particles = [];
    };
  }, [clamped, pending]);

  return (
    <div className="mx-auto w-full max-w-[256px]">
      <h2 className="text-center text-[13px] font-bold uppercase tracking-[0.16em] text-slate-400">
        Puls ligi
      </h2>

      <div
        ref={containerRef}
        className={`relative mt-5 h-32 w-full overflow-hidden transition-all duration-300 ${overlays.glow}`}
      >
        <svg className="h-32 w-full overflow-visible" viewBox="0 0 176 88">
          <defs>
            <linearGradient id="pulseGaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="30%" stopColor="#84cc16" />
              <stop offset="55%" stopColor="#eab308" />
              <stop offset="78%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
            <pattern id="pulseFrostPattern" width="8" height="8" patternUnits="userSpaceOnUse">
              <path d="M 0 4 L 8 4 M 4 0 L 4 8 M 1 1 L 7 7 M 7 1 L 1 7" stroke="#e0f2fe" strokeWidth="0.4" opacity="0.4" />
            </pattern>
          </defs>

          <path d="M 12 88 A 76 76 0 0 1 164 88" fill="none" stroke="#1e293b" strokeWidth="18" strokeLinecap="round" />
          <path
            d="M 12 88 A 76 76 0 0 1 164 88"
            fill="none"
            stroke={overlays.solidStroke ?? 'url(#pulseGaugeGradient)'}
            strokeWidth="18"
            strokeLinecap="round"
          />
          <path d="M 12 88 A 76 76 0 0 1 164 88" fill="none" stroke="#0284c7" strokeWidth="20" strokeLinecap="round" opacity={overlays.ice} />
          <path d="M 12 88 A 76 76 0 0 1 164 88" fill="none" stroke="url(#pulseFrostPattern)" strokeWidth="20" strokeLinecap="round" opacity={overlays.frost} />
          <path d="M 12 88 A 76 76 0 0 1 164 88" fill="none" stroke="#dc2626" strokeWidth="18" strokeLinecap="round" opacity={overlays.fire} />
          <path d="M 12 88 A 76 76 0 0 1 164 88" fill="none" stroke="#a855f7" strokeWidth="18" strokeLinecap="round" opacity={overlays.purple} />
        </svg>

        <div
          className={`absolute bottom-0 left-1/2 w-0 h-0 origin-bottom z-20 ${shiver ? 'pulse-shiver-pointer' : ''}`}
          style={
            {
              transform: `translateX(-50%) rotate(${angleDeg}deg)`,
              '--pulse-angle': `${angleDeg}deg`,
            } as React.CSSProperties
          }
        >
          <svg className="absolute -left-2.5 -top-28 w-5 h-28 overflow-visible" viewBox="0 0 20 128">
            <polygon
              points="10,0 18,128 2,128"
              fill={pending ? '#475569' : '#f8fafc'}
              stroke={pending ? '#334155' : '#94a3b8'}
              strokeWidth="1"
            />
            <polygon points="10,8 14,120 6,120" fill="#334155" />
          </svg>
        </div>

        <div
          className={`absolute bottom-0 left-1/2 z-30 flex h-6 w-6 -translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full border-2 bg-slate-800 shadow-xl ${
            pending ? 'border-slate-700' : 'border-slate-300'
          }`}
        >
          <div className={`h-2 w-2 rounded-full ${pending ? 'bg-slate-600' : TIER_DOT_COLOR[status.tier]}`} />
        </div>

        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-10" />
      </div>

      <div className="mt-2 text-center">
        {pending ? (
          <span className="text-sm font-semibold text-slate-600">Zbieramy dane</span>
        ) : (
          <>
            <span
              className={`text-2xl font-black tracking-tight ${TIER_TEXT_COLOR[status.tier]} ${TIER_PULSE_ANIM[status.tier] ?? ''}`}
            >
              {clamped.toFixed(1)}
            </span>
            <span className="text-sm font-normal text-slate-500"> / 10</span>
          </>
        )}
      </div>

      {!pending && (
        <div
          className={`mt-0.5 text-center text-xs font-bold uppercase tracking-wide ${TIER_TEXT_COLOR[status.tier]}`}
        >
          {status.label}
        </div>
      )}
    </div>
  );
}
