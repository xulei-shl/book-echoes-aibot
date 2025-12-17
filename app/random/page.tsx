import { getAllBooksRandomized } from '@/lib/content';
import { transformMetadataToBook } from '@/lib/utils';
import RandomMasonry from '@/components/RandomMasonry';
import { Metadata } from 'next';

export const revalidate = 3600;

export const metadata: Metadata = {
    title: '随机漫步 | 书海回响',
    description: '在无尽的书海中偶遇你的下一本读物。',
};

export default async function RandomPage() {
    const rawBooks = await getAllBooksRandomized();

    // Transform raw books to frontend Book type
    // Note: rawBook.sourceId is injected by getAllBooksRandomized
    const books = rawBooks.map(rawBook => transformMetadataToBook(rawBook, rawBook.sourceId));

    return <RandomMasonry initialBooks={books} />;
}
