import type { BookInfo } from '@/src/core/aibot/types';

/**
 * 将选中的图书信息格式化为二次检索的输入文本
 * @param books 选中的图书列表
 * @param originalQuery 原始查询文本
 * @returns 格式化后的文本，用于填充输入框
 */
export function formatBooksForSecondarySearch(
    books: BookInfo[],
    originalQuery: string
): string {
    if (books.length === 0) {
        return originalQuery;
    }

    const bookInfoList = books.map((book, index) => {
        const parts = [`【${index + 1}】《${book.title}》`];

        if (book.author) {
            parts.push(`作者: ${book.author}`);
        }

        if (book.description) {
            // 限制描述长度，避免输入框文本过长
            const shortDesc =
                book.description.length > 100
                    ? book.description.slice(0, 100) + '...'
                    : book.description;
            parts.push(`简介: ${shortDesc}`);
        }

        return parts.join('\n');
    });

    return `基于以下图书继续检索：

${bookInfoList.join('\n\n')}

原始需求：${originalQuery}

请继续深入检索相关图书`;
}
