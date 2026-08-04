import Link from 'next/link';
import { ArrowLeft, CalendarClock, AlertTriangle } from 'lucide-react';
import { isInhouseConfigured, getDb } from '@/lib/firebase-admin';
import type { RecurringSlot } from './actions';
import AddSlotForm from './AddSlotForm';
import SlotActions from './SlotActions';

export const dynamic = 'force-dynamic';

const DAYS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];

export default async function SchedulePage() {
  if (!isInhouseConfigured()) {
    return <Wrap><p className="text-slate-400">Firestore nie jest skonfigurowany.</p></Wrap>;
  }

  const snap = await getDb().collection('inhouseConfig').doc('schedule').get();
  const data = snap.data();
  const slots: RecurringSlot[] = Array.isArray(data?.slots) ? (data!.slots as RecurringSlot[]) : [];

  return (
    <Wrap>
      <p className="text-slate-500 text-sm mb-4">
        Ludzie planują wokół rytmu, nie możliwości — to najbardziej dźwigniowy element projektu.
      </p>

      <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3 mb-8 text-amber-200/90 text-sm">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          <b>Uwaga DST:</b> offset jest stały (w minutach od UTC), nie strefą nazwaną. Slot sam nie
          przesunie się przy zmianie czasu w marcu i październiku — trzeba go wtedy poprawić ręcznie.
          Obecnie CET = 60, CEST = 120.
        </span>
      </div>

      {slots.length > 0 && (
        <div className="space-y-2 mb-10">
          {slots.map((s) => (
            <div key={s.id} className="bg-slate-900/40 border border-slate-700 rounded-xl p-4 flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold text-white">
                  {s.label} <span className="text-slate-500 font-normal">· {s.time}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3">
                  <span>{s.daysOfWeek.map((d) => DAYS[d]).join(', ')}</span>
                  <span>host: {s.hostName}</span>
                  <span>otwiera {s.openAheadMinutes} min wcześniej</span>
                  {s.autoPublish && <span className="text-emerald-400">auto-publikacja</span>}
                </div>
              </div>
              <SlotActions id={s.id} enabled={s.enabled} />
            </div>
          ))}
        </div>
      )}

      <div className="bg-slate-900/40 border border-slate-700 rounded-2xl p-6">
        <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2 mb-5">
          <CalendarClock className="w-5 h-5 text-red-500" /> Nowy slot
        </h2>
        <AddSlotForm />
      </div>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/admin/inhouse" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm mb-6">
        <ArrowLeft className="w-4 h-4" /> Inhouse
      </Link>
      <h1 className="text-2xl font-bold text-white mb-1">Harmonogram</h1>
      {children}
    </div>
  );
}
