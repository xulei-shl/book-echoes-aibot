/**
 * 查询扩展服务
 * 负责将用户的简单查询扩展为多个语义丰富的检索探针
 */

import { resolveLLMConfig } from '@/src/utils/aibot-env';
import { loadPrompt } from '@/src/core/aibot/promptLoader';
import { getLogger } from '@/src/utils/logger';
import type { QueryExpansionResult, ExpandedProbe } from '@/src/core/aibot/types';

const logger = getLogger('aibot.queryExpansion');

// 缓存prompt模板
let cachedPromptTemplate: string | null = null;

/**
 * 加载查询扩展prompt模板
 */
async function getExpansionPrompt(): Promise<string> {
    if (cachedPromptTemplate) {
        return cachedPromptTemplate;
    }

    try {
        const template = await loadPrompt('simple_expanded_probes');
        cachedPromptTemplate = template;
        return template;
    } catch (error) {
        logger.error('加载查询扩展prompt失败', { error });
        throw error;
    }
}

/**
 * 解析LLM返回的JSON结果
 */
function parseExpansionResult(rawOutput: string, originalQuery: string): QueryExpansionResult {
    try {
        // 尝试直接解析JSON
        let jsonStr = rawOutput.trim();

        // 移除可能的markdown代码块标记
        if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        const parsed = JSON.parse(jsonStr);

        // 验证结构
        if (!parsed.expanded_probes || !Array.isArray(parsed.expanded_probes)) {
            throw new Error('解析结果缺少expanded_probes数组');
        }

        const probes: ExpandedProbe[] = parsed.expanded_probes.map((probe: any, index: number) => ({
            type: probe.type || `probe_${index}`,
            label: probe.label || `探针${index + 1}`,
            text: probe.text || ''
        }));

        // 过滤掉空文本的探针
        const validProbes = probes.filter(p => p.text.trim().length > 0);

        logger.info('查询扩展解析成功', {
            originalQuery,
            probesCount: validProbes.length,
            probeTypes: validProbes.map(p => p.type)
        });

        return {
            originalQuery: parsed.original_query || originalQuery,
            expandedProbes: validProbes,
            success: true
        };
    } catch (error) {
        logger.error('解析查询扩展结果失败', {
            error,
            rawOutput: rawOutput.substring(0, 500),
            originalQuery
        });

        // 返回降级结果：仅使用原始查询
        return {
            originalQuery,
            expandedProbes: [],
            success: false,
            error: error instanceof Error ? error.message : '解析失败'
        };
    }
}

/**
 * 调用LLM进行查询扩展
 */
export async function expandQuery(query: string): Promise<QueryExpansionResult> {
    const startTime = Date.now();

    logger.info('开始查询扩展', { query });

    try {
        // 获取prompt模板
        const systemPrompt = await getExpansionPrompt();

        // 获取LLM配置
        const llmConfig = resolveLLMConfig();

        // 构建请求
        const requestBody = {
            model: llmConfig.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: query }
            ],
            temperature: 0.7, // 适度创造性
            max_tokens: 1024
        };

        logger.debug('发送查询扩展请求', {
            model: llmConfig.model,
            queryLength: query.length
        });

        const response = await fetch(`${llmConfig.baseURL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${llmConfig.apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error('LLM API调用失败', {
                status: response.status,
                error: errorText
            });
            throw new Error(`LLM API返回 ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const rawOutput = data.choices?.[0]?.message?.content || '';

        const duration = Date.now() - startTime;
        logger.info('查询扩展LLM调用完成', {
            query,
            duration,
            outputLength: rawOutput.length
        });

        // 解析结果
        const result = parseExpansionResult(rawOutput, query);
        result.duration = duration;

        return result;

    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error('查询扩展失败', { error, query, duration });

        // 返回降级结果
        return {
            originalQuery: query,
            expandedProbes: [],
            success: false,
            error: error instanceof Error ? error.message : '查询扩展失败',
            duration
        };
    }
}

/**
 * 提取所有检索文本（原始查询 + 扩展探针）
 */
export function extractSearchTexts(result: QueryExpansionResult): string[] {
    const texts: string[] = [result.originalQuery];

    if (result.success && result.expandedProbes.length > 0) {
        result.expandedProbes.forEach(probe => {
            if (probe.text.trim()) {
                texts.push(probe.text);
            }
        });
    }

    logger.debug('提取检索文本', {
        originalQuery: result.originalQuery,
        totalTexts: texts.length
    });

    return texts;
}
