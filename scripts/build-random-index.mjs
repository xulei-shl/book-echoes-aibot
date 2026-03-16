#!/usr/bin/env node

/**
 * 生成随机漫步索引文件
 * 输出: public/content/random_index.json
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(PROJECT_ROOT, 'public', 'content');
const OUTPUT_PATH = path.join(CONTENT_DIR, 'random_index.json');

const FIELD_BARCODE = '书目条码';
const FIELD_TITLE = '豆瓣书名';

function pickFirstString(...values) {
  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }
    const text = String(value).trim();
    if (text) {
      return text;
    }
  }
  return '';
}

function buildLegacyCardImagePath(sourceId, barcode) {
  return `/api/images/${sourceId}/${barcode}/card`;
}

function buildLegacyCardThumbnailPath(sourceId, barcode) {
  const subjectMatch = sourceId.match(/^(\d{4})-subject-(.+)$/);
  if (subjectMatch) {
    const [, year, name] = subjectMatch;
    return `/content/${year}/subject/${name}/${barcode}/${barcode}_thumb.jpg`;
  }

  const literatureMatch = sourceId.match(/^(\d{4})-literature-(.+)$/);
  if (literatureMatch) {
    const [, year, name] = literatureMatch;
    return `/content/${year}/literature/${name}/${barcode}/${barcode}_thumb.jpg`;
  }

  const sleepingMatch = sourceId.match(/^(\d{4})-sleeping-(.+)$/);
  if (sleepingMatch) {
    const [, year, name] = sleepingMatch;
    return `/content/${year}/new/${name}/${barcode}/${barcode}_thumb.jpg`;
  }

  const monthMatch = sourceId.match(/^(\d{4})-\d{2}$/);
  if (monthMatch) {
    const year = monthMatch[1];
    return `/content/${year}/${sourceId}/${barcode}/${barcode}_thumb.jpg`;
  }

  return `/content/${sourceId}/${barcode}/${barcode}_thumb.jpg`;
}

async function readMetadata(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(content);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn(`⚠️  读取失败: ${filePath}`);
    return [];
  }
}

function buildIndexItems(sourceId, metadataItems) {
  const items = [];
  for (const item of metadataItems) {
    const barcode = pickFirstString(item?.[FIELD_BARCODE]);
    if (!barcode) {
      continue;
    }
    const title = pickFirstString(item?.[FIELD_TITLE]);
    const thumbnailUrl = pickFirstString(
      item?.cardThumbnailUrl,
      item?.cardImageUrl,
      item?.coverThumbnailUrl,
      item?.coverImageUrl,
      buildLegacyCardThumbnailPath(sourceId, barcode)
    );
    const imageUrl = pickFirstString(
      item?.originalImageUrl,
      item?.cardImageUrl,
      item?.coverImageUrl,
      item?.originalThumbnailUrl,
      item?.cardThumbnailUrl,
      thumbnailUrl,
      buildLegacyCardImagePath(sourceId, barcode)
    );

    items.push({
      id: barcode,
      title,
      sourceId,
      month: sourceId,
      thumbnailUrl,
      imageUrl
    });
  }
  return items;
}

async function collectFromDir(dirPath, sourceId) {
  const metadataPath = path.join(dirPath, 'metadata.json');
  const metadataItems = await readMetadata(metadataPath);
  return buildIndexItems(sourceId, metadataItems);
}

function buildSubjectSourceId(year, name) {
  return `${year}-subject-${encodeURIComponent(name)}`;
}

function buildLiteratureSourceId(year, name) {
  return `${year}-literature-${encodeURIComponent(name)}`;
}

function buildSleepingSourceId(year, name) {
  return `${year}-sleeping-${name}`;
}

async function buildRandomIndex() {
  const indexItems = [];
  const yearEntries = await fs.readdir(CONTENT_DIR, { withFileTypes: true });
  const yearDirs = yearEntries.filter(entry => entry.isDirectory() && /^\d{4}$/.test(entry.name));

  for (const yearDir of yearDirs) {
    const year = yearDir.name;
    const yearPath = path.join(CONTENT_DIR, year);
    const entries = await fs.readdir(yearPath, { withFileTypes: true });

    // 月份目录
    const monthDirs = entries.filter(entry => entry.isDirectory() && entry.name !== 'subject' && entry.name !== 'new' && entry.name !== 'literature' && !entry.name.startsWith('.'));
    for (const monthDir of monthDirs) {
      const sourceId = monthDir.name;
      const dirPath = path.join(yearPath, monthDir.name);
      const items = await collectFromDir(dirPath, sourceId);
      indexItems.push(...items);
    }

    // 主题卡目录
    const subjectEntry = entries.find(entry => entry.isDirectory() && entry.name === 'subject');
    if (subjectEntry) {
      const subjectPath = path.join(yearPath, 'subject');
      const subjectDirs = await fs.readdir(subjectPath, { withFileTypes: true });
      for (const subEntry of subjectDirs.filter(entry => entry.isDirectory())) {
        const sourceId = buildSubjectSourceId(year, subEntry.name);
        const dirPath = path.join(subjectPath, subEntry.name);
        const items = await collectFromDir(dirPath, sourceId);
        indexItems.push(...items);
      }
    }

    // 睡美人目录
    const sleepingEntry = entries.find(entry => entry.isDirectory() && entry.name === 'new');
    if (sleepingEntry) {
      const sleepingPath = path.join(yearPath, 'new');
      const sleepingDirs = await fs.readdir(sleepingPath, { withFileTypes: true });
      for (const subEntry of sleepingDirs.filter(entry => entry.isDirectory())) {
        const sourceId = buildSleepingSourceId(year, subEntry.name);
        const dirPath = path.join(sleepingPath, subEntry.name);
        const items = await collectFromDir(dirPath, sourceId);
        indexItems.push(...items);
      }
    }

    // 文学FM目录
    const literatureEntry = entries.find(entry => entry.isDirectory() && entry.name === 'literature');
    if (literatureEntry) {
      const literaturePath = path.join(yearPath, 'literature');
      const literatureDirs = await fs.readdir(literaturePath, { withFileTypes: true });
      for (const subEntry of literatureDirs.filter(entry => entry.isDirectory())) {
        const sourceId = buildLiteratureSourceId(year, subEntry.name);
        const dirPath = path.join(literaturePath, subEntry.name);
        const items = await collectFromDir(dirPath, sourceId);
        indexItems.push(...items);
      }
    }
  }

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(indexItems, null, 2), 'utf8');
  console.log(`\n🧭 随机索引已生成：${OUTPUT_PATH}`);
  console.log(`   共计 ${indexItems.length} 条记录\n`);
}

async function main() {
  try {
    await buildRandomIndex();
  } catch (error) {
    console.error('❌ 随机索引生成失败:', error?.message || error);
    process.exit(1);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && invokedPath === __filename) {
  main();
}

export { buildRandomIndex };
