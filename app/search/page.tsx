import Header from '@/components/Header';
import SemanticSearchPage from '@/components/search/SemanticSearchPage';
import { getAboutContent, getRandomBooks } from '@/lib/content';

export const revalidate = 3600;

export default async function SearchPage() {
  const [aboutContent, random] = await Promise.all([getAboutContent(), getRandomBooks(72)]);

  return (
    <>
      <Header showHomeButton aboutContent={aboutContent} theme="dark" />
      <SemanticSearchPage covers={random.items} />
    </>
  );
}
