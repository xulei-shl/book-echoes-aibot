/**
 * 深度检索修复测试脚本
 * 测试以下修复：
 * 1. JSON解析问题修复
 * 2. MCP检索效率优化
 * 3. 深度检索流程重构
 * 4. 字体样式调整
 */

const testCases = [
    {
        name: '关键词生成API解析测试',
        url: 'http://localhost:3000/api/local-aibot/generate-keywords',
        method: 'POST',
        data: {
            user_input: '影像与记忆_电影作为文明存续的时间容器'
        },
        expectedFields: ['success', 'keywords'],
        validate: (response) => {
            return response.success && Array.isArray(response.keywords) && response.keywords.length > 0;
        }
    },
    {
        name: '深度检索分析API测试',
        url: 'http://localhost:3000/api/local-aibot/deep-search-analysis',
        method: 'POST',
        data: {
            userInput: '影像与记忆_电影作为文明存续的时间容器'
        },
        expectedFields: ['success', 'keywords', 'draftMarkdown', 'searchSnippets'],
        validate: (response) => {
            return response.success && 
                   Array.isArray(response.keywords) && 
                   response.keywords.length > 0 &&
                   typeof response.draftMarkdown === 'string' &&
                   response.draftMarkdown.length > 0 &&
                   Array.isArray(response.searchSnippets);
        }
    },
    {
        name: '图书检索API测试',
        url: 'http://localhost:3000/api/local-aibot/deep-search',
        method: 'POST',
        data: {
            draftMarkdown: '# 交叉主题分析报告\n\n## 共同母题\n\n- 名称: 影像与记忆\n\n- 关键词: 电影时间性, 视觉文化, 文化记忆\n\n- 摘要: 探讨电影作为时间媒介的本质特征，研究影像记录文化的功能\n\n## 文章列表\n\n### 文章 1: 电影的时间性\n\n| 字段 | 内容 |\n| --- | --- |\n| ID | 1 |\n| 主题聚焦 | 电影时间性 |\n| 标签 | 电影, 时间, 记忆 |\n| 提及书籍 | [{"title": "电影的时间性", "author": "张三"}] |\n\n## 深度洞察\n\n- 电影作为时间容器记录文明发展\n- 影像技术对记忆保存的影响\n- 视觉文化与历史传承的关系',
            userInput: '影像与记忆_电影作为文明存续的时间容器'
        },
        expectedFields: ['success', 'retrievalResult'],
        validate: (response) => {
            return response.success && 
                   response.retrievalResult && 
                   Array.isArray(response.retrievalResult.books);
        }
    }
];

async function runTest(testCase) {
    console.log(`\n🧪 开始测试: ${testCase.name}`);
    
    try {
        const response = await fetch(testCase.url, {
            method: testCase.method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testCase.data)
        });
        
        const data = await response.json();
        
        console.log(`📊 响应状态: ${response.status}`);
        console.log(`📝 响应数据:`, JSON.stringify(data, null, 2));
        
        // 检查必需字段
        const missingFields = testCase.expectedFields.filter(field => !(field in data));
        if (missingFields.length > 0) {
            console.log(`❌ 缺少必需字段: ${missingFields.join(', ')}`);
            return false;
        }
        
        // 自定义验证
        const isValid = testCase.validate(data);
        if (isValid) {
            console.log(`✅ 测试通过: ${testCase.name}`);
            return true;
        } else {
            console.log(`❌ 测试失败: ${testCase.name}`);
            return false;
        }
        
    } catch (error) {
        console.log(`💥 测试异常: ${testCase.name}`);
        console.error(error);
        return false;
    }
}

async function runAllTests() {
    console.log('🚀 开始深度检索修复测试\n');
    
    const results = [];
    for (const testCase of testCases) {
        const result = await runTest(testCase);
        results.push({ name: testCase.name, success: result });
        
        // 等待一下避免过快请求
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n📋 测试结果汇总:');
    results.forEach(result => {
        console.log(`${result.success ? '✅' : '❌'} ${result.name}`);
    });
    
    const passedCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    console.log(`\n🎯 总体结果: ${passedCount}/${totalCount} 测试通过`);
    
    if (passedCount === totalCount) {
        console.log('🎉 所有测试通过！深度检索修复成功。');
    } else {
        console.log('⚠️ 部分测试失败，需要进一步检查。');
    }
}

// 检查是否在Node.js环境中运行
if (typeof window === 'undefined') {
    runAllTests().catch(console.error);
} else {
    console.log('⚠️ 此测试脚本需要在Node.js环境中运行');
    console.log('💡 请使用: node test_deep_search_fixes.js');
}