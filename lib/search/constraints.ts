import { findClcClass } from './clc';
import type { AppliedConstraint, DroppedConstraint, QueryPlanTrace, SearchFilters } from './types';

/**
 * 硬条件裁决。
 *
 * 分两层，顺序固定且不可交换：
 * 1. `deterministicConstraints`：**请求期即可确定**的（用户原句的字面条件 ∪ 调用方显式传参），
 *    它能在两条 lane 开跑之前算完，因此可以下推给 `recall.ts::buildAllowSet`；
 * 2. `resolveConstraints`：在其上叠加**模型推出的**条件（年份/评分档位来自意图请求，
 *    类目来自独立请求）。模型可以提出条件，但不能单方面删结果 —— 不满足门槛就进 `plan.dropped`，
 *    且必须可见（否则「为什么没按我说的过滤」无从排查）。
 *
 * 判定本身不在这里：`recall.ts::compileDocFilter` 是全模块唯一的硬条件判定，
 * 下推与兜底共用它，因此「先过滤」与「后过滤」不可能出现两套标准。
 */

/** 确定性层（规则 + API）算出的硬条件与「凭什么」记录。 */
export interface DeterministicConstraints {
  filters: SearchFilters;
  applied: AppliedConstraint[];
}

/**
 * 已生效的硬条件 → 给人/模型看的一句话列表，供精排知道「哪些条件已经不用它操心」。
 *
 * 与 `plan.applied` **同源**（不另建一套判定），类目名走 `clc.ts` 查表。
 */
export function describeApplied(applied: AppliedConstraint[]): string[] {
  const labels: string[] = [];
  for (const entry of applied) {
    switch (entry.field) {
      case 'pubYearFrom':
        labels.push(`出版年 ≥ ${entry.value}`);
        break;
      case 'minRating':
        labels.push(`评分 ≥ ${entry.value}`);
        break;
      case 'excludeFiction':
        labels.push('排除虚构类');
        break;
      case 'callClasses': {
        const codes = Array.isArray(entry.value) ? entry.value : [];
        const named = codes.map(code => {
          const node = findClcClass(code);
          return node ? `${node.code} ${node.label}` : code;
        });
        labels.push(`中图法类目属于 ${named.join('、')}`);
        break;
      }
    }
  }
  return labels;
}

/**
 * **请求期即可确定**的硬条件：规则层（用户原句的字面条件）∪ 请求级 `filters`（调用方显式传参），
 * 同名数值下限取更强的一方。
 *
 * 单独拆出来的理由：这一份在**两条 lane 开跑之前**就算得完，因此可以下推给
 * `recall.ts::buildAllowSet`，让过滤发生在 lane 的 top-K 截断**之前**。
 * 模型档位不在此列 —— 它与 lane 结果并发返回（图 1 的投机并发），物理上赶不上，
 * 只能融合后补一次过滤。
 */
export function deterministicConstraints(
  rule: SearchFilters,
  requested: SearchFilters | undefined
): DeterministicConstraints {
  const filters: SearchFilters = {};
  const applied: AppliedConstraint[] = [];

  // ① 规则层：字面条件，永远生效
  if (rule.minRating !== undefined) {
    filters.minRating = rule.minRating;
    applied.push({ field: 'minRating', value: rule.minRating, source: 'rule' });
  }
  if (rule.pubYearFrom !== undefined) {
    filters.pubYearFrom = rule.pubYearFrom;
    applied.push({ field: 'pubYearFrom', value: rule.pubYearFrom, source: 'rule' });
  }
  if (rule.excludeFiction) {
    filters.excludeFiction = true;
    applied.push({ field: 'excludeFiction', value: true, source: 'rule' });
  }

  // ② 请求级 filters：显式传参，数值下限取更强约束
  if (requested) {
    const claim = (field: 'pubYearFrom' | 'minRating', value: number): void => {
      const current = filters[field];
      if (current === undefined || value > current) {
        filters[field] = value;
        const existing = applied.findIndex(entry => entry.field === field);
        const entry: AppliedConstraint = { field, value, source: 'api' };
        if (existing >= 0) applied[existing] = entry;
        else applied.push(entry);
      }
    };
    if (requested.minRating !== undefined) claim('minRating', requested.minRating);
    if (requested.pubYearFrom !== undefined) claim('pubYearFrom', requested.pubYearFrom);
    if (requested.excludeFiction) {
      filters.excludeFiction = true;
      if (!applied.some(entry => entry.field === 'excludeFiction')) {
        applied.push({ field: 'excludeFiction', value: true, source: 'api' });
      }
    }
    // 调用方显式传的类目：字面/显式证据优先，模型侧给出的会被它顶掉（见 resolveConstraints）
    if (requested.callClasses && requested.callClasses.length > 0) {
      const callClasses = [...requested.callClasses];
      filters.callClasses = callClasses;
      applied.push({ field: 'callClasses', value: callClasses, source: 'api' });
    }
  }

  return { filters, applied };
}

/**
 * 在确定性硬条件之上叠加**模型推出的条件**（年份/评分来自意图请求的档位题，类目来自独立的类目请求）。
 *
 * 年份/评分三道门全过才升级成硬过滤：
 * 1. 句中没有否定表达（`negation` ≤ `negationMax`）—— 「不要 2015 年以后」不能被反过来执行；
 * 2. 模型认为它是硬条件（`strictness` ≥ `hardStrictness`）；
 * 3. 确定性层没有给出同名条件（字面证据优先，避免两套标准）。
 *
 * 不满足时进入 `plan.dropped`：模型可以提出条件，但不能单方面删结果（延续 facets「只能微调」的纪律）。
 */
export function resolveConstraints(args: {
  base: DeterministicConstraints;
  model: SearchFilters;
  strictness: number;
  negation: number;
  /** 生效门槛（默认来自 tuning.ts，可被环境变量覆盖） */
  hardStrictness: number;
  negationMax: number;
  /** 类目请求自己的否定概率（它自包含，不回头依赖意图请求 —— 两边各自失败互不牵连） */
  negated: number;
  /** 类目请求给出的类号（已按「退回较粗的 l1」合并完毕） */
  modelClasses?: string[];
  terms: string[];
}): { filters: SearchFilters; plan: QueryPlanTrace } {
  const filters: SearchFilters = { ...args.base.filters };
  const applied: AppliedConstraint[] = [...args.base.applied];
  const dropped: DroppedConstraint[] = [];

  const negated = args.negation > args.negationMax;
  const strict = args.strictness >= args.hardStrictness;
  const considerModel = (field: 'pubYearFrom' | 'minRating', value: number | undefined): void => {
    if (value === undefined) return;
    if (filters[field] !== undefined) {
      dropped.push({ field, value, reason: 'rule-conflict' });
      return;
    }
    if (negated) {
      dropped.push({ field, value, reason: 'negated' });
      return;
    }
    if (!strict) {
      dropped.push({ field, value, reason: 'soft' });
      return;
    }
    filters[field] = value;
    applied.push({ field, value, source: 'model' });
  };
  considerModel('pubYearFrom', args.model.pubYearFrom);
  considerModel('minRating', args.model.minRating);

  // 虚构维度：与年份/评分共用 `constraint_strictness` 那道门 ——
  // 那道题的题面本来就写着「年份、评分、**虚构与否**是不是必须满足的硬条件」。
  //
  // ⚠️ 唯一一道**不看否定门**的条件，与年份/评分刻意相反：
  // `genre_preference` 问的是「想要虚构还是非虚构」，极性已经包含在答案里 ——
  // 「不要小说」的否定是**构成**这个条件的表达，把它当「反向执行」拦下恰好会拦掉正确行为。
  // 安全性由方向保证：只有 `nonfiction` 才会走到这里，所以「不要非虚构」只会变成「不筛」，不会反向。
  if (args.model.excludeFiction === true) {
    if (filters.excludeFiction) {
      dropped.push({ field: 'excludeFiction', value: true, reason: 'rule-conflict' });
    } else if (!strict) {
      dropped.push({ field: 'excludeFiction', value: true, reason: 'soft' });
    } else {
      filters.excludeFiction = true;
      applied.push({ field: 'excludeFiction', value: true, source: 'model' });
    }
  }

  // 类目条件：两道门，**不看 `constraint_strictness`**。
  // 那道题问的是「年份/评分/是否虚构是不是必须满足的硬条件」，与类目不是同一个判断；
  // 而类目题本身就是在问「是不是在按类目筛」—— 模型给出具体类目（而非 `__none__`）
  // 已经是这道题的答案，再叠一道 strictness 等于把同一个信号数两遍。
  // 保留的两道门：确定性层已有类目则让位（字面/显式证据优先）；句中有否定则一律不用
  // （「不要历史类的」不能被反向执行成「只要历史类」）。
  const modelClasses = args.modelClasses;
  if (modelClasses && modelClasses.length > 0) {
    if (filters.callClasses !== undefined) {
      dropped.push({ field: 'callClasses', value: modelClasses, reason: 'rule-conflict' });
    } else if (args.negated > args.negationMax) {
      dropped.push({ field: 'callClasses', value: modelClasses, reason: 'negated' });
    } else {
      filters.callClasses = [...modelClasses];
      applied.push({ field: 'callClasses', value: [...modelClasses], source: 'model' });
    }
  }

  return { filters, plan: { terms: args.terms, applied, dropped } };
}
