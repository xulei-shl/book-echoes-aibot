import { CLC_TREE, type ClcNode } from './clc.data';

/**
 * 中图法（CLC）类号 → 类目解析。**这是全项目唯一的中图法解析入口**：
 * 其余模块（过滤、排序、分面）只消费本文件的结果，不再各自解析索书号字符串。
 * 类目表本体是纯数据，在 `clc.data.ts`（收录范围与数据来源见那里的文件头注释）。
 *
 * ## 为什么必须查表、不能「截前 N 位」
 *
 * 中图法的层级深度**不统一**，字符串切片会切出**不存在的类目**。实测反例：
 * 把 `K835.615.6` 截前 3 位得到 `K83` —— 而 `K83` 不是类目，它是简表里
 * `K833/837 各国人物传记` 的**区间记法**。真正的二级是 `K81 传记`。
 * 同理 `B51`（应为 `B5 欧洲哲学`）、`I10`（应为 `I1 世界文学`）都是切片伪类目。
 *
 * 所以解析一律用**最长前缀匹配**：拿类号去表里找最长的已知前缀，找不到就回退一级。
 *
 * 维护方式：改类目只动 `clc.data.ts` 的 `CLC_TREE`，本文件不用碰。
 * 表里没有的类号会**逐级回退**，因此新增类目是纯增量、不会让已有数据解析失败。
 */

export interface ClcClass {
  /** 完整类号，如 `K` / `K81` / `TP3` */
  code: string;
  label: string;
}

/**
 * 一本书的类目路径。任一级无法识别时为 `null`（例：`B-53` 只能识别到一级 `B`，两级均为 `null`）。
 *
 * 语义约定：`level1` 恒为 22 大类之一；`level2` 为二级筛选粒度；
 * `level3` **只有 T 类会非空**（其余大类不设三级）。
 *
 * ⚠️ `level1/2/3` 只放**每一层的匹配结果**，因此不是「从粗到细的全部类号」：
 * `TP311.5` 的 `level3` 是 `TP311`，拿不到它标注层级上的祖先 `TP3` / `TP31`。
 * **按类号筛选请用 `matchesClc()`**（它按类号前缀判定，能命中整条标注路径），
 * 不要拿 `level1/2/3` 自己拼判断。
 */
export interface ClcPath {
  /**
   * 解析出的类目位（规范化后的类号），如 `TP311`。无法识别时为空串。
   * 类号小数点后的复分号不保留（`K835.615.6` → `K835`）。
   */
  code: string;
  level1: ClcClass | null;
  level2: ClcClass | null;
  level3: ClcClass | null;
}

interface ClcEntry extends ClcClass {
  /** 父类号；一级类为 null */
  parent: string | null;
  /** 距一级的层数：1 = 一级，2 = 二级，3 = 三级（仅 T 类） */
  depth: number;
}

function buildIndex(tree: readonly ClcNode[]): Map<string, ClcEntry> {
  const index = new Map<string, ClcEntry>();
  const walk = (nodes: readonly ClcNode[], parent: string | null, depth: number): void => {
    for (const node of nodes) {
      if (index.has(node.code)) {
        // 表内重复类号会让「最长前缀匹配」的结果依赖遍历顺序 —— 启动即暴露，不静默
        throw new Error(`CLC 表存在重复类号：${node.code}`);
      }
      index.set(node.code, { code: node.code, label: node.label, parent, depth });
      if (node.children) walk(node.children, node.code, depth + 1);
    }
  };
  walk(tree, null, 1);
  return index;
}

const CLC_INDEX: ReadonlyMap<string, ClcEntry> = buildIndex(CLC_TREE);

/** 表内最长类号长度（当前为 4：`TP311`/`TN91`/`TH11` 等）。前缀匹配从这一层开始往下试。 */
const MAX_CODE_LEN: number = Math.max(...[...CLC_INDEX.keys()].map(code => code.length));

/** 22 个一级大类，供 UI 分面与校验提示使用。 */
export const CLC_LEVEL1: readonly ClcClass[] = CLC_TREE.map(node => ({
  code: node.code,
  label: node.label
}));

/** 无法识别的索书号（或空值）统一返回这一份冻结空路径，避免每次分配。 */
const EMPTY_PATH: ClcPath = Object.freeze({
  code: '',
  level1: null,
  level2: null,
  level3: null
});

/**
 * 取索书号**类目位**：开头的 `字母 + 数字` 段，遇到 `.`、`/`、`-` 等即停止。
 *
 * `B842.6/4895-3` → `B842`；`TP311.5` → `TP311`；`K835.615.6` → `K835`；`DF123` → `DF123`。
 * 大小写不敏感（索书号在馆藏里有小写写法）。中文/空值 → 空串。
 */
export function clcCodeOf(callNumber: string): string {
  const match = callNumber.trim().toUpperCase().match(/^[A-Z]+\d*/);
  return match ? match[0] : '';
}

/** 已知类号 → 类目路径；类号不在表里则回退到最长已知前缀，完全认不出则返回空路径。 */
export function resolveClcCode(code: string): ClcPath {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return EMPTY_PATH;
  for (let length = Math.min(MAX_CODE_LEN, normalized.length); length >= 1; length -= 1) {
    const entry = CLC_INDEX.get(normalized.slice(0, length));
    if (entry) return pathOf(entry, normalized);
  }
  return Object.freeze({
    code: normalized,
    level1: null,
    level2: null,
    level3: null
  });
}

/**
 * 索书号 → 类目路径。**最长前缀匹配**，因此切片伪类目（`K83`、`B51`、`I10`）永远不会出现：
 * 表里没有 `K83` 之外的近似项时，`K835.615` 命中的是表内真实存在的 `K83`。
 */
export function resolveClc(callNumber: string): ClcPath {
  const code = clcCodeOf(callNumber);
  if (!code) return EMPTY_PATH;
  return resolveClcCode(code);
}

function pathOf(entry: ClcEntry, code: string): ClcPath {
  const path: ClcPath = { code, level1: null, level2: null, level3: null };
  let cursor: ClcEntry | undefined = entry;
  while (cursor) {
    const node: ClcClass = { code: cursor.code, label: cursor.label };
    if (cursor.depth === 1) path.level1 = node;
    else if (cursor.depth === 2) path.level2 = node;
    else path.level3 = node;
    cursor = cursor.parent ? CLC_INDEX.get(cursor.parent) : undefined;
  }
  return path;
}

/** 类号是否在表内。路由层用它校验 `filters.callClasses`，避免「传了永远匹配不上的类号 → 静默空结果」。 */
export function isKnownClcCode(code: string): boolean {
  return CLC_INDEX.has(code.trim().toUpperCase());
}

/**
 * 该书的类目是否落在 `wanted` 任一粒度上（空集合 = 不过滤）。
 *
 * 两条判定**取或**，各自覆盖一类情况，不能只用其中一条：
 *
 * ① **类号前缀**：中图法的标注层级在类号上是连续前缀的绝大多数情况。
 *    `TP311.5` 因而能被 `T` / `TP` / `TP3` / `TP31` / `TP311` 任一粒度命中
 *    —— 不能靠 `level1/2/3` 拼判断，因为 `TP3` 与 `TP311` 在表里是并列项，`TP3` 不在 `TP311` 的祖先链上。
 * ② **祖先链**：类号发生跳转的情况。`G519`（教育史）归在 `G4 教育` 下，但类号不以 `G4` 开头，
 *    只能靠表里的父子关系（`G519` → `G51` → `G4`）认出来。
 *
 * 待选类号的合法性由路由层用 `isKnownClcCode()` 把关，这里不做重复校验。
 */
export function matchesClc(path: ClcPath, wanted: ReadonlySet<string>): boolean {
  if (wanted.size === 0) return true;
  if (path.code.length === 0) return false;
  for (const code of wanted) {
    if (path.code.startsWith(code)) return true;
    if (
      path.level1?.code === code ||
      path.level2?.code === code ||
      path.level3?.code === code
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 已知类号 → 类目节点（查表）。表里没有则 `null`。
 *
 * 与 `isKnownClcCode` 共用同一份索引，因此「路由层校验过的类号」必然查得到 ——
 * 要展示类目名时不必再去拼字符串。
 */
export function findClcClass(code: string): ClcClass | null {
  const entry = CLC_INDEX.get(code.trim().toUpperCase());
  return entry ? { code: entry.code, label: entry.label } : null;
}

/**
 * 一本书**最具体**的那一级类目：`K928.42` → `K92 中国地理`，`TP311.5` → `TP311 …`。
 *
 * 供精排看到「这本书属于哪一类」。类目名的唯一权威来源是这张表，
 * 过滤与精排必须共用它，否则两边会用上两套标准。
 */
export function mostSpecificClass(path: ClcPath): ClcClass | null {
  return path.level3 ?? path.level2 ?? path.level1;
}

/**
 * 是否虚构类（中图法 `I` 文学）。软偏好与硬过滤共用这一判定，杜绝两套标准。
 *
 * 已知局限：中图法把 `I` 类同样用于文学研究/评论（如 `I106` 文学评论），它们会被一并判为虚构。
 * 这与改造前的行为一致（原先取首字母 `<== 'I'`），不引入回归。
 */
export function isFictionClc(path: ClcPath): boolean {
  return path.level1?.code === 'I';
}
