import { describe, it, expect } from 'vitest';
import { getRandomBooksFromIndex, RandomIndexItem } from '@/lib/content';

function buildItems(count: number): RandomIndexItem[] {
    return Array.from({ length: count }).map((_, index) => ({
        id: `id-${index + 1}`,
        title: `标题-${index + 1}`,
        sourceId: '2026-01',
        month: '2026-01',
        thumbnailUrl: `/thumb-${index + 1}.jpg`,
        imageUrl: `/image-${index + 1}.jpg`
    }));
}

describe('getRandomBooksFromIndex', () => {
    it('支持分页游标并保持不重复', () => {
        const items = buildItems(6);
        const first = getRandomBooksFromIndex(items, 2, undefined, 123);
        const second = getRandomBooksFromIndex(items, 2, first.nextCursor, 123);

        expect(first.items).toHaveLength(2);
        expect(second.items).toHaveLength(2);
        const firstIds = new Set(first.items.map(item => item.id));
        second.items.forEach(item => {
            expect(firstIds.has(item.id)).toBe(false);
        });
        expect(first.nextCursor).toBe('2');
        expect(second.nextCursor).toBe('4');
    });

    it('游标越界时返回空数据', () => {
        const items = buildItems(3);
        const result = getRandomBooksFromIndex(items, 2, '10', 1);
        expect(result.items).toHaveLength(0);
        expect(result.nextCursor).toBeUndefined();
    });

    it('同一 seed 结果稳定', () => {
        const items = buildItems(5);
        const first = getRandomBooksFromIndex(items, 3, undefined, 42);
        const second = getRandomBooksFromIndex(items, 3, undefined, 42);
        expect(first.items.map(item => item.id)).toEqual(second.items.map(item => item.id));
    });
});
