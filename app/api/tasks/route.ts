import { NextRequest, NextResponse } from "next/server";
import { EvaluationRequest } from "@/types/eeat";
import { createEvaluationTask } from "@/lib/task-queue";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body: EvaluationRequest = await request.json();

    if (!body.content || body.content.trim().length < 50) {
      logger.warn("任务创建失败：内容长度不足", {
        actualLength: body.content?.length || 0
      });
      return NextResponse.json(
        { error: "内容至少需要50个字符" },
        { status: 400 }
      );
    }

    const task = createEvaluationTask(body);

    logger.info("创建评估任务", {
      taskId: task.id,
      useAI: body.useAI,
      useChunked: body.useChunked
    });

    return NextResponse.json({
      taskId: task.id,
      status: task.status
    });
  } catch (error) {
    logger.error("创建评估任务失败", {
      error: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json(
      { error: "创建评估任务失败，请稍后重试" },
      { status: 500 }
    );
  }
}
