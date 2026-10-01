import { z } from "zod";

export const taskSchema = z.object({
  id: z.string().min(1),
  content: z.string(),
  description: z.string(),
  due: z.object({ date: z.string() }).nullable(),
});
export type Task = z.infer<typeof taskSchema>;

const pageSchema = z.object({
  results: z.array(taskSchema.extend({
    checked: z.boolean(),
    is_deleted: z.boolean(),
  })).max(200),
  next_cursor: z.string().min(1).nullable(),
});

export const taskListSchema = z.object({
  configured: z.boolean(),
  tasks: z.array(taskSchema),
  truncated: z.boolean(),
});

// Todoist uses opaque base32/numeric IDs, not client-side tmp-* placeholders.
export const completeTaskInputSchema = z.object({
  taskId: z.string().min(1).max(128).regex(/^[A-Za-z0-9]+$/),
}).strict();
export const completionResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("completed") }),
  z.object({
    status: z.literal("error"),
    reason: z.enum(["not_configured", "unauthorized", "not_found", "rate_limited", "rejected", "unknown"]),
  }),
]);
export type CompletionResult = z.infer<typeof completionResultSchema>;

/** Close the current occurrence, never complete/archive an entire recurring series.
 * https://developer.todoist.com/api/v1/#tag/Tasks/operation/close_task_api_v1_tasks__task_id__close_post
 */
export async function completeTask(
  token: string,
  taskId: string,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<CompletionResult> {
  // Also validate direct callers before constructing a URL or touching the network.
  completeTaskInputSchema.parse({ taskId });
  try {
    signal.throwIfAborted();
    const response = await request(`https://api.todoist.com/api/v1/tasks/${encodeURIComponent(taskId)}/close`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      redirect: "error",
      signal,
    });
    // Close returns 200 with JSON null. A successful write needs no response body;
    // a body/parse failure must not be mistaken for a failed completion.
    void response.body?.cancel().catch(() => {});
    if (response.ok) return { status: "completed" };
    if (response.status === 401 || response.status === 403) return { status: "error", reason: "unauthorized" };
    if (response.status === 404) return { status: "error", reason: "not_found" };
    if (response.status === 429) return { status: "error", reason: "rate_limited" };
    if (response.status === 400) return { status: "error", reason: "rejected" };
  } catch {
    // Timeout, cancellation, redirects and transport errors can follow a write.
    // Never retry automatically or expose request/response details or credentials.
  }
  return { status: "error", reason: "unknown" };
}

/** Fixed-origin filtered read; no general-purpose API proxy. */
export async function listTasks(
  token: string,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<z.infer<typeof taskListSchema>> {
  const tasks = new Map<string, Task>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  // Bound a refresh to 1,000 tasks / five requests, with an explicit partial-list notice.
  for (let page = 0; page < 5; page++) {
    const url = new URL("https://api.todoist.com/api/v1/tasks/filter");
    url.searchParams.set("query", "today | overdue");
    url.searchParams.set("lang", "en");
    url.searchParams.set("limit", "200");
    if (cursor !== null) url.searchParams.set("cursor", cursor);
    let response: Response;
    try {
      response = await request(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        redirect: "error",
        signal,
      });
    } catch {
      // Never expose fetch errors, headers, tokens or raw API responses.
      throw new Error("Could not reach Todoist. The request may have timed out; try Refresh.");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      if (response.status === 401 || response.status === 403) {
        throw new Error("Todoist rejected the API token. Check the plugin's API token setting.");
      }
      if (response.status === 429) {
        throw new Error("Todoist rate limit reached. Wait a little before refreshing again.");
      }
      throw new Error("Todoist could not load tasks. Try Refresh later.");
    }
    let data: z.infer<typeof pageSchema>;
    try {
      data = pageSchema.parse(await response.json());
    } catch {
      throw new Error("Todoist returned an unexpected task response. Try Refresh later.");
    }
    for (const task of data.results) {
      if (!task.checked && !task.is_deleted) tasks.set(task.id, taskSchema.parse(task));
    }
    cursor = data.next_cursor;
    if (cursor === null) return { configured: true, tasks: [...tasks.values()], truncated: false };
    if (cursors.has(cursor)) throw new Error("Todoist repeated a pagination cursor. Try Refresh later.");
    cursors.add(cursor);
  }
  return { configured: true, tasks: [...tasks.values()], truncated: true };
}
