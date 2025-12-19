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
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(content, title, author);

      logger.info("开始智谱AI Premium 评估", {
        contentLength: content.length,
        title,
        hasAuthor: !!author
      });

      const messages: ZhipuMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ];

      // Premium 评估使用更长的超时和更多 tokens
      const response = await this.makeZhipuRequest(messages, 10000, 55000);

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

          logger.info("智谱AI Premium JSON解析成功", {
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

  private buildSystemPrompt(): string {
    return `You are an expert E-E-A-T evaluator tasked with assessing articles based on Google's Experience, Expertise, Authoritativeness, and Trustworthiness principles.

**Critical Instructions:**

1. **Output Format**: Provide ONLY valid JSON. No explanations, commentary, or code blocks (no \`\`\`). Start with { and end with }.

2. **Consistency**: Apply the rubric systematically using the same interpretation across evaluations.

3. **Context-Awareness**: Adapt expectations based on article type, niche, and purpose.

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

## **Required JSON Output Format**:

{
  "articleContext": {
    "type": "article_type",
    "niche": "niche_context",
    "purpose": "primary_purpose",
    "targetAudience": "target_audience_description",
    "contentLength": number,
    "readingTime": number
  },
  "article": {
    "scores": {
      "experience": X,
      "expertise": X,
      "authoritativeness": X,
      "trustworthiness": x
    },
    "overall": X
  },
  "analysis": {
    "experience": {
      "assessment": "Detailed analysis here explaining the score based on rubric and context"
    },
    "expertise": {
      "assessment": "Detailed analysis here"
    },
    "authoritativeness": {
      "assessment": "Detailed analysis here"
    },
    "trustworthiness": {
      "assessment": "Detailed analysis here"
    }
  },
  "summary": [
    {
      "title": "Brief strength title",
      "detail": "Explanation of this strength"
    }
  ],
  "suggestions": [
    "Specific, actionable suggestion 1",
    "Specific, actionable suggestion 2"
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
    let prompt = `${content}`;

    if (title || author) {
      prompt = `${title ? `Title: ${title}\n` : ''}${author ? `Author: ${author}\n` : ''}${prompt}`;
    }

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
        strengths: aiResult.summary?.filter((s: any) => s.title)?.map((s: any) => s.detail) || [],
        weaknesses: [],  // 原始格式没有weaknesses
        opportunities: aiResult.suggestions || []
      },
      summary: aiResult.summary?.map((s: any) => s.detail).join('; ') || '基于EEAT标准的评估完成。',
      suggestions: aiResult.suggestions?.map((s: string, index: number) => ({
        priority: index === 0 ? 'high' : index === 1 ? 'medium' : 'low',
        category: '综合',
        description: s,
        actionItems: [s]
      })) || []
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