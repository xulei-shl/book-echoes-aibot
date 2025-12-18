import { classifyUserIntent } from './src/core/aibot/classifier.js';

// 测试修复后的分类效果
async function testClassifier() {
    console.log('测试分类器修复效果...\n');

    const testCases = [
        '大模型的技术民主化',
        '量子力学的哲学意义',
        '明清时期的文学发展',
        '推荐几本关于心理学的好书',
        '机器学习的入门教材',
        '今天天气怎么样',
        '你叫什么名字',
        '你好'
    ];

    for (const testCase of testCases) {
        try {
            console.log(`测试用例: "${testCase}"`);
            const result = await classifyUserIntent({
                userInput: testCase,
                messages: []
            });
            console.log('分类结果:', JSON.stringify(result, null, 2));
            console.log('---');
        } catch (error) {
            console.error(`测试 "${testCase}" 时出错:`, error);
            console.log('---');
        }
    }
}

// 检查是否有ESM支持
if (typeof import !== 'undefined') {
    testClassifier().catch(console.error);
} else {
    console.log('请使用 Node.js 运行此脚本，并确保支持 ES modules');
}