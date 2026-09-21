import { promises as fs } from 'node:fs';
import {
  QUERY_VECTOR_CACHE_SIZE,
  VECTORS_PATH,
  readEmbeddingConfig,
  type EmbeddingConfig
} from './config';
import type { ScoredDoc } from './types';

/**
 * 稠密向量 lane：`search_vectors.bin`（构建期产物，已提交进仓库）+ 查询期一次远程 embed。
 *
 * 443–5000 本用进程内暴力余弦，不需要向量数据库，也不需要 ANN（§5.4.3）。
 */

const MAGIC = 'BKVS';

export class DenseIndexMismatch extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DenseIndexMismatch';
  }
}

export interface VectorIndex {
  ids: string[];
  sourceIds: string[];
  hashes: string[];
  dim: number;
  model: string;
  count: number;
  /** rows * dim，已 L2 归一化（余弦 = 点积） */
  vectors: Float32Array;
}

interface VectorHeader {
  version: number;
  model: string;
  dim: number;
  count: number;
  normalized: boolean;
  entries: { id: string; sourceId: string; hash: string }[];
  builtAt: string;
}

export interface VectorExpectation {
  model: string;
  dim: number;
  count?: number;
}

/**
 * 解析向量文件并做一致性硬校验（§5.4.5）：
 * 绝不允许静默地拿 512 维旧文件去和 1024 维 query 算余弦。
 */
export function parseVectorFile(buffer: Uint8Array, expect: VectorExpectation): VectorIndex {
  if (buffer.byteLength < 8) {
    throw new DenseIndexMismatch('向量文件过短，不是合法产物');
  }
  const magic = String.fromCharCode(buffer[0], buffer[1], buffer[2], buffer[3]);
  if (magic !== MAGIC) {
    throw new DenseIndexMismatch(`向量文件魔数不匹配：${magic}`);
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const headerLength = view.getUint32(4, true);
  const headerStart = 8;
  const headerEnd = headerStart + headerLength;
  if (headerEnd > buffer.byteLength) {
    throw new DenseIndexMismatch('向量文件 header 越界');
  }
  let header: VectorHeader;
  try {
    header = JSON.parse(new TextDecoder().decode(buffer.subarray(headerStart, headerEnd)));
  } catch {
    throw new DenseIndexMismatch('向量文件 header 不是合法 JSON');
  }

  if (header.model !== expect.model) {
    throw new DenseIndexMismatch(`向量模型不一致：文件=${header.model} 期望=${expect.model}`);
  }
  if (header.dim !== expect.dim) {
    throw new DenseIndexMismatch(`向量维度不一致：文件=${header.dim} 期望=${expect.dim}`);
  }
  if (expect.count !== undefined && header.count !== expect.count) {
    throw new DenseIndexMismatch(`向量数量与语料不一致：文件=${header.count} 语料=${expect.count}`);
  }
  if (!Array.isArray(header.entries) || header.entries.length !== header.count) {
    throw new DenseIndexMismatch('向量 header.entries 数量与 count 不一致');
  }

  const expectedBytes = header.count * header.dim * 4;
  const bodyBytes = buffer.byteLength - headerEnd;
  if (bodyBytes !== expectedBytes) {
    throw new DenseIndexMismatch(`向量 body 长度不符：实际=${bodyBytes} 期望=${expectedBytes}`);
  }

  const vectors = new Float32Array(header.count * header.dim);
  new Uint8Array(vectors.buffer).set(
    buffer.subarray(headerEnd, headerEnd + expectedBytes)
  );

  return {
    ids: header.entries.map(entry => entry.id),
    sourceIds: header.entries.map(entry => entry.sourceId),
    hashes: header.entries.map(entry => entry.hash),
    dim: header.dim,
    model: header.model,
    count: header.count,
    vectors
  };
}

let vectorCache: { loadedAt: number; index: VectorIndex; path: string } | null = null;

/** 加载并缓存向量索引。缺文件时抛 DenseIndexMismatch，由调用方降级为纯词法。 */
export async function loadVectors(options: { path?: string } = {}): Promise<VectorIndex> {
  const config = readEmbeddingConfig();
  if (!config) {
    throw new DenseIndexMismatch('未配置 EMBEDDING_API_KEY，稠密 lane 不可用');
  }
  const filePath = options.path ?? VECTORS_PATH;
  if (vectorCache && vectorCache.path === filePath && vectorCache.index.model === config.model) {
    return vectorCache.index;
  }
  const buffer = await fs.readFile(filePath);
  const index = parseVectorFile(buffer, { model: config.model, dim: config.dim });
  vectorCache = { loadedAt: Date.now(), index, path: filePath };
  return index;
}

export function resetVectorCache(): void {
  vectorCache = null;
}

// ── 查询期远程 embed ────────────────────────────────────────────────────────

const queryVectorCache = new Map<string, Float32Array>();

export function resetQueryVectorCache(): void {
  queryVectorCache.clear();
}

function cacheGet(key: string): Float32Array | undefined {
  const value = queryVectorCache.get(key);
  if (value) {
    // LRU：命中后重新插入
    queryVectorCache.delete(key);
    queryVectorCache.set(key, value);
  }
  return value;
}

function cacheSet(key: string, value: Float32Array): void {
  queryVectorCache.set(key, value);
  while (queryVectorCache.size > QUERY_VECTOR_CACHE_SIZE) {
    const oldest = queryVectorCache.keys().next().value;
    if (oldest === undefined) break;
    queryVectorCache.delete(oldest);
  }
}

function l2Normalize(vector: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < vector.length; i += 1) sum += vector[i] * vector[i];
  const norm = Math.sqrt(sum);
  if (norm > 0) {
    for (let i = 0; i < vector.length; i += 1) vector[i] /= norm;
  }
  return vector;
}

/** base64 → Float32Array；长度不符直接失败。 */
export function decodeEmbedding(base64: string, dim: number): Float32Array {
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.byteLength !== dim * 4) {
    throw new Error(`embedding 维度不符：字节=${bytes.byteLength} 期望=${dim * 4}`);
  }
  const vector = new Float32Array(dim);
  new Uint8Array(vector.buffer).set(bytes);
  return vector;
}

export type EmbedFn = (raw: string) => Promise<Float32Array | null>;

export interface EncodeOptions {
  config?: EmbeddingConfig | null;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface EncodedQuery {
  vector: Float32Array | null;
  cacheHit: boolean;
  /** vector 为 null 时的降级原因：dense-unavailable / dense-timeout / dense-error */
  reason?: string;
}

/**
 * 查询向量：远程 embed + LRU 缓存 + 超时降级。
 * 失败不抛错，只返回降级标记 —— 稠密 lane 永远不是致命依赖（R15）。
 */
export async function encodeQuery(raw: string, options: EncodeOptions = {}): Promise<EncodedQuery> {
  const config = options.config ?? readEmbeddingConfig();
  if (!config) {
    return { vector: null, cacheHit: false, reason: 'dense-unavailable' };
  }

  const cached = cacheGet(raw);
  if (cached) {
    return { vector: cached, cacheHit: true };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`${config.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        input: raw,
        encoding_format: 'base64'
      }),
      signal: options.signal ?? AbortSignal.timeout(config.timeoutMs)
    });

    if (!response.ok) {
      return { vector: null, cacheHit: false, reason: 'dense-error' };
    }

    const body = (await response.json()) as {
      data?: { index: number; embedding: string }[];
    };
    const rows = body.data ?? [];
    if (rows.length === 0) {
      return { vector: null, cacheHit: false, reason: 'dense-error' };
    }
    // 必须按 data[].index 归位，不能假设返回顺序
    rows.sort((a, b) => a.index - b.index);
    const vector = l2Normalize(decodeEmbedding(rows[0].embedding, config.dim));
    cacheSet(raw, vector);
    return { vector, cacheHit: false };
  } catch (error) {
    const aborted = options.signal?.aborted === true || (error as { name?: string })?.name === 'TimeoutError' || (error as { name?: string })?.name === 'AbortError';
    return { vector: null, cacheHit: false, reason: aborted ? 'dense-timeout' : 'dense-error' };
  }
}

/** 向量已 L2 归一化，因此余弦 = 点积。 */
export function cosineTopK(index: VectorIndex, query: Float32Array, topK: number): ScoredDoc[] {
  if (query.length !== index.dim) return [];
  const results: ScoredDoc[] = [];
  for (let row = 0; row < index.count; row += 1) {
    const offset = row * index.dim;
    let dot = 0;
    for (let i = 0; i < index.dim; i += 1) {
      dot += index.vectors[offset + i] * query[i];
    }
    results.push({ docId: index.ids[row], score: dot, matched: [] });
  }
  results.sort((a, b) => b.score - a.score || a.docId.localeCompare(b.docId));
  return results.slice(0, topK);
}
