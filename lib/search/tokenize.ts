/**
 * 中文分词（无新依赖）：CJK 字符 bigram + ASCII 整词。
 *
 * ⚠️ 这个分词器**只服务于词法 lane（BM25 匹配）**。语义由稠密向量 lane 承担，
 * 它不分词、直接吃未降噪的用户原句（§4.2）。
 */

const CJK_START = 0x3400;
const CJK_END = 0x9fff;
const CJK_COMPAT_START = 0xf900;
const CJK_COMPAT_END = 0xfaff;
const FULLWIDTH_START = 0xff01;
const FULLWIDTH_END = 0xff5e;
const FULLWIDTH_OFFSET = 0xfee0;
const IDEOGRAPHIC_SPACE = 0x3000;

/** 词法匹配用的高频噪声词（bigram 与单字）。 */
export const STOPWORDS = new Set<string>([
  // 单字虚词
  '的', '了', '是', '在', '我', '你', '他', '她', '它', '们', '有', '和', '与', '也', '就', '都', '而', '被', '把', '让', '给', '对', '从', '到', '为', '之', '其', '等', '这', '那',
  // 常见 bigram
  '一个', '一些', '一种', '一本', '这个', '那个', '这些', '那些', '什么', '怎么', '怎样', '如何', '可以', '我们', '他们', '她们', '自己', '已经', '还是', '或者', '但是', '因为', '所以', '如果', '就是', '这种', '那种', '没有', '不是', '不能', '不会', '需要', '觉得', '感觉', '想要', '希望', '比较', '非常', '特别', '真的', '其实', '应该', '可能', '一定', '很多',  '关于', '对于', '以及', '并且', '而且', '然后', '现在', '时候', '地方', '东西', '事情', '问题', '方面', '内容', '书籍', '图书', '推荐', '讲述',
  // 语气词（单字 token 只在它独自成串时出现；不删除正文里的「酒吧」「哈耶克」）
  '吗', '呢', '吧', '啊', '哦', '呀', '嘛', '咯', '哈', '啦', '哟', '呗'
]);

/** 全角 → 半角，统一小写。 */
export function normalizeText(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    if (code >= FULLWIDTH_START && code <= FULLWIDTH_END) {
      out += String.fromCharCode(code - FULLWIDTH_OFFSET);
    } else if (code === IDEOGRAPHIC_SPACE) {
      out += ' ';
    } else {
      out += ch;
    }
  }
  return out.toLowerCase();
}

const isCjk = (code: number): boolean =>
  (code >= CJK_START && code <= CJK_END) || (code >= CJK_COMPAT_START && code <= CJK_COMPAT_END);

/** ASCII 词内允许的字符：字母、数字、以及索书号/编号里的 . - + # / */
const isAsciiWordChar = (ch: string): boolean => /[a-z0-9.\-+#/]/.test(ch);

/**
 * 把文本切成 token：
 * 1. 连续 CJK 串 → 滑动窗口 bigram（长度 1 的串保留该字）
 * 2. 连续 ASCII/数字 → 整词（长度 > 4 时叠加 2-gram 兜底）
 * 3. 过滤停用词与纯符号
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const normalized = normalizeText(text);
  const tokens: string[] = [];
  let cjkRun = '';
  let asciiRun = '';

  const flushCjk = () => {
    if (!cjkRun) return;
    if (cjkRun.length === 1) {
      tokens.push(cjkRun);
    } else {
      for (let i = 0; i + 1 < cjkRun.length; i += 1) {
        tokens.push(cjkRun.slice(i, i + 2));
      }
    }
    cjkRun = '';
  };

  const flushAscii = () => {
    if (!asciiRun) return;
    const word = asciiRun.replace(/^[.\-+#/]+|[.\-+#/]+$/g, '');
    asciiRun = '';
    if (!word) return;
    tokens.push(word);
    if (word.length > 4) {
      for (let i = 0; i + 1 < word.length; i += 1) {
        tokens.push(word.slice(i, i + 2));
      }
    }
  };

  for (const ch of normalized) {
    const code = ch.codePointAt(0)!;
    if (isCjk(code)) {
      flushAscii();
      cjkRun += ch;
      continue;
    }
    if (isAsciiWordChar(ch)) {
      flushCjk();
      asciiRun += ch;
      continue;
    }
    flushCjk();
    flushAscii();
  }
  flushCjk();
  flushAscii();

  return tokens.filter(token => token.length > 0 && !STOPWORDS.has(token));
}
