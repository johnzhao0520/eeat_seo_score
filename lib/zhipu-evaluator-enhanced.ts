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
      const systemPrompt = this.buildEnhancedSystemPrompt();
      const userPrompt = this.buildEnhancedUserPrompt(content, title, author);

      logger.info("开始智谱AI增强评估", {
        contentLength: content.length,
        title,
        hasAuthor: !!author
      });

      const messages: ZhipuMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ];

      const response = await this.makeZhipuRequest(messages, 8000);

      if (!response || !response.choices || response.choices.length === 0) {
        throw new Error("智谱AI返回了空响应");
      }

      const aiResult = this.parseAIResponse(response.choices[0].message.content);

      logger.info("智谱AI增强评估结果", {
        hasScores: !!aiResult.scores,
        hasAnalysis: !!aiResult.analysis,
        hasSuggestions: !!aiResult.suggestions,
        usage: response.usage
      });

      return this.formatAIResult(aiResult, content, context);
    } catch (error) {
      logger.error("智谱AI增强评估失败", {
        error: error instanceof Error ? error.message : String(error)
      });
      console.error('智谱AI增强评估失败:', error);
      return null;
    }
  }

  private async makeZhipuRequest(messages: ZhipuMessage[], maxTokens: number = 8000, retries: number = 1): Promise<ZhipuResponse> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        logger.info(`智谱AI请求尝试 ${attempt}/${retries}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

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

      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1];
      }

      const trimmedContent = content.trim();
      if (!jsonContent && trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) {
        jsonContent = trimmedContent;
      }

      if (jsonContent) {
        try {
          let fixedJson = this.fixJsonString(jsonContent);
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

      return this.getDefaultAIResult();
    }
  }

  private fixJsonString(jsonStr: string): string {
    try {
      let fixed = jsonStr.replace(/^\uFEFF/, '').trim();
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
      return jsonStr;
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

  private buildEnhancedSystemPrompt(): string {
    return `你是专业的E-E-A-T评估专家，负责根据Google的Experience、Expertise、Authoritativeness和Trustworthiness原则评估文章。

**最重要的要求：**
1. **必须基于文章的具体内容进行评估**
2. **所有评估必须有文章中的具体证据支撑**
3. **反馈必须具体、可操作，避免空泛建议**

**关键指令：**

1. **输出格式**：仅提供有效的JSON。不要解释、评论或代码块（不要\`\`\`）。以{开始，以}结束。

2. **具体性要求**：
   - 每个evidence必须引用文章中的具体内容或观点
   - 每个strengths必须指出文章中具体的优点
   - 每个issues必须明确指出文章中具体的问题
   - 每个suggestions必须是具体、可执行的改进建议

3. **避免空泛建议**：
   - 不要说"增加专业深度"，要说"在第X段关于Y的讨论中，应该补充Z的具体数据/案例"
   - 不要说"改进可信度"，要说"文章中提到的关于A的论断缺少引用，建议添加具体的研究报告或数据来源"
   - 不要说"增加经验分享"，要说"可以描述你在实施B时的具体过程，包括遇到的挑战和解决方案"

## **评估方法：**

首先，分析文章以确定：
- **文章类型**：（教程、指南、观点/分析、新闻、产品评测、案例研究、研究、列表文章等）
- **领域背景**：（技术/B2B、消费、医疗、金融、创意等）
- **主要目的**：（教育、商业、信息、导航）

然后使用适合该背景的视角评估每个E-E-A-T因素。

## **必须的JSON输出格式**：

{
  "articleContext": {
    "type": "article_type",
    "niche": "niche_context",
    "purpose": "primary_purpose",
    "targetAudience": "target_audience_description",
    "contentLength": number,
    "readingTime": number
  },
  "scores": {
    "experience": {
      "score": number,
      "evidence": ["从文章中提取的2-3条具体证据，必须引用文章内容"],
      "issues": ["2-3个具体问题，指出文章中缺少或不足的地方"],
      "strengths": ["2-3个具体优势，引用文章中的实际内容"],
      "suggestions": ["2-3条具体建议，告诉作者在哪里、如何改进"]
    },
    "expertise": {
      "score": number,
      "evidence": ["具体证据，引用文章中的专业知识展现"],
      "issues": ["具体问题，如缺少数据、过时信息、错误概念等"],
      "strengths": ["具体优势，如准确的信息、深度的分析等"],
      "suggestions": ["具体建议，如补充哪些数据、更新哪些内容等"]
    },
    "authoritativeness": {
      "score": number,
      "evidence": ["具体的权威性证据，如引用、资历展示等"],
      "issues": ["具体问题，如缺少引用、来源不明确等"],
      "strengths": ["具体的权威性表现"],
      "suggestions": ["具体的权威性提升建议"]
    },
    "trustworthiness": {
      "score": number,
      "evidence": ["具体的可信度证据"],
      "issues": ["具体的可信度问题，如偏见、误导性表述等"],
      "strengths": ["具体的可信度表现"],
      "suggestions": ["具体的可信度改进建议"]
    },
    "overall": number
  },
  "analysis": {
    "strengths": ["3-5条整体优势，必须具体"],
    "weaknesses": ["3-5条整体劣势，必须具体"],
    "opportunities": ["3-5条改进机会，必须具体"]
  },
  "summary": "200-300字的详细总结，指出文章的核心价值和最需要改进的地方",
  "suggestions": [
    {
      "priority": "high/medium/low",
      "category": "Experience/Expertise/Authoritativeness/Trustworthiness",
      "description": "具体的改进描述，不要空泛",
      "actionItems": ["3-5条具体的、可执行的行动项"]
    }
  ]
}

**记住：每一条反馈都必须基于文章的具体内容，避免所有空泛的、模板化的建议！**`;
  }

  private buildEnhancedUserPrompt(content: string, title?: string, author?: string): string {
    return `请详细评估以下内容的E-E-A-T表现：

${title ? `标题：${title}\n` : ''}${author ? `作者：${author}\n` : ''}内容：
${content}

**重要提醒：**
1. 评估必须基于文章的具体内容
2. 所有证据、问题、优势、建议都必须具体且有针对性
3. 避免空泛的模板化反馈
4. 如果文章在某个方面确实做得很好，请给予相应的分数
5. 如果文章在某些方面不足，请明确指出具体问题并提供可操作的改进建议

请返回完整、详细的JSON格式评估结果。`;
  }

  private formatAIResult(aiResult: any, content: string, context?: ArticleContext): EEATResult {
    const articleContext = aiResult.articleContext || context || this.generateDefaultContext(content);

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

    const suggestions = Array.isArray(aiResult.suggestions) ? aiResult.suggestions.map((s: any) => ({
      priority: ['high', 'medium', 'low'].includes(s.priority) ? s.priority : 'medium',
      category: s.category || '综合',
      description: s.description || '',
      actionItems: Array.isArray(s.actionItems) ? s.actionItems : []
    })) : [];

    logger.info("智谱AI增强评估结果格式化", {
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
      summary: aiResult.summary || '智谱AI增强评估完成。',
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