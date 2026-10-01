// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { CompletionResult, Task } from "./todoist";

const task = { id: "6XGgmFVcrG5RRjVr", content: "Implement a feature", description: "Acceptance criteria", due: { date: "2026-10-01" } };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 1, 12));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const taskList = (tasks: Task[] = [task]) => ({ configured: true, tasks, truncated: false });

async function mount(tasks: Task[] = [task], configured = true) {
  const app = await loadPluginApp(() => import("./app"));
  return renderSlot(app.navPanels[0]!, { subPath: "" }, {
    rpc: { tasks_list: () => ({ tasks, configured, truncated: false }) },
    sdk: { threads: { spawn: async () => ({ id: "thr-created" }) } },
  });
}

it("opens a prefilled host composer without spawning, then submits and navigates", async () => {
  const slot = await mount();
  fireEvent.click(await slot.findByRole("button", { name: "Draft with agent: Implement a feature" }));
  expect(slot.inspection.sdkCalls).toHaveLength(0);
  const input = slot.getByTestId("bb-new-thread-composer-input");
  expect(slot.getByDisplayValue(/Acceptance criteria/)).toBeTruthy();
  expect(slot.getByDisplayValue(/Do not edit, complete, or comment/)).toBeTruthy();
  expect(slot.inspection.rpcCalls.map(call => call.method)).toEqual(["tasks_list"]);
  fireEvent.change(input, { target: { value: "Reviewed task prompt" } });
  fireEvent.click(slot.getByTestId("bb-new-thread-composer-submit"));
  await waitFor(() => expect(slot.inspection.navigateCalls).toContainEqual({ method: "toThread", threadId: "thr-created" }));
  expect(slot.inspection.sdkCalls).toHaveLength(1);
  expect(JSON.stringify(slot.inspection.sdkCalls)).toContain("Reviewed task prompt");
  expect(JSON.stringify(slot.inspection.sdkCalls)).toContain("project-test");
});

it("allows returning to the task list without starting an agent", async () => {
  const slot = await mount();
  fireEvent.click(await slot.findByRole("button", { name: "Draft with agent: Implement a feature" }));
  fireEvent.click(slot.getByRole("button", { name: "Back to tasks" }));
  expect(slot.getByRole("heading", { name: "Todoist" })).toBeTruthy();
  expect(slot.inspection.sdkCalls).toHaveLength(0);
});

it("shows structured setup with a settings CTA and no credential input or subtitle", async () => {
  const slot = await mount([], false);
  expect(await slot.findByRole("heading", { name: "Connect Todoist" })).toBeTruthy();
  expect(slot.getAllByRole("listitem")).toHaveLength(3);
  expect(slot.getByRole("link", { name: "Open settings" }).getAttribute("href"))
    .toBe("/settings/plugins/todoist");
  expect(slot.getByRole("link", { name: "Todoist integrations" }).getAttribute("href"))
    .toBe("https://app.todoist.com/app/settings/integrations");
  expect(slot.queryByText(/Read-only Todoist tasks/)).toBeNull();
  expect(slot.queryByRole("textbox")).toBeNull();
});

it("shows the empty state", async () => {
  const slot = await mount([]);
  expect(await slot.findByText("No tasks due today or overdue.")).toBeTruthy();
});

it("shows a load error and supports manual retry", async () => {
  const app = await loadPluginApp(() => import("./app"));
  const list = vi.fn().mockRejectedValueOnce(new Error("Todoist rate limit reached."))
    .mockResolvedValue({ configured: true, tasks: [], truncated: false });
  const slot = renderSlot(app.navPanels[0]!, { subPath: "" }, { rpc: { tasks_list: list } });
  expect(await slot.findByRole("alert")).toBeTruthy();
  fireEvent.click(slot.getByRole("button", { name: "Refresh" }));
  expect(await slot.findByText("No tasks due today or overdue.")).toBeTruthy();
  expect(list).toHaveBeenCalledTimes(2);
});

it("renders a compact counted inbox with separate date groups and quiet draft actions", async () => {
  const slot = await mount([
    { ...task, id: "yesterday", content: "Review the design", due: { date: "2026-09-30" } },
    task,
    { ...task, id: "older", content: "Update the guide", due: { date: "2026-09-28" } },
  ]);
  await slot.findByText("3 tasks");
  expect(slot.getByRole("heading", { name: "Todoist" })).toBeTruthy();
  const today = slot.getByRole("region", { name: "Today 1" });
  const overdue = slot.getByRole("region", { name: "Overdue 2" });
  expect(within(today).getAllByRole("listitem")).toHaveLength(1);
  expect(within(overdue).getAllByRole("listitem")).toHaveLength(2);
  expect(within(overdue).getByText("Yesterday").getAttribute("title")).toBe("2026-09-30");
  expect(within(overdue).getByText("Sep 28").getAttribute("datetime")).toBe("2026-09-28");
  const link = within(today).getByRole("link", { name: "Implement a feature (open in Todoist)" });
  expect(link.getAttribute("href")).toBe("https://app.todoist.com/app/task/6XGgmFVcrG5RRjVr");
  expect(link.classList.contains("font-medium")).toBe(true);
  expect(link.classList.contains("hover:underline")).toBe(true);
  expect(link.classList.contains("underline")).toBe(false);
  const draft = within(today).getByRole("button", { name: "Draft with agent: Implement a feature" });
  expect(draft.classList.contains("bg-transparent")).toBe(true);
  expect(draft.classList.contains("text-xs")).toBe(true);
  expect(slot.getByRole("button", { name: "Refresh" }).textContent).toBe("");
  expect(slot.getAllByRole("checkbox")).toHaveLength(3);
  expect(within(today).getByRole("checkbox", { name: "Complete current occurrence: Implement a feature" })
    .getAttribute("aria-checked")).toBe("false");
  expect(slot.queryByRole("region", { name: /Other dates/ })).toBeNull();
  expect(slot.inspection.sdkCalls).toHaveLength(0);
});

it("keeps unexpected or missing dates visible without mislabeling them as today", async () => {
  const slot = await mount([
    { ...task, due: null },
    { ...task, id: "future", content: "Tomorrow in this timezone", due: { date: "2026-10-02" } },
  ]);
  const other = await slot.findByRole("region", { name: "Other dates 2" });
  expect(within(other).getByText("No due date")).toBeTruthy();
  expect(within(other).getByText("Oct 2")).toBeTruthy();
  expect(slot.queryByRole("region", { name: /Today/ })).toBeNull();
});

it("expands and collapses a two-line Markdown preview with accessible controls", async () => {
  // jsdom has no layout: supply the measured line height and overflowing content height.
  const computedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation(element => {
    const style = computedStyle(element);
    style.lineHeight = "20px";
    return style;
  });
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(80);
  const disconnect = vi.fn();
  const observe = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    observe = observe;
    disconnect = disconnect;
  });
  const description = "**Review** the proposal\n\n- Check the [guide](https://example.com)\n- Keep all acceptance criteria";
  const slot = await mount([{ ...task, description }]);
  const more = await slot.findByRole("button", { name: "Show more about Implement a feature" });
  const preview = document.getElementById(more.getAttribute("aria-controls")!)!;
  expect(more.getAttribute("aria-expanded")).toBe("false");
  expect(preview.classList.contains("max-h-10")).toBe(true);
  // The SDK harness stubs Markdown rather than rendering the host's parser.
  expect(within(preview).getByTestId("bb-markdown").textContent).toBe(description);
  expect(observe).toHaveBeenCalled();
  fireEvent.click(more);
  const less = slot.getByRole("button", { name: "Show less about Implement a feature" });
  expect(less.getAttribute("aria-expanded")).toBe("true");
  expect(less.getAttribute("aria-controls")).toBe(preview.id);
  expect(preview.classList.contains("max-h-10")).toBe(false);
  fireEvent.click(less);
  expect(more.getAttribute("aria-expanded")).toBe("false");
  expect(preview.classList.contains("max-h-10")).toBe(true);
  // Focusing a Markdown link below the crop reveals it before keyboard interaction.
  fireEvent.focus(preview);
  expect(more.getAttribute("aria-expanded")).toBe("true");
  expect(slot.inspection.sdkCalls).toHaveLength(0);
  slot.lifecycle.unmount();
  expect(disconnect).toHaveBeenCalled();
});

it("does not show disclosure controls for short or empty descriptions", async () => {
  const slot = await mount([task, { ...task, id: "empty", description: "  \n" }]);
  await slot.findByText("2 tasks");
  expect(slot.queryByRole("button", { name: /Show more/ })).toBeNull();
});

it("shows loading accessibly and clears old task data during refresh", async () => {
  let resolve!: (value: { configured: boolean; tasks: Task[]; truncated: boolean }) => void;
  const app = await loadPluginApp(() => import("./app"));
  const list = vi.fn()
    .mockResolvedValueOnce({ configured: true, tasks: [task], truncated: false })
    .mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const slot = renderSlot(app.navPanels[0]!, { subPath: "" }, { rpc: { tasks_list: list } });
  await slot.findByText("1 task");
  fireEvent.click(slot.getByRole("button", { name: "Refresh" }));
  expect(slot.getByRole("status").textContent).toBe("Loading tasks…");
  expect(slot.getByRole("button", { name: "Refreshing tasks" }).hasAttribute("disabled")).toBe(true);
  expect(slot.queryByText("1 task")).toBeNull();
  expect(slot.queryByRole("button", { name: /Draft with agent/ })).toBeNull();
  resolve({ configured: true, tasks: [], truncated: false });
  await slot.findByText("0 tasks");
  expect(slot.getByRole("button", { name: "Refresh" }).hasAttribute("disabled")).toBe(false);
});

it("retains the partial-list warning and marks the count as a lower bound", async () => {
  const app = await loadPluginApp(() => import("./app"));
  const slot = renderSlot(app.navPanels[0]!, { subPath: "" }, {
    rpc: { tasks_list: () => ({ configured: true, tasks: [task], truncated: true }) },
  });
  expect(await slot.findByText("1+ task")).toBeTruthy();
  expect(slot.getByRole("status").textContent).toContain("Showing a partial list");
});

it("completes only on a user click, blocks duplicates, retains the row through refresh, then removes it", async () => {
  const completion = deferred<CompletionResult>();
  const refreshed = deferred<ReturnType<typeof taskList>>();
  const complete = vi.fn(() => completion.promise);
  const list = vi.fn().mockResolvedValueOnce(taskList()).mockImplementationOnce(() => refreshed.promise);
  const app = await loadPluginApp(() => import("./app"));
  const slot = renderSlot(app.navPanels[0]!, { subPath: "" }, { rpc: { tasks_list: list, tasks_complete: complete } });
  const checkbox = await slot.findByRole("checkbox", { name: "Complete current occurrence: Implement a feature" });
  expect(complete).not.toHaveBeenCalled();
  act(() => { fireEvent.click(checkbox); fireEvent.click(checkbox); });
  expect(complete).toHaveBeenCalledTimes(1);
  expect(slot.inspection.rpcCalls).toContainEqual({ method: "tasks_complete", input: { taskId: task.id } });
  expect(checkbox.hasAttribute("disabled")).toBe(true);
  expect(checkbox.getAttribute("aria-busy")).toBe("true");
  expect(checkbox.getAttribute("aria-checked")).toBe("false");
  expect(slot.getByRole("button", { name: "Refresh" }).hasAttribute("disabled")).toBe(true);
  expect(slot.getByRole("link", { name: /Implement a feature/ })).toBeTruthy();
  expect(list).toHaveBeenCalledTimes(1);
  await act(async () => completion.resolve({ status: "completed" }));
  expect(list).toHaveBeenCalledTimes(2);
  expect(checkbox.getAttribute("aria-checked")).toBe("true");
  expect(checkbox.hasAttribute("disabled")).toBe(true);
  expect(slot.getByText("Loading tasks…")).toBeTruthy();
  expect(slot.getByRole("link", { name: /Implement a feature/ })).toBeTruthy();
  await act(async () => refreshed.resolve(taskList([])));
  expect(await slot.findByText("No tasks due today or overdue.")).toBeTruthy();
  expect(slot.queryByRole("checkbox")).toBeNull();
  expect(complete).toHaveBeenCalledTimes(1);
  expect(slot.inspection.sdkCalls).toEqual([]);
  expect(slot.inspection.navigateCalls).toEqual([]);
});

it("renders a recurring task's refreshed next occurrence even when the ID still matches", async () => {
  const complete = vi.fn().mockResolvedValue({ status: "completed" });
  const list = vi.fn().mockResolvedValueOnce(taskList([{ ...task, due: { date: "2026-09-30" } }]))
    .mockResolvedValue(taskList());
  const app = await loadPluginApp(() => import("./app"));
  const slot = renderSlot(app.navPanels[0]!, { subPath: "" }, { rpc: { tasks_list: list, tasks_complete: complete } });
  const overdue = await slot.findByRole("region", { name: "Overdue 1" });
  fireEvent.click(within(overdue).getByRole("checkbox"));
  const today = await slot.findByRole("region", { name: "Today 1" });
  const next = within(today).getByRole("checkbox");
  expect(next.getAttribute("aria-checked")).toBe("false");
  expect(next.hasAttribute("disabled")).toBe(false);
  expect(slot.queryByRole("region", { name: /Overdue/ })).toBeNull();
  expect(complete).toHaveBeenCalledTimes(1);
  expect(list).toHaveBeenCalledTimes(2);
  // Only a new explicit click completes the next occurrence.
  fireEvent.click(next);
  await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
  expect(complete).toHaveBeenCalledTimes(2);
});

it.each([
  ["unauthorized", /token and its permissions/], ["rate_limited", /rate limit/],
  ["not_found", /no longer available/], ["not_configured", /No Todoist API token/],
  ["rejected", /rejected this completion/],
])("keeps the task and shows a useful inline error after %s", async (reason, message) => {
  const complete = vi.fn().mockResolvedValue({ status: "error", reason });
  const list = vi.fn().mockResolvedValue(taskList());
  const app = await loadPluginApp(() => import("./app"));
  const slot = renderSlot(app.navPanels[0]!, { subPath: "" }, { rpc: { tasks_list: list, tasks_complete: complete } });
  const checkbox = await slot.findByRole("checkbox");
  fireEvent.click(checkbox);
  const alert = await slot.findByRole("alert");
  expect(alert.textContent).toMatch(message);
  expect(checkbox.getAttribute("aria-describedby")).toBe(alert.id);
  expect(checkbox.getAttribute("aria-checked")).toBe("false");
  expect(slot.getByRole("link", { name: /Implement a feature/ })).toBeTruthy();
  expect(slot.getByRole("button", { name: /Draft with agent/ })).toBeTruthy();
  expect(list).toHaveBeenCalledTimes(1);
  expect(complete).toHaveBeenCalledTimes(1);
  expect(slot.inspection.sdkCalls).toEqual([]);
});

it.each(["unknown", "rpc rejection"])("never retries or leaks an ambiguous %s; requires a manual refresh", async failure => {
  const complete = vi.fn();
  if (failure === "unknown") complete.mockResolvedValue({ status: "error", reason: "unknown" });
  else complete.mockRejectedValue(new Error("private credentials and transport details"));
  const list = vi.fn().mockResolvedValue(taskList());
  const app = await loadPluginApp(() => import("./app"));
  const slot = renderSlot(app.navPanels[0]!, { subPath: "" }, { rpc: { tasks_list: list, tasks_complete: complete } });
  const checkbox = await slot.findByRole("checkbox");
  fireEvent.click(checkbox);
  expect((await slot.findByRole("alert")).textContent).toContain("It may have succeeded");
  expect(slot.queryByText(/private credentials/)).toBeNull();
  expect(checkbox.hasAttribute("disabled")).toBe(true);
  expect(slot.getByRole("link", { name: /Implement a feature/ })).toBeTruthy();
  fireEvent.click(checkbox);
  expect(complete).toHaveBeenCalledTimes(1);
  expect(list).toHaveBeenCalledTimes(1);
  fireEvent.click(slot.getByRole("button", { name: "Refresh" }));
  const refreshed = await slot.findByRole("checkbox");
  expect(refreshed.hasAttribute("disabled")).toBe(false);
  expect(complete).toHaveBeenCalledTimes(1);
  expect(list).toHaveBeenCalledTimes(2);
});

it("distinguishes a successful write from a failed refresh and only retries the read", async () => {
  const complete = vi.fn().mockResolvedValue({ status: "completed" });
  const list = vi.fn().mockResolvedValueOnce(taskList())
    .mockRejectedValueOnce(new Error("private refresh details"))
    .mockResolvedValueOnce(taskList([]));
  const app = await loadPluginApp(() => import("./app"));
  const slot = renderSlot(app.navPanels[0]!, { subPath: "" }, { rpc: { tasks_list: list, tasks_complete: complete } });
  const checkbox = await slot.findByRole("checkbox");
  fireEvent.click(checkbox);
  const alert = await slot.findByRole("alert");
  expect(alert.textContent).toContain("Occurrence completed in Todoist, but the list could not be refreshed");
  expect(alert.textContent).toContain("do not complete it again");
  expect(slot.queryByText(/private refresh details/)).toBeNull();
  expect(checkbox.hasAttribute("disabled")).toBe(true);
  expect(checkbox.getAttribute("aria-checked")).toBe("true");
  expect(slot.getByRole("link", { name: /Implement a feature/ })).toBeTruthy();
  fireEvent.click(checkbox);
  expect(complete).toHaveBeenCalledTimes(1);
  fireEvent.click(slot.getByRole("button", { name: "Refresh" }));
  expect(await slot.findByText("No tasks due today or overdue.")).toBeTruthy();
  expect(list).toHaveBeenCalledTimes(3);
  expect(complete).toHaveBeenCalledTimes(1);
});

it("does not start a list refresh after unmounting during completion", async () => {
  const completion = deferred<CompletionResult>();
  const list = vi.fn().mockResolvedValue(taskList());
  const app = await loadPluginApp(() => import("./app"));
  const slot = renderSlot(app.navPanels[0]!, { subPath: "" }, {
    rpc: { tasks_list: list, tasks_complete: () => completion.promise },
  });
  fireEvent.click(await slot.findByRole("checkbox"));
  slot.lifecycle.unmount();
  await act(async () => completion.resolve({ status: "completed" }));
  expect(list).toHaveBeenCalledTimes(1);
});

it("drafts the chosen task without launching work or changing the original description", async () => {
  const app = await loadPluginApp(() => import("./app"));
  const slot = renderSlot(app.navPanels[0]!, { subPath: "" }, {
    rpc: { tasks_list: () => ({ configured: true, tasks: [task, {
      ...task, id: "second", content: "Review a second task", description: "Second task details",
    }], truncated: false }) },
    sdk: { threads: { spawn: async () => ({ id: "thr-second" }) } },
  });
  fireEvent.click(await slot.findByRole("button", { name: "Draft with agent: Review a second task" }));
  expect(slot.inspection.sdkCalls).toHaveLength(0);
  const input = slot.getByTestId("bb-new-thread-composer-input");
  expect(slot.getByDisplayValue(/Second task details/)).toBeTruthy();
  fireEvent.change(input, { target: { value: "Reviewed second task" } });
  expect(slot.getByDisplayValue("Reviewed second task")).toBeTruthy();
  fireEvent.click(slot.getByRole("button", { name: "Back to tasks" }));
  expect(slot.getByText("Second task details")).toBeTruthy();
  expect(slot.inspection.sdkCalls).toHaveLength(0);
  expect(slot.inspection.navigateCalls).toHaveLength(0);
});
