'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ChevronDown, Ban, Link2Off, Trash2, EyeOff, Eye, Loader2 } from 'lucide-react';
import type { AccountRow as Row } from '@/lib/inhouse/accounts';
import { toSteam64 } from '@/lib/inhouse/display';
import {
  allowInRanking,
  deletePlayerProfile,
  removeFromRanking,
  unlinkSteam,
  type ActionResult,
} from './actions';

// One person, or one unlinked Steam account.
//
// Collapsed by default: the destructive actions are all one level down, because
// a row you can unlink from by mis-clicking is a row somebody eventually
// unlinks from by mis-clicking.

export default function AccountRow({ row }: { row: Row }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const run = (fn: () => Promise<ActionResult>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    start(async () => setResult(await fn()));
  };

  const allSteamIds = row.steam.map((s) => s.steamId32);
  const anyListed = row.steam.some((s) => s.inRanking);
  const anyExcluded = row.steam.some((s) => s.excludedFromRanking);

  return (
    <div className="border-b border-slate-800">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-white/[0.03]"
      >
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-600 transition-transform ${open ? 'rotate-180' : ''}`}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-200">
              {row.discordName ?? row.steam[0]?.playerName ?? `Gracz ${row.steam[0]?.steamId32}`}
            </span>
            {row.discordId ? (
              <Tag className="border-indigo-500/30 bg-indigo-500/10 text-indigo-300">połączone</Tag>
            ) : (
              <Tag className="border-slate-600/40 bg-slate-600/10 text-slate-400">
                bez Discorda
              </Tag>
            )}
            {row.ban && (
              <Tag className="border-red-500/40 bg-red-500/10 text-red-300">
                <Ban className="mr-1 inline h-3 w-3" />
                ban
              </Tag>
            )}
            {anyExcluded && (
              <Tag className="border-amber-500/40 bg-amber-500/10 text-amber-300">
                poza rankingiem
              </Tag>
            )}
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-slate-500">
            {allSteamIds.join(', ') || '—'}
          </div>
        </div>

        <div className="shrink-0 text-right text-xs text-slate-500">
          <div className="tabular-nums text-slate-300">{row.gamesPlayed}</div>
          <div>gier</div>
        </div>
      </button>

      {open && (
        <div className="space-y-4 bg-black/20 px-3 pb-4 pl-10 pt-1">
          {row.discordId && (
            <Field label="Discord">
              <span className="font-mono text-xs text-slate-400">{row.discordId}</span>
              {row.linkSource && <span className="ml-2 text-xs text-slate-600">via {row.linkSource}</span>}
            </Field>
          )}

          <Field label="Konta Steam">
            <ul className="space-y-1.5">
              {row.steam.map((s) => (
                <li key={s.steamId32} className="flex flex-wrap items-center gap-2 text-xs">
                  <a
                    href={`https://steamcommunity.com/profiles/${toSteam64(s.steamId32)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-slate-300 underline-offset-2 hover:text-white hover:underline"
                  >
                    {s.steamId32}
                  </a>
                  {s.playerName && <span className="text-slate-500">{s.playerName}</span>}

                  {s.excludedFromRanking ? (
                    <Tag className="border-amber-500/40 bg-amber-500/10 text-amber-300">
                      wykluczone
                    </Tag>
                  ) : s.inRanking ? (
                    <Tag className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                      w rankingu
                    </Tag>
                  ) : (
                    <Tag className="border-slate-600/40 bg-slate-600/10 text-slate-500">
                      poza rankingiem
                    </Tag>
                  )}

                  {s.excludedFromRanking ? (
                    <Action
                      onClick={() => run(() => allowInRanking([s.steamId32]))}
                      disabled={pending}
                      icon={<Eye className="h-3 w-3" />}
                    >
                      przywróć
                    </Action>
                  ) : (
                    <Action
                      onClick={() =>
                        run(
                          () =>
                            removeFromRanking(
                              [s.steamId32],
                              window.prompt('Powód (opcjonalnie):') ?? '',
                            ),
                          `Usunąć ${s.steamId32} z rankingu na stałe? Konto nie wróci po kolejnych meczach.`,
                        )
                      }
                      disabled={pending}
                      icon={<EyeOff className="h-3 w-3" />}
                    >
                      usuń z rankingu
                    </Action>
                  )}

                  {row.discordId && row.steam.length > 1 && (
                    <Action
                      onClick={() =>
                        run(
                          () => unlinkSteam(row.discordId!, s.steamId32),
                          `Odłączyć ${s.steamId32} od tego profilu? Statystyki zostaną przeliczone z pozostałych kont.`,
                        )
                      }
                      disabled={pending}
                      icon={<Link2Off className="h-3 w-3" />}
                    >
                      odłącz
                    </Action>
                  )}
                </li>
              ))}
            </ul>
          </Field>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {anyListed && !anyExcluded && row.steam.length > 1 && (
              <Action
                onClick={() =>
                  run(
                    () => removeFromRanking(allSteamIds, window.prompt('Powód (opcjonalnie):') ?? ''),
                    `Usunąć wszystkie ${allSteamIds.length} konta tego gracza z rankingu?`,
                  )
                }
                disabled={pending}
                icon={<EyeOff className="h-3 w-3" />}
              >
                usuń wszystkie z rankingu
              </Action>
            )}

            {row.discordId && (
              <Action
                onClick={() =>
                  run(
                    () => deletePlayerProfile(row.discordId!),
                    'Usunąć cały profil? Konta Steam zostaną odłączone, a licznik gier wyzerowany. ' +
                      'Historia meczów pozostanie — jest przypisana do kont Steam, nie do profilu.',
                  )
                }
                disabled={pending}
                icon={<Trash2 className="h-3 w-3" />}
                danger
              >
                usuń profil
              </Action>
            )}

            <Link
              href="/admin/inhouse/moderation"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition-colors hover:text-white"
            >
              <Ban className="h-3 w-3" />
              {row.ban ? 'zarządzaj banem' : 'nadaj bana'}
            </Link>

            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />}
          </div>

          {row.ban && (
            <p className="text-xs text-red-300/90">
              Ban: {row.ban.reason}
              {row.ban.expiresAt
                ? ` — do ${new Date(row.ban.expiresAt).toLocaleDateString('pl-PL')}`
                : ' — na stałe'}
            </p>
          )}

          {result && (
            <p className={`text-xs ${result.ok ? 'text-emerald-400' : 'text-red-400'}`}>
              {result.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Tag({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${className}`}>
      {children}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-slate-600">{label}</div>
      {children}
    </div>
  );
}

function Action({
  onClick,
  disabled,
  icon,
  danger,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
        danger ? 'text-red-400 hover:text-red-300' : 'text-slate-400 hover:text-white'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
