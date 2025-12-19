import OpenAI from 'openai';
import { EEATResult, ArticleContext, ScoreDetails } from '@/types/eeat';

interface EvaluateOptions {
  useAI?: boolean;
  openaiApiKey?: string;
}

export class AIEvaluator {
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
        max_tokens: 2500,
        response_format: { type: "json_object" }
      });

      const response = completion.choices[0].message.content;
      if (!response) {
        throw new Error('AI返回了空响应');
      }

      const result = JSON.parse(response);
      return this.formatAIResult(result, content, context);
    } catch (error) {
      console.error('AI评估失败:', error);
      return null;
    }
  }

  private buildSystemPrompt(): string {
    return `你是一位专业的E-E-A-T（Experience, Expertise, Authoritativeness, Trustworthiness）内容评估专家，基于Tom Winter的RFT框架。

你的任务是：
1. Role：扮演一位资深的内容质量评估专家
2. Task：对给定的文章内容进行E-E-A-T四维度评估
3. Format：严格按照指定的JSON格式返回结果

评估标准（1-10分制）：

Experience（经验）：
- 检查第一手经验、实践案例、详细流程
- 寻找具体数据、指标、截图、演示
- 评估是否包含实操见解和边缘案例认知
- 1-3分：纯理论无实践
- 4-6分：有一定实践但不够深入
- 7-8分：丰富实践经验
- 9-10分：深度案例研究和详细流程

Expertise（专业知识）：
- 评估信息的准确性和时效性
- 检查深度解释和对复杂性的理解
- 寻找战略见解和专业术语正确使用
- 评估是否跟踪领域最新发展
- YMYL内容（医疗/金融）有更高标准
- 1-3分：不准确或表面信息
- 4-6分：准确但深度有限
- 7-8分：深入理解和最新信息
- 9-10分：全面掌握和战略见解

Authoritativeness（权威性）：
- 检查可信来源引用和作者资质
- 寻找原创数据/研究和行业认可
- 评估是否有权威机构关联
- 1-3分：无可信背书
- 4-6分：有限引用或资质
- 7-8分：可靠来源和作者资质
- 9-10分：权威机构认可和原创研究

Trustworthiness（可信度）：
- 检查是否平衡呈现和清晰归属
- 评估方法透明度和准确可验证性
- 寻找专业编辑和及时更新
- 检查是否避免过于绝对的表述
- 1-3分：误导或缺乏透明度
- 4-6分：基本透明但有改进空间
- 7-8分：透明准确可验证
- 9-10分：卓越可信度

请返回JSON格式的评估结果。`;
  }

  private buildUserPrompt(content: string, title?: string, author?: string): string {
    return `请评估以下内容的E-E-A-T表现：

${title ? `标题：${title}\n` : ''}
${author ? `作者：${author}\n` : ''}
内容：
---
${content}
---

请提供详细的JSON格式评估，包括：
1. 文章上下文分析（类型、利基、目的、目标受众）
2. 四维度评分（1-10分）
3. 每个维度的证据、问题、优势和建议
4. 总体分析（优势、弱点、机会）
5. 评估总结
6. 具体改进建议（按优先级分类）

请确保评估客观、具体，并提供可行的改进建议。`;
  }

  private formatAIResult(aiResult: any, content: string, context?: ArticleContext): EEATResult {
    // 如果AI返回了上下文，使用AI的；否则使用传入的context
    const articleContext = aiResult.articleContext || context || this.generateDefaultContext(content);

    // 格式化评分，确保在1-10范围内
    const formatScore = (score: any): ScoreDetails => {
      const s = Math.max(1, Math.min(10, Number(score.score || 5)));
      return {
        score: s,
        evidence: score.evidence || [],
        issues: score.issues || [],
        strengths: score.strengths || [],
        suggestions: score.suggestions || []
      };
    };

    const scores = {
      experience: formatScore(aiResult.scores?.experience || { score: 5 }),
      expertise: formatScore(aiResult.scores?.expertise || { score: 5 }),
      authoritativeness: formatScore(aiResult.scores?.authoritativeness || { score: 5 }),
      trustworthiness: formatScore(aiResult.scores?.trustworthiness || { score: 5 }),
      overall: Math.max(1, Math.min(10, Number(aiResult.overall || 5)))
    };

    // 确保总体评分合理
    scores.overall = (
      scores.experience.score * 0.25 +
      scores.expertise.score * 0.3 +
      scores.authoritativeness.score * 0.25 +
      scores.trustworthiness.score * 0.2
    );

    return {
      articleContext,
      scores,
      analysis: {
        strengths: aiResult.analysis?.strengths || [],
        weaknesses: aiResult.analysis?.weaknesses || [],
        opportunities: aiResult.analysis?.opportunities || []
      },
      summary: aiResult.summary || 'AI评估完成。',
      suggestions: (aiResult.suggestions || []).map((s: any) => ({
        priority: s.priority || 'medium',
        category: s.category || '综合',
        description: s.description || '',
        actionItems: s.actionItems || []
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