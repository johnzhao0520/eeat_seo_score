import { EEATResult, ArticleContext, ScoreDetails, EEATScores } from "@/types/eeat";
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

interface EvaluateAIOptions {
  useChunked?: boolean;
  maxTimeoutMs?: number;
}

export class ZhipuEvaluatorEnhancedV2 {
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
    context?: ArticleContext,
    options: EvaluateAIOptions = {}
  ): Promise<EEATResult | null> {
    try {
      const shouldChunk = this.shouldUseChunked(content, options.useChunked);
      if (shouldChunk) {
        return await this.evaluateWithAIChunked(content, title, author, context, options);
      }

      // 对于长内容进行智能截取，保留更多关键信息
      const processedContent = this.preprocessContent(content, 6000); // 增加到6000字符
      const systemPrompt = this.buildEnhancedSystemPrompt();
      const userPrompt = this.buildUserPrompt(processedContent, title, author, content.length);

      logger.info("开始智谱AI Enhanced V2 评估", {
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

      // Enhanced V2 使用50秒超时，充分利用Vercel Pro
      const response = await this.makeZhipuRequest(
        messages,
        8000,
        this.getAdaptiveTimeout(content.length, 8000, options.maxTimeoutMs, 50000)
      );

      if (!response || !response.choices || response.choices.length === 0) {
        throw new Error("智谱AI返回了空响应");
      }

      const aiResult = this.parseAIResponse(response.choices[0].message.content);

      // 使用增强的结果格式化器
      const result = this.formatEnhancedAIResult(aiResult, content, title, author);

      logger.info("智谱AI Enhanced V2 评估完成", {
        overall: result.scores.overall,
        scores: {
          experience: result.scores.experience.score,
          expertise: result.scores.expertise.score,
          authoritativeness: result.scores.authoritativeness.score,
          trustworthiness: result.scores.trustworthiness.score
        },
        hasDetailedFeedback: result.analysis.strengths.length > 0 || result.analysis.weaknesses.length > 0
      });

      return result;
    } catch (error) {
      logger.error("智谱AI Enhanced V2 评估失败", {
        error: error instanceof Error ? error.message : String(error),
        contentLength: content.length,
        title
      });
      return null;
    }
  }

  private shouldUseChunked(content: string, requested?: boolean): boolean {
    if (requested !== undefined) {
      return requested;
    }
    if (process.env.ZHIPU_FORCE_CHUNKED === "true") {
      return true;
    }
    return content.length > 3500;
  }

  private async evaluateWithAIChunked(
    content: string,
    title?: string,
    author?: string,
    context?: ArticleContext,
    options: EvaluateAIOptions = {}
  ): Promise<EEATResult | null> {
    const chunks = this.splitContent(content, 1800);
    if (chunks.length === 0) {
      return null;
    }

    logger.info("智谱AI Enhanced V2 分段评估开始", {
      chunkCount: chunks.length,
      contentLength: content.length
    });

    const chunkResults: EEATResult[] = [];

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const chunkSystemPrompt = this.buildChunkSystemPrompt();
      const chunkUserPrompt = this.buildChunkUserPrompt(chunk, index + 1, chunks.length, title, author);
      const messages: ZhipuMessage[] = [
        { role: "system", content: chunkSystemPrompt },
        { role: "user", content: chunkUserPrompt }
      ];

      const response = await this.makeZhipuRequest(
        messages,
        1500,
        this.getAdaptiveTimeout(chunk.length, 1500, options.maxTimeoutMs, 25000)
      );

      if (!response || !response.choices || response.choices.length === 0) {
        continue;
      }

      const aiResult = this.parseAIResponse(response.choices[0].message.content);
      const formatted = this.formatEnhancedAIResult(aiResult, chunk, title, author);
      chunkResults.push(formatted);
    }

    if (chunkResults.length === 0) {
      return null;
    }

    const aggregatedScores = this.aggregateScores(chunkResults);
    const aggregatedAnalysis = this.aggregateAnalysis(chunkResults);
    const aggregatedSuggestions = this.aggregateSuggestions(chunkResults);

    const aggregation = await this.requestAggregationSummary(
      chunkResults,
      title,
      author,
      aggregatedScores,
      aggregatedAnalysis,
      options
    );

    const aiResult = {
      articleContext: context,
      scores: aggregatedScores,
      analysis: aggregatedAnalysis,
      summary: aggregation.summary,
      suggestions: aggregation.suggestions.length > 0 ? aggregation.suggestions : aggregatedSuggestions
    };

    logger.info("智谱AI Enhanced V2 分段评估完成", {
      chunkCount: chunks.length,
      overall: aggregatedScores.overall
    });

    return this.formatEnhancedAIResult(aiResult, content, title, author);
  }

  private async makeZhipuRequest(
    messages: ZhipuMessage[],
    maxTokens: number = 8000,
    timeout: number = 50000,
    retries: number = 1
  ): Promise<ZhipuResponse | null> {
    const attempts = Math.max(1, retries);

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(this.baseUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "glm-4.6",
            messages: messages,
            max_tokens: maxTokens,
            temperature: 0.2, // 降低温度以获得更一致的结果
            stream: false,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`智谱AI请求失败: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content || !content.trim()) {
          throw new Error("智谱AI返回空内容");
        }
        return data;
      } catch (error) {
        clearTimeout(timeoutId);
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof Error && error.name === "AbortError") {
          if (attempt >= attempts) {
            throw new Error(`智谱AI请求超时（${timeout}ms）`);
          }
        }

        if (attempt < attempts) {
          logger.warn("智谱AI请求失败，准备重试", {
            attempt,
            attempts,
            error: message
          });
          await this.sleep(500 * attempt);
          continue;
        }

        throw error;
      }
    }

    return null;
  }

  private getAdaptiveTimeout(
    contentLength: number,
    maxTokens: number,
    requestedTimeout?: number,
    defaultTimeout: number = 50000
  ): number {
    const maxTimeout = Number(process.env.ZHIPU_MAX_TIMEOUT_MS || "120000");
    if (requestedTimeout) {
      return Math.min(requestedTimeout, maxTimeout);
    }

    const tokenFactor = Math.ceil(maxTokens / 1000) * 6000;
    const lengthFactor = Math.ceil(contentLength / 1000) * 4000;
    const adaptive = defaultTimeout + tokenFactor + lengthFactor;

    return Math.min(Math.max(adaptive, defaultTimeout), maxTimeout);
  }

  private splitContent(content: string, maxChunkLength: number): string[] {
    if (content.length <= maxChunkLength) {
      return [content];
    }

    const paragraphs = content.split(/\n\s*\n/);
    const chunks: string[] = [];
    let buffer = "";

    for (const paragraph of paragraphs) {
      const next = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
      if (next.length <= maxChunkLength) {
        buffer = next;
        continue;
      }

      if (buffer) {
        chunks.push(buffer);
      }
      if (paragraph.length > maxChunkLength) {
        for (let i = 0; i < paragraph.length; i += maxChunkLength) {
          chunks.push(paragraph.slice(i, i + maxChunkLength));
        }
        buffer = "";
      } else {
        buffer = paragraph;
      }
    }

    if (buffer) {
      chunks.push(buffer);
    }

    return chunks.filter(chunk => chunk.trim().length > 0);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private buildChunkSystemPrompt(): string {
    return `你是E-E-A-T评估专家，需要对文章片段进行局部评估。

【要求】
1. 只基于片段内容评分，给出具体证据
2. 每个维度至少给出1条evidence
3. JSON格式返回，字段与完整评估一致
4. summary只需简短概述片段要点（1-2句）

返回完整JSON结构。`;
  }

  private buildChunkUserPrompt(
    content: string,
    index: number,
    total: number,
    title?: string,
    author?: string
  ): string {
    return `请评估以下文章片段（第${index}/${total}段）：

${title ? `标题：${title}\n` : ""}${author ? `作者：${author}\n` : ""}内容：
${content}

请严格输出JSON。`;
  }

  private async requestAggregationSummary(
    chunkResults: EEATResult[],
    title: string | undefined,
    author: string | undefined,
    aggregatedScores: EEATScores,
    aggregatedAnalysis: { strengths: string[]; weaknesses: string[]; opportunities: string[] },
    options: EvaluateAIOptions
  ): Promise<{ summary: string; suggestions: EEATResult["suggestions"] }> {
    const summaries = chunkResults.map((result, index) => {
      return `片段${index + 1}总结：${result.summary}`;
    });

    const prompt = `请基于以下分段评估结果生成最终总结与建议（不要重新评分）。

${title ? `标题：${title}\n` : ""}${author ? `作者：${author}\n` : ""}
综合分数：
Experience=${aggregatedScores.experience.score}
Expertise=${aggregatedScores.expertise.score}
Authoritativeness=${aggregatedScores.authoritativeness.score}
Trustworthiness=${aggregatedScores.trustworthiness.score}

整体优势：${aggregatedAnalysis.strengths.join("；")}
整体不足：${aggregatedAnalysis.weaknesses.join("；")}
改进机会：${aggregatedAnalysis.opportunities.join("；")}

分段摘要：
${summaries.join("\n")}

请输出JSON格式：
{
  "summary": "200-300字总结",
  "suggestions": [
    {
      "priority": "high|medium|low",
      "category": "分类",
      "description": "建议",
      "actionItems": ["行动1", "行动2"]
    }
  ]
}`;

    const messages: ZhipuMessage[] = [
      { role: "system", content: "你是评估汇总助手，负责基于分段结果输出最终总结与建议。" },
      { role: "user", content: prompt }
    ];

    try {
      const response = await this.makeZhipuRequest(
        messages,
        1200,
        this.getAdaptiveTimeout(prompt.length, 1200, options.maxTimeoutMs, 25000),
        2
      );

      if (!response || !response.choices || response.choices.length === 0) {
        throw new Error("聚合总结返回空响应");
      }

      const aggregation = this.parseAggregationResponse(response.choices[0].message.content);
      return aggregation;
    } catch (error) {
      logger.warn("聚合总结失败，使用本地总结", {
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        summary: this.generateSummary(chunkResults.map(result => result.summary).join("\n")),
        suggestions: []
      };
    }
  }

  private parseAggregationResponse(content: string): {
    summary: string;
    suggestions: EEATResult["suggestions"];
  } {
    let jsonContent = null;
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1];
    } else if (content.trim().startsWith("{") && content.trim().endsWith("}")) {
      jsonContent = content.trim();
    }

    if (jsonContent) {
      try {
        const fixedJson = this.fixJsonString(jsonContent);
        const parsed = JSON.parse(fixedJson);
        return {
          summary: typeof parsed.summary === "string" ? parsed.summary : "",
          suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
        };
      } catch (error) {
        logger.warn("聚合总结JSON解析失败", {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return { summary: "", suggestions: [] };
  }

  private aggregateScores(results: EEATResult[]): EEATScores {
    const average = (values: number[]) => {
      if (values.length === 0) return 0;
      return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
    };

    const mergeStrings = (values: string[], limit: number) => {
      const seen = new Set<string>();
      const merged: string[] = [];
      for (const value of values) {
        const trimmed = value.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        merged.push(trimmed);
        if (merged.length >= limit) break;
      }
      return merged;
    };

    const buildScore = (dimension: keyof EEATScores): ScoreDetails => {
      const scores = results.map(result => result.scores[dimension as keyof EEATScores] as ScoreDetails);
      const numericScores = scores.map(score => score.score);
      return {
        score: average(numericScores),
        evidence: mergeStrings(scores.flatMap(score => score.evidence || []), 8),
        issues: mergeStrings(scores.flatMap(score => score.issues || []), 6),
        strengths: mergeStrings(scores.flatMap(score => score.strengths || []), 6),
        suggestions: mergeStrings(scores.flatMap(score => score.suggestions || []), 6)
      };
    };

    const experience = buildScore("experience");
    const expertise = buildScore("expertise");
    const authoritativeness = buildScore("authoritativeness");
    const trustworthiness = buildScore("trustworthiness");

    const overall = average([experience.score, expertise.score, authoritativeness.score, trustworthiness.score]);

    return {
      experience,
      expertise,
      authoritativeness,
      trustworthiness,
      overall
    };
  }

  private aggregateAnalysis(results: EEATResult[]): {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
  } {
    const mergeStrings = (values: string[], limit: number) => {
      const seen = new Set<string>();
      const merged: string[] = [];
      for (const value of values) {
        const trimmed = value.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        merged.push(trimmed);
        if (merged.length >= limit) break;
      }
      return merged;
    };

    return {
      strengths: mergeStrings(results.flatMap(result => result.analysis.strengths || []), 8),
      weaknesses: mergeStrings(results.flatMap(result => result.analysis.weaknesses || []), 8),
      opportunities: mergeStrings(results.flatMap(result => result.analysis.opportunities || []), 8)
    };
  }

  private aggregateSuggestions(results: EEATResult[]): EEATResult["suggestions"] {
    const suggestions = results.flatMap(result => result.suggestions || []);
    const seen = new Set<string>();
    const merged: EEATResult["suggestions"] = [];
    for (const suggestion of suggestions) {
      const key = `${suggestion.category}-${suggestion.description}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(suggestion);
      if (merged.length >= 6) break;
    }
    return merged;
  }

  private getAdaptiveTimeout(
    contentLength: number,
    maxTokens: number,
    requestedTimeout?: number,
    defaultTimeout: number = 50000
  ): number {
    const maxTimeout = Number(process.env.ZHIPU_MAX_TIMEOUT_MS || "120000");
    if (requestedTimeout) {
      return Math.min(requestedTimeout, maxTimeout);
    }

    const tokenFactor = Math.ceil(maxTokens / 1000) * 6000;
    const lengthFactor = Math.ceil(contentLength / 1000) * 4000;
    const adaptive = defaultTimeout + tokenFactor + lengthFactor;

    return Math.min(Math.max(adaptive, defaultTimeout), maxTimeout);
  }

  private splitContent(content: string, maxChunkLength: number): string[] {
    if (content.length <= maxChunkLength) {
      return [content];
    }

    const paragraphs = content.split(/\n\s*\n/);
    const chunks: string[] = [];
    let buffer = "";

    for (const paragraph of paragraphs) {
      const next = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
      if (next.length <= maxChunkLength) {
        buffer = next;
        continue;
      }

      if (buffer) {
        chunks.push(buffer);
      }
      if (paragraph.length > maxChunkLength) {
        for (let i = 0; i < paragraph.length; i += maxChunkLength) {
          chunks.push(paragraph.slice(i, i + maxChunkLength));
        }
        buffer = "";
      } else {
        buffer = paragraph;
      }
    }

    if (buffer) {
      chunks.push(buffer);
    }

    return chunks.filter(chunk => chunk.trim().length > 0);
  }

  private buildChunkSystemPrompt(): string {
    return `你是E-E-A-T评估专家，需要对文章片段进行局部评估。

【要求】
1. 只基于片段内容评分，给出具体证据
2. 每个维度至少给出1条evidence
3. JSON格式返回，字段与完整评估一致
4. summary只需简短概述片段要点（1-2句）

返回完整JSON结构。`;
  }

  private buildChunkUserPrompt(
    content: string,
    index: number,
    total: number,
    title?: string,
    author?: string
  ): string {
    return `请评估以下文章片段（第${index}/${total}段）：

${title ? `标题：${title}\n` : ""}${author ? `作者：${author}\n` : ""}内容：
${content}

请严格输出JSON。`;
  }

  private async requestAggregationSummary(
    chunkResults: EEATResult[],
    title: string | undefined,
    author: string | undefined,
    aggregatedScores: EEATScores,
    aggregatedAnalysis: { strengths: string[]; weaknesses: string[]; opportunities: string[] },
    options: EvaluateAIOptions
  ): Promise<{ summary: string; suggestions: EEATResult["suggestions"] }> {
    const summaries = chunkResults.map((result, index) => {
      return `片段${index + 1}总结：${result.summary}`;
    });

    const prompt = `请基于以下分段评估结果生成最终总结与建议（不要重新评分）。

${title ? `标题：${title}\n` : ""}${author ? `作者：${author}\n` : ""}
综合分数：
Experience=${aggregatedScores.experience.score}
Expertise=${aggregatedScores.expertise.score}
Authoritativeness=${aggregatedScores.authoritativeness.score}
Trustworthiness=${aggregatedScores.trustworthiness.score}

整体优势：${aggregatedAnalysis.strengths.join("；")}
整体不足：${aggregatedAnalysis.weaknesses.join("；")}
改进机会：${aggregatedAnalysis.opportunities.join("；")}

分段摘要：
${summaries.join("\n")}

请输出JSON格式：
{
  "summary": "200-300字总结",
  "suggestions": [
    {
      "priority": "high|medium|low",
      "category": "分类",
      "description": "建议",
      "actionItems": ["行动1", "行动2"]
    }
  ]
}`;

    const messages: ZhipuMessage[] = [
      { role: "system", content: "你是评估汇总助手，负责基于分段结果输出最终总结与建议。" },
      { role: "user", content: prompt }
    ];

    try {
      const response = await this.makeZhipuRequest(
        messages,
        1200,
        this.getAdaptiveTimeout(prompt.length, 1200, options.maxTimeoutMs, 25000)
      );

      if (!response || !response.choices || response.choices.length === 0) {
        throw new Error("聚合总结返回空响应");
      }

      const aggregation = this.parseAggregationResponse(response.choices[0].message.content);
      return aggregation;
    } catch (error) {
      logger.warn("聚合总结失败，使用本地总结", {
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        summary: this.generateSummary(chunkResults.map(result => result.summary).join("\n")),
        suggestions: []
      };
    }
  }

  private parseAggregationResponse(content: string): {
    summary: string;
    suggestions: EEATResult["suggestions"];
  } {
    let jsonContent = null;
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1];
    } else if (content.trim().startsWith("{") && content.trim().endsWith("}")) {
      jsonContent = content.trim();
    }

    if (jsonContent) {
      try {
        const fixedJson = this.fixJsonString(jsonContent);
        const parsed = JSON.parse(fixedJson);
        return {
          summary: typeof parsed.summary === "string" ? parsed.summary : "",
          suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
        };
      } catch (error) {
        logger.warn("聚合总结JSON解析失败", {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return { summary: "", suggestions: [] };
  }

  private aggregateScores(results: EEATResult[]): EEATScores {
    const average = (values: number[]) => {
      if (values.length === 0) return 0;
      return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
    };

    const mergeStrings = (values: string[], limit: number) => {
      const seen = new Set<string>();
      const merged: string[] = [];
      for (const value of values) {
        const trimmed = value.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        merged.push(trimmed);
        if (merged.length >= limit) break;
      }
      return merged;
    };

    const buildScore = (dimension: keyof EEATScores): ScoreDetails => {
      const scores = results.map(result => result.scores[dimension as keyof EEATScores] as ScoreDetails);
      const numericScores = scores.map(score => score.score);
      return {
        score: average(numericScores),
        evidence: mergeStrings(scores.flatMap(score => score.evidence || []), 8),
        issues: mergeStrings(scores.flatMap(score => score.issues || []), 6),
        strengths: mergeStrings(scores.flatMap(score => score.strengths || []), 6),
        suggestions: mergeStrings(scores.flatMap(score => score.suggestions || []), 6)
      };
    };

    const experience = buildScore("experience");
    const expertise = buildScore("expertise");
    const authoritativeness = buildScore("authoritativeness");
    const trustworthiness = buildScore("trustworthiness");

    const overall = average([experience.score, expertise.score, authoritativeness.score, trustworthiness.score]);

    return {
      experience,
      expertise,
      authoritativeness,
      trustworthiness,
      overall
    };
  }

  private aggregateAnalysis(results: EEATResult[]): {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
  } {
    const mergeStrings = (values: string[], limit: number) => {
      const seen = new Set<string>();
      const merged: string[] = [];
      for (const value of values) {
        const trimmed = value.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        merged.push(trimmed);
        if (merged.length >= limit) break;
      }
      return merged;
    };

    return {
      strengths: mergeStrings(results.flatMap(result => result.analysis.strengths || []), 8),
      weaknesses: mergeStrings(results.flatMap(result => result.analysis.weaknesses || []), 8),
      opportunities: mergeStrings(results.flatMap(result => result.analysis.opportunities || []), 8)
    };
  }

  private aggregateSuggestions(results: EEATResult[]): EEATResult["suggestions"] {
    const suggestions = results.flatMap(result => result.suggestions || []);
    const seen = new Set<string>();
    const merged: EEATResult["suggestions"] = [];
    for (const suggestion of suggestions) {
      const key = `${suggestion.category}-${suggestion.description}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(suggestion);
      if (merged.length >= 6) break;
    }
    return merged;
  }

  private preprocessContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    // 保留开头、中间关键部分和结尾
    const startLength = Math.floor(maxLength * 0.35);
    const endLength = Math.floor(maxLength * 0.25);
    const middleLength = maxLength - startLength - endLength;
    const middleStart = Math.floor(content.length * 0.3);

    return (
      content.substring(0, startLength) +
      "\n\n...[内容已截取，保留关键部分]...\n\n" +
      content.substring(middleStart, middleStart + middleLength) +
      "\n\n...[内容已截取，保留结尾部分]...\n\n" +
      content.substring(content.length - endLength)
    );
  }

  private buildEnhancedSystemPrompt(): string {
    return `你是专业的E-E-A-T评估专家，基于Google的Experience、Expertise、Authoritativeness和Trustworthiness原则进行深度内容评估。

【核心要求】
1. **提供具体、可操作的反馈** - 必须基于文章的具体内容，不要使用模板化建议
2. **引用具体内容** - 在evidence中引用文章中的具体段落或表述
3. **差异化评分** - 根据文章质量给出真实的分数，避免总是给中等分数

【评分标准详解】

**Authoritativeness (权威性) 评分指南：**
- 8-10分：文章有明确作者信息、专业机构背景、原创数据/研究、深入的行业洞察
- 6-7分：有部分专业支撑，但缺乏权威认证或深度原创内容
- 4-5分：基本信息正确，但缺乏权威来源或专业背景
- 1-3分：内容来源不明，缺乏可信度支撑

**Trustworthiness (可信度) 评分指南：**
- 8-10分：信息透明、有明确来源标注、观点平衡、承认局限性
- 6-7分：大部分信息可信，但某些表述缺乏支撑或略显主观
- 4-5分：基本可信，但存在模糊表述或缺乏来源标注
- 1-3分：信息模糊、夸大宣传、缺乏透明度

【输出要求】
- 必须返回完整JSON
- 每个evidence数组必须包含至少2个来自文章的具体引用
- issues和strengths必须针对具体内容，不要使用通用描述
- suggestions必须是可执行的具体建议

【JSON格式要求】
{
  "articleContext": {...},
  "scores": {
    "experience": {
      "score": 数字1-10,
      "evidence": ["具体引用1", "具体引用2"],
      "issues": ["具体问题1", "具体问题2"],
      "strengths": ["具体优势1", "具体优势2"],
      "suggestions": ["具体建议1", "具体建议2"]
    },
    ...其他维度
  },
  "analysis": {
    "strengths": ["整体优势1", "整体优势2"],
    "weaknesses": ["具体不足1", "具体不足2"],
    "opportunities": ["改进机会1", "改进机会2"]
  },
  "summary": "200-300字的具体总结",
  "suggestions": [...]
}

记住：你的目标是提供有价值、具体、可操作的评估反馈！`;
  }

  private buildUserPrompt(
    content: string,
    title?: string,
    author?: string,
    originalLength?: number
  ): string {
    const contextInfo = originalLength && originalLength > content.length
      ? `\n注意：原文长度为${originalLength}字符，为适应评估限制已截取为${content.length}字符。`
      : '';

    return `请深度评估以下内容：

${title ? `标题：${title}\n` : ''}${author ? `作者：${author}\n` : ''}内容：
${content}

${contextInfo}

评估要求：
1. 仔细分析内容的权威性和可信度信号
2. 识别作者是否展示了专业知识或经验
3. 检查是否有来源引用、数据支撑
4. 评估内容的透明度和平衡性
5. 提供具体而非泛泛的改进建议

请严格按照JSON格式返回评估结果。`;
  }

  private parseAIResponse(content: string): any {
    try {
      logger.info("智谱AI Enhanced V2 原始响应", {
        contentLength: content.length,
        hasMarkdown: content.includes('```json'),
        contentPreview: content.substring(0, 500) + (content.length > 500 ? "..." : "")
      });

      let jsonContent = null;

      // 提取JSON内容
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1];
      } else if (content.trim().startsWith('{') && content.trim().endsWith('}')) {
        jsonContent = content.trim();
      }

      if (jsonContent) {
        const fixedJson = this.fixJsonString(jsonContent);
        const parsed = JSON.parse(fixedJson);

        // 验证必需的字段
        if (!parsed.scores || !parsed.analysis || !parsed.summary) {
          logger.warn("AI响应缺少必需字段", {
            hasScores: !!parsed.scores,
            hasAnalysis: !!parsed.analysis,
            hasSummary: !!parsed.summary
          });
        }

        return parsed;
      }

      throw new Error("无法解析AI响应为JSON格式");
    } catch (error) {
      logger.error("解析智谱AI Enhanced V2 响应失败", {
        error: error instanceof Error ? error.message : String(error),
        contentPreview: content.substring(0, 1000)
      });
      return this.getDefaultAIResult();
    }
  }

  private fixJsonString(jsonStr: string): string {
    try {
      let fixed = jsonStr.replace(/^\uFEFF/, '').trim();

      // 修复常见的JSON问题
      fixed = fixed.replace(/,(\s*[}\]])/g, '$1'); // 移除多余的逗号
      fixed = fixed.replace(/\n\s*\n/g, '\\n'); // 替换多个换行

      return fixed;
    } catch (error) {
      return jsonStr;
    }
  }

  private formatEnhancedAIResult(
    aiResult: any,
    originalContent: string,
    title?: string,
    author?: string
  ): EEATResult {
    // 生成文章上下文 - 确保总是有正确的结构
    const aiContext = aiResult.articleContext;
    const articleContext: ArticleContext = {
      type: aiContext?.type || this.guessContentType(originalContent),
      niche: aiContext?.niche || this.guessContentNiche(originalContent),
      purpose: aiContext?.purpose || "信息",
      targetAudience: aiContext?.targetAudience || this.guessTargetAudience(originalContent, title),
      contentLength: aiContext?.contentLength || originalContent.length,
      readingTime: aiContext?.readingTime || Math.ceil(originalContent.length / 500)
    };

    // 处理评分
    const processScore = (dimension: string): ScoreDetails => {
      const scoreData = aiResult.scores?.[dimension];

      if (!scoreData || typeof scoreData.score !== 'number') {
        // 使用智能默认值而不是固定5分
        const defaultScore = this.calculateIntelligentDefault(dimension, originalContent);
        return {
          score: defaultScore,
          evidence: [`${dimension}评估基于内容分析`],
          issues: [],
          strengths: [],
          suggestions: [this.generateDefaultSuggestion(dimension, defaultScore)]
        };
      }

      return {
        score: Math.max(1, Math.min(10, scoreData.score)),
        evidence: Array.isArray(scoreData.evidence) ? scoreData.evidence : [],
        issues: Array.isArray(scoreData.issues) ? scoreData.issues : [],
        strengths: Array.isArray(scoreData.strengths) ? scoreData.strengths : [],
        suggestions: Array.isArray(scoreData.suggestions) ? scoreData.suggestions : []
      };
    };

    const experience = processScore('experience');
    const expertise = processScore('expertise');
    const authoritativeness = processScore('authoritativeness');
    const trustworthiness = processScore('trustworthiness');

    // 计算总体分数
    const overall = aiResult.scores?.overall ||
      Math.round((experience.score + expertise.score + authoritativeness.score + trustworthiness.score) / 4 * 10) / 10;

    // 处理分析部分
    const analysis = aiResult.analysis || {
      strengths: [],
      weaknesses: [],
      opportunities: []
    };

    // 确保有具体的分析内容
    if (analysis.strengths.length === 0 && analysis.weaknesses.length === 0) {
      analysis.strengths = this.generateStrengths(originalContent);
      analysis.weaknesses = this.generateWeaknesses(originalContent);
      analysis.opportunities = this.generateOpportunities(originalContent);
    }

    return {
      articleContext,
      scores: {
        experience,
        expertise,
        authoritativeness,
        trustworthiness,
        overall
      },
      analysis: {
        strengths: analysis.strengths || [],
        weaknesses: analysis.weaknesses || [],
        opportunities: analysis.opportunities || []
      },
      summary: typeof aiResult.summary === 'string' ? aiResult.summary : this.generateSummary(originalContent),
      suggestions: Array.isArray(aiResult.suggestions) && aiResult.suggestions.length > 0
        ? aiResult.suggestions.map((s: any) => ({
            priority: ['high', 'medium', 'low'].includes(s.priority) ? s.priority : 'medium',
            category: s.category || '综合',
            description: s.description || '改进建议',
            actionItems: Array.isArray(s.actionItems) ? s.actionItems : [s.description || '采取行动']
          }))
        : this.generateSpecificSuggestions(originalContent, experience, expertise, authoritativeness, trustworthiness)
    };
  }

  // 智能计算默认分数
  private calculateIntelligentDefault(dimension: string, content: string): number {
    const indicators = {
      authoritativeness: {
        hasAuthor: content.includes('作者') || content.includes('by') || content.includes('written'),
        hasCredentials: /\b(PhD|Dr\.|专家|教授|研究员|MBA)\b/i.test(content),
        hasData: /\d+%|\d+\s*(万|千|百)|研究表明|数据显示/i.test(content),
        hasCitations: /\[1\]|\[2\]|引用|来源|参考/i.test(content)
      },
      trustworthiness: {
        hasSource: /来源|出处|引自|according to/i.test(content),
        isBalanced: /(然而|但是|另一方面|需要注意的是|值得注意的是)/i.test(content),
        hasDate: /\d{4}年|\d{1,2}月|\d{1,2}日/i.test(content),
        isTransparent: /免责声明|声明|请注意|重要提示/i.test(content)
      },
      expertise: {
        hasTechnical: /(算法|原理|机制|技术|方法|步骤)/i.test(content),
        hasExamples: /(例如|比如|举例|案例)/i.test(content),
        hasDetails: content.length > 2000,
        hasDepth: /(深入|详细|全面|系统)/i.test(content)
      },
      experience: {
        hasPractical: /(实践|实际|应用|经验|亲测)/i.test(content),
        hasPersonal: /我个人|我的经验|我试过/i.test(content),
        hasResults: /(结果|效果|成果|收获)/i.test(content),
        hasProcess: /(首先|然后|最后|第一步)/i.test(content)
      }
    };

    const dimensionIndicators = indicators[dimension as keyof typeof indicators] || {};
    const score = Object.values(dimensionIndicators).filter(Boolean).length;

    // 基础分数 + 指标分数
    return Math.min(8, 5 + score);
  }

  // 生成具体的建议
  private generateDefaultSuggestion(dimension: string, score: number): string {
    const suggestions = {
      authoritativeness: score < 7 ? "添加更多专业背景信息或数据支撑" : "继续保持专业深度",
      trustworthiness: score < 7 ? "增加信息来源标注以提高可信度" : "保持信息的透明度",
      expertise: score < 7 ? "深入探讨技术细节和原理" : "专业知识展示良好",
      experience: score < 7 ? "分享更多实际应用案例" : "实践经验分享充分"
    };
    return suggestions[dimension as keyof typeof suggestions] || "持续改进";
  }

  // 生成具体的改进建议
  private generateSpecificSuggestions(
    content: string,
    experience: ScoreDetails,
    expertise: ScoreDetails,
    authoritativeness: ScoreDetails,
    trustworthiness: ScoreDetails
  ): Array<any> {
    const suggestions = [];

    // 基于分数生成优先级
    const getPriority = (score: number): 'high' | 'medium' | 'low' => {
      if (score < 5) return 'high';
      if (score < 7) return 'medium';
      return 'low';
    };

    // 权威性建议
    if (authoritativeness.score < 7) {
      if (!content.includes('PhD') && !content.includes('Dr.') && !content.includes('专家')) {
        suggestions.push({
          priority: getPriority(authoritativeness.score),
          category: 'Authoritativeness',
          description: '添加作者的专业资质或相关认证信息',
          actionItems: [
            '在文章开头或结尾添加作者简介',
            '提及相关的专业背景或认证',
            '展示在相关领域的经验'
          ]
        });
      }
    }

    // 可信度建议
    if (trustworthiness.score < 6) {
      suggestions.push({
        priority: getPriority(trustworthiness.score),
        category: 'Trustworthiness',
        description: '增加数据来源和引用标注',
        actionItems: [
          '为具体数据添加来源链接',
          '引用权威研究或报告',
          '提供明确的参考列表'
        ]
      });
    }

    // 经验建议
    if (experience.score < 7) {
      if (!/实践|案例|应用|经验/i.test(content)) {
        suggestions.push({
          priority: getPriority(experience.score),
          category: 'Experience',
          description: '分享更多实际应用场景或案例研究',
          actionItems: [
            '添加具体的应用实例',
            '分享实际项目的经验',
            '描述遇到的问题和解决方案'
          ]
        });
      }
    }

    // 专业知识建议
    if (expertise.score < 7) {
      if (content.length < 3000) {
        suggestions.push({
          priority: getPriority(expertise.score),
          category: 'Expertise',
          description: '深化内容，提供更多技术细节',
          actionItems: [
            '扩展关键概念的解释',
            '添加更多示例和说明',
            '深入探讨技术原理'
          ]
        });
      }
    }

    // 如果分数都不错，提供通用的改进建议
    if (suggestions.length === 0) {
      suggestions.push({
        priority: 'low',
        category: '综合',
        description: '内容质量良好，建议继续保持',
        actionItems: [
          '定期更新内容以保持时效性',
          '收集读者反馈并持续优化',
          '考虑增加互动元素如FAQ'
        ]
      });
    }

    return suggestions;
  }

  // 生成优势分析
  private generateStrengths(content: string): string[] {
    const strengths = [];
    if (content.length > 3000) strengths.push("内容详实，信息量丰富");
    if (/步骤|方法|如何/i.test(content)) strengths.push("提供了实用的操作指导");
    if (/数据|统计|研究/i.test(content)) strengths.push("包含数据支撑，增强可信度");
    if (/\d+年|\d+\s*(年|月)/i.test(content)) strengths.push("提供了时间维度的信息");
    if (strengths.length === 0) strengths.push("内容结构清晰");
    return strengths;
  }

  // 生成弱点分析
  private generateWeaknesses(content: string): string[] {
    const weaknesses = [];
    if (!/作者|专家|by/i.test(content)) weaknesses.push("缺乏作者背景介绍");
    if (!/\[.*\]|\d+\..*参考文献/i.test(content) && /\d+%|\d+\s*(万|千|百)/i.test(content))
      weaknesses.push("数据引用缺乏来源标注");
    if (content.length < 1000) weaknesses.push("内容深度有待加强");
    if (!/(然而|但是|缺点|不足)/i.test(content)) weaknesses.push("缺乏多角度分析");
    if (weaknesses.length === 0) weaknesses.push("某些方面可以进一步完善");
    return weaknesses;
  }

  // 生成改进机会
  private generateOpportunities(content: string): string[] {
    const opportunities = [];
    if (!/案例|示例|举例/i.test(content)) opportunities.push("增加具体案例增强说服力");
    if (!/图片|图表|示意图/i.test(content)) opportunities.push("添加可视化元素提升理解");
    if (!/总结|结论|综上所述/i.test(content)) opportunities.push("强化总结部分");
    if (!/问题|解答|FAQ/i.test(content)) opportunities.push("预判并回答读者可能的问题");
    if (opportunities.length === 0) opportunities.push("持续优化内容质量");
    return opportunities;
  }

  // 生成总结
  private generateSummary(content: string): string {
    const score = this.calculateIntelligentDefault('expertise', content);
    if (score >= 7) {
      return "本文内容质量较高，提供了有价值的信息。建议继续保持专业深度，并适当增加更多实际案例和数据支撑，进一步提升内容的权威性和实用性。";
    } else {
      return "本文具备一定参考价值，但在专业深度和可信度方面还有提升空间。建议增加更多具体细节、数据支撑和作者背景信息，以增强内容的权威性和说服力。";
    }
  }

  private guessContentType(content: string): string {
    const lowerContent = content.toLowerCase();
    if (/步骤|如何|教程|指南|how to|tutorial|guide/i.test(content)) return "教程指南";
    if (/分析|评估|研究|analysis|research|study/i.test(content)) return "分析报告";
    if (/新闻|报道|消息|news|report/i.test(content)) return "新闻资讯";
    if (/产品|评测|对比|product|review|comparison/i.test(content)) return "产品评测";
    if (/问答|解答|quick answer|FAQ/i.test(content)) return "问答";
    return "文章";
  }

  private guessContentNiche(content: string): string {
    const lowerContent = content.toLowerCase();
    if (/技术|编程|代码|算法|技术|steel|carbon|magnetic|technical|engineering|编程|development/i.test(content) ||
        /api|sdk|software|developer/i.test(lowerContent)) return "技术";
    if (/营销|SEO|流量|转化|marketing|ads/i.test(content)) return "营销";
    if (/健康|医疗|养生|health|medical|doctor/i.test(content)) return "健康";
    if (/金融|投资|理财|financial|money|investment/i.test(content)) return "金融";
    if (/教育|学习|课程|education|study/i.test(content)) return "教育";
    return "通用";
  }

  private guessTargetAudience(content: string, title?: string): string {
    const lowerContent = (content + ' ' + (title || '')).toLowerCase();

    if (/初学者|入门|基础|beginner|introduction/i.test(lowerContent)) return "初学者";
    if (/专业|高级|进阶|professional|advanced|expert/i.test(lowerContent)) return "专业人士";
    if (/学生|学习|student|learn/i.test(lowerContent)) return "学生";
    if (/企业|商业|business|company|b2b/i.test(lowerContent)) return "企业用户";
    if (/消费者|用户|customer|consumer/i.test(lowerContent)) return "普通消费者";

    return "普通读者";
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
        strengths: ["内容结构清晰"],
        weaknesses: ["需要更多专业支撑"],
        opportunities: ["增加实际案例"]
      },
      summary: "内容评估完成，建议增加更多专业细节和可信度支撑。",
      suggestions: []
    };
  }
}
