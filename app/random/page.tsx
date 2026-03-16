import { getRandomBooks } from '@/lib/content';
import RandomMasonry from '@/components/RandomMasonry';
import { Metadata } from 'next';

export const revalidate = 3600;

export const metadata: Metadata = {
    title: '随机漫步 | 书海回响',
    description: '在无尽的书海中偶遇你的下一本读物。',
};

export default async function RandomPage() {
    const { items, nextCursor, seed } = await getRandomBooks(18);
    return <RandomMasonry initialBooks={items} initialCursor={nextCursor} seed={seed} />;
}
