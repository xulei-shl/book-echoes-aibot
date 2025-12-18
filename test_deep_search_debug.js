// 测试深度检索API的调试脚本

async function testDeepSearchAPI() {
    try {
        console.log('测试深度检索API...');
        
        const response = await fetch('http://127.0.0.1:8000/api/books/multi-query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                markdown_text: '人工智能和相关算法技术在民主选举中既是提升效率与透明度的重要工具，也是引发舆论操控、隐私侵犯和合法性危机的潜在风险源，体现出复杂的双重性和内在矛盾。',
                per_query_top_k: 8,
                final_top_k: 12,
                enable_rerank: true,
                response_format: 'json'
            })
        });
        
        if (!response.ok) {
            console.error('API调用失败:', response.status, response.statusText);
            return;
        }
        
        const data = await response.json();
        console.log('API响应成功');
        console.log('完整响应数据:', JSON.stringify(data, null, 2));
        console.log('\n响应数据结构:');
        console.log('- context_plain_text存在:', !!data.context_plain_text);
        console.log('- results存在:', !!data.results);
        console.log('- results类型:', Array.isArray(data.results) ? '数组' : typeof data.results);
        console.log('- results长度:', data.results ? data.results.length : 0);
        console.log('- metadata:', data.metadata);
        
        if (data.results && data.results.length > 0) {
            console.log('\n前3个结果样本:');
            data.results.slice(0, 3).forEach((item, index) => {
                console.log(`结果${index + 1}:`);
                console.log('- book_id:', item.book_id);
                console.log('- title:', item.title || item.豆瓣书名);
                console.log('- author:', item.author || item.豆瓣作者);
                console.log('- final_score:', item.final_score);
                console.log('- similarity_score:', item.similarity_score);
            });
        }
        
    } catch (error) {
        console.error('测试失败:', error);
    }
}

testDeepSearchAPI();