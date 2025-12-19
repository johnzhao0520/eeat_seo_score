import { NextRequest, NextResponse } from "next/server"
import { EEATEvaluator } from "@/lib/eeat-evaluator"
import { EvaluationRequest } from "@/types/eeat"
import { logger } from "@/lib/logger"

export async function POST(request: NextRequest) {
  try {
    const body: EvaluationRequest = await request.json()

    // 记录评估请求
    logger.info("收到内容评估请求", {
      contentLength: body.content?.length || 0,
      title: body.title,
      author: body.author,
      useAI: body.useAI
    })

    if (!body.content || body.content.trim().length < 50) {
      logger.warn("内容长度不足", {
        actualLength: body.content?.length || 0,
        requiredLength: 50
      })
      return NextResponse.json(
        { error: "内容至少需要50个字符" },
        { status: 400 }
      )
    }

    const evaluator = new EEATEvaluator({
      zhipuApiKey: process.env.ZHIPU_API_KEY,
      openaiApiKey: process.env.OPENAI_API_KEY,
    })
    const result = await evaluator.evaluate(
      body.content,
      body.title,
      body.author,
      {
        useAI: body.useAI || false,
        useOpenAI: body.useOpenAI || false,
        useChunked: body.useChunked
      }
    )

    // 记录评估结果
    logger.info("评估完成", {
      overall: result.scores.overall,
      experience: result.scores.experience.score,
      expertise: result.scores.expertise.score,
      authoritativeness: result.scores.authoritativeness.score,
      trustworthiness: result.scores.trustworthiness.score,
      contentType: result.articleContext.type,
      niche: result.articleContext.niche
    })

    return NextResponse.json(result)
  } catch (error) {
    logger.error("评估过程中发生错误", {
      error: error instanceof Error ? error.message : String(error)
    })
    console.error("评估错误:", error)
    return NextResponse.json(
      { error: "评估过程中发生错误，请稍后重试" },
      { status: 500 }
    )
  }
}
