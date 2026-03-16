import { getRandomBooks } from '@/lib/content';

export const revalidate = 3600;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get('limit') ?? 18);
    const cursor = searchParams.get('cursor') ?? undefined;
    const seedParam = searchParams.get('seed');
    const seed = seedParam ? Number(seedParam) : undefined;

    const data = await getRandomBooks(limit, cursor, seed);
    return Response.json(data);
}
