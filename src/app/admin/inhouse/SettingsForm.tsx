'use client';

import { useActionState } from 'react';
import { Save, Loader2, AlertTriangle } from 'lucide-react';
import { GAME_MODE_NAMES, SERVER_REGION_NAMES, DOTA_TV_DELAYS } from '@/lib/inhouse/core/settings';
import type { ResolvedSettings } from '@/lib/inhouse/core/types';
import { saveInhouseDefaults, type FormState } from './actions';

const INITIAL: FormState = { status: 'idle' };

const inputCls =
  'w-full bg-[#181a20] border border-white/10 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all';
const labelCls = 'block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5';

export default function SettingsForm({ initial }: { initial: ResolvedSettings }) {
  const [state, action, pending] = useActionState(saveInhouseDefaults, INITIAL);

  return (
    <form action={action} className="space-y-6">
      {/* League ID — the blocking prerequisite */}
      <div className="bg-black/30 border border-white/10 rounded-xl p-4">
        <label className={labelCls} htmlFor="leagueId">
          League ID
        </label>
        <input id="leagueId" name="leagueId" type="number" min={0} defaultValue={initial.leagueId} className={`${inputCls} max-w-xs`} />
        {initial.leagueId === 0 && (
          <p className="flex items-start gap-2 text-amber-300/90 text-sm mt-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            League ID = 0 oznacza „nieustawione”. Gry działają, ale mecze nie są publicznie pobierane —
            brak frekwencji, składów na stronach gier, wyróżnień i kredytu wstecznego.
          </p>
        )}
      </div>

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
              <option key={id} value={id}>{name}</option>
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
          <select id="selectionPriorityRules" name="selectionPriorityRules" defaultValue={initial.selectionPriorityRules} className={inputCls}>
            <option value={1}>Rzut monetą</option>
            <option value={0}>Ręcznie</option>
          </select>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <NumberField name="reservationTtlSeconds" label="Rezerwacja (s)" value={initial.reservationTtlSeconds} />
        <NumberField name="idleLobbyExpiryMinutes" label="Wygaśnięcie lobby (min)" value={initial.idleLobbyExpiryMinutes} />
        <NumberField name="autoPublishNudgeMinutes" label="Nudge publikacji (min)" value={initial.autoPublishNudgeMinutes} />
        <NumberField name="publishGateGames" label="Gry przed publikacją" value={initial.publishGateGames} />
        <NumberField name="publishesPerDay" label="Publikacje / dzień (0=∞)" value={initial.publishesPerDay} />
        <NumberField name="startCountdownSeconds" label="Odliczanie startu (s)" value={initial.startCountdownSeconds} />
        <NumberField name="newcomerReservedSlots" label="Sloty dla nowych" value={initial.newcomerReservedSlots} />
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="banLadderDays">Drabinka banów (dni, 0=stały)</label>
          <input id="banLadderDays" name="banLadderDays" defaultValue={initial.banLadderDays.join(', ')} className={inputCls} />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Check name="allowSpectators" label="Obserwatorzy" checked={initial.allowSpectators} />
        <Check name="cheatsEnabled" label="Cheaty" checked={initial.cheatsEnabled} />
        <Check name="fillWithBots" label="Wypełnij botami" checked={initial.fillWithBots} />
        <Check name="immortalDraft" label="Immortal Draft (nieaktywne)" checked={initial.immortalDraft} />
      </div>

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
