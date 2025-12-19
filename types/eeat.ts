export interface ArticleContext {
  type: string;
  niche: string;
  purpose: string;
  targetAudience: string;
  contentLength: number;
  readingTime: number;
}

export interface ScoreDetails {
  score: number;
  evidence: string[];
  issues: string[];
  strengths: string[];
  suggestions: string[];
}

export interface EEATScores {
  experience: ScoreDetails;
  expertise: ScoreDetails;
  authoritativeness: ScoreDetails;
  trustworthiness: ScoreDetails;
  overall: number;
}

export interface EEATResult {
  articleContext: ArticleContext;
  scores: EEATScores;
  analysis: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
  };
  summary: string;
  suggestions: {
    priority: "high" | "medium" | "low";
    category: string;
    description: string;
    actionItems: string[];
  }[];
}

export interface EvaluationRequest {
  content: string;
  title?: string;
  url?: string;
  author?: string;
  useAI?: boolean;
  useOpenAI?: boolean;
  useChunked?: boolean;
}

export interface BatchEvaluationRequest {
  articles: Array<{
    content: string;
    title?: string;
    url?: string;
    author?: string;
  }>;
  useAI?: boolean;
}

export interface BatchEvaluationResponse {
  results: EEATResult[];
  summary: {
    total: number;
    average: {
      experience: number;
      expertise: number;
      authoritativeness: number;
      trustworthiness: number;
      overall: number;
    };
    distribution: {
      excellent: number;
      good: number;
      average: number;
      poor: number;
    };
  };
}
