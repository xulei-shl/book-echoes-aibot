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
  // We prioritize originalImageUrl, but fallback to coverImageUrl if needed
  const images = latestMonth?.books
    .map(book => book.originalImageUrl || book.coverImageUrl)
    .filter((url): url is string => !!url) || [];

  // If no images found, we might want a fallback or just show empty state
  // For now, we assume there are images if there is a month.

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)]">
      {latestMonth ? (
        <HomeHero
          images={images}
          targetLink={`/${latestMonth.id}`}
          title="书海回响"
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
