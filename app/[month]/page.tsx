import { promises as fs } from 'fs';
import path from 'path';
import Canvas from '@/components/Canvas';
import { Book } from '@/types';
import { transformMetadataToBook } from '@/lib/utils';

export const revalidate = 3600;
export const dynamic = 'force-static';

interface PageProps {
    params: Promise<{
        month: string;
    }>;
}

// 辅助函数：从目录中提取md文件的中文标题
async function extractSubjectLabel(dirPath: string): Promise<string | null> {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const mdFile = entries.find(e => e.isFile() && e.name.endsWith('.md') && !e.name.toLowerCase().startsWith('readme'));
        if (mdFile) {
            const fileName = mdFile.name.replace(/\.md$/, '');
            // 提取冒号前的主标题
            const mainTitle = fileName.split(/[：:]/)[0].trim();
            return mainTitle || fileName;
        }
    } catch {
        // 忽略错误
    }
    return null;
}

interface MonthDataResult {
    books: Book[];
    subjectLabel?: string;  // 主题卡的中文标题
}

// Function to get data for a specific month
async function getMonthData(month: string): Promise<MonthDataResult> {
    let filePath = '';
    let subjectDirPath = '';  // 用于主题卡读取md文件

    const subjectMatch = month.match(/^(\d{4})-subject-(.+)$/);
    const sleepingMatch = month.match(/^(\d{4})-sleeping-(.+)$/);

    if (subjectMatch) {
        const [_, year, name] = subjectMatch;
        // name is already decoded from the URL parameter, no need to decode again
        subjectDirPath = path.join(process.cwd(), 'public', 'content', year, 'subject', name);
        filePath = path.join(subjectDirPath, 'metadata.json');

        try {
            await fs.access(filePath);
        } catch (_accessError) {
            const encodedName = encodeURIComponent(name);
            const encodedDirPath = path.join(process.cwd(), 'public', 'content', year, 'subject', encodedName);
            const encodedPath = path.join(encodedDirPath, 'metadata.json');
            try {
                await fs.access(encodedPath);
                filePath = encodedPath;
                subjectDirPath = encodedDirPath;
            } catch (encodedError) {
                console.error('[SubjectData] metadata.json路径解析失败', encodedError);
            }
        }
    } else if (sleepingMatch) {
        const [_, year, name] = sleepingMatch;
        // name is already decoded from the URL parameter, no need to decode again
        filePath = path.join(process.cwd(), 'public', 'content', year, 'new', name, 'metadata.json');
    } else {
        const monthMatch = month.match(/^(\d{4})-\d{2}$/);
        if (monthMatch) {
            const year = monthMatch[1];
            filePath = path.join(process.cwd(), 'public', 'content', year, month, 'metadata.json');
        } else if (month === 'new') {
            // Special handling for 'new' directory - it doesn't have metadata.json directly
            // Return empty result as 'new' itself is not a valid content directory
            return { books: [] };
        } else {
            // Fallback
            filePath = path.join(process.cwd(), 'public', 'content', month, 'metadata.json');
        }
    }

    try {
        const fileContents = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(fileContents);
        const books = data.map((item: any) => transformMetadataToBook(item, month));

        // 如果是主题卡，提取md文件中的中文标题
        let subjectLabel: string | undefined;
        if (subjectDirPath) {
            subjectLabel = await extractSubjectLabel(subjectDirPath) || undefined;
        }

        return { books, subjectLabel };
    } catch (error) {
        console.error(`Error loading data for month ${month}:`, error);
        return { books: [] };
    }
}

export default async function MonthPage({ params }: PageProps) {
    const { month } = await params;
    // Decode month param just in case
    const decodedMonth = decodeURIComponent(month);

    const { books, subjectLabel } = await getMonthData(decodedMonth);

    if (!books || books.length === 0) {
        return (
            <div className="flex items-center justify-center h-screen bg-[var(--background)] text-[var(--foreground)]">
                <h1 className="font-display text-2xl">Month not found or empty</h1>
            </div>
        );
    }

    return <Canvas books={books} month={decodedMonth} subjectLabel={subjectLabel} />;
}

export async function generateStaticParams() {
    const contentDir = path.join(process.cwd(), 'public', 'content');
    const params: { month: string }[] = [];

    try {
        const yearEntries = await fs.readdir(contentDir, { withFileTypes: true });
        const yearDirs = yearEntries
            .filter(entry => entry.isDirectory() && /^\d{4}$/.test(entry.name))
            .map(entry => entry.name);

        for (const year of yearDirs) {
            const yearPath = path.join(contentDir, year);
            const entries = await fs.readdir(yearPath, { withFileTypes: true });

            // Months
            entries
                .filter(e => e.isDirectory() && e.name !== 'subject' && e.name !== 'new' && !e.name.startsWith('.'))
                .forEach(e => params.push({ month: e.name }));

            // Subjects
            const subjectDirEntry = entries.find(e => e.isDirectory() && e.name === 'subject');
            if (subjectDirEntry) {
                const subjectPath = path.join(yearPath, 'subject');
                const subjectEntries = await fs.readdir(subjectPath, { withFileTypes: true });
                subjectEntries
                    .filter(e => e.isDirectory())
                    .forEach(e => {
                        const route = `${year}-subject-${encodeURIComponent(e.name)}`;
                        params.push({ month: route });
                    });
            }

            // Sleeping Beauties (new)
            const sleepingDirEntry = entries.find(e => e.isDirectory() && e.name === 'new');
            if (sleepingDirEntry) {
                const sleepingPath = path.join(yearPath, 'new');
                const sleepingEntries = await fs.readdir(sleepingPath, { withFileTypes: true });
                sleepingEntries
                    .filter(e => e.isDirectory())
                    .forEach(e => params.push({ month: `${year}-sleeping-${e.name}` }));
            }
        }
    } catch (e) {
        console.error("Error generating static params:", e);
    }
    return params;
}
