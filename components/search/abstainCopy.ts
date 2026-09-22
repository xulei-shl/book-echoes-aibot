import type { AbstainReason } from '@/lib/search/types';

/**
 * 弃权文案：**标题与正文都按成因分流**。`abstained` 不是无因的布尔 —— 三种成因该做的事完全不同，
 * 一句笼统的「馆藏里没有高度契合的书」会把「放宽筛选条件」误导成「换个主题」，让用户白跑一轮。
 */
export const ABSTAIN_COPY: Record<AbstainReason, { title: string; body: string }> = {
  'hard-filter': {
    title: '这些条件下没有可推荐的书',
    body: '这次没有勉强提供不精准的结果。你给的年份、评分或类型条件把候选全排除了 —— 放宽其中一项再试。'
  },
  fit: {
    title: '馆藏里没有高度契合的书籍',
    body: '这次没有勉强提供不精准的结果。没有候选达到相关度门槛，换成更具体的主题、作者或时代线索再试。'
  },
  batch: {
    title: '有几本主题相关，但没有真正契合的',
    body: '这次没有勉强提供不精准的结果。其中几本已判定为主题相关，只是整体上看没有真正回应你要找的东西 —— 可展开下面的低相关度结果自行判断。'
  }
};

/** `abstained` 为真时 `abstainReason` 必然非空；这里只是给类型收窄一个安全的兜底。 */
export const ABSTAIN_FALLBACK = {
  title: '馆藏里没有高度契合的书籍',
  body: '这次没有勉强提供不精准的结果。建议补充作者、主题背景或时代线索再试。'
};

export function abstainCopyFor(reason: AbstainReason | null | undefined): {
  title: string;
  body: string;
} {
  return reason ? ABSTAIN_COPY[reason] : ABSTAIN_FALLBACK;
}
