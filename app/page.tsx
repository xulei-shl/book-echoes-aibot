import { getMonths, getAboutContent } from '@/lib/content';
import HomeHero from '@/components/HomeHero';
import HomeNavigation from '@/components/HomeNavigation';

export const revalidate = 3600;
export const dynamic = 'force-static';

export default async function Home() {
  const months = await getMonths();
  const aboutContent = await getAboutContent();

  const latestMonth = months.length > 0 ? months[0] : null;

  // Extract images from the latest month's books
  // Provide horizontal, vertical, and fallback image URLs for adaptive layout
  const heroCards = latestMonth?.books
    .map(book => {
      const horizontalUrl = book.originalImageUrl;
      const verticalUrl = book.cardImageUrl || book.coverImageUrl;
      const primaryUrl = horizontalUrl || verticalUrl || '';
      return {
        id: String(book['书目条码'] || ''),
        image: primaryUrl,
        horizontalUrl,
        verticalUrl,
        title: book['豆瓣书名'] || '',
      };
    })
    .filter(card => !!card.image) || [];

  const images = heroCards.map(c => c.image);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)]">
      {latestMonth ? (
        <HomeHero
          cards={heroCards}
          images={images}
          targetLink={`/${latestMonth.id}`}
          subtitle={latestMonth.label}
        />
      ) : (
        <div className="flex items-center justify-center h-screen">
          <p className="text-gray-500">暂无期刊数据</p>
        </div>
      )}

      <HomeNavigation aboutContent={aboutContent} />
    </main>
  );
}
