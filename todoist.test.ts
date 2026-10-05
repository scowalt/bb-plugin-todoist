import { describe, expect, it, vi } from "vitest";
import { completeTask, listTasks } from "./todoist";
import { taskPrompt, taskUrl } from "./task-prompt";

const task = {
  id: "abc123", content: "Ship it", description: "Details", due: { date: "2026-10-01" },
  checked: false, is_deleted: false,
};
const response = (results: unknown[], next_cursor: string | null = null) =>
  Response.json({ results, next_cursor });
const signal = () => new AbortController().signal;

describe("Todoist task listing", () => {
  it("uses the official filter, fixed origin, bearer header and opaque cursors", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response([task], "opaque +/="))
      .mockResolvedValueOnce(response([task, { ...task, id: "second", due: null }]));
    const result = await listTasks("test-token", signal(), request);
    expect(result.tasks.map(t => t.id)).toEqual(["abc123", "second"]);
    expect(result.truncated).toBe(false);
    for (const [input, options] of request.mock.calls) {
      const url = new URL(String(input));
      expect(url.origin + url.pathname).toBe("https://api.todoist.com/api/v1/tasks/filter");
      expect(url.searchParams.get("query")).toBe("today | overdue");
      expect(url.searchParams.get("limit")).toBe("200");
      expect(options).toMatchObject({ method: "GET", redirect: "error", headers: { Authorization: "Bearer test-token" } });
    }
    expect(new URL(String(request.mock.calls[1]![0])).searchParams.get("cursor")).toBe("opaque +/=");
    expect(result.tasks[0]).not.toHaveProperty("checked");
  });

  it("excludes completed and deleted tasks", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response([
      { ...task, checked: true }, { ...task, is_deleted: true },
    ]));
    expect((await listTasks("token", signal(), request)).tasks).toEqual([]);
  });

  it.each([401, 403, 429, 500])("sanitizes HTTP %s errors", async status => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("sensitive response", { status }));
    await expect(listTasks("secret-token", signal(), request)).rejects.not.toThrow(/secret-token|sensitive response/);
  });

  it("sanitizes transport errors", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error("secret-token"));
    await expect(listTasks("secret-token", signal(), request)).rejects.toThrow("Could not reach Todoist");
  });

  it("rejects malformed data without exposing its content", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response([{ content: "private content" }]));
    await expect(listTasks("token", signal(), request)).rejects.toThrow("unexpected task response");
  });

  it("detects pagination loops", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => response([], "repeat"));
    await expect(listTasks("token", signal(), request)).rejects.toThrow("repeated a pagination cursor");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("bounds pagination and reports truncation", async () => {
    let cursor = 0;
    const request = vi.fn<typeof fetch>().mockImplementation(async () => response([], String(++cursor)));
    expect((await listTasks("token", signal(), request)).truncated).toBe(true);
    expect(request).toHaveBeenCalledTimes(5);
  });

  it("passes cancellation through to fetch", async () => {
    const controller = new AbortController();
    controller.abort();
    const request = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
      options?.signal?.throwIfAborted();
      return response([]);
    });
    await expect(listTasks("token", controller.signal, request)).rejects.toThrow("Could not reach Todoist");
    expect(request.mock.calls[0]![1]?.signal).toBe(controller.signal);
  });
});

describe("Todoist occurrence completion", () => {
  it.each(["6XGgmFVcrG5RRjVr", "2995104339"])("closes %s using only the official occurrence endpoint", async taskId => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(null));
    const cancellation = signal();
    expect(await completeTask("test-token", taskId, cancellation, request)).toEqual({ status: "completed" });
    expect(request.mock.calls).toEqual([[
      `https://api.todoist.com/api/v1/tasks/${taskId}/close`,
      { method: "POST", headers: { Authorization: "Bearer test-token" }, redirect: "error", signal: cancellation },
    ]]);
    expect(request.mock.calls[0]![1]).not.toHaveProperty("body");
  });

  it("does not interpret a successful response body as another operation or a write failure", async () => {
    const body = new ReadableStream({ start(controller) { controller.error(new Error("private body")); } });
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 200 }));
    expect(await completeTask("token", "abc123", signal(), request)).toEqual({ status: "completed" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    [400, "rejected"], [401, "unauthorized"], [403, "unauthorized"], [404, "not_found"],
    [429, "rate_limited"], [500, "unknown"], [503, "unknown"], [302, "unknown"],
  ])("sanitizes HTTP %s without retrying", async (status, reason) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("private response secret-token", { status }));
    expect(await completeTask("secret-token", "abc123", signal(), request)).toEqual({ status: "error", reason });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("treats transport/redirect failures as ambiguous, never automatically retrying", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error("Authorization: secret-token private details"));
    expect(await completeTask("secret-token", "abc123", signal(), request)).toEqual({ status: "error", reason: "unknown" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not send an already-cancelled write", async () => {
    const controller = new AbortController();
    controller.abort();
    const request = vi.fn<typeof fetch>();
    expect(await completeTask("token", "abc123", controller.signal, request)).toEqual({ status: "error", reason: "unknown" });
    expect(request).not.toHaveBeenCalled();
  });

  it.each(["", " ", "../other", "a/b", "a?x=y", "a%2Fb", "https://evil.test", "tmp-placeholder", "a".repeat(129)])(
    "rejects invalid IDs before network access (%s)", async taskId => {
      const request = vi.fn<typeof fetch>();
      await expect(completeTask("token", taskId, signal(), request)).rejects.toThrow();
      expect(request).not.toHaveBeenCalled();
    },
  );
});

it("builds an editable task prompt without granting Todoist write permission", () => {
  expect(taskPrompt(task)).toContain('"title": "Ship it"');
  expect(taskPrompt(task)).toContain('"description": "Details"');
  expect(taskPrompt(task)).toContain(taskUrl(task));
  expect(taskPrompt(task)).toContain("Do not edit, complete, or comment");
  expect(taskUrl({ id: "a/b?c" })).toBe("https://app.todoist.com/app/task/a%2Fb%3Fc");
});
