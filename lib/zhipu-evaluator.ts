import { EEATResult, ArticleContext, ScoreDetails } from "@/types/eeat";
import { logger } from "./logger";

interface ZhipuMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ZhipuResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class ZhipuEvaluator {
  private apiKey: string;
  private baseUrl: string = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ZHIPU_API_KEY || "";
    if (!this.apiKey) {
      throw new Error("智谱AI API Key未配置");
    }
  }

  async evaluateWithAI(
    content: string,
    title?: string,
    author?: string,
    context?: ArticleContext
  ): Promise<EEATResult | null> {
    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(content, title, author);

      logger.info("开始智谱AI评估", {
        contentLength: content.length,
        title,
        hasAuthor: !!author
      });

      const messages: ZhipuMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ];

      const response = await this.makeZhipuRequest(messages, 6000); // 增加到6000 tokens以支持完整响应

      if (!response || !response.choices || response.choices.length === 0) {
        throw new Error("智谱AI返回了空响应");
      }

      const aiResult = this.parseAIResponse(response.choices[0].message.content);

      logger.info("智谱AI解析结果", {
        hasScores: !!aiResult.scores,
        hasAnalysis: !!aiResult.analysis,
        hasSuggestions: !!aiResult.suggestions,
        usage: response.usage
      });

      return this.formatAIResult(aiResult, content, context);
    } catch (error) {
      logger.error("智谱AI评估失败", {
        error: error instanceof Error ? error.message : String(error)
      });
      console.error('智谱AI评估失败:', error);
      return null;
    }
  }

  private async makeZhipuRequest(messages: ZhipuMessage[], maxTokens: number = 3500, retries: number = 2): Promise<ZhipuResponse> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        logger.info(`智谱AI请求尝试 ${attempt}/${retries}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 2分钟超时

        const response = await fetch(this.baseUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "glm-4.6",
            messages: messages,
            temperature: 0.3,
            max_tokens: maxTokens,
            stream: false
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`智谱AI API错误 ${response.status}: ${errorText}`);
        }

        return response.json() as Promise<ZhipuResponse>;
      } catch (error) {
        logger.error(`智谱AI请求失败 (尝试 ${attempt}/${retries})`, {
          error: error instanceof Error ? error.message : String(error)
        });

        if (attempt === retries) {
          throw error;
        }

        // 等待一段时间再重试
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      }
    }

    throw new Error(`智谱AI请求失败，已重试 ${retries} 次`);
  }

  private parseAIResponse(content: string): any {
    try {
      logger.info("智谱AI原始响应", {
        contentLength: content.length,
        hasMarkdown: content.includes('```json'),
        contentPreview: content.substring(0, 500) + (content.length > 500 ? "..." : "")
      });

      let jsonContent = null;

      // 智谱AI可能不强制JSON格式，需要解析
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1];
      }

      // 尝试直接解析JSON
      const trimmedContent = content.trim();
      if (!jsonContent && trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) {
        jsonContent = trimmedContent;
      }

      // 如果找到JSON内容，尝试解析和修复
      if (jsonContent) {
        try {
          // 尝试修复常见的JSON问题
          let fixedJson = this.fixJsonString(jsonContent);
          logger.info("JSON修复尝试", {
            originalLength: jsonContent.length,
            fixedLength: fixedJson.length,
            wasModified: fixedJson !== jsonContent
          });

          const parsed = JSON.parse(fixedJson);

          logger.info("智谱AI JSON解析成功", {
            hasArticleContext: !!parsed.articleContext,
            hasScores: !!parsed.scores,
            hasAnalysis: !!parsed.analysis,
            hasSuggestions: !!parsed.suggestions,
            overallScore: parsed.scores?.overall
          });
          return parsed;
        } catch (parseError) {
          logger.error("JSON解析失败", {
            jsonContent: jsonContent.substring(0, 1000),
            parseError: parseError instanceof Error ? parseError.message : String(parseError)
          });
        }
      }

      throw new Error("无法解析AI响应为JSON格式");
    } catch (error) {
      logger.error("解析智谱AI响应失败", {
        contentPreview: content.substring(0, 500),
        error: error instanceof Error ? error.message : String(error)
      });

      // 返回默认结构，防止系统崩溃
      return this.getDefaultAIResult();
    }
  }

  private fixJsonString(jsonStr: string): string {
    try {
      // 移除可能的BOM和多余空白
      let fixed = jsonStr.replace(/^\uFEFF/, '').trim();

      // 尝试修复常见的JSON问题
      // 1. 检查是否有未闭合的引号或括号
      const stack = [];
      let inString = false;
      let escapeNext = false;

      for (let i = 0; i < fixed.length; i++) {
        const char = fixed[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === '\\') {
          escapeNext = true;
          continue;
        }

        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === '{' || char === '[') {
            stack.push(char);
          } else if (char === '}' || char === ']') {
            const expected = char === '}' ? '{' : '[';
            if (stack.length === 0 || stack[stack.length - 1] !== expected) {
              // 结构不匹配，尝试修复
              logger.warn("JSON结构不匹配", {
                position: i,
                char,
                expected,
                stack: [...stack]
              });
            } else {
              stack.pop();
            }
          }
        }
      }

      // 如果有未闭合的结构，尝试修复
      if (stack.length > 0) {
        logger.info("尝试修复未闭合的JSON结构", { unclosed: stack });
        while (stack.length > 0) {
          const last = stack.pop();
          fixed += last === '{' ? '}' : ']';
        }
      }

      return fixed;
    } catch (error) {
      logger.error("JSON修复失败", {
        error: error instanceof Error ? error.message : String(error)
      });
      return jsonStr; // 返回原始字符串
    }
  }

  private getDefaultAIResult(): any {
    return {
      articleContext: {
        type: "文章",
        niche: "通用",
        purpose: "信息",
        targetAudience: "普通读者",
        contentLength: 0,
        readingTime: 0
      },
      scores: {
        experience: { score: 5, evidence: [], issues: [], strengths: [], suggestions: [] },
        expertise: { score: 5, evidence: [], issues: [], strengths: [], suggestions: [] },
        authoritativeness: { score: 5, evidence: [], issues: [], strengths: [], suggestions: [] },
        trustworthiness: { score: 5, evidence: [], issues: [], strengths: [], suggestions: [] },
        overall: 5
      },
      analysis: {
        strengths: ["需要更多信息进行分析"],
        weaknesses: ["信息不足"],
        opportunities: ["可以改进的地方"]
      },
      summary: "智谱AI评估完成，但由于响应格式问题，使用默认评估。",
      suggestions: []
    };
  }

  private buildSystemPrompt(): string {
    return `你是一位专业的E-E-A-T（Experience, Expertise, Authoritativeness, Trustworthiness）内容评估专家。

**重要要求**：
1. 所有输出必须使用中文
2. 深度理解内容质量
3. 提供专业的评估建议
4. 严格按照JSON格式输出

**评估标准（1-10分制）**：

**Experience（经验）**：
- 第一手经验和案例研究
- 详细的操作步骤和流程
- 具体数据和指标
- 实践见解和经验分享

**Expertise（专业知识）**：
- 信息准确性和时效性
- 深度解释和专业见解
- 对复杂性的理解
- 行业发展趋势认知

**Authoritativeness（权威性）**：
- 可信来源和引用
- 作者资质和背景
- 原创研究和数据
- 行业认可和权威背书

**Trustworthiness（可信度）**：
- 内容平衡性和客观性
- 信息透明度和可验证性
- 专业编辑和更新频率
- 避免误导性表述

**输出格式要求**：
请严格按以下JSON格式输出，所有文本内容必须使用中文：

{
  "articleContext": {
    "type": "文章类型（中文）",
    "niche": "利基市场（中文）",
    "purpose": "主要目的（中文）",
    "targetAudience": "目标受众（中文）",
    "contentLength": 内容长度（数字）,
    "readingTime": "阅读时间（中文）"
  },
  "scores": {
    "experience": {
      "score": 分数(1-10),
      "evidence": ["证据1（中文）", "证据2（中文）"],
      "strengths": ["优势1（中文）", "优势2（中文）"],
      "issues": ["问题1（中文）", "问题2（中文）"],
      "suggestions": ["建议1（中文）", "建议2（中文）"]
    },
    "expertise": {
      "score": 分数(1-10),
      "evidence": ["证据1（中文）", "证据2（中文）"],
      "strengths": ["优势1（中文）", "优势2（中文）"],
      "issues": ["问题1（中文）", "问题2（中文）"],
      "suggestions": ["建议1（中文）", "建议2（中文）"]
    },
    "authoritativeness": {
      "score": 分数(1-10),
      "evidence": ["证据1（中文）", "证据2（中文）"],
      "strengths": ["优势1（中文）", "优势2（中文）"],
      "issues": ["问题1（中文）", "问题2（中文）"],
      "suggestions": ["建议1（中文）", "建议2（中文）"]
    },
    "trustworthiness": {
      "score": 分数(1-10),
      "evidence": ["证据1（中文）", "证据2（中文）"],
      "strengths": ["优势1（中文）", "优势2（中文）"],
      "issues": ["问题1（中文）", "问题2（中文）"],
      "suggestions": ["建议1（中文）", "建议2（中文）"]
    },
    "overall": 总体分数(1-10)
  },
  "analysis": {
    "strengths": ["整体优势1（中文）", "整体优势2（中文）"],
    "weaknesses": ["整体弱点1（中文）", "整体弱点2（中文）"],
    "opportunities": ["改进机会1（中文）", "改进机会2（中文）"]
  },
  "summary": "评估总结（中文）",
  "suggestions": [
    {
      "priority": "high/medium/low",
      "category": "Experience/Expertise/Authoritativeness/Trustworthiness",
      "description": "改进建议描述（中文）",
      "actionItems": ["具体行动1（中文）", "具体行动2（中文）"]
    }
  ]
}

注意：所有文本字段必须使用中文，除了数字和优先级字段。`;
  }

  private buildUserPrompt(content: string, title?: string, author?: string): string {
    return `请评估以下内容的E-E-A-T表现：

${title ? `标题：${title}\n` : ''}${author ? `作者：${author}\n` : ''}内容：
---
${content}
---

请基于上述E-E-A-T标准进行专业评估，并提供详细的分析和建议。

**重要提醒**：
- 必须使用中文进行所有分析和建议
- 严格按照JSON格式输出
- 所有文本字段必须使用中文
- 确保评估结果专业、详细、有深度

评估完成后，请用中文总结内容的整体质量水平和改进方向。`;
  }

  private formatAIResult(aiResult: any, content: string, context?: ArticleContext): EEATResult {
    // 使用AI返回的上下文，或传入的context，或生成默认值
    const articleContext = aiResult.articleContext || context || this.generateDefaultContext(content);

    // 确保每个维度的评分都是完整的
    const formatScore = (dimension: string): ScoreDetails => {
      const scoreData = aiResult.scores?.[dimension] || { score: 5 };
      return {
        score: Math.max(1, Math.min(10, Number(scoreData.score || 5))),
        evidence: Array.isArray(scoreData.evidence) ? scoreData.evidence : [],
        issues: Array.isArray(scoreData.issues) ? scoreData.issues : [],
        strengths: Array.isArray(scoreData.strengths) ? scoreData.strengths : [],
        suggestions: Array.isArray(scoreData.suggestions) ? scoreData.suggestions : []
      };
    };

    const experience = formatScore('experience');
    const expertise = formatScore('expertise');
    const authoritativeness = formatScore('authoritativeness');
    const trustworthiness = formatScore('trustworthiness');

    // 计算总体评分
    const overall = aiResult.scores?.overall || (
      experience.score * 0.25 +
      expertise.score * 0.3 +
      authoritativeness.score * 0.25 +
      trustworthiness.score * 0.2
    );

    const scores = {
      experience,
      expertise,
      authoritativeness,
      trustworthiness,
      overall: Math.max(1, Math.min(10, overall))
    };

    // 格式化建议
    const suggestions = Array.isArray(aiResult.suggestions) ? aiResult.suggestions.map((s: any) => ({
      priority: ['high', 'medium', 'low'].includes(s.priority) ? s.priority : 'medium',
      category: s.category || '综合',
      description: s.description || '',
      actionItems: Array.isArray(s.actionItems) ? s.actionItems : []
    })) : [];

    logger.info("智谱AI评估结果格式化", {
      overall,
      experience: experience.score,
      expertise: expertise.score,
      authoritativeness: authoritativeness.score,
      trustworthiness: trustworthiness.score,
      hasAnalysis: !!aiResult.analysis,
      suggestionsCount: suggestions.length
    });

    return {
      articleContext,
      scores,
      analysis: {
        strengths: Array.isArray(aiResult.analysis?.strengths) ? aiResult.analysis.strengths : [],
        weaknesses: Array.isArray(aiResult.analysis?.weaknesses) ? aiResult.analysis.weaknesses : [],
        opportunities: Array.isArray(aiResult.analysis?.opportunities) ? aiResult.analysis.opportunities : []
      },
      summary: aiResult.summary || '智谱AI评估完成。',
      suggestions
    };
  }

  private generateDefaultContext(content: string): ArticleContext {
    return {
      type: '文章',
      niche: '通用',
      purpose: '信息',
      targetAudience: '普通读者',
      contentLength: content.length,
      readingTime: Math.ceil(content.length / 500)
    };
  }
}