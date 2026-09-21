import Header from '@/components/Header';
import SemanticSearchPage from '@/components/search/SemanticSearchPage';
import { getAboutContent, getSearchCovers } from '@/lib/content';

export const revalidate = 3600;

export default async function SearchPage() {
  const [aboutContent, covers] = await Promise.all([getAboutContent(), getSearchCovers(120)]);

  return (
    <div className="relative min-h-screen bg-[#0e0d0c] text-[#E8E6DC] overflow-x-hidden">
      <Header showHomeButton aboutContent={aboutContent} theme="dark" />
      <SemanticSearchPage covers={covers} />
    </div>
  );
}

