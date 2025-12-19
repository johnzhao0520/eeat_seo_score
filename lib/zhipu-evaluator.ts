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

      const response = await this.makeZhipuRequest(messages, 2000); // 限制tokens以加快响应速度

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

  private async makeZhipuRequest(messages: ZhipuMessage[], maxTokens: number = 3500, retries: number = 1): Promise<ZhipuResponse> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        logger.info(`智谱AI请求尝试 ${attempt}/${retries}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8秒超时，为Vercel 10秒限制预留时间

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
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
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
        contentPreview: content.substring(0, 1000),
        contentLength: content.length,
        error: error instanceof Error ? error.message : String(error)
      });

      // 尝试使用简单的解析逻辑
      try {
        // 如果JSON解析失败，尝试提取分数
        const scoreMatch = content.match(/"score":\s*(\d+)/g);
        if (scoreMatch && scoreMatch.length > 0) {
          logger.info("尝试从响应中提取分数", { scoreMatches: scoreMatch });
        }
      } catch (e) {
        // 忽略
      }

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
    return `你是E-E-A-T评估专家。请评估给定内容并严格按JSON格式返回结果。

评分标准（1-10分）：
- Experience：是否有第一手经验、案例研究、数据支撑
- Expertise：信息准确性、专业深度、时效性
- Authoritativeness：可信来源、作者资质、引用质量
- Trustworthiness：内容客观性、透明度、可验证性

必须返回完整JSON：
{
  "articleContext": {
    "type": "文章类型",
    "niche": "领域",
    "purpose": "目的",
    "targetAudience": "受众",
    "contentLength": 实际长度,
    "readingTime": "分钟数分钟"
  },
  "scores": {
    "experience": {
      "score": 1-10的数字,
      "evidence": ["具体证据1", "具体证据2"],
      "strengths": ["优势1", "优势2"],
      "issues": ["问题1", "问题2"],
      "suggestions": ["改进建议1", "改进建议2"]
    },
    "expertise": {...同上格式...},
    "authoritativeness": {...同上格式...},
    "trustworthiness": {...同上格式...},
    "overall": 1-10的总体分数
  },
  "analysis": {
    "strengths": ["优势1", "优势2"],
    "weaknesses": ["弱点1", "弱点2"],
    "opportunities": ["机会1", "机会2"]
  },
  "summary": "评估总结",
  "suggestions": [
    {
      "priority": "high",
      "category": "类别",
      "description": "描述",
      "actionItems": ["行动1", "行动2"]
    }
  ]
}

重要：必须返回有效的、完整的JSON格式。`;
  }

  private buildUserPrompt(content: string, title?: string, author?: string): string {
    return `请评估以下内容的E-E-A-T表现：

${title ? `标题：${title}\n` : ''}${author ? `作者：${author}\n` : ''}内容：
${content.substring(0, 2500)}${content.length > 2500 ? '...' : ''}

请根据内容质量进行1-10分评分，并返回完整的JSON格式评估结果。注意：
1. 根据实际内容质量评分，不要都给5分
2. 提供具体的证据和分析
3. 确保返回格式正确的JSON`;
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