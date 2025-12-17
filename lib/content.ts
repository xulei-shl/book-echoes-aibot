import { promises as fs } from 'fs';
import path from 'path';
import { legacyCardThumbnailPath, resolveImageUrl } from '@/lib/assets';

export interface Book {
  '书目条码': string | number;
  '豆瓣书名': string;
  '豆瓣副标题'?: string;
  '豆瓣作者'?: string;
  '豆瓣出版社'?: string;
  '豆瓣出版年'?: number | string;
  cardImageUrl?: string;
  cardThumbnailUrl?: string;
  coverImageUrl?: string;
  coverThumbnailUrl?: string;
  originalImageUrl?: string;
  originalThumbnailUrl?: string;
  [key: string]: any;
}

export interface ArchiveItem {
  id: string;          // Folder name, e.g., "2025-08" or "ScienceFiction"
  label: string;       // Display name, e.g., "二零二五年 八月" or "科幻"
  type: 'month' | 'subject' | 'sleeping_beauty';
  previewCards: string[];
  bookCount: number;
  books: Book[];
  vol?: string;        // Specific to months, e.g., "Vol. 12"
}

export interface YearArchiveData {
  year: string;
  months: ArchiveItem[];
  subjects: ArchiveItem[];
  sleepingBeauties: ArchiveItem[];
}

// Keep MonthData for backward compatibility, alias to ArchiveItem (or subset)
export type MonthData = ArchiveItem;

// Helper to format month label
function formatMonthLabel(year: string, month: string): string {
  const yearCN = year.split('').map(d => '零一二三四五六七八九'[parseInt(d)]).join('');
  const monthCN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'][parseInt(month) - 1];
  return `${yearCN}年 ${monthCN}月`;
}

// 辅助函数：从目录中提取md文件的中文标题
async function extractSubjectLabelFromMd(dirPath: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    // 查找.md文件（排除README等）
    const mdFile = entries.find(e => e.isFile() && e.name.endsWith('.md') && !e.name.toLowerCase().startsWith('readme'));
    if (mdFile) {
      // 从文件名提取标题，去掉.md后缀
      const fileName = mdFile.name.replace(/\.md$/, '');
      // 提取冒号/分号前的主标题（如果有的话）
      const mainTitle = fileName.split(/[：:]/)[0].trim();
      return mainTitle || fileName;
    }
  } catch (e) {
    // 忽略错误，返回null使用默认label
  }
  return null;
}

// Helper to process a directory and return an ArchiveItem
async function processArchiveItem(
  dirPath: string,
  id: string,
  type: 'month' | 'subject' | 'sleeping_beauty',
  year: string
): Promise<ArchiveItem | null> {
  try {
    const metadataPath = path.join(dirPath, 'metadata.json');
    const metadataContent = await fs.readFile(metadataPath, 'utf8');
    const books: Book[] = JSON.parse(metadataContent);

    // Randomly select 4-6 books for collage preview
    const numToShow = Math.min(books.length, Math.floor(Math.random() * 3) + 4);
    const shuffled = [...books].sort(() => Math.random() - 0.5);
    const booksToShow = shuffled.slice(0, numToShow);

    const previewCards = booksToShow.map((book: Book) => {
      const bookId = String(book['书目条码']);
      const candidate = book.cardThumbnailUrl || book.cardImageUrl;
      return resolveImageUrl(candidate, legacyCardThumbnailPath(id, bookId));
    });

    let label = id;
    let vol = undefined;

    if (type === 'month') {
      const parts = id.split('-');
      if (parts.length === 2) {
        label = formatMonthLabel(parts[0], parts[1]);
      }
    } else if (type === 'subject') {
      // 主题卡：优先从md文件名提取中文标题
      const mdLabel = await extractSubjectLabelFromMd(dirPath);
      if (mdLabel) {
        label = mdLabel;
      } else {
        // 降级：从ID中提取
        const parts = id.split('-subject-');
        label = parts.length > 1 ? parts[1] : id;
      }
    } else if (type === 'sleeping_beauty') {
      // Extract name from ID: {year}-sleeping-{name}
      const parts = id.split('-sleeping-');
      label = parts.length > 1 ? parts[1] : id;
    }

    return {
      id,
      label,
      type,
      previewCards,
      bookCount: books.length,
      books,
      vol
    };
  } catch (e) {
    console.warn(`Could not load metadata for ${id} in ${dirPath}:`, e);
    return null;
  }
}

export async function getArchiveData(): Promise<YearArchiveData[]> {
  const contentDir = path.join(process.cwd(), 'public', 'content');
  const years: YearArchiveData[] = [];

  try {
    const yearEntries = await fs.readdir(contentDir, { withFileTypes: true });
    // Filter for year directories (4 digits)
    const yearDirs = yearEntries
      .filter(entry => entry.isDirectory() && /^\d{4}$/.test(entry.name))
      .map(entry => entry.name)
      .sort((a, b) => b.localeCompare(a)); // Newest year first

    for (const year of yearDirs) {
      const yearPath = path.join(contentDir, year);
      const entries = await fs.readdir(yearPath, { withFileTypes: true });

      const monthPromises: Promise<ArchiveItem | null>[] = [];
      const subjectPromises: Promise<ArchiveItem | null>[] = [];
      const sleepingPromises: Promise<ArchiveItem | null>[] = [];

      // Check for 'subject' folder
      const subjectDirEntry = entries.find(e => e.isDirectory() && e.name === 'subject');
      if (subjectDirEntry) {
        const subjectPath = path.join(yearPath, 'subject');
        const subjectEntries = await fs.readdir(subjectPath, { withFileTypes: true });

        for (const subEntry of subjectEntries) {
          if (subEntry.isDirectory()) {
            // Use a unique ID for subjects: {year}-subject-{name}
            const subjectId = `${year}-subject-${subEntry.name}`;
            subjectPromises.push(processArchiveItem(
              path.join(subjectPath, subEntry.name),
              subjectId,
              'subject',
              year
            ));
          }
        }
      }

      // Check for 'sleeping_beauty' folder (mapped to 'new' directory)
      const sleepingDirEntry = entries.find(e => e.isDirectory() && e.name === 'new');
      if (sleepingDirEntry) {
        const sleepingPath = path.join(yearPath, 'new');
        const sleepingEntries = await fs.readdir(sleepingPath, { withFileTypes: true });

        // Sort sleeping beauties by month (descending order: 12, 11, ..., 01) to match months
        const sortedSleepingEntries = sleepingEntries
          .filter(e => e.isDirectory())
          .sort((a, b) => b.name.localeCompare(a.name));

        for (const subEntry of sortedSleepingEntries) {
          // Use a unique ID: {year}-sleeping-{name}
          const sleepingId = `${year}-sleeping-${subEntry.name}`;
          sleepingPromises.push(processArchiveItem(
            path.join(sleepingPath, subEntry.name),
            sleepingId,
            'sleeping_beauty',
            year
          ));
        }
      }

      // Process month folders
      const monthEntries = entries.filter(e => e.isDirectory() && e.name !== 'subject' && e.name !== 'new' && !e.name.startsWith('.'));
      // Sort months descending
      monthEntries.sort((a, b) => b.name.localeCompare(a.name));

      monthEntries.forEach((entry) => {
        monthPromises.push(processArchiveItem(
          path.join(yearPath, entry.name),
          entry.name,
          'month',
          year
        ));
      });

      const months = (await Promise.all(monthPromises)).filter((item): item is ArchiveItem => item !== null);
      const subjects = (await Promise.all(subjectPromises)).filter((item): item is ArchiveItem => item !== null);
      const sleepingBeauties = (await Promise.all(sleepingPromises)).filter((item): item is ArchiveItem => item !== null);

      years.push({
        year,
        months,
        subjects,
        sleepingBeauties
      });
    }
  } catch (e) {
    console.error("Error reading archive data:", e);
  }

  return years;
}

export async function getMonths(): Promise<MonthData[]> {
  const archiveData = await getArchiveData();

  // Flatten all months from all years
  let allMonths: ArchiveItem[] = [];
  archiveData.forEach(yearData => {
    allMonths.push(...yearData.months);
  });

  // Sort by ID (date) descending
  allMonths.sort((a, b) => b.id.localeCompare(a.id));

  // Assign Vol numbers (Newest is Vol. N, Oldest is Vol. 1)
  const totalMonths = allMonths.length;
  return allMonths.map((item, index) => ({
    ...item,
    vol: `Vol. ${totalMonths - index}`
  }));
}

export async function getAboutContent() {
  const aboutPath = path.join(process.cwd(), 'public', 'About.md');
  try {
    return await fs.readFile(aboutPath, 'utf8');
  } catch (e) {
    console.warn('Failed to load About content:', e);
    return '';
  }
}

export async function getAllBooksRandomized(): Promise<Book[]> {
  const archiveData = await getArchiveData();
  const allBooks: Book[] = [];

  archiveData.forEach(yearData => {
    // Helper to process items
    const processItems = (items: ArchiveItem[]) => {
      items.forEach(item => {
        item.books.forEach(book => {
          // Inject sourceId for routing
          allBooks.push({
            ...book,
            sourceId: item.id
          });
        });
      });
    };

    processItems(yearData.months);
    processItems(yearData.subjects);
    processItems(yearData.sleepingBeauties);
  });

  // Shuffle the books
  return allBooks.sort(() => Math.random() - 0.5);
}
