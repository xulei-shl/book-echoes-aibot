import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/core/aibot/network/proxyFetch', () => ({
    fetchWithOptionalProxy: vi.fn()
}));

vi.mock('@/src/utils/logger', () => ({
    getLogger: () => ({
        info: vi.fn(),
        error: vi.fn()
    })
}));

import { extractContentFromUrl, extractContentFromUrls } from '@/src/core/aibot/jina/jinaContentExtractor';
import { fetchWithOptionalProxy } from '@/src/core/aibot/network/proxyFetch';

describe('Jina Content Extractor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('extracts content from valid URL', async () => {
        vi.mocked(fetchWithOptionalProxy).mockResolvedValue({
            ok: true,
            text: vi.fn().mockResolvedValue('Extracted full article content here...')
        } as any);

        const result = await extractContentFromUrl('https://example.com/article');

        expect(result.success).toBe(true);
        expect(result.content).toContain('Extracted full article');
        expect(result.url).toBe('https://example.com/article');
    });

    it('returns error for HTTP failure', async () => {
        vi.mocked(fetchWithOptionalProxy).mockResolvedValue({
            ok: false,
            status: 404
        } as any);

        const result = await extractContentFromUrl('https://example.com/notfound');

        expect(result.success).toBe(false);
        expect(result.error).toContain('404');
    });

    it('returns error for empty content', async () => {
        vi.mocked(fetchWithOptionalProxy).mockResolvedValue({
            ok: true,
            text: vi.fn().mockResolvedValue('')
        } as any);

        const result = await extractContentFromUrl('https://example.com/empty');

        expect(result.success).toBe(false);
        expect(result.error).toBe('空内容');
    });

    it('extracts multiple URLs concurrently', async () => {
        vi.mocked(fetchWithOptionalProxy)
            .mockResolvedValueOnce({
                ok: true,
                text: vi.fn().mockResolvedValue('Content 1')
            } as any)
            .mockResolvedValueOnce({
                ok: true,
                text: vi.fn().mockResolvedValue('Content 2')
            } as any);

        const results = await extractContentFromUrls([
            'https://example.com/1',
            'https://example.com/2'
        ], 3, 15000);

        expect(results.size).toBe(2);
        expect(results.get('https://example.com/1')?.success).toBe(true);
        expect(results.get('https://example.com/2')?.success).toBe(true);
    });

    it('handles extraction errors gracefully', async () => {
        vi.mocked(fetchWithOptionalProxy).mockRejectedValue(new Error('Network error'));

        const result = await extractContentFromUrl('https://example.com/error');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Network error');
    });
});