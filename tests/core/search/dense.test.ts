import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DenseIndexMismatch,
  cosineTopK,
  decodeEmbedding,
  encodeQuery,
  parseVectorFile,
  resetQueryVectorCache,
  type VectorIndex
} from '@/lib/search/dense';

function makeVectorFile(options: {
  model?: string;
  dim?: number;
  entries: { id: string; sourceId: string; hash: string }[];
  vectors: number[][];
}): Buffer {
  const dim = options.dim ?? 4;
  const header = {
    version: 1,
    model: options.model ?? 'BAAI/bge-m3',
    dim,
    count: options.entries.length,
    normalized: true,
    entries: options.entries,
    builtAt: '2026-09-21T00:00:00.000Z'
  };
  const headerBytes = Buffer.from(JSON.stringify(header), 'utf8');
  const prefix = Buffer.alloc(8);
  prefix.write('BKVS', 0, 'ascii');
  prefix.writeUInt32LE(headerBytes.byteLength, 4);
  const body = Buffer.alloc(options.entries.length * dim * 4);
  options.vectors.forEach((vector, row) => {
    vector.forEach((value, i) => body.writeFloatLE(value, (row * dim + i) * 4));
  });
  return Buffer.concat([prefix, headerBytes, body]);
}

const entries = [
  { id: '1', sourceId: '2026-06', hash: 'aaaa' },
  { id: '2', sourceId: '2026-07', hash: 'bbbb' }
];

const base64Of = (values: number[]): string => {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((value, i) => bytes.writeFloatLE(value, i * 4));
  return bytes.toString('base64');
};

afterEach(() => {
  resetQueryVectorCache();
  vi.restoreAllMocks();
});

describe('dense / parseVectorFile', () => {
  it('解析合法文件', () => {
    const index = parseVectorFile(
      makeVectorFile({ entries, vectors: [[1, 0, 0, 0], [0, 1, 0, 0]] }),
      { model: 'BAAI/bge-m3', dim: 4 }
    );
    expect(index.count).toBe(2);
    expect(index.ids).toEqual(['1', '2']);
    expect(index.vectors.length).toBe(8);
  });

  it('模型不一致时抛 DenseIndexMismatch', () => {
    expect(() =>
      parseVectorFile(makeVectorFile({ entries, vectors: [[1, 0, 0, 0], [0, 1, 0, 0]] }), {
        model: 'other-model',
        dim: 4
      })
    ).toThrow(DenseIndexMismatch);
  });

  it('维度不一致时抛 DenseIndexMismatch（不允许拿 512 维文件算 1024 维余弦）', () => {
    expect(() =>
      parseVectorFile(makeVectorFile({ entries, vectors: [[1, 0, 0, 0], [0, 1, 0, 0]] }), {
        model: 'BAAI/bge-m3',
        dim: 512
      })
    ).toThrow(DenseIndexMismatch);
  });

  it('数量与语料不一致时抛 DenseIndexMismatch', () => {
    expect(() =>
      parseVectorFile(makeVectorFile({ entries, vectors: [[1, 0, 0, 0], [0, 1, 0, 0]] }), {
        model: 'BAAI/bge-m3',
        dim: 4,
        count: 443
      })
    ).toThrow(DenseIndexMismatch);
  });

  it('魔数错误时抛 DenseIndexMismatch', () => {
    expect(() => parseVectorFile(Buffer.from('XXXXXXXX'), { model: 'm', dim: 4 })).toThrow(
      DenseIndexMismatch
    );
  });
});

describe('dense / decodeEmbedding', () => {
  it('base64 → Float32Array 数值正确', () => {
    const decoded = decodeEmbedding(base64Of([1.5, -2.25]), 2);
    expect(Array.from(decoded)).toEqual([1.5, -2.25]);
  });

  it('字节长度不符时抛错', () => {
    expect(() => decodeEmbedding(base64Of([1, 2]), 4)).toThrow();
  });
});

describe('dense / encodeQuery', () => {
  const config = {
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    model: 'BAAI/bge-m3',
    dim: 2,
    timeoutMs: 1000
  };

  it('未配置 key 时返回 dense-unavailable 而非抛错', async () => {
    const result = await encodeQuery('焦虑', { config: null });
    expect(result.vector).toBeNull();
    expect(result.reason).toBe('dense-unavailable');
  });

  it('按 data[].index 归位并 L2 归一化', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            { index: 1, embedding: base64Of([0, 5]) },
            { index: 0, embedding: base64Of([3, 4]) }
          ]
        }),
        { status: 200 }
      )
    ) as unknown as typeof fetch;

    const result = await encodeQuery('存在主义', { config, fetchImpl });
    expect(result.vector).not.toBeNull();
    expect(result.vector![0]).toBeCloseTo(0.6, 5);
    expect(result.vector![1]).toBeCloseTo(0.8, 5);
  });

  it('相同 query 二次调用命中 LRU，不产生第二次请求', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ index: 0, embedding: base64Of([1, 0]) }] }), {
        status: 200
      })
    ) as unknown as typeof fetch;

    await encodeQuery('孤独的城市', { config, fetchImpl });
    const second = await encodeQuery('孤独的城市', { config, fetchImpl });
    expect(second.cacheHit).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('超时返回 dense-timeout 而非抛错', async () => {
    const timeout = new Error('timeout');
    timeout.name = 'TimeoutError';
    const fetchImpl = vi.fn(async () => {
      throw timeout;
    }) as unknown as typeof fetch;

    const result = await encodeQuery('城市', { config, fetchImpl });
    expect(result.vector).toBeNull();
    expect(result.reason).toBe('dense-timeout');
  });
});

describe('dense / cosineTopK', () => {
  it('按点积返回最近邻', () => {
    const index: VectorIndex = {
      ids: ['x', 'y', 'z'],
      sourceIds: ['s', 's', 's'],
      hashes: ['', '', ''],
      dim: 2,
      model: 'm',
      count: 3,
      vectors: new Float32Array([1, 0, 0.9, 0.1, 0, 1])
    };
    const results = cosineTopK(index, new Float32Array([1, 0]), 2);
    expect(results.map(r => r.docId)).toEqual(['x', 'y']);
  });

  it('查询维度不符返回空', () => {
    const index: VectorIndex = {
      ids: ['x'],
      sourceIds: ['s'],
      hashes: [''],
      dim: 2,
      model: 'm',
      count: 1,
      vectors: new Float32Array([1, 0])
    };
    expect(cosineTopK(index, new Float32Array([1, 0, 0]), 2)).toEqual([]);
  });
});
