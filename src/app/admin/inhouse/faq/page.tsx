import Link from 'next/link';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import { listFaqsAdmin } from './actions';
import FaqItemRow from './FaqItemRow';
import AddFaqForm from './AddFaqForm';

export const dynamic = 'force-dynamic';

export default async function FaqAdminPage() {
  const faqs = await listFaqsAdmin();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/admin/inhouse" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm mb-6">
        <ArrowLeft className="w-4 h-4" /> Inhouse
      </Link>
      <h1 className="text-2xl font-bold text-white mb-1">FAQ</h1>
      <p className="text-slate-500 text-sm mb-8">
        Pytania i odpowiedzi widoczne w sekcji FAQ na /inhouse, w kolejności jak niżej.
      </p>

      {faqs.length > 0 && (
        <div className="space-y-2 mb-10">
          {faqs.map((faq, i) => (
            <FaqItemRow key={faq.id} faq={faq} index={i} />
          ))}
        </div>
      )}

      <div className="bg-slate-900/40 border border-slate-700 rounded-2xl p-6">
        <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2 mb-5">
          <HelpCircle className="w-5 h-5 text-red-500" /> Nowe pytanie
        </h2>
        <AddFaqForm />
      </div>
    </div>
  );
}
