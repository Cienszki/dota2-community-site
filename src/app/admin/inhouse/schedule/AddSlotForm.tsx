'use client';

import { useActionState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { addSlot, type SlotFormState } from './actions';

const INITIAL: SlotFormState = { status: 'idle' };
const DAYS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];
const inputCls = 'bg-[#181a20] border border-white/10 rounded-lg px-3 py-2 text-slate-200 outline-none focus:ring-2 focus:ring-red-600';
const labelCls = 'block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5';

export default function AddSlotForm() {
  const [state, action, pending] = useActionState(addSlot, INITIAL);

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="label">Nazwa</label>
          <input id="label" name="label" placeholder="Wtorkowy inhouse" className={`${inputCls} w-full`} />
        </div>
        <div>
          <label className={labelCls} htmlFor="time">Godzina (HH:MM)</label>
          <input id="time" name="time" placeholder="21:00" className={`${inputCls} w-full`} />
        </div>
      </div>

      <div>
        <span className={labelCls}>Dni tygodnia</span>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d, i) => (
            <label key={i} className="inline-flex items-center gap-1.5 bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" name="daysOfWeek" value={i} className="accent-red-600" /> {d}
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={labelCls} htmlFor="timeZoneOffsetMinutes">Offset UTC (min)</label>
          <input id="timeZoneOffsetMinutes" name="timeZoneOffsetMinutes" type="number" defaultValue={120} className={`${inputCls} w-full`} />
        </div>
        <div>
          <label className={labelCls} htmlFor="openAheadMinutes">Otwórz z wyprzedzeniem (min)</label>
          <input id="openAheadMinutes" name="openAheadMinutes" type="number" defaultValue={240} className={`${inputCls} w-full`} />
        </div>
        <div>
          <label className={labelCls} htmlFor="hostName">Nazwa hosta</label>
          <input id="hostName" name="hostName" defaultValue="Community" className={`${inputCls} w-full`} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 items-end">
        <div>
          <label className={labelCls} htmlFor="hostDiscordId">Host Discord ID (opcjonalnie)</label>
          <input id="hostDiscordId" name="hostDiscordId" className={`${inputCls} w-full`} />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-300 py-2">
          <input type="checkbox" name="autoPublish" defaultChecked className="w-4 h-4 accent-red-600" /> Auto-publikacja
        </label>
      </div>

      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold text-sm">
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Dodaj slot
        </button>
        {state.status === 'ok' && <span className="text-sm text-emerald-400">{state.message}</span>}
        {state.status === 'error' && <span className="text-sm text-red-400">{state.message}</span>}
      </div>
    </form>
  );
}
