import { afterEach, expect, it, vi } from "vitest";
import { createFakePluginHost, experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";
import { fileURLToPath } from "node:url";
import plugin from "./server";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("uses only public SDK and declared UI/test dependencies", () => {
  const scan = experimental_scanPublicSdkOnly(fileURLToPath(new URL(".", import.meta.url)), {
    allow: [
      /^react(?:\/.*)?$/, /^react-dom(?:\/.*)?$/, /^@radix-ui\/react-[\w-]+$/,
      /^@testing-library\/react$/, /^vitest(?:\/config)?$/, /^@\/components\/ui\/button$/,
      /^@\/(?:lib|hooks|components)\/[\w/.-]+$/,
      /^(?:class-variance-authority|clsx|tailwind-merge|vaul)$/,
    ],
  });
  expect(scan.violations).toEqual([]);
  expect(scan.privateDependencies).toEqual([]);
});

it("only exposes list/occurrence RPCs, no agent/CLI writes; missing credentials cause no network access", async () => {
  const request = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", request);
  const { bb, harness } = createFakePluginHost({ pluginId: "todoist" });
  try {
    await plugin(bb);
    expect(await harness.behavior.callRpc("tasks_list", null)).toEqual({ configured: false, tasks: [], truncated: false });
    expect(await harness.behavior.callRpc("tasks_complete", { taskId: "abc123" }))
      .toEqual({ status: "error", reason: "not_configured" });
    expect(request).not.toHaveBeenCalled();
    expect(harness.registrations.rpcMethods.sort()).toEqual(["tasks_complete", "tasks_list"]);
    expect(harness.registrations.experimental_publishedRpcMethods).toEqual([]);
    expect(harness.registrations.agentTools).toEqual([]);
    expect(harness.registrations.cli).toBeNull();
    expect(harness.registrations.services).toEqual([]);
    expect(harness.registrations.schedules).toEqual([]);
    await expect(harness.behavior.callRpc("todos_add", { title: "no" })).rejects.toThrow();
  } finally { await harness.lifecycle.dispose(); }
});

it.each([
  null, {}, { taskId: 12 }, { taskId: "" }, { taskId: "a/b" }, { taskId: ".." },
  { taskId: "a?b" }, { taskId: "tmp-placeholder" }, { taskId: "a".repeat(129) },
  { taskId: "abc123", completeSeries: true }, { taskId: "abc123", url: "https://evil.test" },
])("validates completion RPC input before any request (%j)", async input => {
  const request = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", request);
  const { bb, harness } = createFakePluginHost({ settings: { apiToken: "fake-token" } });
  try {
    await plugin(bb);
    await expect(harness.behavior.callRpc("tasks_complete", input)).rejects.toMatchObject({ code: "invalid_input" });
    expect(request).not.toHaveBeenCalled();
  } finally { await harness.lifecycle.dispose(); }
});

it("coalesces overlapping completion calls, then releases the per-task lock", async () => {
  let finish!: (response: Response) => void;
  const request = vi.fn<typeof fetch>()
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce(Response.json(null));
  vi.stubGlobal("fetch", request);
  const { bb, harness } = createFakePluginHost({ settings: { apiToken: "fake-token" } });
  try {
    await plugin(bb);
    const first = harness.behavior.callRpc("tasks_complete", { taskId: "abc123" });
    const duplicate = harness.behavior.callRpc("tasks_complete", { taskId: "abc123" });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    finish(Response.json(null));
    expect(await Promise.all([first, duplicate])).toEqual([{ status: "completed" }, { status: "completed" }]);
    expect(await harness.behavior.callRpc("tasks_complete", { taskId: "abc123" })).toEqual({ status: "completed" });
    expect(request).toHaveBeenCalledTimes(2);
    expect(harness.inspection.sdk.calls).toEqual([]);
  } finally { await harness.lifecycle.dispose(); }
});

it("releases a failed lock without automatically retrying the write", async () => {
  const request = vi.fn<typeof fetch>()
    .mockRejectedValueOnce(new Error("private-token private response"))
    .mockResolvedValueOnce(Response.json(null));
  vi.stubGlobal("fetch", request);
  const { bb, harness } = createFakePluginHost({ settings: { apiToken: "private-token" } });
  try {
    await plugin(bb);
    expect(await harness.behavior.callRpc("tasks_complete", { taskId: "abc123" }))
      .toEqual({ status: "error", reason: "unknown" });
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(harness.logEntries)).not.toContain("private-token");
    expect(await harness.behavior.callRpc("tasks_complete", { taskId: "abc123" })).toEqual({ status: "completed" });
  } finally { await harness.lifecycle.dispose(); }
});

it.each(["timeout", "dispose"])("cancels in-flight completions on %s without retries or credential leakage", async mode => {
  vi.useFakeTimers();
  const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  });
  const request = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener("abort", () => reject(new Error("secret-token")), { once: true });
  }));
  vi.stubGlobal("fetch", request);
  const { bb, harness } = createFakePluginHost({ settings: { apiToken: "secret-token" } });
  try {
    await plugin(bb);
    const pending = harness.behavior.callRpc("tasks_complete", { taskId: "abc123" });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(timeout).toHaveBeenCalledWith(20_000);
    if (mode === "timeout") await vi.advanceTimersByTimeAsync(20_000);
    else await harness.lifecycle.dispose();
    expect(await pending).toEqual({ status: "error", reason: "unknown" });
    expect(request.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(harness.logEntries)).not.toContain("secret-token");
  } finally { await harness.lifecycle.dispose(); }
});

it("re-reads changed/removed credentials for each completion without exposing them", async () => {
  const request = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(null));
  vi.stubGlobal("fetch", request);
  const { bb, harness } = createFakePluginHost({ settings: { apiToken: "fake-first" } });
  try {
    await plugin(bb);
    const first = await harness.behavior.callRpc("tasks_complete", { taskId: "abc123" });
    await harness.behavior.setSettings({ apiToken: " fake-second " });
    const second = await harness.behavior.callRpc("tasks_complete", { taskId: "abc123" });
    expect(request.mock.calls[1]![1]?.headers).toEqual({ Authorization: "Bearer fake-second" });
    await harness.behavior.setSettings({ apiToken: "" });
    expect(await harness.behavior.callRpc("tasks_complete", { taskId: "abc123" }))
      .toEqual({ status: "error", reason: "not_configured" });
    expect(request).toHaveBeenCalledTimes(2);
    expect(JSON.stringify([first, second, harness.logEntries])).not.toMatch(/fake-first|fake-second/);
  } finally { await harness.lifecycle.dispose(); }
});

it("reads token changes without reload and never returns/logs credentials", async () => {
  const request = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ results: [], next_cursor: null }));
  vi.stubGlobal("fetch", request);
  const { bb, harness } = createFakePluginHost({ pluginId: "todoist", settings: { apiToken: "first-test-token" } });
  try {
    await plugin(bb);
    const first = await harness.behavior.callRpc("tasks_list", null);
    await harness.behavior.setSettings({ apiToken: "second-test-token" });
    const second = await harness.behavior.callRpc("tasks_list", null);
    expect(request.mock.calls[1]![1]?.headers).toEqual({ Authorization: "Bearer second-test-token" });
    expect(JSON.stringify([first, second, harness.logEntries])).not.toMatch(/first-test-token|second-test-token/);
    await harness.behavior.setSettings({ apiToken: "" });
    expect(await harness.behavior.callRpc("tasks_list", null)).toMatchObject({ configured: false });
    expect(request).toHaveBeenCalledTimes(2);
  } finally { await harness.lifecycle.dispose(); }
});
