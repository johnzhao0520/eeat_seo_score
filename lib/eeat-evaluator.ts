import { ArticleContext, EEATResult, ScoreDetails, EEATScores } from "@/types/eeat";
import { calculateOverallScore } from "./utils";
import { AIEvaluatorEnhanced } from "./ai-evaluator-enhanced";
import { ZhipuEvaluator } from "./zhipu-evaluator-adaptive";

interface EvaluateOptions {
  useAI?: boolean;
  useOpenAI?: boolean;
  zhipuApiKey?: string;
  openaiApiKey?: string;
}

export class EEATEvaluator {
  private articleContext: ArticleContext | null = null;
  private openaiEvaluator: AIEvaluatorEnhanced | null = null;
  private zhipuEvaluator: ZhipuEvaluator | null = null;

  constructor(options?: { zhipuApiKey?: string; openaiApiKey?: string }) {
    // 优先使用智谱AI（更经济）
    if (options?.zhipuApiKey) {
      this.zhipuEvaluator = new ZhipuEvaluator(options.zhipuApiKey);
    }
    // OpenAI作为备选
    if (options?.openaiApiKey) {
      this.openaiEvaluator = new AIEvaluatorEnhanced(options.openaiApiKey);
    }
  }

  /**
   * 评估文章内容
   */
  async evaluate(
    content: string,
    title?: string,
    author?: string,
    options: EvaluateOptions = {}
  ): Promise<EEATResult> {
    // 1. 分析文章上下文
    this.articleContext = this.analyzeContext(content, title);

    // 2. 检查是否使用AI评估
    if (options.useAI) {
      let aiResult = null;

      // 优先使用智谱AI（更经济）
      if (this.zhipuEvaluator && !options.useOpenAI) {
        aiResult = await this.zhipuEvaluator.evaluateWithAI(content, title, author, this.articleContext);
      }

      // 如果智谱AI失败或明确要求使用OpenAI
      if (!aiResult && this.openaiEvaluator && (options.useOpenAI || !this.zhipuEvaluator)) {
        aiResult = await this.openaiEvaluator.evaluateWithAI(content, title, author, this.articleContext);
      }

      if (aiResult) {
        // AI评估成功，返回AI结果
        return aiResult;
      }
      // AI评估失败，继续使用规则评估
    }

    // 3. 进行规则驱动的四个维度评估
    const scores = await this.calculateScores(content, this.articleContext, options);

    // 3. 生成分析和建议
    const analysis = this.generateAnalysis(scores);
    const suggestions = this.generateSuggestions(scores, this.articleContext);
    const summary = this.generateSummary(scores);

    return {
      articleContext: this.articleContext,
      scores,
      analysis,
      summary,
      suggestions,
    };
  }

  /**
   * 分析文章上下文（类型、利基、目的等）
   */
  private analyzeContext(content: string, title?: string): ArticleContext {
    const text = content.toLowerCase();
    const titleText = (title || "").toLowerCase();

    // 识别文章类型
    let type = "文章";
    const typePatterns = {
      tutorial: [
        "教程", "步骤", "如何", "how to", "tutorial", "指南", "学习",
        "教程", "操作指南", "分步"
      ],
      guide: [
        "指南", "指南", "guide", "手册", "完整指南", "完整教程"
      ],
      analysis: [
        "分析", "analysis", "评估", "评测", "对比", "比较", "研究"
      ],
      news: [
        "新闻", "news", "报道", "最新", "公告", "发布"
      ],
      review: [
        "评测", "review", "评价", "体验", "测试", "测评"
      ]
    };

    for (const [typeName, patterns] of Object.entries(typePatterns)) {
      if (patterns.some(pattern => text.includes(pattern) || titleText.includes(pattern))) {
        type = typeName;
        break;
      }
    }

    // 识别利基市场
    let niche = "通用";
    const nichePatterns = {
      "技术B2B": [
        "api", "sdk", "开发", "技术", "编程", "软件", "企业",
        "b2b", "software", "developer"
      ],
      "消费者": [
        "购买", "推荐", "产品", "消费", "用户", "生活", "家居"
      ],
      "医疗": [
        "医疗", "健康", "疾病", "治疗", "药物", "症状", "medical",
        "health", "doctor"
      ],
      "金融": [
        "投资", "理财", "金融", "股票", "基金", "银行", "financial",
        "money", "investment"
      ],
      "教育": [
        "教育", "学习", "课程", "知识", "学术", "education", "study"
      ],
      "营销": [
        "营销", "推广", "seo", "广告", "品牌", "marketing", "ads"
      ]
    };

    for (const [nicheName, patterns] of Object.entries(nichePatterns)) {
      if (patterns.some(pattern => text.includes(pattern))) {
        niche = nicheName;
        break;
      }
    }

    // 识别目的
    let purpose = "信息";
    const purposePatterns = {
      教育: ["教学", "学习", "educate", "teach", "了解", "知道"],
      商业: ["销售", "推广", "商业", "business", "产品", "服务"],
      信息: ["信息", "资讯", "信息", "新闻", "报道"],
      导航: ["导航", "目录", "导航", "index"]
    };

    for (const [purposeName, patterns] of Object.entries(purposePatterns)) {
      if (patterns.some(pattern => text.includes(pattern))) {
        purpose = purposeName;
        break;
      }
    }

    return {
      type,
      niche,
      purpose,
      targetAudience: this.inferTargetAudience(niche),
      contentLength: content.length,
      readingTime: Math.ceil(content.length / 500), // 估算阅读时间（分钟）
    };
  }

  private inferTargetAudience(niche: string): string {
    const audienceMap: Record<string, string> = {
      "技术B2B": "开发者、技术决策者",
      "消费者": "普通消费者",
      "医疗": "患者、医疗专业人士",
      "金融": "投资者、金融从业者",
      "教育": "学生、教师",
      "营销": "营销人员、企业主",
      "通用": "普通读者",
    };

    return audienceMap[niche] || "通用受众";
  }

  /**
   * 计算四个维度的评分
   */
  private async calculateScores(
    content: string,
    context: ArticleContext,
    options: EvaluateOptions
  ): Promise<EEATScores> {
    const experience = this.evaluateExperience(content, context);
    const expertise = this.evaluateExpertise(content, context);
    const authoritativeness = this.evaluateAuthoritativeness(content, context);
    const trustworthiness = this.evaluateTrustworthiness(content, context);

    const overall = calculateOverallScore(
      experience.score,
      expertise.score,
      authoritativeness.score,
      trustworthiness.score
    );

    return {
      experience,
      expertise,
      authoritativeness,
      trustworthiness,
      overall,
    };
  }

  /**
   * 评估 Experience（经验）维度
   */
  private evaluateExperience(content: string, context: ArticleContext): ScoreDetails {
    const text = content.toLowerCase();
    const evidence: string[] = [];
    const issues: string[] = [];
    const strengths: string[] = [];
    const suggestions: string[] = [];

    let score = 4; // 基础分，根据证据动态调整

    // 检查第一手经验证据
    const experienceIndicators = {
      "第一手经验": [
        "我亲自", "我曾经", "我做过", "我的经验", "根据我的经验",
        "i personally", "i have done", "my experience", "in my experience"
      ],
      "案例研究": [
        "案例研究", "案例分析", "成功案例", "失败案例", "case study",
        "实际案例", "具体例子"
      ],
      "详细流程": [
        "步骤", "流程", "详细", "具体步骤", "详细说明", "步骤如下",
        "process", "steps", "detailed"
      ],
      "数据和指标": [
        "数据", "指标", "统计", "百分比", "%", "数字", "结果",
        "data", "statistics", "metrics", "results"
      ],
      "截图/演示": [
        "截图", "图片", "演示", "图表", "screenshot", "image",
        "demo", "diagram"
      ]
    };

    let evidenceCount = 0;
    for (const [category, keywords] of Object.entries(experienceIndicators)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        evidenceCount++;
        evidence.push(`包含${category}相关描述`);
      }
    }

    // 根据证据数量调整分数
    score = Math.min(10, 3 + evidenceCount * 1.5);

    // 内容类型特定检查
    if (context.type === "tutorial" || context.type === "guide") {
      if (evidenceCount < 3) {
        issues.push("教程/指南类内容需要更多实践经验");
        suggestions.push("添加个人实践经历和具体操作步骤");
      }
    }

    // 根据分数评级strengths和suggestions
    if (score >= 8) {
      strengths.push("内容包含丰富的实践经验");
      strengths.push("提供了具体的案例和数据支持");
    } else if (score >= 6) {
      strengths.push("包含一定的实践经验");
      suggestions.push("增加更多第一手经验和具体案例");
    } else if (score < 4) {
      issues.push("缺乏实践经验描述");
      suggestions.push("添加个人经验和具体案例研究");
    }

    return { score, evidence, issues, strengths, suggestions };
  }

  /**
   * 评估 Expertise（专业知识）维度
   */
  private evaluateExpertise(content: string, context: ArticleContext): ScoreDetails {
    const text = content.toLowerCase();
    const evidence: string[] = [];
    const issues: string[] = [];
    const strengths: string[] = [];
    const suggestions: string[] = [];

    let score = 4; // 基础分，根据证据动态调整

    // 检查专业知识指标
    const expertiseIndicators = {
      "准确性": [
        "准确", "正确", "准确无误", "accurate", "correct"
      ],
      "最新信息": [
        "最新", "2023", "2024", "当前", "recent", "latest", "最新版本"
      ],
      "深度解释": [
        "深度", "详细解释", "深入", "详细分析", "detailed", "in-depth"
      ],
      "复杂性理解": [
        "复杂", "复杂性", "挑战", "complex", "challenging"
      ],
      "战略见解": [
        "策略", "战略", "建议", "strategy", "insight", "建议是"
      ],
      "专业术语": [
        "技术术语", "专业词汇", "专业术语", "technical terms"
      ]
    };

    let evidenceCount = 0;
    for (const [category, keywords] of Object.entries(expertiseIndicators)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        evidenceCount++;
        evidence.push(`展现${category}能力`);
      }
    }

    score = Math.min(10, 3 + evidenceCount * 1.2);

    // YMYL内容特殊检查
    if (context.niche === "医疗" || context.niche === "金融") {
      if (evidenceCount < 4) {
        issues.push("医疗/金融内容需要更高的专业标准");
        suggestions.push("提供更专业的证据和引用来源");
      }
      score = Math.max(score, 6); // YMYL内容最低6分
    }

    // 内容长度与深度匹配
    const expectedDepth = this.getExpectedDepth(context.type);
    if (content.length < expectedDepth * 0.8) {
      issues.push("内容深度可能不足");
      suggestions.push("增加更详细的解释和分析");
    }

    if (score >= 8) {
      strengths.push("内容展现深厚的专业知识");
      strengths.push("信息准确且具有深度");
    } else if (score < 5) {
      issues.push("专业知识深度不足");
      suggestions.push("增加专业见解和深度分析");
    }

    return { score, evidence, issues, strengths, suggestions };
  }

  private getExpectedDepth(type: string): number {
    const depthMap: Record<string, number> = {
      tutorial: 1500,
      guide: 2000,
      analysis: 2500,
      news: 800,
      review: 1200,
      文章: 1000,
    };

    return depthMap[type] || 1000;
  }

  /**
   * 评估 Authoritativeness（权威性）维度
   */
  private evaluateAuthoritativeness(content: string, context: ArticleContext): ScoreDetails {
    const evidence: string[] = [];
    const issues: string[] = [];
    const strengths: string[] = [];
    const suggestions: string[] = [];

    let score = 4; // 基础分，根据证据动态调整

    // 检查权威性指标
    const authoritativenessIndicators = {
      "引用来源": [
        "引用", "来源", "according to", "source", "according to",
        "研究表明", "research shows"
      ],
      "作者资质": [
        "作者", "专家", "认证", "qualified", "expert", "certified",
        "经验", "experience"
      ],
      "原创数据": [
        "原创研究", "原创数据", "original research", "our data",
        "独家", "exclusive"
      ],
      "行业认可": [
        "行业", "认可", "industry", "recognized", "award",
        "奖项", "奖项获得"
      ]
    };

    let evidenceCount = 0;
    for (const [category, keywords] of Object.entries(authoritativenessIndicators)) {
      const pattern = new RegExp(keywords.join("|"), "i");
      if (pattern.test(content)) {
        evidenceCount++;
        evidence.push(`包含${category}`);
      }
    }

    score = Math.min(10, 3 + evidenceCount * 1.8);

    // 检查引用数量和质量
    const linkPattern = /\[(\d+)\]|\(\d{4}\)|https?:\/\/[^\s]+/g;
    const references = content.match(linkPattern);
    if (references && references.length > 0) {
      evidence.push(`包含${references.length}个引用`);
      score += 1;
    }

    if (score >= 8) {
      strengths.push("内容具有很强的权威性");
      strengths.push("有充分的证据和引用支持");
    } else if (score < 5) {
      issues.push("缺乏权威性证据");
      suggestions.push("增加可信的引用来源和作者资质");
      suggestions.push("添加原创数据或研究成果");
    }

    return { score, evidence, issues, strengths, suggestions };
  }

  /**
   * 评估 Trustworthiness（可信度）维度
   */
  private evaluateTrustworthiness(content: string, context: ArticleContext): ScoreDetails {
    const evidence: string[] = [];
    const issues: string[] = [];
    const strengths: string[] = [];
    const suggestions: string[] = [];

    let score = 4; // 基础分，根据证据动态调整

    // 检查可信度指标
    const trustworthinessIndicators = {
      "平衡呈现": [
        "平衡", "客观", "both sides", "balanced", "objective",
        "一方面", "另一方面"
      ],
      "清晰归属": [
        "作者", "归属", "author", "by", "版权所有",
        "copyright", "rights reserved"
      ],
      "方法透明": [
        "方法", " methodology", "方法如下", "我们的方法是",
        "如何", "process"
      ],
      "准确可验证": [
        "验证", "准确", "verified", "accurate", "confirmed",
        "已确认", "已验证"
      ],
      "更新信息": [
        "更新", "updated", "最新更新", "last updated",
        "最后更新"
      ]
    };

    let evidenceCount = 0;
    for (const [category, keywords] of Object.entries(trustworthinessIndicators)) {
      if (keywords.some(keyword => content.toLowerCase().includes(keyword))) {
        evidenceCount++;
        evidence.push(`展现${category}`);
      }
    }

    score = Math.min(10, 3 + evidenceCount * 1.4);

    // 检查免责声明
    const disclaimerPatterns = [
      "免责声明", "disclaimer", "不保证", "不承担责任",
      "not responsible", "no guarantee"
    ];
    const hasDisclaimer = disclaimerPatterns.some(pattern =>
      content.toLowerCase().includes(pattern)
    );

    if (hasDisclaimer) {
      evidence.push("包含免责声明");
      score += 0.5;
    }

    // 检查偏见性语言
    const biasedLanguage = ["绝对", "肯定", "一定是", "绝对正确", "100%", "without doubt"];
    const hasBias = biasedLanguage.some(phrase => content.includes(phrase));

    if (hasBias) {
      issues.push("存在过于绝对的表述");
      suggestions.push("使用更平衡和谨慎的语言");
      score -= 0.5;
    }

    if (score >= 8) {
      strengths.push("内容透明可信");
      strengths.push("信息准确且可验证");
    } else if (score < 5) {
      issues.push("可信度不足");
      suggestions.push("增加透明度和平衡性");
      suggestions.push("添加验证信息和方法说明");
    }

    return { score: Math.max(0, Math.min(10, score)), evidence, issues, strengths, suggestions };
  }

  /**
   * 生成整体分析
   */
  private generateAnalysis(scores: EEATScores): {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
  } {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const opportunities: string[] = [];

    // 基于分数分析
    if (scores.experience.score >= 7) {
      strengths.push("内容展现了丰富的实践经验");
    } else {
      opportunities.push("增强实践经验描述");
    }

    if (scores.expertise.score >= 7) {
      strengths.push("展现了深厚的专业知识");
    } else {
      opportunities.push("深化专业知识和见解");
    }

    if (scores.authoritativeness.score >= 7) {
      strengths.push("具有很强的权威性和可信度");
    } else {
      opportunities.push("提升权威性和引用质量");
    }

    if (scores.trustworthiness.score >= 7) {
      strengths.push("内容透明且值得信赖");
    } else {
      opportunities.push("增强透明度和平衡性");
    }

    // 添加weaknesses
    if (scores.experience.score < 5) weaknesses.push("缺乏实践经验证据");
    if (scores.expertise.score < 5) weaknesses.push("专业知识深度不足");
    if (scores.authoritativeness.score < 5) weaknesses.push("缺乏权威性支撑");
    if (scores.trustworthiness.score < 5) weaknesses.push("可信度需要提升");

    return { strengths, weaknesses, opportunities };
  }

  /**
   * 生成改进建议
   */
  private generateSuggestions(
    scores: EEATScores,
    context: ArticleContext
  ): Array<{
    priority: "high" | "medium" | "low";
    category: string;
    description: string;
    actionItems: string[];
  }> {
    const suggestions: Array<{
      priority: "high" | "medium" | "low";
      category: string;
      description: string;
      actionItems: string[];
    }> = [];

    // 根据最低分数给出高优先级建议
    const scoresWithNames = [
      { name: "experience", score: scores.experience.score },
      { name: "expertise", score: scores.expertise.score },
      { name: "authoritativeness", score: scores.authoritativeness.score },
      { name: "trustworthiness", score: scores.trustworthiness.score },
    ];

    scoresWithNames.sort((a, b) => a.score - b.score);
    const lowest = scoresWithNames[0];

    if (lowest.score < 6) {
      suggestions.push({
        priority: "high",
        category: this.getCategoryName(lowest.name),
        description: `${this.getCategoryName(lowest.name)}是最需要改进的方面`,
        actionItems: this.getActionItems(lowest.name, context),
      });
    }

    // 中等优先级建议
    const midScoreCategories = scoresWithNames.filter(s => s.score >= 6 && s.score < 8);
    midScoreCategories.forEach(category => {
      suggestions.push({
        priority: "medium",
        category: this.getCategoryName(category.name),
        description: `${this.getCategoryName(category.name)}有提升空间`,
        actionItems: this.getActionItems(category.name, context),
      });
    });

    return suggestions;
  }

  private getCategoryName(name: string): string {
    const map: Record<string, string> = {
      experience: "经验",
      expertise: "专业知识",
      authoritativeness: "权威性",
      trustworthiness: "可信度",
    };
    return map[name] || name;
  }

  private getActionItems(category: string, context: ArticleContext): string[] {
    const actionMap: Record<string, Record<string, string[]>> = {
      experience: {
        tutorial: [
          "添加个人实践经历",
          "包含具体操作步骤",
          "分享实际案例和结果",
        ],
        guide: [
          "提供第一手经验",
          "增加详细案例研究",
          "包含实用技巧和窍门",
        ],
        default: [
          "添加个人经验和案例",
          "提供具体数据和指标",
          "包含第一手见解",
        ],
      },
      expertise: {
        default: [
          "深化专业分析",
          "添加最新行业趋势",
          "提供战略见解",
        ],
      },
      authoritativeness: {
        default: [
          "增加可信引用来源",
          "添加作者资质说明",
          "引用权威机构数据",
        ],
      },
      trustworthiness: {
        default: [
          "增加透明度和平衡性",
          "添加方法说明",
          "包含免责声明",
        ],
      },
    };

    return actionMap[category]?.[context.type] || actionMap[category]?.default || [];
  }

  /**
   * 生成总结
   */
  private generateSummary(scores: EEATScores): string {
    const overall = scores.overall;
    let summary = "";

    if (overall >= 9) {
      summary = "这是一篇高质量的内容，在经验、专业知识、权威性和可信度方面都表现出色。";
    } else if (overall >= 7) {
      summary = "这是一篇良好的内容，大部分EEAT标准达标，只需小幅改进即可达到优秀水平。";
    } else if (overall >= 5) {
      summary = "这是一篇中等质量的内容，在某些方面表现良好，但在多个维度还有提升空间。";
    } else {
      summary = "这篇内容需要重大改进，特别是在EEAT的多个核心维度上。";
    }

    // 添加具体的强项和弱项
    const strengths = [];
    if (scores.experience.score >= 7) strengths.push("经验丰富");
    if (scores.expertise.score >= 7) strengths.push("专业深入");
    if (scores.authoritativeness.score >= 7) strengths.push("权威可信");
    if (scores.trustworthiness.score >= 7) strengths.push("值得信赖");

    const weaknesses = [];
    if (scores.experience.score < 6) weaknesses.push("实践经验不足");
    if (scores.expertise.score < 6) weaknesses.push("专业知识欠缺");
    if (scores.authoritativeness.score < 6) weaknesses.push("权威性不足");
    if (scores.trustworthiness.score < 6) weaknesses.push("可信度不够");

    if (strengths.length > 0) {
      summary += "\n\n主要优势：" + strengths.join("、") + "。";
    }

    if (weaknesses.length > 0) {
      summary += '\n主要改进点：' + weaknesses.join('、') + '。';
    }

    return summary;
  }
}
