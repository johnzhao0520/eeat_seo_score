import { NextRequest, NextResponse } from "next/server";
import { getEvaluationTask } from "@/lib/task-queue";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  const taskId = context.params.id;
  const task = getEvaluationTask(taskId);

  if (!task) {
    logger.warn("评估任务不存在", { taskId });
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }

  return NextResponse.json({
    taskId: task.id,
    status: task.status,
    result: task.result,
    error: task.error,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  });
}
