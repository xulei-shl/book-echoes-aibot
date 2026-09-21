#!/usr/bin/env node

/**
 * 构建期向量化：public/content 各级目录的 metadata.json 到 public/content/search_vectors.bin
 *
 * 与 build-random-index.mjs 同级、手动运行（不挂进 next build），产物提交进仓库。
 * 这样构建与部署都不需要 EMBEDDING_API_KEY，只有重建向量时才需要。
 *
 *   npm run build:vectors        （key 放在 .env / .env.local，由 npm script 加载）
 *
 * 也可被 import：build-content.mjs 在内容与随机索引写好后会自动调用 buildSearchVectors()，
 * 增量逻辑（按 hash 复用旧向量）保证它只编码新增/变更的书目。
 * EMBEDDING_MODEL / EMBEDDING_DIM 从环境读取，与运行期 lib/search/config.ts 保持同一份配置，
 * 否则建库用了 A 模型、查询期按 B 模型校验，加载向量时会 DenseIndexMismatch 降级。
 *
 * 参数（优先级高于环境变量）：
 *   --no-author-bio   不把「豆瓣作者简介」编进向量（§5.4.1 的 A/B 开关）
 *   --force           忽略增量，整库重编码
 *   --model=<id>      embedding 模型，默认取 EMBEDDING_MODEL，再退到 BAAI/bge-m3
 *   --dim=<n>         向量维度，默认取 EMBEDDING_DIM，再退到 1024
 *   --batch=<n>       每批条数，默认 32
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(PROJECT_ROOT, 'public', 'content');
const OUTPUT_PATH = path.join(CONTENT_DIR, 'search_vectors.bin');
const MAGIC = 'BKVS';
const MAX_TEXT_CHARS = 3000;
const CONCURRENCY = 2;
const MAX_RETRIES = 5;

const FIELD = {
  barcode: '书目条码',
  title: '豆瓣书名',
  subtitle: '豆瓣副标题',
  author: '豆瓣作者',
  translator: '豆瓣译者',
  publisher: '豆瓣出版社',
  pubYear: '豆瓣出版年',
  callNumber: '索书号',
  reason: '初评理由',
  summary: '豆瓣内容简介',
  authorIntro: '豆瓣作者简介'
};

function readModel() {
  return process.env.EMBEDDING_MODEL?.trim() || 'BAAI/bge-m3';
}

function readDim() {
  const value = Number(process.env.EMBEDDING_DIM);
  return Number.isFinite(value) && value > 0 ? value : 1024;
}

function defaultOptions() {
  return { authorBio: true, force: false, model: readModel(), dim: readDim(), batch: 32 };
}

function parseArgs(argv) {
  const options = defaultOptions();
  for (const arg of argv.slice(2)) {
    if (arg === '--no-author-bio') options.authorBio = false;
    else if (arg === '--force') options.force = true;
    else if (arg.startsWith('--model=')) options.model = arg.slice('--model='.length);
    else if (arg.startsWith('--dim=')) options.dim = Number(arg.slice('--dim='.length));
    else if (arg.startsWith('--batch=')) options.batch = Number(arg.slice('--batch='.length));
  }
  return options;
}

const text = (value) => (value === undefined || value === null ? '' : String(value).trim());

/** 与 lib/search/corpus.ts::contentHash 相同的 FNV-1a，用于增量比对。 */
function contentHash(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** 字段取舍见 §5.4.1：排除目录 / URL / 评分；作者简介可选且排在最后。 */
function buildEncodedText(item, options) {
  const title = text(item[FIELD.title]);
  const subtitle = text(item[FIELD.subtitle]);
  const author = text(item[FIELD.author]);
  const translator = text(item[FIELD.translator]);
  const parts = [
    `${title}${subtitle ? `：${subtitle}` : ''}`,
    `作者：${author}${translator ? ` 译者：${translator}` : ''}`,
    `${text(item[FIELD.publisher])} ${text(item[FIELD.pubYear])}  索书号：${text(item[FIELD.callNumber])}`,
    `初评理由：${text(item[FIELD.reason]).slice(0, 400)}`,
    `内容简介：${text(item[FIELD.summary]).slice(0, 2000)}`
  ];
  if (options.authorBio) {
    const authorIntro = text(item[FIELD.authorIntro]).slice(0, 400);
    if (authorIntro) parts.push(`作者简介：${authorIntro}`);
  }
  return parts
    .filter(part => part && part.trim())
    .join('\n')
    .slice(0, MAX_TEXT_CHARS);
}

async function readMetadata(filePath) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function collectFromDir(dirPath, sourceId, entries, options) {
  const raws = await readMetadata(path.join(dirPath, 'metadata.json'));
  for (const item of raws) {
    const id = text(item[FIELD.barcode]);
    if (!id) continue;
    const encoded = buildEncodedText(item, options);
    entries.push({ id, sourceId, hash: contentHash(encoded), text: encoded });
  }
}

async function walkDirectory(dirPath, visit) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    await visit(path.join(dirPath, entry.name), entry.name);
  }
}

/** 遍历目录，产出 [{ id, sourceId, hash, text }]（sourceId 与 getArchiveData 一致）。 */
async function collectEntries(options) {
  const entries = [];
  const yearDirs = (await fs.readdir(CONTENT_DIR, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && /^\d{4}$/.test(entry.name))
    .map(entry => entry.name);

  for (const year of yearDirs) {
    const yearPath = path.join(CONTENT_DIR, year);
    const dirEntries = await fs.readdir(yearPath, { withFileTypes: true });

    for (const entry of dirEntries) {
      if (
        entry.isDirectory() &&
        entry.name !== 'subject' &&
        entry.name !== 'new' &&
        entry.name !== 'literature' &&
        !entry.name.startsWith('.')
      ) {
        await collectFromDir(path.join(yearPath, entry.name), entry.name, entries, options);
      }
    }
    if (dirEntries.some(entry => entry.isDirectory() && entry.name === 'subject')) {
      await walkDirectory(path.join(yearPath, 'subject'), (dir, name) =>
        collectFromDir(dir, `${year}-subject-${name}`, entries, options)
      );
    }
    if (dirEntries.some(entry => entry.isDirectory() && entry.name === 'new')) {
      await walkDirectory(path.join(yearPath, 'new'), (dir, name) =>
        collectFromDir(dir, `${year}-sleeping-${name}`, entries, options)
      );
    }
    if (dirEntries.some(entry => entry.isDirectory() && entry.name === 'literature')) {
      await walkDirectory(path.join(yearPath, 'literature'), (dir, name) =>
        collectFromDir(dir, `${year}-literature-${name}`, entries, options)
      );
    }
  }
  return entries;
}

/** 读现有产物，返回 id → { hash, vector } 映射（用于增量跳过未变条目）。 */
async function readExisting(options) {
  try {
    const buffer = await fs.readFile(OUTPUT_PATH);
    if (buffer.byteLength < 8 || buffer.subarray(0, 4).toString('ascii') !== MAGIC) return null;
    const headerLength = buffer.readUInt32LE(4);
    const header = JSON.parse(buffer.subarray(8, 8 + headerLength).toString('utf8'));
    if (header.model !== options.model || header.dim !== options.dim) return null;
    const body = buffer.subarray(8 + headerLength);
    const existing = new Map();
    header.entries.forEach((entry, row) => {
      const start = row * header.dim * 4;
      const slice = body.subarray(start, start + header.dim * 4);
      const vector = new Float32Array(header.dim);
      new Uint8Array(vector.buffer).set(slice);
      existing.set(entry.id, { hash: entry.hash, sourceId: entry.sourceId, vector });
    });
    return existing;
  } catch {
    return null;
  }
}

function l2Normalize(vector) {
  let sum = 0;
  for (let i = 0; i < vector.length; i += 1) sum += vector[i] * vector[i];
  const norm = Math.sqrt(sum);
  if (norm > 0) for (let i = 0; i < vector.length; i += 1) vector[i] /= norm;
  return vector;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function embedBatch(config, texts, attempt = 0) {
  const response = await fetch(`${config.baseUrl}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, input: texts, encoding_format: 'base64' })
  });
  const raw = await response.text();
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500 || raw.includes('50505');
    if (retryable && attempt < MAX_RETRIES) {
      const backoff = 1000 * 2 ** attempt + Math.floor(Math.random() * 250);
      console.warn(`  ↻ HTTP ${response.status}，${backoff}ms 后重试（${attempt + 1}/${MAX_RETRIES}）`);
      await sleep(backoff);
      return embedBatch(config, texts, attempt + 1);
    }
    throw new Error(`embedding 请求失败 HTTP ${response.status}: ${raw.slice(0, 200)}`);
  }
  const body = JSON.parse(raw);
  const rows = (body.data ?? []).slice().sort((a, b) => a.index - b.index);
  return rows.map(row => {
    const bytes = Buffer.from(row.embedding, 'base64');
    const vector = new Float32Array(bytes.byteLength / 4);
    new Uint8Array(vector.buffer).set(bytes);
    return l2Normalize(vector);
  });
}

async function runWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  await buildSearchVectors(parseArgs(process.argv));
}

/**
 * 生成 / 增量更新 search_vectors.bin。
 *
 * 可被其它脚本 import 调用（build-content.mjs 在内容构建后自动刷新向量）。
 * 与 CLI 共用同一套默认值：EMBEDDING_MODEL / EMBEDDING_DIM 取自环境，参数可覆盖。
 *
 * 缺 key 或请求失败一律 throw —— 由调用方决定是中断还是只提示。
 */
async function buildSearchVectors(overrides = {}) {
  const options = { ...defaultOptions(), ...overrides };
  const apiKey = process.env.EMBEDDING_API_KEY;
  if (!apiKey) {
    throw new Error('缺少 EMBEDDING_API_KEY，无法编码。产物已提交进仓库，重建时才需要该 key。');
  }
  const config = {
    apiKey,
    baseUrl: (process.env.EMBEDDING_BASE_URL ?? 'https://api.siliconflow.cn/v1').replace(/\/+$/, ''),
    model: options.model,
    dim: options.dim
  };

  const entries = await collectEntries(options);
  console.log(`📚 采集到 ${entries.length} 条书目`);

  const existing = options.force ? null : await readExisting(options);
  const vectors = new Map();
  const pending = [];

  for (const entry of entries) {
    const reused = existing?.get(entry.id);
    if (reused && reused.hash === entry.hash && reused.vector.length === config.dim) {
      reused.sourceId = entry.sourceId;
      vectors.set(entry.id, reused.vector);
    } else {
      pending.push(entry);
    }
  }
  console.log(`🔁 复用 ${vectors.size} 条，需编码 ${pending.length} 条（增量）`);

  const batches = [];
  for (let i = 0; i < pending.length; i += options.batch) {
    batches.push(pending.slice(i, i + options.batch));
  }

  let done = 0;
  await runWithConcurrency(
    batches.map(batch => async () => {
      const output = await embedBatch(config, batch.map(entry => entry.text));
      if (output.length !== batch.length) {
        throw new Error(`返回条数不匹配：期望 ${batch.length} 实际 ${output.length}`);
      }
      batch.forEach((entry, index) => {
        if (output[index].length !== config.dim) {
          throw new Error(`维度不符：${output[index].length} ≠ ${config.dim}`);
        }
        vectors.set(entry.id, output[index]);
      });
      done += 1;
      process.stdout.write(`\r  进度 ${done}/${batches.length} 批`);
    }),
    CONCURRENCY
  );
  if (batches.length > 0) process.stdout.write('\n');

  // 与 entries 同序写入，header 里保存 id / sourceId / hash
  const header = {
    version: 1,
    model: config.model,
    dim: config.dim,
    count: entries.length,
    normalized: true,
    entries: entries.map(entry => ({ id: entry.id, sourceId: entry.sourceId, hash: entry.hash })),
    builtAt: new Date().toISOString()
  };
  const headerBytes = Buffer.from(JSON.stringify(header), 'utf8');
  const body = new Float32Array(entries.length * config.dim);
  entries.forEach((entry, row) => {
    const vector = vectors.get(entry.id);
    if (!vector) throw new Error(`缺少向量：${entry.id}`);
    body.set(vector, row * config.dim);
  });

  const prefix = Buffer.alloc(8);
  prefix.write(MAGIC, 0, 'ascii');
  prefix.writeUInt32LE(headerBytes.byteLength, 4);
  const payload = Buffer.concat([prefix, headerBytes, Buffer.from(body.buffer, body.byteOffset, body.byteLength)]);

  const tempPath = `${OUTPUT_PATH}.tmp`;
  await fs.writeFile(tempPath, payload);
  await fs.rename(tempPath, OUTPUT_PATH);

  const mb = (payload.byteLength / (1024 * 1024)).toFixed(2);
  console.log(`\n✅ 向量已生成：${OUTPUT_PATH}`);
  console.log(`   ${entries.length} 本 · ${config.dim} 维 · ${mb} MiB · 模型 ${config.model}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === __filename) {
  main().catch(error => {
    console.error('❌ 向量生成失败:', error?.message || error);
    process.exit(1);
  });
}

export { buildEncodedText, contentHash, collectEntries, buildSearchVectors };
