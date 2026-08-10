import type { Metadata } from 'next';
import ContentPageView from '@/components/ContentPageView';
import { CONTENT_PAGES } from '@/lib/content-pages';

const meta = CONTENT_PAGES.rekrutacja;

export const metadata: Metadata = {
  title: meta.ogTitle ?? meta.title,
  description: meta.description,
};

export default function RekrutacjaPage() {
  return <ContentPageView slug="rekrutacja" />;
}
