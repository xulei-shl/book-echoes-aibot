import { search, type Bm25Index } from './bm25';
import { cosineTopK, encodeQuery, type EncodedQuery, type VectorIndex } from './dense';
import type { RecallLane, RecallResult } from './types';

/** 词法 lane：本地 ~10ms，吃降噪后的关键词。 */
export function createLexicalLane(index: Bm25Index): RecallLane {
  return {
    id: 'lexical',
    async search({ core, limit, allow }) {
      return search(index, core, limit, allow).map<RecallResult>(item => ({
        docId: item.docId,
        score: item.score,
        lanes: ['lexical'],
        matched: item.matched,
        laneScores: { lexical: item.score }
      }));
    }
  };
}

export interface DenseLaneDeps {
  index: VectorIndex | null;
  /** 默认走远程 embed；测试可注入桩函数 */
  encode?: (raw: string) => Promise<EncodedQuery>;
  onDegraded?: (code: string) => void;
  onTiming?: (ms: number, cacheHit: boolean) => void;
}

/** 稠密 lane：一次远程 embed（~100–500ms）+ 本地暴力余弦（亚毫秒）。 */
export function createDenseLane(deps: DenseLaneDeps): RecallLane {
  const encode = deps.encode ?? ((raw: string) => encodeQuery(raw));
  return {
    id: 'dense',
    async search({ raw, limit, allow }) {
      if (!deps.index) {
        deps.onDegraded?.('dense-unavailable');
        return [];
      }
      const started = Date.now();
      const encoded = await encode(raw);
      deps.onTiming?.(Date.now() - started, encoded.cacheHit);
      if (!encoded.vector) {
        deps.onDegraded?.(encoded.reason ?? 'dense-error');
        return [];
      }
      return cosineTopK(deps.index, encoded.vector, limit, allow).map<RecallResult>(item => ({
        docId: item.docId,
        score: item.score,
        lanes: ['dense'],
        matched: item.matched,
        laneScores: { dense: item.score }
      }));
    }
  };
}
