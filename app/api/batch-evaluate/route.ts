import { NextRequest, NextResponse } from "next/server"
import { EEATEvaluator } from "@/lib/eeat-evaluator"
import { BatchEvaluationRequest, BatchEvaluationResponse } from "@/types/eeat"
import { logger } from "@/lib/logger"

export async function POST(request: NextRequest) {
  try {
    const body: BatchEvaluationRequest = await request.json()

    logger.info("收到批量评估请求", {
      articleCount: body.articles?.length || 0,
      useAI: body.useAI
    })

    if (!body.articles || body.articles.length === 0) {
      logger.warn("批量评估：没有提供文章")
      return NextResponse.json(
        { error: "请提供要评估的文章" },
        { status: 400 }
      )
    }

    if (body.articles.length > 50) {
      logger.warn("批量评估：文章数量超过限制", {
        actualCount: body.articles.length,
        maxCount: 50
      })
      return NextResponse.json(
        { error: "批量评估最多支持50篇文章" },
        { status: 400 }
      )
    }

    const evaluator = new EEATEvaluator({
      zhipuApiKey: process.env.ZHIPU_API_KEY,
      openaiApiKey: process.env.OPENAI_API_KEY,
    })
    const results = []

    for (let index = 0; index < body.articles.length; index++) {
      const article = body.articles[index];

      if (!article.content || article.content.trim().length < 50) {
        continue
      }

      try {
        const result = await evaluator.evaluate(
          article.content,
          article.title,
          article.author,
          {
            useAI: body.useAI || false
          }
        )
        results.push(result)
      } catch (error) {
        logger.error("评估单篇文章时出错", {
          error: error instanceof Error ? error.message : String(error),
          articleIndex: index,
          title: article.title
        })
        console.error("评估单篇文章时出错:", error)
      }
    }

    if (results.length === 0) {
      logger.warn("批量评估：没有成功评估任何文章")
      return NextResponse.json(
        { error: "没有成功评估任何文章" },
        { status: 400 }
      )
    }

    // 计算统计数据
    const total = results.length
    const average = {
      experience: results.reduce((sum, r) => sum + r.scores.experience.score, 0) / total,
      expertise: results.reduce((sum, r) => sum + r.scores.expertise.score, 0) / total,
      authoritativeness: results.reduce((sum, r) => sum + r.scores.authoritativeness.score, 0) / total,
      trustworthiness: results.reduce((sum, r) => sum + r.scores.trustworthiness.score, 0) / total,
      overall: results.reduce((sum, r) => sum + r.scores.overall, 0) / total,
    }

    const distribution = {
      excellent: results.filter(r => r.scores.overall >= 8).length,
      good: results.filter(r => r.scores.overall >= 6 && r.scores.overall < 8).length,
      average: results.filter(r => r.scores.overall >= 4 && r.scores.overall < 6).length,
      poor: results.filter(r => r.scores.overall < 4).length,
    }

    const response: BatchEvaluationResponse = {
      results,
      summary: {
        total,
        average,
        distribution,
      },
    }

    logger.info("批量评估完成", {
      successfulEvaluations: results.length,
      totalRequested: body.articles.length,
      averageScore: average.overall,
      distribution
    })

    return NextResponse.json(response)
  } catch (error) {
    logger.error("批量评估过程中发生错误", {
      error: error instanceof Error ? error.message : String(error)
    })
    console.error("批量评估错误:", error)
    return NextResponse.json(
      { error: "批量评估过程中发生错误，请稍后重试" },
      { status: 500 }
    )
  }
}
