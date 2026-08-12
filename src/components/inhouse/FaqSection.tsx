'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { FaqEntry } from '@/lib/inhouse/faq';

// FAQ accordion (v5 redesign). Content is admin-editable from
// /admin/inhouse/faq (Supabase, src/lib/inhouse/faq.ts) — this component only
// owns the open/close interaction and the numbering.

export default function FaqSection({ faqs }: { faqs: FaqEntry[] }) {
  const [open, setOpen] = useState(true);

  if (faqs.length === 0) return null;

  return (
    <section className="mt-16 max-w-[760px] mx-auto" id="faq">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-5 cursor-pointer"
      >
        <span className="flex-1 h-px bg-white/15" />
        <h2 className="text-[28px] font-black text-white text-center whitespace-nowrap">FAQ</h2>
        <ChevronDown
          className={`w-[22px] h-[22px] shrink-0 text-slate-400 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
        <span className="flex-1 h-px bg-white/15" />
      </button>

      {open && (
        <div className="mt-7">
          {faqs.map((f, i) => (
            <div key={f.id} className="border-b border-white/10 py-[18px] px-1">
              <div className="flex items-baseline gap-3">
                <span className="shrink-0 font-mono text-sm text-[#E7000B]/80">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <p className="font-bold text-base text-white">{f.question}</p>
              </div>
              <p className="mt-1.5 pl-8 text-[15px] text-slate-400 leading-relaxed">{f.answer}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
