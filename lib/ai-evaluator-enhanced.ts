import OpenAI from 'openai';
import { EEATResult, ArticleContext, ScoreDetails } from '@/types/eeat';
import { logger } from './logger';

interface EvaluateOptions {
  useAI?: boolean;
  openaiApiKey?: string;
}

export class AIEvaluatorEnhanced {
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
      const systemPrompt = this.buildEnhancedSystemPrompt();
      const userPrompt = this.buildEnhancedUserPrompt(content, title, author);

      logger.info("开始OpenAI增强评估", {
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

      logger.info("OpenAI原始响应", { responseLength: response.length });

      const aiResult = JSON.parse(response);
      logger.info("OpenAI解析结果", {
        hasScores: !!aiResult.scores,
        hasAnalysis: !!aiResult.analysis,
        hasSuggestions: !!aiResult.suggestions,
        overall: aiResult.overall
      });

      return this.formatAIResult(aiResult, content, context);
    } catch (error) {
      logger.error("OpenAI增强评估失败", {
        error: error instanceof Error ? error.message : String(error)
      });
      console.error('OpenAI增强评估失败:', error);
      return null;
    }
  }

  private buildEnhancedSystemPrompt(): string {
    return `You are an expert E-E-A-T evaluator tasked with assessing articles based on Google's Experience, Expertise, Authoritativeness, and Trustworthiness principles.

**MOST IMPORTANT REQUIREMENTS:**
1. **All evaluation must be based on the article's specific content**
2. **Every piece of evidence must reference specific content from the article**
3. **All feedback must be specific and actionable, avoiding vague suggestions**

**Critical Instructions:**

1. **Output Format**: Provide ONLY valid JSON. No explanations, commentary, or code blocks (no \`\`\`). Start with { and end with }.

2. **Specificity Requirements**:
   - Each evidence must quote or reference specific content from the article
   - Each strength must highlight specific strengths from the article
   - Each issue must identify specific problems in the article
   - Each suggestion must be specific, actionable improvement advice

3. **Avoid Vague Suggestions**:
   - DON'T say "increase professional depth" - say "in section X about topic Y, add specific data/case studies"
   - DON'T say "improve credibility" - say "the claim about A needs citations from specific research reports"
   - DON'T say "add experience sharing" - say "describe your specific process implementing B, including challenges faced"

## **Evaluation Approach:**

First, analyze the article to determine:
- **Article Type**: (Tutorial, Guide, Opinion/Analysis, News, Product Review, Case Study, Research, Listicle, etc.)
- **Niche Context**: (Technical/B2B, Consumer, Medical, Financial, Creative, etc.)
- **Primary Purpose**: (Educational, Commercial, Informational, Navigational)

Then evaluate each E-E-A-T factor using the appropriate lens for that context.

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
      "evidence": ["2-3 specific evidence quotes from the article"],
      "issues": ["2-3 specific problems, identifying where the article is lacking"],
      "strengths": ["2-3 specific strengths, quoting actual content"],
      "suggestions": ["2-3 specific suggestions, telling where and how to improve"]
    },
    "expertise": {
      "score": number,
      "evidence": ["Specific evidence showing professional knowledge"],
      "issues": ["Specific problems like missing data, outdated info, incorrect concepts"],
      "strengths": ["Specific strengths like accurate information, deep analysis"],
      "suggestions": ["Specific suggestions like what data to add, what to update"]
    },
    "authoritativeness": {
      "score": number,
      "evidence": ["Specific authority evidence like citations, credentials"],
      "issues": ["Specific problems like missing citations, unclear sources"],
      "strengths": ["Specific authoritative indicators"],
      "suggestions": ["Specific authority improvement suggestions"]
    },
    "trustworthiness": {
      "score": number,
      "evidence": ["Specific trustworthiness evidence"],
      "issues": ["Specific problems like bias, misleading statements"],
      "strengths": ["Specific trustworthiness indicators"],
      "suggestions": ["Specific trustworthiness improvement suggestions"]
    },
    "overall": number
  },
  "analysis": {
    "strengths": ["3-5 specific overall strengths"],
    "weaknesses": ["3-5 specific overall weaknesses"],
    "opportunities": ["3-5 specific improvement opportunities"]
  },
  "summary": "200-300 word detailed summary highlighting core value and most needed improvements",
  "suggestions": [
    {
      "priority": "high/medium/low",
      "category": "Experience/Expertise/Authoritativeness/Trustworthiness",
      "description": "Specific improvement description, not generic",
      "actionItems": ["3-5 specific, actionable action items"]
    }
  ]
}

**Remember: Every piece of feedback must be based on specific article content. Avoid all generic, template-based suggestions!**`;
  }

  private buildEnhancedUserPrompt(content: string, title?: string, author?: string): string {
    return `Please evaluate the following content for E-E-A-T compliance:

${title ? `Title: ${title}\n` : ''}${author ? `Author: ${author}\n` : ''}Content:
---
${content}
---

**Important reminders:**
1. Evaluation must be based on the article's specific content
2. All evidence, issues, strengths, suggestions must be specific and targeted
3. Avoid generic, template-based feedback
4. If the article performs well in certain areas, give appropriate scores
5. If the article lacks in certain areas, clearly identify specific problems and provide actionable improvement suggestions

Please provide a comprehensive evaluation following the exact JSON format specified in the system prompt, focusing on:
1. Specific evidence for each score from the article content
2. Specific strengths and weaknesses with examples
3. Actionable improvement suggestions that tell exactly what to do
4. Context-aware assessment based on article type and niche`;
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

    logger.info("OpenAI增强评估结果格式化", {
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
      summary: aiResult.summary || 'OpenAI增强评估完成。',
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