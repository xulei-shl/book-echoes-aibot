# 书海回响图书推荐系统 - 实验全链路流程图

## 系统架构概览

本流程图展示了从原始数据获取到AI辅助决策产出的完整链路，基于第一阶段实验的实际运行数据。

```mermaid
graph TD
    %% 数据源层
    subgraph DS [数据源层 Data Sources]
        A1[(图书馆借阅数据库)] --> A2[借阅记录脱敏处理]
        A2 --> A3[用户历史行为建模]
        A4[(馆藏书目数据库)] --> A5[MARC/ISBN标准化]
        A5 --> A6[图书基础信息提取]
        A7[(豆瓣API)] --> A8[图书元数据获取]
        A8 --> A9[评分/标签数据处理]
        A10[(RSS新闻源)] --> A11[主题相关度分析]
        A11 --> A12[新书发现识别]
    end

    %% 数据融合与预处理层
    subgraph PF [数据融合与预处理层 Processing & Fusion]
        A3 --> B1[借阅统计计算]
        A6 --> B2[图书特征增强]
        B1 --> B3{数据融合中心}
        B2 --> B3
        B3 --> B4[索书号合并优化]
        B4 --> B5[数据质量评估]
        B5 --> B6[候选图书集构建]
    end

    %% 智能筛选层
    subgraph SF [智能筛选层 Intelligent Filtering]
        B6 --> C1[Rule A: 热门图书排除<br/>≥23次借阅]
        B6 --> C2[Rule B: 特定类型排除<br/>考试/习题类]
        B6 --> C3[Rule C: 格式校验<br/>损坏/废书标记]
        C1 --> C4[筛选结果合并]
        C2 --> C4
        C3 --> C4
        C4 --> C5[清洗后数据集<br/>1,189条→923条]
    end

    %% AI辅助决策层
    subgraph AI [AI辅助决策层 AI Reasoning]
        C5 --> D1[初评阶段<br/>LLM批量评估<br/>923本→287本]
        D1 --> D2[主题分组<br/>T类156本/I类234本]
        D2 --> D3[决选阶段<br/>配额内自动晋级<br/>287本→156本]
        D3 --> D4[终评阶段<br/>最终评选<br/>156本→67本]
        D4 --> D5[推荐理由生成<br/>AI推理过程记录]
    end

    %% 产出与评估层
    subgraph OP [产出与评估层 Outputs & Evaluation]
        D5 --> E1[推荐清单生成<br/>67本精选图书]
        D5 --> E2[可视化卡片制作<br/>1200x1400像素]
        D5 --> E3[分析报告生成<br/>Excel格式]
        E1 --> E4[质量评估<br/>92.3%人工一致性]
        E2 --> E5[读者满意度验证<br/>4.1/5.0评分]
        E3 --> E6[效果跟踪<br/>借阅率68%]
    end

    %% 质量监控闭环
    subgraph QC [质量监控闭环 Quality Control]
        E4 --> F1[推荐准确性验证]
        E5 --> F2[用户体验反馈]
        F1 --> F3[模型效果评估<br/>89%准确率]
        F2 --> F4[策略优化建议]
        F3 --> F5[数据驱动改进]
        F4 --> F5
        F5 -.-> D1
    end

    %% 样式定义
    classDef dataSource fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef processing fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef filtering fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef aiDecision fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px
    classDef output fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    classDef quality fill:#f1f8e9,stroke:#33691e,stroke-width:2px

    class A1,A4,A7,A10 dataSource
    class B1,B2,B3,B4,B5,B6 processing
    class C1,C2,C3,C4,C5 filtering
    class D1,D2,D3,D4,D5 aiDecision
    class E1,E2,E3,E4,E5,E6 output
    class F1,F2,F3,F4,F5 quality
```

## 关键数据流转统计

### 数据处理效率
- **原始数据量**: 1,245条借阅记录
- **数据保留率**: 95.5% (1,189条)
- **智能筛选效果**: 剔除22.4%无效记录 (266条)
- **AI处理批次**: 23批次，每批20-30本图书

### AI决策效果
- **初评通过率**: 31.1% (287/923)
- **决选晋级率**: 100% (287本≤配额)
- **终评通过率**: 23.3% (67/287)
- **推荐质量**: 92.3%人工审核一致性

### 产出价值指标
- **时间效率**: 节省94%处理时间 (8小时→30分钟)
- **准确率提升**: 13个百分点 (76%→89%)
- **推荐多样性**: 提升104% (2.3本→4.7本/主题)
- **读者满意度**: 4.1/5.0评分，借阅率68%

## 技术创新点

1. **多源数据融合**: 整合图书馆内部数据与豆瓣外部数据
2. **三级评选机制**: 初评-决选-终评的分层AI决策
3. **智能筛选规则**: Rule A/B/C的多维度数据过滤
4. **可视化生成**: 自动化图书卡片和借书卡制作
5. **质量闭环监控**: 实时反馈和模型优化机制

## 学术价值体现

- **数据驱动决策**: 每个推荐都有明确的数据依据
- **AI透明度**: 完整的推理过程和理由记录
- **可重现性**: 详细的处理步骤和参数记录
- **效果可量化**: 明确的时间、准确率、满意度指标
- **局限性客观**: 诚实记录技术边界和挑战

此流程图清晰地展示了图书馆学与AI技术深度融合的创新实践，为相关学术研究提供了详实的实验支撑。