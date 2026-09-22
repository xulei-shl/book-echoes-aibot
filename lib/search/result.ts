import { FIT_LEVELS, nearestLevelLabel } from './levels';
import type { ScoredCandidate } from './rank';
import type { RecallResult, SearchDoc, SearchResultItem } from './types';

/**
 * 结果条目组装。
 *
 * 精确命中跳 `/{sourceId}?focus={id}`，`sourceId` 正是本项目详情页的路由参数 ——
 * 检索不需要单独造一套路由。
 */
export const deepLinkFor = (doc: SearchDoc): string =>
  `/${encodeURIComponent(doc.sourceId)}?focus=${encodeURIComponent(doc.id)}`;

/**
 * 结果条目的唯一构造点。
 *
 * 三个来源（精排后的候选 / 精排不可用时的召回兜底 / 精确命中直通）只差几个标量，
 * `why` 面板的字段映射只在这里写一次 —— 否则任何一次新增解释字段都要在三处同步，
 * 而漏掉的那处不会报错，只会静默少一个字段。
 */
interface ResultItemSeed {
  doc: SearchDoc;
  /** 是否经过 Jev 精排判分 */
  ranked: boolean;
  passedGate: boolean;
  relevancePct: number;
  matchPct: number;
  rankScore: number;
  fit: number | null;
  /** 模型判定的档位；缺失为 null */
  fitLevel: number | null;
  fitConfidence: number | null;
  /** 原始召回名次，1-based；未经召回的直通路径记 0 */
  recallRank: number;
  lanes: string[];
  laneScores: Record<string, number>;
  matched: string[];
  /** 本批 `choice(best)` 的 `__none__` 概率；只作展示与排查，不参与门控（见 `rank.ts::eligibility`） */
  pNone: number | null;
}

function buildResultItem(seed: ResultItemSeed): SearchResultItem {
  const { doc } = seed;
  return {
    book: doc.book,
    sourceId: doc.sourceId,
    relevancePct: seed.relevancePct,
    matchPct: seed.matchPct,
    rankScore: seed.rankScore,
    fit: seed.fit,
    ranked: seed.ranked,
    passedGate: seed.passedGate,
    deepLink: deepLinkFor(doc),
    lanes: seed.lanes,
    laneScores: seed.laneScores,
    why: {
      lanes: seed.lanes,
      laneScores: seed.laneScores,
      matched: seed.matched,
      recallRank: seed.recallRank,
      fit: seed.fit,
      fitLevel: seed.fitLevel,
      fitLevelLabel: seed.fitLevel === null ? null : nearestLevelLabel(seed.fitLevel, FIT_LEVELS),
      fitConfidence: seed.fitConfidence,
      matchPct: seed.matchPct,
      rankScore: seed.rankScore,
      pNone: seed.pNone
    },
    ...(doc.alsoIn ? { alsoIn: doc.alsoIn } : {})
  };
}

/** 已判分候选 → 结果条目。 */
export function toResultItem(
  candidate: ScoredCandidate,
  passedGate = true,
  pNone: number | null = null
): SearchResultItem {
  return buildResultItem({
    doc: candidate.doc,
    ranked: true,
    passedGate,
    relevancePct: candidate.relevancePct,
    matchPct: candidate.matchPct,
    rankScore: candidate.rankScore,
    fit: candidate.fit,
    fitLevel: candidate.fitLevel,
    fitConfidence: candidate.fitConfidence,
    recallRank: candidate.recallRank,
    lanes: candidate.lanes,
    laneScores: candidate.laneScores,
    matched: candidate.matched,
    pNone
  });
}

/** rerank 不可用时的兜底结果：全部保留、ranked=false 沉底。 */
export function unrankedFromRecall(
  results: RecallResult[],
  docs: Map<string, SearchDoc>,
  limit: number
): SearchResultItem[] {
  const items: SearchResultItem[] = [];
  for (const result of results) {
    if (items.length >= limit) break;
    const doc = docs.get(result.docId);
    if (!doc) continue;
    items.push(
      buildResultItem({
        doc,
        ranked: false,
        passedGate: true,
        relevancePct: 0,
        matchPct: 0,
        rankScore: 0,
        fit: null,
        fitLevel: null,
        fitConfidence: null,
        recallRank: 0,
        lanes: result.lanes,
        laneScores: result.laneScores,
        matched: result.matched,
        // 精排未跑（rerank 不可用），不存在 p_none
        pNone: null
      })
    );
  }
  return items;
}

/** 精确命中（0 次 Jev 直通）→ 结果条目：没有精排批，也没有 p_none。 */
export function exactMatchItem(doc: SearchDoc): SearchResultItem {
  return buildResultItem({
    doc,
    ranked: true,
    passedGate: true,
    relevancePct: 100,
    matchPct: 100,
    rankScore: 1,
    fit: null,
    fitLevel: null,
    fitConfidence: null,
    recallRank: 1,
    lanes: ['exact'],
    laneScores: {},
    matched: [],
    pNone: null
  });
}
