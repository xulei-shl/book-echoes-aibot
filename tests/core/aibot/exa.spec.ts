import { describe, expect, it, vi } from 'vitest';
import { parseMcpResult, parseExaTextResult } from '@/src/core/aibot/exa/exaMcpResearcher';

vi.mock('@/src/utils/logger', () => ({
    getLogger: () => ({
        info: vi.fn(),
        error: vi.fn()
    })
}));

describe('Exa MCP - parseMcpResult', () => {
    it('parses JSON array from text content', () => {
        const result = parseMcpResult({
            content: [
                { type: 'text', text: JSON.stringify([
                    { title: 'Book A', url: 'https://example.com/a', snippet: 'Content A' },
                    { title: 'Book B', url: 'https://example.com/b', snippet: 'Content B' }
                ])}
            ]
        });

        expect(result).toHaveLength(2);
        expect(result[0].title).toBe('Book A');
        expect(result[0].url).toBe('https://example.com/a');
    });

    it('handles single JSON object in text', () => {
        const result = parseMcpResult({
            content: [
                { type: 'text', text: JSON.stringify({ title: 'Single', url: 'https://single.com' }) }
            ]
        });

        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('Single');
    });

    it('falls back to plain text when not JSON', () => {
        const result = parseMcpResult({
            content: [
                { type: 'text', text: 'Plain text result' }
            ]
        });

        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('Plain text result');
        expect(result[0].snippet).toBe('Plain text result');
    });

    it('handles JSON data field with array', () => {
        const result = parseMcpResult({
            content: [
                { type: 'json', data: [
                    { title: 'Data Result', url: 'https://data.com', snippet: 'From data' }
                ]}
            ]
        });

        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('Data Result');
    });

    it('handles single object in data field', () => {
        const result = parseMcpResult({
            content: [
                { type: 'json', data: { title: 'Single Data', url: 'https://sd.com' } }
            ]
        });

        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('Single Data');
    });

    it('handles empty content', () => {
        const result = parseMcpResult({ content: [] });
        expect(result).toHaveLength(0);
    });

    it('handles undefined content', () => {
        const result = parseMcpResult({});
        expect(result).toHaveLength(0);
    });

    it('applies fallback title for missing title', () => {
        const result = parseMcpResult({
            content: [
                { type: 'text', text: JSON.stringify([{ url: 'https://test.com' }]) }
            ]
        });

        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('Exa 结果 1');
    });

    it('applies default snippet for missing snippet', () => {
        const result = parseMcpResult({
            content: [
                { type: 'text', text: JSON.stringify([{ title: 'Test', url: 'https://test.com' }]) }
            ]
        });

        expect(result[0].snippet).toBe('暂无摘要');
    });

    it('parses the Exa text result format into multiple snippets', () => {
        const text = [
            'Title: 结果一',
            'URL: https://example.com/1',
            'Published: 2024-01-01T00:00:00.000Z',
            'Author: N/A',
            'Highlights:',
            '第一段摘要内容',
            '',
            '---',
            '',
            'Title: 结果二',
            'URL: https://example.com/2',
            'Published: 2024-02-02T00:00:00.000Z',
            'Author: 作者',
            'Highlights:',
            '第二段摘要内容'
        ].join('\n');

        const result = parseExaTextResult(text);

        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({
            title: '结果一',
            url: 'https://example.com/1',
            snippet: '第一段摘要内容'
        });
        expect(result[1]).toMatchObject({
            title: '结果二',
            url: 'https://example.com/2',
            snippet: '第二段摘要内容'
        });
    });

    it('parses Exa text content through parseMcpResult', () => {
        const result = parseMcpResult({
            content: [{
                type: 'text',
                text: 'Title: 结果一\nURL: https://example.com/1\nHighlights:\n摘要内容'
            }]
        });

        expect(result).toHaveLength(1);
        expect(result[0].url).toBe('https://example.com/1');
        expect(result[0].snippet).toBe('摘要内容');
    });
});