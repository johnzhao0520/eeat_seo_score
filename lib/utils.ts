import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculateOverallScore(
  experience: number,
  expertise: number,
  authoritativeness: number,
  trustworthiness: number
): number {
  // 加权平均（可根据需求调整权重）
  const weights = {
    experience: 0.25,
    expertise: 0.3,
    authoritativeness: 0.25,
    trustworthiness: 0.2,
  };

  return Number(
    (
      experience * weights.experience +
      expertise * weights.expertise +
      authoritativeness * weights.authoritativeness +
      trustworthiness * weights.trustworthiness
    ).toFixed(1)
  );
}

export function getScoreLevel(score: number): {
  level: string;
  color: string;
  description: string;
} {
  if (score >= 9) {
    return {
      level: "优秀",
      color: "text-green-600",
      description: "内容质量极高，符合顶级EEAT标准",
    };
  } else if (score >= 7) {
    return {
      level: "良好",
      color: "text-blue-600",
      description: "内容质量良好，大部分EEAT标准达标",
    };
  } else if (score >= 5) {
    return {
      level: "中等",
      color: "text-yellow-600",
      description: "内容质量中等，部分方面需要改进",
    };
  } else if (score >= 3) {
    return {
      level: "较差",
      color: "text-orange-600",
      description: "内容质量较差，多个方面需要优化",
    };
  } else {
    return {
      level: "很差",
      color: "text-red-600",
      description: "内容质量很差，需要重大改进",
    };
  }
}

export function extractTextFromHtml(html: string): string {
  // 简单的HTML标签移除
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function estimateReadingTime(text: string): number {
  const wordsPerMinute = 200;
  const words = text.trim().split(/\s+/).length;
  return Math.ceil(words / wordsPerMinute);
}
