#!/usr/bin/env node

/**
 * 生成随机漫步索引文件
 * 输出: public/content/random_index.json
 *
 * 每条记录现在携带三档图片与原始尺寸：
 *   - thumbnailUrl   卡片裁切缩略图（竖版 400px，约 40KB），检索/封面场景用
 *   - placeholderUrl 原图的等比缩略图（约 21KB），随机页做即时占位/兜底
 *   - imageUrl       原图（PNG，0.5–1.1MB），保真兜底
 *   - displayUrl     原图的 WebP 显示版（最长边 800px，约 60–120KB），随机页首选
 *   - width / height 原图像素尺寸，供前端在图片到达前按比例占位，消除瀑布流跳动
 *
 * displayUrl 属于「重编码产物」，需要可写的 R2，因此**默认不生成**（留空、前端
 * 回退到 placeholderUrl）。要启用时显式加 `--with-images`：会把原图重编码为 WebP
 * 并上传回 R2（新增对象，不覆盖原图），随后写入索引。默认关闭是为了避免日常内容
 * 构建里意外触发一次全量原图重编码与上传。生成按原图实际内容进行，横竖版比例都保留。
 *
 * 用法:
 *   node scripts/build-random-index.mjs                 # 只刷新索引（原图走占位图）
 *   node scripts/build-random-index.mjs --with-images   # 额外生成并上传原图 WebP 显示图（需可写 R2）
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  loadEnvFiles,
  createR2Config,
  buildDisplayKey,
  probeImageSize,
  generateOriginalDisplay,
  uploadDisplay
} from './lib/original-display.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(PROJECT_ROOT, 'public', 'content');
const OUTPUT_PATH = path.join(CONTENT_DIR, 'random_index.json');

const FIELD_BARCODE = '书目条码';
const FIELD_TITLE = '豆瓣书名';

/** 重编码/尺寸探测的并发度，避免一次性打满网络与 CPU。 */
const CONCURRENCY = 8;

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
  } catch {
    console.warn(`⚠️  读取失败: ${filePath}`);
    return [];
  }
}

/** 从 metadata 条目提取原始字段，暂不做重编码（需要网络，放到后面统一处理）。 */
function buildRawItem(sourceId, item) {
  const barcode = pickFirstString(item?.[FIELD_BARCODE]);
  if (!barcode) {
    return null;
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
  // 原图的等比轻量版：优先 originalThumbnailUrl，缺失时退到卡片缩略图
  const placeholderUrl = pickFirstString(
    item?.originalThumbnailUrl,
    item?.cardThumbnailUrl,
    thumbnailUrl,
    imageUrl
  );

  return {
    id: barcode,
    title,
    sourceId,
    month: sourceId,
    thumbnailUrl,
    imageUrl,
    placeholderUrl,
    originalImageUrl: pickFirstString(item?.originalImageUrl)
  };
}

function buildIndexItems(sourceId, metadataItems) {
  const items = [];
  for (const item of metadataItems) {
    const raw = buildRawItem(sourceId, item);
    if (raw) {
      items.push(raw);
    }
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

async function collectRawItems() {
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

  return indexItems;
}

async function loadPreviousIndex() {
  try {
    const content = await fs.readFile(OUTPUT_PATH, 'utf8');
    const data = JSON.parse(content);
    if (!Array.isArray(data)) {
      return new Map();
    }
    return new Map(data.map(item => [`${String(item?.sourceId ?? '')}|${String(item?.id ?? '')}`, item]));
  } catch {
    return new Map();
  }
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * 为单条记录解析显示图与原始尺寸。
 *
 * 只有原图内容不变时才复用上一次的结果，避免每次构建都重新下载/上传全量原图；
 * 语料增量时只处理新增或变更的条目。
 */
async function resolveDisplay(rawItem, pipeline, previous) {
  const reusable = previous
    && previous.placeholderUrl === rawItem.placeholderUrl
    && Number(previous.width) > 0
    && Number(previous.height) > 0;
  if (reusable) {
    return {
      displayUrl: pickFirstString(previous.displayUrl),
      width: Number(previous.width),
      height: Number(previous.height),
      reused: true,
      generated: false
    };
  }

  if (pipeline.shouldUpload && rawItem.originalImageUrl) {
    const key = buildDisplayKey(rawItem.originalImageUrl);
    if (key) {
      try {
        const { buffer, width, height } = await generateOriginalDisplay(rawItem.originalImageUrl);
        const displayUrl = await uploadDisplay(pipeline, key, buffer);
        if (displayUrl) {
          return { displayUrl, width, height, reused: false, generated: true };
        }
      } catch (error) {
        console.warn(`⚠️  原图重编码失败 ${rawItem.id}: ${error?.message || error}`);
      }
    }
  }

  const size = await probeImageSize(rawItem.placeholderUrl);
  return {
    displayUrl: '',
    width: size?.width ?? 0,
    height: size?.height ?? 0,
    reused: false,
    generated: false
  };
}

async function buildRandomIndex(options = {}) {
  await loadEnvFiles();
  const r2Config = createR2Config();
  // 只认显式传入的选项：build-content 内部调用时不传，因此永远不会补写 R2；
  // 只有单独跑 `node scripts/build-random-index.mjs --with-images` 才启用重编码。
  const withImages = Boolean(options.withImages);
  const pipeline = { ...r2Config, shouldUpload: r2Config.shouldUpload && withImages };
  if (!withImages) {
    console.log('ℹ️  默认仅刷新索引；如需把原图重编码为 WebP 显示图，加 --with-images（需可写 R2）\n');
  } else if (!r2Config.shouldUpload) {
    console.log('⚠️  已指定 --with-images，但 R2 不可写（缺少配置或 UPLOAD_TO_R2=false），显示图将回退为占位图\n');
  }

  const previous = await loadPreviousIndex();
  const rawItems = await collectRawItems();

  let generated = 0;
  let reused = 0;
  const resolved = await mapWithConcurrency(rawItems, CONCURRENCY, async (rawItem) => {
    const previousItem = previous.get(`${rawItem.sourceId}|${rawItem.id}`);
    const display = await resolveDisplay(rawItem, pipeline, previousItem);
    if (display.generated) {
      generated += 1;
    } else if (display.reused) {
      reused += 1;
    }
    return {
      id: rawItem.id,
      title: rawItem.title,
      sourceId: rawItem.sourceId,
      month: rawItem.month,
      thumbnailUrl: rawItem.thumbnailUrl,
      imageUrl: rawItem.imageUrl,
      placeholderUrl: rawItem.placeholderUrl,
      displayUrl: display.displayUrl,
      width: display.width,
      height: display.height
    };
  });

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(resolved, null, 2), 'utf8');
  console.log(`\n🧭 随机索引已生成：${OUTPUT_PATH}`);
  console.log(`   共计 ${resolved.length} 条记录`);
  console.log(`   原图显示图：新生成 ${generated} 条，复用 ${reused} 条，占用位图 ${resolved.length - generated - reused} 条\n`);
}

async function main() {
  try {
    await buildRandomIndex({ withImages: process.argv.includes('--with-images') });
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
