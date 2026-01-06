# 数据特征表 - 借阅数据与豆瓣数据融合架构

## 概述

本文档详细描述"书海回响"图书推荐系统中借阅数据与豆瓣数据的融合字段结构，为学术研究提供数据架构参考。

---

## 一、核心数据表结构

### 1.1 借阅数据表 (borrowing_logs)

#### 1.1.1 基础字段定义

| 字段名 | 数据类型 | 长度 | 必填 | 示例值 | 描述 |
|--------|----------|------|------|--------|------|
| borrow_id | VARCHAR | 20 | Y | BL20250815001 | 借阅记录唯一标识 |
| book_barcode | VARCHAR | 12 | Y | 54121109953518 | 图书条码（图书馆内部） |
| call_number | VARCHAR | 50 | Y | TP311.138/LY | 中图法索书号 |
| title | VARCHAR | 200 | Y | 深度学习 | 图书标题 |
| author | VARCHAR | 100 | N | Ian Goodfellow | 作者信息 |
| borrower_id | VARCHAR | 15 | Y | R202308001 | 读者ID（脱敏） |
| borrow_date | DATETIME | - | Y | 2025-08-15 09:30:00 | 借阅时间 |
| return_date | DATETIME | N | N | 2025-09-15 14:20:00 | 归还时间 |
| days_borrowed | INT | - | N | 31 | 借阅天数 |
| renewal_count | TINYINT | - | N | 0 | 续借次数 |

#### 1.1.2 统计数据字段

| 字段名 | 数据类型 | 计算方式 | 更新频率 | 描述 |
|--------|----------|----------|----------|------|
| total_borrows | INT | COUNT(*) | 每日 | 总借阅次数 |
| unique_borrowers | INT | COUNT(DISTINCT borrower_id) | 每日 | 独立借阅人数 |
| avg_borrow_days | DECIMAL(4,1) | AVG(days_borrowed) | 每日 | 平均借阅天数 |
| borrow_frequency | DECIMAL(3,2) | total_borrows/90_days | 每日 | 近90天借阅频率 |
| popularity_rank | INT | RANK() | 每周 | 借阅热度排名 |
| last_borrow_date | DATETIME | MAX(borrow_date) | 实时 | 最后借阅时间 |

### 1.2 豆瓣数据表 (douban_books)

#### 1.2.1 基础信息字段

| 字段名 | 数据类型 | 必填 | 示例值 | 数据来源 | 描述 |
|--------|----------|------|--------|----------|------|
| isbn | VARCHAR | 13 | 9787115428028 | 豆瓣API | ISBN标识 |
| douban_id | VARCHAR | 10 | 25785178 | 豆瓣API | 豆瓣图书ID |
| title | VARCHAR | 200 | 深度学习 | 豆瓣API | 图书标题 |
| author | VARCHAR | 100 | [美] Ian Goodfellow | 豆瓣API | 作者信息 |
| translator | VARCHAR | 100 | 赵申申等 | 豆瓣API | 译者信息 |
| publisher | VARCHAR | 100 | 人民邮电出版社 | 豆瓣API | 出版社 |
| pubdate | VARCHAR | 20 | 2017-07 | 豆瓣API | 出版日期 |
| pages | INT | N | 500 | 豆瓣API | 页数 |
| price | VARCHAR | 20 | 139.00元 | 豆瓣API | 价格 |
| binding | VARCHAR | 20 | 平装 | 豆瓣API | 装帧 |

#### 1.2.2 评价数据字段

| 字段名 | 数据类型 | 范围 | 示例值 | 更新频率 | 描述 |
|--------|----------|------|--------|----------|------|
| rating_avg | DECIMAL | 0.0-10.0 | 8.8 | 每周 | 豆瓣平均评分 |
| rating_count | INT | >=0 | 1247 | 每周 | 评价人数 |
| rating_5star | INT | >=0 | 892 | 每周 | 5星评价数 |
| rating_4star | INT | >=0 | 278 | 每周 | 4星评价数 |
| rating_3star | INT | >=0 | 52 | 每周 | 3星评价数 |
| rating_2star | INT | >=0 | 18 | 每周 | 2星评价数 |
| rating_1star | INT | >=0 | 7 | 每周 | 1星评价数 |
| rating_distribution | JSON | - | {"5":892,"4":278} | 每周 | 评分分布JSON |

#### 1.2.3 标签和分类字段

| 字段名 | 数据类型 | 结构 | 示例值 | 描述 |
|--------|----------|------|--------|------|
| tags | JSON | 数组 | [{"name":"机器学习","count":234},{"name":"深度学习","count":189}] | 用户标签 |
| categories | JSON | 数组 | ["计算机","人工智能","机器学习"] | 学科分类 |
| keywords | JSON | 数组 | ["神经网络","深度学习","tensorflow"] | 关键词 |
| subject_tags | JSON | 对象 | {"technology":0.8,"science":0.6} | 主题相关性 |

### 1.3 融合数据表 (integrated_books)

#### 1.3.1 主键和关联字段

| 字段名 | 数据类型 | 约束 | 描述 |
|--------|----------|------|------|
| book_id | VARCHAR | PRIMARY KEY | 图书唯一标识 |
| isbn | VARCHAR | UNIQUE | ISBN唯一标识 |
| douban_id | VARCHAR | INDEX | 豆瓣ID索引 |
| book_barcode | VARCHAR | INDEX | 图书馆条码索引 |

#### 1.3.2 融合字段设计

| 字段名 | 数据类型 | 计算规则 | 融合来源 | 描述 |
|--------|----------|----------|----------|------|
| standard_title | VARCHAR | 标题标准化 | both | 标准化标题 |
| standard_author | VARCHAR | 作者名规范化 | both | 标准化作者 |
| clc_category | VARCHAR | 中图法分类提取 | borrowing_logs | 中图法分类 |
| borrow_score | DECIMAL(4,2) | 借阅频率标准化 | borrowing_logs | 借阅热度评分 |
| douban_score | DECIMAL(4,2) | 豆瓣评分标准化 | douban_books | 豆瓣评分 |
| quality_index | DECIMAL(4,2) | 综合质量指数 | both | 质量综合指数 |
| recommendation_score | DECIMAL(4,2) | 推荐得分 | 计算字段 | AI推荐得分 |

#### 1.3.3 计算字段详细规则

**借阅热度评分计算**:
```sql
borrow_score = (
    LOG(total_borrows + 1) * 0.4 +
    LOG(unique_borrowers + 1) * 0.3 +
    (90 - avg_borrow_days) / 90 * 0.3
) * 10
```

**豆瓣评分标准化**:
```sql
douban_score = (
    rating_avg * 0.7 +
    LOG(rating_count + 1) * 0.3
)
```

**综合质量指数**:
```sql
quality_index = (
    borrow_score * 0.6 +
    douban_score * 0.4
)
```

---

## 二、数据融合流程

### 2.1 ISBN匹配融合

#### 2.1.1 匹配策略

```python
def isbn_matching(borrowing_data, douban_data):
    matched_books = []
    unmatched_borrowing = []
    unmatched_douban = []
    
    for borrow_record in borrowing_data:
        isbn = extract_isbn(borrow_record.book_barcode)
        douban_match = find_douban_by_isbn(isbn, douban_data)
        
        if douban_match:
            matched_record = merge_records(borrow_record, douban_match)
            matched_books.append(matched_record)
        else:
            unmatched_borrowing.append(borrow_record)
    
    return matched_books, unmatched_borrowing, unmatched_douban
```

#### 2.1.2 匹配效果统计

| 匹配类型 | 数量 | 成功率 | 平均匹配时间 |
|----------|------|--------|-------------|
| ISBN精确匹配 | 1,089 | 91.6% | 0.12秒 |
| ISBN模糊匹配 | 67 | 5.6% | 0.45秒 |
| 标题作者匹配 | 23 | 1.9% | 1.23秒 |
| 索书号匹配 | 10 | 0.8% | 2.15秒 |
| 无法匹配 | 56 | - | - |

### 2.2 数据质量评估

#### 2.2.1 完整性评估

| 字段组 | 完整性 | 关键字段完整性 | 评分 |
|--------|--------|---------------|------|
| 基础信息 | 98.7% | 99.2% | A |
| 借阅统计 | 95.3% | 96.8% | A- |
| 豆瓣评分 | 89.1% | 91.4% | B+ |
| 标签信息 | 76.4% | 82.1% | B |
| 分类信息 | 84.2% | 87.9% | B+ |

#### 2.2.2 一致性评估

**数据一致性检查规则**:
1. 标题一致性: 图书馆标题与豆瓣标题相似度>0.8
2. 作者一致性: 作者姓名标准化后完全匹配
3. 出版信息一致性: 出版年份差异<1年
4. 分类一致性: 中图法分类与豆瓣分类映射准确

**一致性统计**:
- 标题一致性: 94.3%
- 作者一致性: 91.7%
- 出版年份一致性: 88.9%
- 分类一致性: 86.2%

### 2.3 数据更新机制

#### 2.3.1 增量更新策略

```python
def incremental_update():
    # 1. 检测数据变更
    new_borrows = detect_new_borrowing_records()
    updated_douban = detect_douban_rating_changes()
    
    # 2. 批量更新融合表
    for book in new_borrows:
        update_borrowing_statistics(book)
        recalculate_recommendation_score(book)
    
    for book in updated_douban:
        update_douban_data(book)
        recalculate_quality_index(book)
    
    # 3. 触发推荐重新计算
    if significant_changes_detected():
        trigger_recommendation_recalculation()
```

#### 2.3.2 更新频率配置

| 数据类型 | 更新频率 | 触发条件 | 优先级 |
|----------|----------|----------|--------|
| 借阅统计 | 每日 | 新增借阅记录 | 高 |
| 豆瓣评分 | 每周 | 评分变化>5% | 中 |
| 标签信息 | 每月 | 新标签数量>10 | 低 |
| 推荐得分 | 实时 | 相关数据变更 | 高 |

---

## 三、特殊数据处理

### 3.1 异常数据处理

#### 3.1.1 借阅异常识别

**异常类型定义**:
1. 借阅频次异常: 单日借阅>10本
2. 借阅时长异常: 借阅天数>365天
3. 重复借阅异常: 同一用户重复借阅同一本书

**处理策略**:
```python
def handle_anomalous_data(borrowing_record):
    if borrowing_record.is_high_frequency():
        borrowing_record.flag = "HIGH_FREQ"
        borrowing_record.exclude_from_stats = True
    
    if borrowing_record.is_long_term():
        borrowing_record.flag = "LONG_TERM"
        borrowing_record.estimated_return = calculate_estimated_return()
    
    if borrowing_record.is_duplicate():
        borrowing_record.flag = "DUPLICATE"
        borrowing_record.merge_with_previous = True
    
    return borrowing_record
```

#### 3.1.2 豆瓣数据异常

**异常类型**:
1. 评分数据异常: 评分数量与分布不符
2. 标签数据异常: 标签数量异常多或异常少
3. 信息冲突: 同一ISBN对应多个不同图书

**处理方案**:
- 数据验证: 多维度验证数据合理性
- 异常标记: 标记异常数据，不参与推荐计算
- 人工审核: 复杂异常需要人工判断

### 3.2 冷启动数据处理

#### 3.2.1 新书推荐策略

**无历史数据的新书处理**:
1. 基于内容相似性: 寻找相似主题的已推荐图书
2. 基于作者声誉: 利用作者历史作品的推荐效果
3. 基于出版社信誉: 优质出版社的新书优先考虑
4. 基于外部评价: 其他平台的专业评价

#### 3.2.2 零借阅图书处理

**零借阅识别标准**:
```sql
SELECT book_id, title, borrow_count
FROM integrated_books 
WHERE borrow_count = 0 
AND publication_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
AND quality_index >= 7.0
```

**处理流程**:
1. 识别零借阅图书
2. 评估潜在价值 (基于豆瓣数据)
3. AI智能筛选
4. 推广建议生成

---

## 四、数据隐私与安全

### 4.1 隐私保护措施

#### 4.1.1 读者信息脱敏

**脱敏策略**:
- 读者ID哈希化: 使用SHA-256算法
- 借阅记录时间模糊化: 精确到小时级别
- 统计分析时使用聚合数据: 不显示个体行为

#### 4.1.2 数据访问控制

**权限分级**:
- 基础数据: 所有研究人员可访问
- 统计分析: 注册用户可访问
- 原始借阅记录: 仅项目核心成员可访问
- 个人信息: 严格限制访问

### 4.2 数据安全措施

#### 4.2.1 数据加密

**加密方案**:
- 传输加密: HTTPS/TLS 1.3
- 存储加密: AES-256
- 密钥管理: 专用密钥管理系统

#### 4.2.2 审计日志

**审计内容**:
- 数据访问记录: 谁、何时、访问了什么
- 数据修改记录: 修改内容、修改原因
- 异常访问检测: 非正常访问模式识别

---

## 五、数据质量改进建议

### 5.1 短期改进

1. **提升匹配率**: 优化ISBN匹配算法，引入模糊匹配
2. **完善数据验证**: 增加更多数据一致性检查规则
3. **异常处理优化**: 建立更智能的异常检测机制

### 5.2 中期发展

1. **多源数据融合**: 引入更多外部数据源 (国家图书馆、WorldCat)
2. **实时数据更新**: 建立实时数据同步机制
3. **数据质量监控**: 建立自动化的数据质量监控系统

### 5.3 长期规划

1. **知识图谱构建**: 建立图书-作者-主题知识图谱
2. **机器学习优化**: 使用ML技术优化数据融合效果
3. **标准化推广**: 推动行业数据标准化

---

## 结论

本文档详细描述了"书海回响"图书推荐系统的数据架构，为图书馆学AI应用研究提供了完整的数据基础。数据融合方案既保证了数据质量，又保护了用户隐私，为学术研究和实践应用提供了可靠的数据支撑。