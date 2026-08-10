import type { Metadata } from 'next';
import ContentPageView from '@/components/ContentPageView';
import { CONTENT_PAGES } from '@/lib/content-pages';

const meta = CONTENT_PAGES['polityka-prywatnosci'];

export const metadata: Metadata = {
  title: meta.ogTitle ?? meta.title,
  description: meta.description,
};

export default function PolitykaPrywatnosciPage() {
  return <ContentPageView slug="polityka-prywatnosci" />;
}
