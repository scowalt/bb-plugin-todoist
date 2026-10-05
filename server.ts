import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  completeTask, completeTaskInputSchema, completionResultSchema,
  listTasks, taskListSchema, type CompletionResult,
} from "./todoist";

export const rpcContract = defineRpcContract({
  tasks_list: { input: z.null(), output: taskListSchema },
  tasks_complete: { input: completeTaskInputSchema, output: completionResultSchema },
});

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    apiToken: { type: "string", label: "Todoist API token", secret: true },
  });
  const lifecycle = new AbortController();
  bb.onDispose(() => lifecycle.abort());
  const completions = new Map<string, Promise<CompletionResult>>();

  bb.rpc.register(rpcContract, {
    tasks_complete: ({ taskId }) => {
      const pending = completions.get(taskId);
      if (pending) return pending;
      const operation = (async (): Promise<CompletionResult> => {
        try {
          const token = (await settings.get()).apiToken?.trim();
          if (!token) return { status: "error", reason: "not_configured" };
          return await completeTask(token, taskId, AbortSignal.any([
            lifecycle.signal,
            AbortSignal.timeout(20_000),
          ]));
        } catch {
          return { status: "error", reason: "unknown" };
        }
      })().finally(() => completions.delete(taskId));
      completions.set(taskId, operation);
      return operation;
    },
    tasks_list: async () => {
      const token = (await settings.get()).apiToken?.trim();
      if (!token) return { configured: false, tasks: [], truncated: false };
      return listTasks(token, AbortSignal.any([
        lifecycle.signal,
        AbortSignal.timeout(20_000),
      ]));
    },
  });
}
