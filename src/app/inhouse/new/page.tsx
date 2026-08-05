import type { Metadata } from 'next';
import { Gamepad2, MessageSquareText, Megaphone, Zap } from 'lucide-react';
import InhouseShell from '@/components/inhouse/InhouseShell';
import SkewButton from '@/components/inhouse/SkewButton';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { getInhouseViewer } from '@/lib/inhouse/session';
import CreateGameButton from './CreateGameButton';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Utwórz grę',
  description: 'Otwórz lobby inhouse 5v5 jednym kliknięciem — reszta ustawień pochodzi z domyślnych.',
  robots: { index: false, follow: true },
};

export default async function NewGamePage() {
  const configured = isInhouseConfigured();
  const viewer = configured ? await getInhouseViewer() : null;

  return (
    <InhouseShell width="narrow">
      <div className="mb-8">
        <h1 className="text-4xl font-black uppercase tracking-tight">Utwórz grę</h1>
        <p className="text-slate-400 mt-2 text-lg">Jedno kliknięcie. Resztę ustawień bierzemy z domyślnych.</p>
      </div>

      {!configured ? (
        <Card>
          <p className="text-slate-300">Integracja z botem lobby jest w trakcie konfiguracji.</p>
        </Card>
      ) : !viewer?.discordId ? (
        <Card>
          <h2 className="text-lg font-bold text-white mb-2">Najpierw połącz konto</h2>
          <p className="text-slate-400 text-sm mb-5">Hostowanie wymaga połączonego konta Discord.</p>
          <SkewButton href="/inhouse/link" variant="discord" prefetch={false}>
            <Gamepad2 className="w-5 h-5" /> Połącz konto
          </SkewButton>
        </Card>
      ) : (
        <Card>
          <CreateGameButton />
          <div className="mt-8 pt-6 border-t border-white/10 space-y-3">
            <Hint icon={<Zap className="w-4 h-4" />}>
              Lobby otworzy się od razu — zobaczysz nazwę i hasło na stronie gry.
            </Hint>
            <Hint icon={<MessageSquareText className="w-4 h-4" />}>
              Ustawienia zmieniasz komendami w czacie lobby: <code className="text-slate-200">!mode</code>,{' '}
              <code className="text-slate-200">!region</code>, <code className="text-slate-200">!delay</code>.
            </Hint>
            <Hint icon={<Megaphone className="w-4 h-4" />}>
              Gra startuje jako prywatna. Kiedy zechcesz, opublikuj ją, żeby wpuścić cały serwer.
            </Hint>
          </div>
        </Card>
      )}
    </InhouseShell>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-zinc-900/40 border border-white/10 rounded-2xl p-6 sm:p-8 backdrop-blur-md">{children}</div>;
}

function Hint({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-slate-400 text-sm">
      <span className="text-[#E7000B] mt-0.5">{icon}</span>
      <span>{children}</span>
    </div>
  );
}
