import type { Metadata } from 'next';
import KontaktForm from './KontaktForm';

export const metadata: Metadata = {
  title: 'Kontakt',
  description: 'Masz pytania dotyczące inhouse lobby lub turniejów Dota 2? Skontaktuj się z nami!',
};

export default function KontaktPage() {
  return <KontaktForm />;
}