import type { Metadata } from 'next';
import ContentPageView from '@/components/ContentPageView';
import { CONTENT_PAGES } from '@/lib/content-pages';

const meta = CONTENT_PAGES['o-nas'];

export const metadata: Metadata = {
  title: meta.ogTitle ?? meta.title,
  description: meta.description,
};

export default function ONasPage() {
  return <ContentPageView slug="o-nas" />;
}
