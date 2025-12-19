import OpenAI from 'openai';
import { EEATResult, ArticleContext, ScoreDetails } from '@/types/eeat';
import { logger } from './logger';

interface EvaluateOptions {
  useAI?: boolean;
  openaiApiKey?: string;
}

export class AIEvaluatorV2 {
  private openai: OpenAI | null = null;

  constructor(openaiApiKey?: string) {
    if (openaiApiKey) {
      this.openai = new OpenAI({
        apiKey: openaiApiKey,
      });
    }
  }

  async evaluateWithAI(
    content: string,
    title?: string,
    author?: string,
    context?: ArticleContext
  ): Promise<EEATResult | null> {
    if (!this.openai) {
      return null;
    }

    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(content, title, author);

      logger.info("开始AI评估", {
        contentLength: content.length,
        title,
        hasAuthor: !!author
      });

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 8000,
        response_format: { type: "json_object" }
      });

      const response = completion.choices[0].message.content;
      if (!response) {
        throw new Error('AI返回了空响应');
      }

      logger.info("AI原始响应", { responseLength: response.length });

      const aiResult = JSON.parse(response);
      logger.info("AI解析结果", {
        hasScores: !!aiResult.scores,
        hasAnalysis: !!aiResult.analysis,
        hasSuggestions: !!aiResult.suggestions,
        overall: aiResult.overall
      });

      return this.formatAIResult(aiResult, content, context);
    } catch (error) {
      logger.error("AI评估失败", {
        error: error instanceof Error ? error.message : String(error)
      });
      console.error('AI评估失败:', error);
      return null;
    }
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
- **1-3**: Inaccurate information or superficial coverage with evident gaps
- **4-5**: Generally accurate but lacks depth, may have minor inaccuracies
- **6-7**: Good solid understanding appropriate to scope, accurate with some depth
- **8-9**: Excellent depth with nuanced understanding, clear expertise demonstrated
- **10**: Exceptional expertise with sophisticated insights, comprehensive mastery

### **Authoritativeness (1-10)**

**Scoring Philosophy**: Authoritativeness comes from credible sourcing, author credentials, original research, and industry recognition.

**Evidence of Authoritativeness may include**:
- Credible sources with proper attribution
- Author credentials and expertise in the topic area
- Original research, data, or unique insights
- Industry recognition, awards, or third-party validation
- Institutional backing or affiliation with authoritative organizations
- Citations by other authoritative sources

**Scoring Bands**:
- **1-3**: No credible sources, unknown author, questionable claims
- **4-5**: Limited sourcing, minimal author credentials shown
- **6-7**: Some credible sources, basic author credentials
- **8-9**: Strong sourcing, clear author expertise, some industry recognition
- **10**: Exceptional authority with multiple credible sources, recognized expertise, original research

### **Trustworthiness (1-10)**

**Scoring Philosophy**: Trustworthiness comes from transparency, accuracy, balanced presentation, and professional standards.

**Evidence of Trustworthiness may include**:
- Balanced presentation of multiple perspectives
- Clear attribution and citation of sources
- Transparency about methodology and limitations
- Accurate, verifiable information
- Professional editing and fact-checking evidence
- Clear date and recent updates
- No evidence of manipulation or deception

**Scoring Bands**:
- **1-3**: Misleading information, lack of transparency, potential manipulation
- **4-5**: Some transparency issues, partial information, questionable accuracy
- **6-7**: Generally trustworthy with minor transparency gaps
- **8-9**: Highly trustworthy with strong transparency and accuracy
- **10**: Exceptional trustworthiness with complete transparency and verification

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
  "scores": {
    "experience": {
      "score": number,
      "evidence": ["evidence1", "evidence2"],
      "issues": ["issue1", "issue2"],
      "strengths": ["strength1", "strength2"],
      "suggestions": ["suggestion1", "suggestion2"]
    },
    "expertise": {
      "score": number,
      "evidence": ["evidence1", "evidence2"],
      "issues": ["issue1", "issue2"],
      "strengths": ["strength1", "strength2"],
      "suggestions": ["suggestion1", "suggestion2"]
    },
    "authoritativeness": {
      "score": number,
      "evidence": ["evidence1", "evidence2"],
      "issues": ["issue1", "issue2"],
      "strengths": ["strength1", "strength2"],
      "suggestions": ["suggestion1", "suggestion2"]
    },
    "trustworthiness": {
      "score": number,
      "evidence": ["evidence1", "evidence2"],
      "issues": ["issue1", "issue2"],
      "strengths": ["strength1", "strength2"],
      "suggestions": ["suggestion1", "suggestion2"]
    },
    "overall": number
  },
  "analysis": {
    "strengths": ["overall_strength1", "overall_strength2"],
    "weaknesses": ["overall_weakness1", "overall_weakness2"],
    "opportunities": ["opportunity1", "opportunity2"]
  },
  "summary": "detailed_evaluation_summary_here",
  "suggestions": [
    {
      "priority": "high/medium/low",
      "category": "Experience/Expertise/Authoritativeness/Trustworthiness",
      "description": "specific_improvement_description",
      "actionItems": ["action_item1", "action_item2"]
    }
  ]
}`;
  }

  private buildUserPrompt(content: string, title?: string, author?: string): string {
    return `Evaluate the following content for E-E-A-T compliance:

${title ? `Title: ${title}\n` : ''}\
${author ? `Author: ${author}\n` : ''}\
Content:
---
${content}
---

Please provide a comprehensive evaluation following the exact JSON format specified in the system prompt. Focus on providing:
1. Detailed evidence for each score
2. Specific strengths and weaknesses
3. Actionable improvement suggestions
4. Context-aware assessment based on article type and niche`;
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

    logger.info("AI评估结果格式化", {
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
      summary: aiResult.summary || 'AI评估完成。',
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