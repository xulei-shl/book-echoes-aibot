/**
 * 中图法（CLC）类号 → 类目映射。**这是全项目唯一的中图法知识来源**：
 * 其余模块（过滤、排序、分面）只消费 `resolveClc()` 的结果，不再各自解析索书号字符串。
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
 * ## 收录范围（与用户约定的粒度）
 *
 * - **一级**：22 大类全部收录（`A`–`Z`，其中 `L`/`M`/`W`/`Y` 中图法不使用）。
 * - **二级**：简表列出的二级类目；区间记法按《世界地区表》展开为独立类号
 *   （`D33/37` → `D33..D37`；`I3/7` → `I3..I7`）。
 * - **三级**：**只有 T 类**收录（`TB1`、`TP3`、`TS97`…）—— 工业技术的二级太粗，
 *   不分三级就分不开「计算机」与「轻工业」。
 * - **补入跳转类号**：`G4 教育` 下的 `G5x`/`G6x`/`G7x`。中图法把这些类号归在 `G4` 名下，
 *   但类号在标注上不落在 `G4` 前缀下（`G519` 教育史属于教育，却不是 `G4…`），
 *   因此不收录它们就会把教育类书籍退到裸 `G`。
 * - **额外补入**：`K82`（中国人物传记）/`K83`（各国人物传记）。简表用区间记法
 *   `K833/837` 表示各国传记，若只收 `K81`，馆藏里 74 本 `K8x` 会全部回退到裸 `K`
 *   （实测占全馆 17%），因此按 clcindex 的 `K81 传记` 子目补入这两个类号。
 * - **不收**：交替类目（简表里带 `[]` 的，如 `[C7]`/`[U8]`）与总论复分（`T-0` 等）——
 *   它们不会出现在索书号的类目位。
 *
 * ## 数据来源
 *
 * - 一级 / 二级：复旦大学图书馆《中图法分类表》（第五版简表）
 *   https://library.fudan.edu.cn/xszl/e8/ae/c42129a518318/page.htm
 * - 三级（T 类）：上海理工大学图书馆《中图分类法简表》+ clcindex 逐类核对
 *   https://library.usst.edu.cn/1452/list.htm
 *
 * 维护方式：本文件是一张**纯数据表**，改类目只动 `CLC_TREE`，逻辑不用碰。
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

interface ClcNode {
  readonly code: string;
  readonly label: string;
  readonly children?: readonly ClcNode[];
}

/**
 * 中图法类目表。结构即层级：顶层 22 个一级类，`children` 为二级，二级再挂 `children` 即三级。
 * 按简表原文顺序排列，便于与图书馆页面逐行比对。
 */
const CLC_TREE: readonly ClcNode[] = [
  {
    code: 'A',
    label: '马克思主义、列宁主义、毛泽东思想、邓小平理论',
    children: [
      { code: 'A1', label: '马克思、恩格斯著作' },
      { code: 'A2', label: '列宁著作' },
      { code: 'A3', label: '斯大林著作' },
      { code: 'A4', label: '毛泽东著作' },
      { code: 'A49', label: '邓小平著作' },
      { code: 'A5', label: '马克思、恩格斯、列宁、斯大林、毛泽东、邓小平著作汇编' },
      { code: 'A7', label: '马克思、恩格斯、列宁、斯大林、毛泽东、邓小平生平和传记' },
      { code: 'A8', label: '马克思主义、列宁主义、毛泽东思想、邓小平理论的学习和研究' }
    ]
  },
  {
    code: 'B',
    label: '哲学、宗教',
    children: [
      { code: 'B0', label: '哲学理论' },
      { code: 'B1', label: '世界哲学' },
      { code: 'B2', label: '中国哲学' },
      { code: 'B3', label: '亚洲哲学' },
      { code: 'B4', label: '非洲哲学' },
      { code: 'B5', label: '欧洲哲学' },
      { code: 'B6', label: '大洋洲哲学' },
      { code: 'B7', label: '美洲哲学' },
      { code: 'B80', label: '思维科学' },
      { code: 'B81', label: '逻辑学（论理学）' },
      { code: 'B82', label: '伦理学（道德哲学）' },
      { code: 'B83', label: '美学' },
      { code: 'B84', label: '心理学' },
      { code: 'B9', label: '宗教' }
    ]
  },
  {
    code: 'C',
    label: '社会科学总论',
    children: [
      { code: 'C0', label: '社会科学理论与方法论' },
      { code: 'C1', label: '社会科学概况、现状、进展' },
      { code: 'C2', label: '社会科学机构、团体、会议' },
      { code: 'C3', label: '社会科学研究方法' },
      { code: 'C4', label: '社会科学教育与普及' },
      { code: 'C5', label: '社会科学丛书、文集、连续性出版物' },
      { code: 'C6', label: '社会科学参考工具书' },
      { code: 'C8', label: '统计学' },
      { code: 'C91', label: '社会学' },
      { code: 'C92', label: '人口学' },
      { code: 'C93', label: '管理学' },
      { code: 'C95', label: '民族学、文化人类学' },
      { code: 'C96', label: '人才学' },
      { code: 'C97', label: '劳动科学' }
    ]
  },
  {
    code: 'D',
    label: '政治、法律',
    children: [
      { code: 'D0', label: '政治学、政治理论' },
      { code: 'D1', label: '国际共产主义运动' },
      { code: 'D2', label: '中国共产党' },
      { code: 'D33', label: '各国共产党（亚洲）' },
      { code: 'D34', label: '各国共产党（非洲）' },
      { code: 'D35', label: '各国共产党（欧洲）' },
      { code: 'D36', label: '各国共产党（大洋洲）' },
      { code: 'D37', label: '各国共产党（美洲）' },
      { code: 'D4', label: '工人、农民、青年、妇女运动与组织' },
      { code: 'D5', label: '世界政治' },
      { code: 'D6', label: '中国政治' },
      { code: 'D73', label: '各国政治（亚洲）' },
      { code: 'D74', label: '各国政治（非洲）' },
      { code: 'D75', label: '各国政治（欧洲）' },
      { code: 'D76', label: '各国政治（大洋洲）' },
      { code: 'D77', label: '各国政治（美洲）' },
      { code: 'D8', label: '外交、国际关系' },
      { code: 'D9', label: '法律' },
      { code: 'DF', label: '法律' }
    ]
  },
  {
    code: 'E',
    label: '军事',
    children: [
      { code: 'E0', label: '军事理论' },
      { code: 'E1', label: '世界军事' },
      { code: 'E2', label: '中国军事' },
      { code: 'E3', label: '各国军事（亚洲）' },
      { code: 'E4', label: '各国军事（非洲）' },
      { code: 'E5', label: '各国军事（欧洲）' },
      { code: 'E6', label: '各国军事（大洋洲）' },
      { code: 'E7', label: '各国军事（美洲）' },
      { code: 'E8', label: '战略学、战役学、战术学' },
      { code: 'E9', label: '军事技术' },
      { code: 'E99', label: '军事地形学、军事地理学' }
    ]
  },
  {
    code: 'F',
    label: '经济',
    children: [
      { code: 'F0', label: '经济学' },
      { code: 'F1', label: '世界各国经济概况、经济史、经济地理' },
      { code: 'F13', label: '各国经济（亚洲）' },
      { code: 'F14', label: '各国经济（非洲）' },
      { code: 'F15', label: '各国经济（欧洲）' },
      { code: 'F16', label: '各国经济（大洋洲）' },
      { code: 'F17', label: '各国经济（美洲）' },
      { code: 'F2', label: '经济管理' },
      { code: 'F3', label: '农业经济' },
      { code: 'F4', label: '工业经济' },
      { code: 'F49', label: '信息产业经济' },
      { code: 'F5', label: '交通运输经济' },
      { code: 'F59', label: '旅游经济' },
      { code: 'F6', label: '邮电通信经济' },
      { code: 'F7', label: '贸易经济' },
      { code: 'F8', label: '财政、金融' }
    ]
  },
  {
    code: 'G',
    label: '文化、科学、教育、体育',
    children: [
      { code: 'G0', label: '文化理论' },
      { code: 'G1', label: '世界各国文化与文化事业' },
      { code: 'G2', label: '信息与知识传播' },
      { code: 'G3', label: '科学、科学研究' },
      {
        code: 'G4',
        label: '教育',
        // 教育类必须展开：中图法把 G5x/G6x/G7x 都归在 G4 名下，类号在标注上是**跳的**
        // （G519 教育史归 G4，但类号不以 G4 开头）。不收录这些中间类号，
        // 前缀匹配会直接把 G519 退到裸 G，丢掉「教育」这个二级。（{G5}/{G6}/{G7} 是汇总头，不是类号）
        children: [
          { code: 'G40', label: '教育学' },
          { code: 'G41', label: '思想政治教育、德育' },
          { code: 'G42', label: '教学理论' },
          { code: 'G43', label: '电化教育' },
          { code: 'G44', label: '教育心理学' },
          { code: 'G45', label: '教师与学生' },
          { code: 'G46', label: '教育行政' },
          { code: 'G47', label: '学校管理' },
          { code: 'G48', label: '学校建筑和设备的管理' },
          { code: 'G51', label: '世界教育事业' },
          { code: 'G52', label: '中国教育事业' },
          { code: 'G53', label: '各国教育事业（亚洲）' },
          { code: 'G54', label: '各国教育事业（非洲）' },
          { code: 'G55', label: '各国教育事业（欧洲）' },
          { code: 'G56', label: '各国教育事业（大洋洲）' },
          { code: 'G57', label: '各国教育事业（美洲）' },
          { code: 'G61', label: '学前教育、幼儿教育' },
          { code: 'G62', label: '初等教育' },
          { code: 'G63', label: '中等教育' },
          { code: 'G64', label: '高等教育' },
          { code: 'G65', label: '师范教育' },
          { code: 'G71', label: '职业技术教育' },
          { code: 'G72', label: '成人教育、业余教育' },
          { code: 'G74', label: '华侨教育、侨民教育' },
          { code: 'G75', label: '少数民族教育' },
          { code: 'G76', label: '特殊教育' },
          { code: 'G77', label: '社会教育' },
          { code: 'G78', label: '家庭教育' },
          { code: 'G79', label: '自学' }
        ]
      },
      { code: 'G8', label: '体育' }
    ]
  },
  {
    code: 'H',
    label: '语言、文字',
    children: [
      { code: 'H0', label: '语言学' },
      { code: 'H1', label: '汉语' },
      { code: 'H2', label: '中国少数民族语言' },
      { code: 'H3', label: '常用外国语' },
      { code: 'H4', label: '汉藏语系' },
      { code: 'H5', label: '阿尔泰语系（突厥-蒙古-通古斯语系）' },
      { code: 'H61', label: '南亚语系（澳斯特罗-亚细亚语系）' },
      { code: 'H62', label: '南印语系（达罗毗荼语系、德拉维达语系）' },
      { code: 'H63', label: '南岛语系（马来亚-玻里尼西亚语系）' },
      { code: 'H64', label: '东北亚诸语言' },
      { code: 'H65', label: '高加索语系（伊比利亚-高加索语系）' },
      { code: 'H66', label: '乌拉尔语系（芬兰-乌戈尔语系）' },
      { code: 'H67', label: '闪-含语系（阿非罗-亚细亚语系）' },
      { code: 'H7', label: '印欧语系' },
      { code: 'H81', label: '非洲诸语言' },
      { code: 'H83', label: '美洲诸语言' },
      { code: 'H84', label: '大洋洲诸语言' },
      { code: 'H9', label: '国际辅助语' }
    ]
  },
  {
    code: 'I',
    label: '文学',
    children: [
      { code: 'I0', label: '文学理论' },
      { code: 'I1', label: '世界文学' },
      { code: 'I2', label: '中国文学' },
      { code: 'I3', label: '各国文学（亚洲）' },
      { code: 'I4', label: '各国文学（非洲）' },
      { code: 'I5', label: '各国文学（欧洲）' },
      { code: 'I6', label: '各国文学（大洋洲）' },
      { code: 'I7', label: '各国文学（美洲）' }
    ]
  },
  {
    code: 'J',
    label: '艺术',
    children: [
      { code: 'J0', label: '艺术理论' },
      { code: 'J1', label: '世界各国艺术概况' },
      { code: 'J19', label: '专题艺术与现代边缘艺术' },
      { code: 'J2', label: '绘画' },
      { code: 'J29', label: '书法、篆刻' },
      { code: 'J3', label: '雕塑' },
      { code: 'J4', label: '摄影艺术' },
      { code: 'J5', label: '工艺美术' },
      { code: 'J6', label: '音乐' },
      { code: 'J7', label: '舞蹈' },
      { code: 'J8', label: '戏剧、曲艺、杂技艺术' },
      { code: 'J9', label: '电影、电视艺术' }
    ]
  },
  {
    code: 'K',
    label: '历史、地理',
    children: [
      { code: 'K0', label: '史学理论' },
      { code: 'K1', label: '世界史' },
      { code: 'K2', label: '中国史' },
      { code: 'K3', label: '亚洲史' },
      { code: 'K4', label: '非洲史' },
      { code: 'K5', label: '欧洲史' },
      { code: 'K6', label: '大洋洲史' },
      { code: 'K7', label: '美洲史' },
      { code: 'K81', label: '传记' },
      { code: 'K82', label: '中国人物传记' },
      { code: 'K83', label: '各国人物传记' },
      { code: 'K85', label: '文物考古' },
      { code: 'K89', label: '风俗习惯' },
      { code: 'K9', label: '地理' },
      { code: 'K90', label: '地理学' },
      { code: 'K91', label: '世界地理' },
      { code: 'K92', label: '中国地理' },
      { code: 'K93', label: '各国地理（亚洲）' },
      { code: 'K94', label: '各国地理（非洲）' },
      { code: 'K95', label: '各国地理（欧洲）' },
      { code: 'K96', label: '各国地理（大洋洲）' },
      { code: 'K97', label: '各国地理（美洲）' },
      { code: 'K99', label: '地图' }
    ]
  },
  {
    code: 'N',
    label: '自然科学总论',
    children: [
      { code: 'N0', label: '自然科学理论与方法论' },
      { code: 'N1', label: '自然科学概况、现状、进展' },
      { code: 'N2', label: '自然科学机关、团体、会议' },
      { code: 'N3', label: '自然科学研究方法' },
      { code: 'N4', label: '自然科学教育与普及' },
      { code: 'N5', label: '自然科学丛书、文集、连续性出版物' },
      { code: 'N6', label: '自然科学参考工具书' },
      { code: 'N8', label: '自然科学调查、考察' },
      { code: 'N91', label: '自然研究、自然历史' },
      { code: 'N93', label: '非线性科学' },
      { code: 'N94', label: '系统科学' }
    ]
  },
  {
    code: 'O',
    label: '数理科学和化学',
    children: [
      { code: 'O1', label: '数学' },
      { code: 'O3', label: '力学' },
      { code: 'O4', label: '物理学' },
      { code: 'O6', label: '化学' },
      { code: 'O7', label: '晶体学' }
    ]
  },
  {
    code: 'P',
    label: '天文学、地球科学',
    children: [
      { code: 'P1', label: '天文学' },
      { code: 'P2', label: '测绘学' },
      { code: 'P3', label: '地球物理学' },
      { code: 'P4', label: '大气科学（气象学）' },
      { code: 'P5', label: '地质学' },
      { code: 'P7', label: '海洋学' },
      { code: 'P9', label: '自然地理学' }
    ]
  },
  {
    code: 'Q',
    label: '生物科学',
    children: [
      { code: 'Q1', label: '普通生物学' },
      { code: 'Q2', label: '细胞生物学' },
      { code: 'Q3', label: '遗传学' },
      { code: 'Q4', label: '生理学' },
      { code: 'Q5', label: '生物化学' },
      { code: 'Q6', label: '生物物理学' },
      { code: 'Q7', label: '分子生物学' },
      { code: 'Q81', label: '生物工程学（生物技术）' },
      { code: 'Q91', label: '古生物学' },
      { code: 'Q93', label: '微生物学' },
      { code: 'Q94', label: '植物学' },
      { code: 'Q95', label: '动物学' },
      { code: 'Q96', label: '昆虫学' },
      { code: 'Q98', label: '人类学' }
    ]
  },
  {
    code: 'R',
    label: '医药、卫生',
    children: [
      { code: 'R1', label: '预防医学、卫生学' },
      { code: 'R2', label: '中国医学' },
      { code: 'R3', label: '基础医学' },
      { code: 'R4', label: '临床医学' },
      { code: 'R5', label: '内科学' },
      { code: 'R6', label: '外科学' },
      { code: 'R71', label: '妇产科学' },
      { code: 'R72', label: '儿科学' },
      { code: 'R73', label: '肿瘤学' },
      { code: 'R74', label: '神经病学与精神病学' },
      { code: 'R75', label: '皮肤病学与性病学' },
      { code: 'R76', label: '耳鼻咽喉科学' },
      { code: 'R77', label: '眼科学' },
      { code: 'R78', label: '口腔科学' },
      { code: 'R79', label: '外国民族医学' },
      { code: 'R8', label: '特种医学' },
      { code: 'R9', label: '药学' }
    ]
  },
  {
    code: 'S',
    label: '农业科学',
    children: [
      { code: 'S1', label: '农业基础科学' },
      { code: 'S2', label: '农业工程' },
      { code: 'S3', label: '农学（农艺学）' },
      { code: 'S4', label: '植物保护' },
      { code: 'S5', label: '农作物' },
      { code: 'S6', label: '园艺' },
      { code: 'S7', label: '林业' },
      { code: 'S8', label: '畜牧、动物医学、狩猎、蚕、蜂' },
      { code: 'S9', label: '水产、渔业' }
    ]
  },
  {
    code: 'T',
    label: '工业技术',
    children: [
      {
        code: 'TB',
        label: '一般工业技术',
        children: [
          { code: 'TB1', label: '工程基础科学' },
          { code: 'TB2', label: '工程设计与测绘' },
          { code: 'TB3', label: '工程材料学' },
          { code: 'TB4', label: '工业通用技术与设备' },
          { code: 'TB5', label: '声学工程' },
          { code: 'TB6', label: '制冷工程' },
          { code: 'TB7', label: '真空技术' },
          { code: 'TB8', label: '摄影技术' },
          { code: 'TB9', label: '计量学' }
        ]
      },
      {
        code: 'TD',
        label: '矿业工程',
        children: [
          { code: 'TD1', label: '矿山地质与测量' },
          { code: 'TD2', label: '矿山设计与建设' },
          { code: 'TD3', label: '矿山压力与支护' },
          { code: 'TD4', label: '矿山机械' },
          { code: 'TD5', label: '矿山运输与设备' },
          { code: 'TD6', label: '矿山电工' },
          { code: 'TD7', label: '矿山安全与劳动保护' },
          { code: 'TD8', label: '矿山开采' },
          { code: 'TD9', label: '选矿' },
          { code: 'TD98', label: '矿产资源的综合利用' }
        ]
      },
      {
        code: 'TE',
        label: '石油、天然气工业',
        children: [
          { code: 'TE0', label: '能源与节能' },
          { code: 'TE1', label: '石油、天然气地质与勘探' },
          { code: 'TE2', label: '钻井工程' },
          { code: 'TE3', label: '油气田开发与开采' },
          { code: 'TE4', label: '油气田建设工程' },
          { code: 'TE5', label: '海上油气田勘探与开发' },
          { code: 'TE6', label: '石油、天然气加工工业' },
          { code: 'TE8', label: '石油、天然气储存与运输' },
          { code: 'TE9', label: '石油机械设备与自动化' }
        ]
      },
      {
        code: 'TF',
        label: '冶金工业',
        children: [
          { code: 'TF0', label: '一般性问题' },
          { code: 'TF1', label: '冶金技术' },
          { code: 'TF3', label: '冶金机械、冶金生产自动化' },
          { code: 'TF4', label: '钢铁冶金（黑色金属冶炼）（总论）' },
          { code: 'TF5', label: '炼铁' },
          { code: 'TF6', label: '铁合金冶炼' },
          { code: 'TF7', label: '炼钢' },
          { code: 'TF79', label: '其他黑色金属冶炼' },
          { code: 'TF8', label: '有色金属冶炼' }
        ]
      },
      {
        code: 'TG',
        label: '金属学与金属工艺',
        children: [
          { code: 'TG1', label: '金属学与热处理' },
          { code: 'TG2', label: '铸造' },
          { code: 'TG3', label: '金属压力加工' },
          { code: 'TG4', label: '焊接、金属切割及金属粘接' },
          { code: 'TG5', label: '金属切削加工及机床' },
          { code: 'TG7', label: '刀具、磨料、磨具、夹具、模具和手工具' },
          { code: 'TG8', label: '公差与技术测量及机械量仪' },
          { code: 'TG9', label: '钳工工艺与装配工艺' }
        ]
      },
      {
        code: 'TH',
        label: '机械、仪表工业',
        children: [
          { code: 'TH11', label: '机械学（机械设计基础理论）' },
          { code: 'TH12', label: '机械设计、计算与制图' },
          { code: 'TH13', label: '机械零件及传动装置' },
          { code: 'TH14', label: '机械制造用材料' },
          { code: 'TH16', label: '机械制造工艺' },
          { code: 'TH17', label: '机械运行与维修' },
          { code: 'TH18', label: '机械工厂（车间）' },
          { code: 'TH2', label: '起重机械与运输机械' },
          { code: 'TH3', label: '泵' },
          { code: 'TH4', label: '气体压缩与输送机械' },
          { code: 'TH6', label: '专用机械与设备' },
          { code: 'TH7', label: '仪器、仪表' }
        ]
      },
      {
        code: 'TJ',
        label: '武器工业',
        children: [
          { code: 'TJ0', label: '一般性问题' },
          { code: 'TJ2', label: '枪械' },
          { code: 'TJ3', label: '火炮' },
          { code: 'TJ4', label: '弹药、引信、火工品' },
          { code: 'TJ5', label: '爆破器材、烟火器材、火炸药' },
          { code: 'TJ6', label: '水中兵器' },
          { code: 'TJ7', label: '火箭、导弹' },
          { code: 'TJ8', label: '战车、战舰、战机、航天武器' },
          { code: 'TJ9', label: '核武器与其他特种武器及其防护设备' }
        ]
      },
      {
        code: 'TK',
        label: '能源与动力工程',
        children: [
          { code: 'TK0', label: '一般性问题' },
          { code: 'TK1', label: '热力工程、热机' },
          { code: 'TK2', label: '蒸汽动力工程' },
          { code: 'TK3', label: '热工量测和热工自动控制' },
          { code: 'TK4', label: '内燃机' },
          { code: 'TK5', label: '特殊热能及其机械' },
          { code: 'TK6', label: '生物能及其利用' },
          { code: 'TK7', label: '水能、水力机械' },
          { code: 'TK8', label: '风能、风力机械' },
          { code: 'TK91', label: '氢能及其利用' }
        ]
      },
      {
        code: 'TL',
        label: '原子能技术',
        children: [
          { code: 'TL1', label: '基础理论' },
          { code: 'TL2', label: '核燃料及其生产' },
          { code: 'TL3', label: '核反应堆工程' },
          { code: 'TL4', label: '各种核反应堆、核电厂' },
          { code: 'TL5', label: '加速器' },
          { code: 'TL6', label: '受控热核反应（聚变反应理论及实验装置）' },
          { code: 'TL7', label: '辐射防护' },
          { code: 'TL8', label: '粒子探测技术、辐射探测技术与核仪器仪表' },
          { code: 'TL91', label: '核爆炸' },
          { code: 'TL92', label: '放射性同位素的生产与制备' },
          { code: 'TL93', label: '放射性物质的包装、运输和贮存' },
          { code: 'TL94', label: '放射性废物管理及综合利用' },
          { code: 'TL99', label: '原子能技术的应用' }
        ]
      },
      {
        code: 'TM',
        label: '电工技术',
        children: [
          { code: 'TM0', label: '一般性问题' },
          { code: 'TM1', label: '电工基础理论' },
          { code: 'TM2', label: '电工材料' },
          { code: 'TM3', label: '电机' },
          { code: 'TM4', label: '变压器、变流器及电抗器' },
          { code: 'TM5', label: '电器' },
          { code: 'TM6', label: '发电、发电厂' },
          { code: 'TM7', label: '输配电工程、电力网及电力系统' },
          { code: 'TM8', label: '高电压技术' },
          { code: 'TM91', label: '独立电源技术（直接发电）' },
          { code: 'TM92', label: '电气化、电能应用' },
          { code: 'TM93', label: '电气测量技术及仪器' }
        ]
      },
      {
        code: 'TN',
        label: '电子技术、通信技术',
        children: [
          { code: 'TN0', label: '一般性问题' },
          { code: 'TN1', label: '真空电子技术' },
          { code: 'TN2', label: '光电子技术、激光技术' },
          { code: 'TN3', label: '半导体技术' },
          { code: 'TN4', label: '微电子技术、集成电路（IC）' },
          { code: 'TN6', label: '电子元件、组件' },
          { code: 'TN7', label: '基本电子电路' },
          { code: 'TN8', label: '无线电设备、电信设备' },
          { code: 'TN91', label: '通信' },
          { code: 'TN92', label: '无线通信' },
          { code: 'TN93', label: '广播' },
          { code: 'TN94', label: '电视' },
          { code: 'TN95', label: '雷达' },
          { code: 'TN96', label: '无线电导航' },
          { code: 'TN97', label: '电子对抗（干扰及抗干扰）' },
          { code: 'TN99', label: '无线电电子学的应用' }
        ]
      },
      {
        code: 'TP',
        label: '自动化技术、计算机技术',
        children: [
          { code: 'TP1', label: '自动化基础理论' },
          { code: 'TP2', label: '自动化技术及设备' },
          { code: 'TP3', label: '计算技术、计算机技术' },
          { code: 'TP30', label: '一般性问题' },
          { code: 'TP31', label: '计算机软件' },
          { code: 'TP311', label: '程序设计、软件工程' },
          { code: 'TP312', label: '程序语言、算法语言' },
          { code: 'TP313', label: '汇编程序' },
          { code: 'TP314', label: '编译程序、解释程序' },
          { code: 'TP315', label: '管理程序、管理系统' },
          { code: 'TP316', label: '操作系统' },
          { code: 'TP317', label: '程序包（应用软件）' },
          { code: 'TP319', label: '专用应用软件' },
          { code: 'TP32', label: '一般计算器和计算机' },
          { code: 'TP33', label: '电子数字计算机' },
          { code: 'TP34', label: '电子模拟计算机' },
          { code: 'TP35', label: '混合电子计算机' },
          { code: 'TP36', label: '微型计算机' },
          { code: 'TP37', label: '多媒体技术与多媒体计算机' },
          { code: 'TP38', label: '其他计算机' },
          { code: 'TP39', label: '计算机的应用' },
          { code: 'TP391', label: '信息处理' },
          { code: 'TP392', label: '各种专用数据库' },
          { code: 'TP393', label: '计算机网络' },
          { code: 'TP399', label: '在其他方面的应用' },
          { code: 'TP6', label: '射流技术（流控技术）' },
          { code: 'TP7', label: '遥感技术' },
          { code: 'TP8', label: '远动技术' }
        ]
      },
      {
        code: 'TQ',
        label: '化学工业',
        children: [
          { code: 'TQ0', label: '一般性问题' },
          { code: 'TQ11', label: '基本无机化学工业' },
          { code: 'TQ12', label: '非金属元素及其无机化合物化学工业' },
          { code: 'TQ13', label: '金属元素的无机化合物化学工业' },
          { code: 'TQ15', label: '电化学工业' },
          { code: 'TQ16', label: '电热工业、高温制品工业' },
          { code: 'TQ17', label: '硅酸盐工业' },
          { code: 'TQ2', label: '基本有机化学工业' },
          { code: 'TQ31', label: '高分子化合物工业（高聚物工业）' },
          { code: 'TQ32', label: '合成树脂与塑料工业' },
          { code: 'TQ33', label: '橡胶工业' },
          { code: 'TQ34', label: '化学纤维工业' },
          { code: 'TQ35', label: '纤维素质的化学加工工业' },
          { code: 'TQ41', label: '溶剂与增塑剂的生产' },
          { code: 'TQ42', label: '试剂与纯化学品的生产' },
          { code: 'TQ43', label: '胶粘剂工业' },
          { code: 'TQ44', label: '化学肥料工业' },
          { code: 'TQ45', label: '农药工业' },
          { code: 'TQ46', label: '制药化学工业' },
          { code: 'TQ51', label: '燃料化学工业（总论）' },
          { code: 'TQ52', label: '炼焦化学工业' },
          { code: 'TQ53', label: '煤化学及煤的加工利用' },
          { code: 'TQ54', label: '煤炭气化工业' },
          { code: 'TQ55', label: '燃料照明工业' },
          { code: 'TQ56', label: '爆炸物工业、火柴工业' },
          { code: 'TQ57', label: '感光材料工业' },
          { code: 'TQ58', label: '磁性记录材料工业' },
          { code: 'TQ59', label: '光学记录材料工业' },
          { code: 'TQ61', label: '染料及中间体工业' },
          { code: 'TQ62', label: '颜料工业' },
          { code: 'TQ63', label: '涂料工业' },
          { code: 'TQ64', label: '油脂和蜡的化学加工工业、肥皂工业' },
          { code: 'TQ65', label: '香料及化妆品工业' },
          { code: 'TQ9', label: '其他化学工业' }
        ]
      },
      {
        code: 'TS',
        label: '轻工业、手工业、生活服务业',
        children: [
          { code: 'TS0', label: '一般性问题' },
          { code: 'TS1', label: '纺织工业、染整工业' },
          { code: 'TS2', label: '食品工业' },
          { code: 'TS3', label: '制盐工业' },
          { code: 'TS4', label: '烟草工业' },
          { code: 'TS5', label: '皮革工业' },
          { code: 'TS6', label: '木材加工工业、家具制造工业' },
          { code: 'TS7', label: '造纸工业' },
          { code: 'TS8', label: '印刷工业' },
          { code: 'TS91', label: '五金制品工业' },
          { code: 'TS93', label: '工艺美术制品工业' },
          { code: 'TS94', label: '服装工业、制鞋工业' },
          { code: 'TS95', label: '其他轻工业、手工业' },
          { code: 'TS97', label: '生活服务技术' }
        ]
      },
      {
        code: 'TU',
        label: '建筑科学',
        children: [
          { code: 'TU1', label: '建筑基础科学' },
          { code: 'TU19', label: '建筑勘测' },
          { code: 'TU2', label: '建筑设计' },
          { code: 'TU3', label: '建筑结构' },
          { code: 'TU4', label: '土力学、地基基础工程' },
          { code: 'TU5', label: '建筑材料' },
          { code: 'TU6', label: '建筑施工机械和设备' },
          { code: 'TU7', label: '建筑施工' },
          { code: 'TU8', label: '房屋建筑设备' },
          { code: 'TU9', label: '地下建筑' },
          { code: 'TU97', label: '高层建筑' },
          { code: 'TU98', label: '区域规划、城乡规划' },
          { code: 'TU99', label: '市政工程' }
        ]
      },
      {
        code: 'TV',
        label: '水利工程',
        children: [
          { code: 'TV1', label: '水利工程基础科学' },
          { code: 'TV21', label: '水资源调查与水利规划' },
          { code: 'TV22', label: '水工勘测水工设计' },
          { code: 'TV3', label: '水工结构' },
          { code: 'TV4', label: '水工材料' },
          { code: 'TV5', label: '水利工程施工' },
          { code: 'TV6', label: '水利枢纽、水工建筑物' },
          { code: 'TV7', label: '水能利用、水电站工程' },
          { code: 'TV8', label: '治河工程与防洪工程' }
        ]
      }
    ]
  },
  {
    code: 'U',
    label: '交通运输',
    children: [
      { code: 'U1', label: '综合运输' },
      { code: 'U2', label: '铁路运输' },
      { code: 'U4', label: '公路运输' },
      { code: 'U6', label: '水路运输' }
    ]
  },
  {
    code: 'V',
    label: '航空、航天',
    children: [
      { code: 'V1', label: '航空、航天技术的研究与探索' },
      { code: 'V2', label: '航空' },
      { code: 'V4', label: '航天（宇宙航行）' }
    ]
  },
  {
    code: 'X',
    label: '环境科学、安全科学',
    children: [
      { code: 'X1', label: '环境科学基础理论' },
      { code: 'X2', label: '社会与环境' },
      { code: 'X3', label: '环境保护管理' },
      { code: 'X4', label: '灾害及其防治' },
      { code: 'X5', label: '环境污染及其防治' },
      { code: 'X7', label: '行业污染、废物处理与综合利用' },
      { code: 'X8', label: '环境质量评价与环境监测' },
      { code: 'X9', label: '安全科学' }
    ]
  },
  {
    code: 'Z',
    label: '综合性图书',
    children: [
      { code: 'Z1', label: '丛书' },
      { code: 'Z2', label: '百科全书、类书' },
      { code: 'Z3', label: '辞典' },
      { code: 'Z4', label: '论文集、全集、选集、杂著' },
      { code: 'Z5', label: '年鉴、年刊' },
      { code: 'Z6', label: '期刊、连续性出版物' },
      { code: 'Z8', label: '图书报刊目录、文摘、索引' }
    ]
  }
];

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
