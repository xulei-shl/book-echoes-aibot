// 创建测试函数
async function testClassification() {
    const testInput = "大模型的技术民主化";

    try {
        const response = await fetch('http://localhost:3000/api/local-aibot/classify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userInput: testInput,
                messages: []
            })
        });

        const result = await response.json();
        console.log('测试输入:', testInput);
        console.log('分类结果:', JSON.stringify(result, null, 2));

        if (result.intent === 'search') {
            console.log('✅ 修复成功！现在正确分类为 search');
        } else {
            console.log('❌ 修复失败，仍然分类为:', result.intent);
            console.log('原因:', result.reason);
        }
    } catch (error) {
        console.error('测试失败:', error);
    }
}

// 运行测试
console.log('测试分类器修复效果...');
testClassification();