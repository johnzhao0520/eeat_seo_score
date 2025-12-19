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

export class ZhipuEvaluatorPremium {
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
      // 对于长内容进行智能截取，确保AI能及时响应
      const processedContent = this.preprocessContent(content);
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(processedContent, title, author);

      logger.info("开始智谱AI Premium 评估", {
        contentLength: content.length,
        processedLength: processedContent.length,
        wasTruncated: processedContent.length < content.length,
        title,
        hasAuthor: !!author
      });

      const messages: ZhipuMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ];

      // Premium 评估使用更长的超时和更多 tokens
      // 调整为45秒，确保在Vercel Pro的60秒限制内完成
      const response = await this.makeZhipuRequest(messages, 8000, 45000);

      if (!response || !response.choices || response.choices.length === 0) {
        throw new Error("智谱AI返回了空响应");
      }

      const aiResult = this.parseAIResponse(response.choices[0].message.content);

      logger.info("智谱AI Premium 解析结果", {
        hasScores: !!aiResult.scores,
        hasAnalysis: !!aiResult.analysis,
        hasSuggestions: !!aiResult.suggestions,
        usage: response.usage
      });

      return this.formatAIResult(aiResult, content, context);
    } catch (error) {
      logger.error("智谱AI Premium 评估失败", {
        error: error instanceof Error ? error.message : String(error)
      });
      console.error('智谱AI Premium 评估失败:', error);
      return null;
    }
  }

  private async makeZhipuRequest(
    messages: ZhipuMessage[],
    maxTokens: number = 10000,
    timeout: number = 55000,
    retries: number = 1
  ): Promise<ZhipuResponse> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        logger.info(`智谱AI Premium 请求尝试 ${attempt}/${retries}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(this.baseUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "glm-4.6",
            messages: messages,
            temperature: 0.2,  // 降低温度，提高一致性
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
        logger.error(`智谱AI Premium 请求失败 (尝试 ${attempt}/${retries})`, {
          error: error instanceof Error ? error.message : String(error)
        });

        if (attempt === retries) {
          throw error;
        }

        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    throw new Error(`智谱AI Premium 请求失败，已重试 ${retries} 次`);
  }

  private parseAIResponse(content: string): any {
    try {
      logger.info("智谱AI Premium 原始响应", {
        contentLength: content.length,
        hasMarkdown: content.includes('```json'),
        contentPreview: content.substring(0, 500) + (content.length > 500 ? "..." : "")
      });

      let jsonContent = null;
      let parsed = null;

      // 如果包含markdown代码块，提取JSON内容
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1];
      }

      // 如果没有markdown代码块，尝试直接解析
      const trimmedContent = content.trim();
      if (!jsonContent && trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) {
        jsonContent = trimmedContent;
      }

      if (jsonContent) {
        try {
          // 尝试修复JSON字符串
          let fixedJson = this.fixJsonString(jsonContent);
          parsed = JSON.parse(fixedJson);
        } catch (parseError) {
          logger.error("智谱AI Premium JSON解析失败", {
            jsonContent: jsonContent.substring(0, 1000),
            parseError: parseError instanceof Error ? parseError.message : String(parseError)
          });
          throw new Error("JSON解析失败");
        }
      }

      // 检查并修复返回的数据结构
      if (parsed) {
        // 如果AI返回的是 article.scores 格式，需要转换
        if (parsed.article && parsed.article.scores) {
          const articleScores = parsed.article.scores;
          // 转换为我们期望的格式
          parsed.scores = {
            experience: {
              score: articleScores.experience || 5,
              evidence: ["需要更多具体证据"],
              issues: [],
              strengths: [],
              suggestions: []
            },
            expertise: {
              score: articleScores.expertise || 5,
              evidence: ["需要更多专业证据"],
              issues: [],
              strengths: [],
              suggestions: []
            },
            authoritativeness: {
              score: articleScores.authoritativeness || 5,
              evidence: ["需要更多权威性证据"],
              issues: [],
              strengths: [],
              suggestions: []
            },
            trustworthiness: {
              score: articleScores.trustworthiness || 5,
              evidence: ["需要更多可信度证据"],
              issues: [],
              strengths: [],
              suggestions: []
            },
            overall: articleScores.overall || 5
          };
          // 删除错误的格式
          delete parsed.article;
        }

        // 确保scores结构正确
        if (!parsed.scores) {
          throw new Error("缺少scores字段");
        }

        // 确保每个维度都有完整的结构
        ['experience', 'expertise', 'authoritativeness', 'trustworthiness'].forEach(dimension => {
          if (!parsed.scores[dimension] || typeof parsed.scores[dimension] !== 'object') {
            parsed.scores[dimension] = {
              score: 5,
              evidence: [],
              issues: [],
              strengths: [],
              suggestions: []
            };
          } else if (typeof parsed.scores[dimension].score !== 'number') {
            // 如果score不是数字，说明结构有问题
            const score = Number(parsed.scores[dimension]);
            parsed.scores[dimension] = {
              score: isNaN(score) ? 5 : score,
              evidence: [],
              issues: [],
              strengths: [],
              suggestions: []
            };
          }
        });

        logger.info("智谱AI Premium JSON解析成功", {
          hasArticleContext: !!parsed.articleContext,
          hasScores: !!parsed.scores,
          hasAnalysis: !!parsed.analysis,
          hasSuggestions: !!parsed.suggestions,
          overallScore: parsed.scores?.overall
        });

        return parsed;
      }

      throw new Error("无法解析AI响应为JSON格式");
    } catch (error) {
      logger.error("解析智谱AI Premium 响应失败", {
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
      summary: "智谱AI Premium 评估完成，但由于响应格式问题，使用默认评估。",
      suggestions: []
    };
  }

  private preprocessContent(content: string): string {
    // 对于 Premium 版本，限制在8000字符以内，确保AI能及时响应
    const maxLength = 8000;

    if (content.length <= maxLength) {
      return content;
    }

    // 保留开头、中间和结尾部分
    const startLength = Math.floor(maxLength * 0.4);   // 40%
    const endLength = Math.floor(maxLength * 0.3);    // 30%
    const middleLength = maxLength - startLength - endLength;  // 30%
    const middleStart = Math.floor((content.length - middleLength) / 2);

    return (
      content.substring(0, startLength) +
      "\n\n...[内容已截取，保留核心部分]...\n\n" +
      content.substring(middleStart, middleStart + middleLength) +
      "\n\n...[内容已截取，保留结尾部分]...\n\n" +
      content.substring(content.length - endLength)
    );
  }

  private buildSystemPrompt(): string {
    return `你是专业的E-E-A-T评估专家，负责根据Google的Experience、Expertise、Authoritativeness和Trustworthiness原则评估文章。

**最重要的要求：**

1. **输出格式**：仅提供有效的JSON。不要解释、评论或代码块（不要\`\`\`）。以{开始，以}结束。

2. **结构必须严格遵循以下格式**：
   - articleContext（对象）
   - scores（对象，包含4个子对象）
   - analysis（对象）
   - summary（字符串）
   - suggestions（数组）

3. **评分格式要求**：
   - scores.experience 必须是包含 score、evidence、issues、strengths、suggestions 的对象
   - scores.expertise 必须是包含 score、evidence、issues、strengths、suggestions 的对象
   - scores.authoritativeness 必须是包含 score、evidence、issues、strengths、suggestions 的对象
   - scores.trustworthiness 必须是包含 score、evidence、issues、strengths、suggestions 的对象
   - 每个score必须是1-10的数字
   - evidence、issues、strengths、suggestions都必须是字符串数组

You are evaluating an article using Google's E-E-A-T principles. Your assessment must be objective, context-aware, and consistent.

## **Evaluation Approach:**

First, analyze the article to determine:

- **Article Type**: (Tutorial, Guide, Opinion/Analysis, News, Product Review, Case Study, Research, Listicle, etc.)

- **Niche Context**: (Technical/B2B, Consumer, Medical, Financial, Creative, etc.)

- **Primary Purpose**: (Educational, Commercial, Informational, Navigational)

Then evaluate each E-E-A-T factor using the appropriate lens for that context.

## **Adaptive Scoring Rubric**

### **Experience (1-10)**

**Scoring Philosophy**: Experience manifests differently across article types. A tutorial shows experience through detailed steps; an analysis shows it through real-world application; a guide shows it through comprehensive coverage.

**Evidence of Experience may include**:
- First-hand accounts, case studies, or personal examples
- Detailed process descriptions showing "how" not just "what"
- Specific data, metrics, or outcomes from real implementations
- Screenshots, demonstrations, or original visual evidence
- Nuanced insights that only come from doing the work
- Acknowledgment of edge cases or practical challenges

**Scoring Bands**:
- **1-3**: Purely theoretical or generic; lacks any practical grounding
- **4-5**: Limited practical elements; mostly surface-level examples
- **6-7**: Solid practical foundation with relevant examples appropriate to article type
- **8-9**: Strong demonstration of hands-on experience with detailed, applicable insights
- **10**: Extensive depth of practical experience; multiple rich examples; insights that clearly come from extensive real-world application

**Context Adjustments**:
- News articles: Experience shown through access, investigation, or expert sourcing
- Opinion pieces: Experience shown through relevant background and informed perspective
- Technical guides: Experience shown through detailed implementation steps and troubleshooting
- Tutorials/How-to Guides: Experience shown through step-by-step walkthroughs, screenshots of each stage, troubleshooting common issues, time estimates based on actual completion
- Comparison: Experience shown through personal testing of multiple options, real-world usage scenarios, specific criteria based on hands-on evaluation
- Strategic/Business Content: Experience shown through specific company examples, implementation stories, practical frameworks tested in real scenarios

### **Expertise (1-10)**

**Scoring Philosophy**: Expertise is demonstrated through accuracy, depth, and sophisticated understanding appropriate to the article's scope and audience.

**Evidence of Expertise may include**:
- Accurate, current information with proper technical/industry terminology
- Depth of explanation proportional to article purpose
- Nuanced understanding of complexities and trade-offs
- Strategic insights beyond surface-level information
- Clear explanations of difficult concepts
- Evidence of staying current with field developments
- Author credentials or demonstrated knowledge

**Scoring Bands**:
- **1-3**: Inaccurate, outdated, or superficial information
- **4-5**: Accurate but basic; lacks meaningful depth
- **6-7**: Solid expertise appropriate to article scope; accurate and reasonably detailed
- **8-9**: Strong depth and sophistication; demonstrates advanced understanding
- **10**: Comprehensive mastery of the subject; explains complex topics with clarity; current with latest developments; may include original frameworks or research

**Context Adjustments**:
- Introductory content: Expertise shown through clear teaching and accessibility
- Advanced content: Expertise shown through technical depth and precision
- Broad overviews: Expertise shown through comprehensive synthesis
- Deep-Dive Specialized Content: Expertise shown through mastery of narrow subject, references to latest research/developments, sophisticated analysis
- Tool/Platform Tutorials: Expertise shown through understanding of features, best practices, common pitfalls, advanced techniques, staying current with updates
- Medical/Health Content: Expertise shown through citation of medical literature, understanding of clinical nuances, appropriate caveats, current clinical guidelines (YMYL - higher bar)
- Financial/Legal Content: Expertise shown through accurate regulatory knowledge, understanding of implications, appropriate disclaimers, current with rule changes (YMYL - higher bar)

### **Authoritativeness (1-10)**

**Scoring Philosophy**: Authoritativeness comes from multiple signals, not just citations. The weight of each signal varies by article type and niche.

**Evidence of Authoritativeness may include**:
- Citations from credible, relevant sources (when appropriate)
- Author credentials or demonstrated authority
- Original data, research, or proprietary insights
- Recognition as a source in the field
- Association with authoritative brands or publications
- Tool demonstrations or platform expertise
- Comprehensive coverage showing subject mastery

**Scoring Bands**:
- **1-3**: No credible backing; questionable or absent sources
- **4-5**: Basic credibility; some authoritative elements present
- **6-7**: Solid authority appropriate to context; credible sources where needed
- **8-9**: Strong authoritative signals; well-supported with recognized sources or demonstrated platform authority
- **10**: Comprehensive authority through multiple signals: widely recognized expertise, credentials, original research, or comprehensive authoritative backing

**Context Adjustments**:
- Platform-specific content: Authority demonstrated through tool expertise, screenshots, and internal resources
- Opinion/Analysis: Authority shown through reasoning quality and author background
- How-to guides: Authority shown through comprehensive coverage and demonstrated results
- Comparison Content: Authority shown through comprehensive analysis, fair evaluation criteria, breadth of options covered, demonstrated testing
- Not all articles require external citations to be authoritative

### **Trustworthiness (1-10)**

**Scoring Philosophy**: Trustworthiness is earned through transparency, objectivity, accuracy, and user-first presentation.

**Evidence of Trustworthiness may include**:
- Balanced presentation of multiple perspectives
- Clear attribution and citation of sources (when claims require it)
- Transparency about methodology, relationships, or potential biases
- Accurate, verifiable information
- Professional presentation and editing
- Up-to-date content (or dated appropriately)
- No evidence of manipulation or deception
- Author/organization accountability

**Scoring Bands**:
- **1-3**: Misleading, biased, or poorly attributed; lacks transparency
- **4-5**: Generally trustworthy but inconsistent attribution or transparency
- **6-7**: Solid trustworthiness; balanced and appropriately sourced
- **8-9**: Highly trustworthy; transparent, objective, well-attributed
- **10**: Exceptional trustworthiness; complete transparency and verification

**Context Adjustments**:
- Brand content: Trustworthiness requires acknowledging when discussing own products
- Comparative content: Trustworthiness requires fairness to alternatives
- Statistical claims: Trustworthiness requires clear sourcing
- Medical/Health Content (YMYL): Trustworthiness requires medical review, clear disclaimers, evidence-based recommendations, acknowledgment of when to see a doctor, current guidelines
- Financial Content (YMYL): Trustworthiness requires appropriate disclaimers, acknowledgment of risks, not promising unrealistic returns, disclosure of conflicts of interest

## **Scoring Calibration Guidelines**:

To ensure high-quality articles receive appropriate scores:
- **6.0-7.4 = Good**: Solid article that meets E-E-A-T standards for its type
- **7.5-8.4 = Strong**: Strong article that exceeds typical standards
- **8.5-9.4 = Very Strong**: High-quality article that demonstrates high E-E-A-T across factors
- **9.5-10.0 = Excellent**: Top Tier execution of E-E-A-T principles for its category

**Calibration Principles**:
1. A well-executed article meeting its purpose should score 7-8 range
2. Score of 10 should be achievable for genuinely excellent work - it represents "outstanding for this type of content," not "theoretically perfect"
3. Articles don't need perfection in every criterion to score high
4. Compensatory scoring: Exceptional strength in some areas can balance moderate performance in others
5. Context matters: A tutorial with great screenshots and detailed steps shows authority differently than a research article with citations

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
      "score": 数字1-10,
      "evidence": ["具体证据1", "具体证据2"],
      "issues": ["问题1", "问题2"],
      "strengths": ["优势1", "优势2"],
      "suggestions": ["改进建议1", "改进建议2"]
    },
    "expertise": {
      "score": 数字1-10,
      "evidence": ["具体证据1", "具体证据2"],
      "issues": ["问题1", "问题2"],
      "strengths": ["优势1", "优势2"],
      "suggestions": ["改进建议1", "改进建议2"]
    },
    "authoritativeness": {
      "score": 数字1-10,
      "evidence": ["具体证据1", "具体证据2"],
      "issues": ["问题1", "问题2"],
      "strengths": ["优势1", "优势2"],
      "suggestions": ["改进建议1", "改进建议2"]
    },
    "trustworthiness": {
      "score": 数字1-10,
      "evidence": ["具体证据1", "具体证据2"],
      "issues": ["问题1", "问题2"],
      "strengths": ["优势1", "优势2"],
      "suggestions": ["改进建议1", "改进建议2"]
    },
    "overall": 数字1-10
  },
  "analysis": {
    "strengths": ["整体优势1", "整体优势2"],
    "weaknesses": ["整体劣势1", "整体劣势2"],
    "opportunities": ["机会1", "机会2"]
  },
  "summary": "200-300字的详细总结",
  "suggestions": [
    {
      "priority": "high/medium/low",
      "category": "Experience/Expertise/Authoritativeness/Trustworthiness",
      "description": "具体改进描述",
      "actionItems": ["行动项1", "行动项2"]
    }
  ]
}

---

## **Consistency Protocol**:

To ensure <10% variation across multiple evaluations:
1. **Read completely** before scoring
2. **Identify article context** first
3. **Apply rubric systematically** - use the same interpretation of bands each time
4. **Document specific evidence** for each score in your assessment and keep it under 90 words per factor
5. **Calculate overall** as simple average of four scores
6. **Cross-check**: Does the overall score feel right for the article's quality in its category?

---

**Now evaluate the provided article following this framework.**

**Article:**`;
  }

  private buildUserPrompt(content: string, title?: string, author?: string): string {
    let prompt = `请评估以下内容的E-E-A-T表现：

${title ? `标题：${title}\n` : ''}${author ? `作者：${author}\n` : ''}内容：
${content}

请严格按照系统提示中指定的JSON格式返回评估结果。特别注意：
1. scores必须包含experience、expertise、authoritativeness、trustworthiness四个对象
2. 每个评分对象必须包含score（数字）、evidence（数组）、issues（数组）、strengths（数组）、suggestions（数组）
3. 不要使用article.scores格式，直接使用scores
4. 确保返回完整的JSON，以{开始，以}结束，不要包含代码块`;

    return prompt;
  }

  private formatAIResult(aiResult: any, content: string, context?: ArticleContext): EEATResult {
    // 处理原始 EEAT Prompt.md 格式的输出
    const articleContext = aiResult.articleContext || context || this.generateDefaultContext(content);

    // 从原始格式提取分数
    const scores = {
      experience: aiResult.article?.scores?.experience || aiResult.scores?.experience || { score: 5 },
      expertise: aiResult.article?.scores?.expertise || aiResult.scores?.expertise || { score: 5 },
      authoritativeness: aiResult.article?.scores?.authoritativeness || aiResult.scores?.authoritativeness || { score: 5 },
      trustworthiness: aiResult.article?.scores?.trustworthiness || aiResult.scores?.trustworthiness || { score: 5 }
    };

    // 确保score是数字
    const ensureNumber = (value: any): number => {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const num = parseFloat(value);
        return isNaN(num) ? 5 : num;
      }
      return 5;
    };

    const experienceScore = ensureNumber(scores.experience.score || scores.experience.score);
    const expertiseScore = ensureNumber(scores.expertise.score || scores.expertise.score);
    const authoritativenessScore = ensureNumber(scores.authoritativeness.score || scores.authoritativeness.score);
    const trustworthinessScore = ensureNumber(scores.trustworthiness.score || scores.trustworthiness.score);

    // 计算或使用overall分数
    const overall = aiResult.article?.overall || aiResult.scores?.overall ||
      (experienceScore + expertiseScore + authoritativenessScore + trustworthinessScore) / 4;

    // 格式化每个维度的详细评分
    const formatDetailedScore = (dimension: string, baseScore: any): ScoreDetails => {
      const assessment = aiResult.analysis?.[dimension as keyof typeof aiResult.analysis]?.assessment ||
                         "基于内容质量进行的评估";

      return {
        score: Math.max(1, Math.min(10, baseScore)),
        evidence: aiResult.scores?.[dimension]?.evidence || [],
        issues: aiResult.scores?.[dimension]?.issues || [],
        strengths: aiResult.scores?.[dimension]?.strengths || [],
        suggestions: aiResult.scores?.[dimension]?.suggestions || []
      };
    };

    return {
      articleContext,
      scores: {
        experience: formatDetailedScore('experience', experienceScore),
        expertise: formatDetailedScore('expertise', expertiseScore),
        authoritativeness: formatDetailedScore('authoritativeness', authoritativenessScore),
        trustworthiness: formatDetailedScore('trustworthiness', trustworthinessScore),
        overall: Math.max(1, Math.min(10, overall))
      },
      analysis: {
        strengths: aiResult.analysis?.strengths || [],
        weaknesses: aiResult.analysis?.weaknesses || [],
        opportunities: aiResult.analysis?.opportunities || []
      },
      summary: typeof aiResult.summary === 'string' ? aiResult.summary : '基于EEAT标准的评估完成。',
      suggestions: (aiResult.suggestions || []).map((s: any) => ({
        priority: ['high', 'medium', 'low'].includes(s.priority) ? s.priority : 'medium',
        category: s.category || '综合',
        description: s.description || '改进建议',
        actionItems: Array.isArray(s.actionItems) ? s.actionItems : [s.description || '采取行动']
      }))
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