'use client';

import { useActionState } from 'react';
import { Save, Loader2, AlertTriangle } from 'lucide-react';
import { GAME_MODE_NAMES, SERVER_REGION_NAMES, DOTA_TV_DELAYS } from '@/lib/inhouse/core/settings';
import { SERVER_REGION_NAMES_PL } from '@/lib/inhouse/display';
import type { ResolvedSettings } from '@/lib/inhouse/core/types';
import { saveInhouseDefaults, type FormState } from './actions';

// Every game inherits these at creation, and the bot opens the Dota lobby with
// them. Grouped rather than listed flat: the four blocks below are four
// different jobs, and an admin changing the ban ladder has no business
// scrolling past the DotaTV delay to find it.
//
// Changing anything here does not touch games that are already open.

const INITIAL: FormState = { status: 'idle' };

const inputCls =
  'w-full bg-[#181a20] border border-white/10 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all';
const labelCls = 'block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5';

/** 0 = unlimited, 1 = limited, 2 = disabled (DOTALobbyPauseSetting). */
const PAUSE_SETTINGS: Array<[number, string]> = [
  [0, 'Bez ograniczeń'],
  [1, 'Ograniczone'],
  [2, 'Wyłączone'],
];

export default function SettingsForm({ initial }: { initial: ResolvedSettings }) {
  const [state, action, pending] = useActionState(saveInhouseDefaults, INITIAL);

  return (
    <form action={action} className="space-y-8">
      {/* League ID — the blocking prerequisite */}
      <div className="bg-black/30 border border-white/10 rounded-xl p-4">
        <label className={labelCls} htmlFor="leagueId">
          League ID
        </label>
        <input
          id="leagueId"
          name="leagueId"
          type="number"
          min={0}
          defaultValue={initial.leagueId}
          className={`${inputCls} max-w-xs`}
        />
        {initial.leagueId === 0 && (
          <p className="flex items-start gap-2 text-amber-300/90 text-sm mt-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            League ID = 0 oznacza „nieustawione”. Gry działają, ale mecze nie są publicznie pobierane —
            brak frekwencji, składów na stronach gier, wyróżnień, kredytu wstecznego i podglądu meczu.
          </p>
        )}
      </div>

      {/* ── Lobby ───────────────────────────────────────────────────────── */}
      <Section title="Lobby" desc="Z tymi ustawieniami bot otwiera lobby w Docie.">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="gameMode">Tryb gry</label>
            <select id="gameMode" name="gameMode" defaultValue={initial.gameMode} className={inputCls}>
              {Object.entries(GAME_MODE_NAMES).map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="serverRegion">Region</label>
            <select id="serverRegion" name="serverRegion" defaultValue={initial.serverRegion} className={inputCls}>
              {Object.entries(SERVER_REGION_NAMES).map(([id, name]) => (
                <option key={id} value={id}>{SERVER_REGION_NAMES_PL[Number(id)] ?? name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="dotaTvDelay">Opóźnienie DotaTV</label>
            <select id="dotaTvDelay" name="dotaTvDelay" defaultValue={initial.dotaTvDelay} className={inputCls}>
              {DOTA_TV_DELAYS.map((d) => (
                <option key={d} value={d}>{d >= 60 ? `${d / 60} min` : `${d} s`}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="selectionPriorityRules">Pierwszy wybór</label>
            <select
              id="selectionPriorityRules"
              name="selectionPriorityRules"
              defaultValue={initial.selectionPriorityRules}
              className={inputCls}
            >
              <option value={1}>Rzut monetą</option>
              <option value={0}>Ręcznie</option>
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="pauseSetting">Pauzy</label>
            <select id="pauseSetting" name="pauseSetting" defaultValue={initial.pauseSetting} className={inputCls}>
              {PAUSE_SETTINGS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 mt-5">
          <Check name="allowSpectators" label="Obserwatorzy" checked={initial.allowSpectators} />
          <Check name="cheatsEnabled" label="Cheaty" checked={initial.cheatsEnabled} />
          <Check name="fillWithBots" label="Wypełnij botami" checked={initial.fillWithBots} />
          <Check name="immortalDraft" label="Immortal Draft (nieaktywne)" checked={initial.immortalDraft} />
        </div>
        <p className="text-slate-600 text-xs mt-3">
          Immortal Draft jest zapisywany i wyświetlany, ale schemat Game Coordinatora w bibliotece bota
          nie ma na niego pola — do lobby nie trafia.
        </p>
      </Section>

      {/* ── Sloty i rezerwacje ──────────────────────────────────────────── */}
      <Section
        title="Sloty i rezerwacje"
        desc="Jak długo trzymamy miejsce dla gracza i kiedy lobby samo się poddaje."
      >
        <div className="grid gap-5 sm:grid-cols-3">
          <NumberField name="reservationTtlSeconds" label="Rezerwacja (s)" value={initial.reservationTtlSeconds} />
          <NumberField name="startCountdownSeconds" label="Odliczanie startu (s)" value={initial.startCountdownSeconds} />
          <NumberField name="idleLobbyExpiryMinutes" label="Wygaśnięcie lobby (min)" value={initial.idleLobbyExpiryMinutes} />
          <NumberField name="newcomerReservedSlots" label="Sloty dla nowych" value={initial.newcomerReservedSlots} />
        </div>
      </Section>

      {/* ── Publikacja ──────────────────────────────────────────────────── */}
      <Section title="Publikacja" desc="Kto i jak często może otwierać gry dla całego serwera.">
        <div className="grid gap-5 sm:grid-cols-3">
          <NumberField name="autoPublishNudgeMinutes" label="Nudge publikacji (min)" value={initial.autoPublishNudgeMinutes} />
          <NumberField name="publishGateGames" label="Gry przed publikacją" value={initial.publishGateGames} />
          <NumberField name="publishesPerDay" label="Publikacje / dzień (0=∞)" value={initial.publishesPerDay} />
        </div>
      </Section>

      {/* ── Moderacja ───────────────────────────────────────────────────── */}
      <Section title="Moderacja" desc="Kolejne bany tej samej osoby idą po tej drabince.">
        <div>
          <label className={labelCls} htmlFor="banLadderDays">Drabinka banów (dni, 0 = stały)</label>
          <input
            id="banLadderDays"
            name="banLadderDays"
            defaultValue={initial.banLadderDays.join(', ')}
            className={`${inputCls} max-w-md`}
          />
          <p className="text-slate-600 text-xs mt-2">
            Np. <code className="text-slate-400">7, 30, 0</code> — tydzień, miesiąc, potem na stałe.
          </p>
        </div>
      </Section>

      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold text-sm transition-colors"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Zapisz ustawienia
        </button>
        {state.status === 'ok' && <span className="text-sm text-emerald-400">{state.message}</span>}
        {state.status === 'error' && <span className="text-sm text-red-400">{state.message}</span>}
      </div>
    </form>
  );
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="border-t border-white/10 pt-6">
      <legend className="sr-only">{title}</legend>
      <div className="mb-4">
        <h3 className="text-sm font-bold text-slate-200">{title}</h3>
        <p className="text-slate-500 text-xs mt-0.5">{desc}</p>
      </div>
      {children}
    </fieldset>
  );
}

function NumberField({ name, label, value }: { name: string; label: string; value: number }) {
  return (
    <div>
      <label className={labelCls} htmlFor={name}>{label}</label>
      <input id={name} name={name} type="number" min={0} defaultValue={value} className={inputCls} />
    </div>
  );
}

function Check({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
      <input type="checkbox" name={name} defaultChecked={checked} className="w-4 h-4 accent-red-600" />
      {label}
    </label>
  );
}
