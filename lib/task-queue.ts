import { EEATEvaluator } from "@/lib/eeat-evaluator";
import { EEATResult, EvaluationRequest } from "@/types/eeat";
import { logger } from "@/lib/logger";

type TaskStatus = "queued" | "running" | "completed" | "failed";

interface TaskRecord {
  id: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  input: EvaluationRequest;
  result?: EEATResult;
  error?: string;
}

const tasks = new Map<string, TaskRecord>();
const queue: string[] = [];
let processing = false;

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `task_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const now = () => new Date().toISOString();

export const createEvaluationTask = (input: EvaluationRequest): TaskRecord => {
  const id = createId();
  const record: TaskRecord = {
    id,
    status: "queued",
    createdAt: now(),
    updatedAt: now(),
    input
  };

  tasks.set(id, record);
  queue.push(id);
  void processQueue();
  return record;
};

export const getEvaluationTask = (id: string): TaskRecord | null => {
  return tasks.get(id) || null;
};

const processQueue = async () => {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const taskId = queue.shift();
    if (!taskId) continue;
    const task = tasks.get(taskId);
    if (!task) continue;

    task.status = "running";
    task.updatedAt = now();

    try {
      const evaluator = new EEATEvaluator({
        zhipuApiKey: process.env.ZHIPU_API_KEY,
        openaiApiKey: process.env.OPENAI_API_KEY
      });

      const result = await evaluator.evaluate(
        task.input.content,
        task.input.title,
        task.input.author,
        {
          useAI: task.input.useAI ?? true,
          useOpenAI: task.input.useOpenAI ?? false,
          useChunked: task.input.useChunked ?? true
        }
      );

      task.status = "completed";
      task.result = result;
      task.updatedAt = now();
    } catch (error) {
      task.status = "failed";
      task.error = error instanceof Error ? error.message : String(error);
      task.updatedAt = now();
      logger.error("评估任务执行失败", {
        taskId,
        error: task.error
      });
    }
  }

  processing = false;
};
