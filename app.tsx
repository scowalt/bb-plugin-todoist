import { useCallback, useEffect, useRef, useState } from "react";
import {
  definePluginApp,
  experimental_NewThreadComposer as NewThreadComposer,
  UrlLink,
  useBbNavigate,
  useRpc,
  useSdk,
} from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import type { CompletionResult, Task } from "./todoist";
import { taskPrompt } from "./task-prompt";
import { TaskList, type TaskCompletionState } from "./task-list";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

const completionErrors: Record<Extract<CompletionResult, { status: "error" }>["reason"], string> = {
  not_configured: "No Todoist API token is configured. Set it in plugin settings, then Refresh.",
  unauthorized: "Todoist rejected completion. Check the API token and its permissions in plugin settings.",
  not_found: "This task is no longer available. Refresh the list to check its current state.",
  rate_limited: "Todoist rate limit reached. Wait before trying again.",
  rejected: "Todoist rejected this completion. Check the task in Todoist, then Refresh.",
  unknown: "Could not confirm completion. It may have succeeded. Check Todoist and Refresh before completing another occurrence; nothing was retried.",
};

function TasksPage() {
  const rpc = useRpc<typeof rpcContract>();
  const sdk = useSdk();
  const navigate = useBbNavigate();
  const [result, setResult] = useState<{
    configured: boolean; tasks: Task[]; truncated: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Task | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [spawnError, setSpawnError] = useState(false);
  const spawning = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(false);
  const refreshing = useRef(false);
  const inFlight = useRef(false);
  const [completing, setCompleting] = useState(false);
  const [completions, setCompletions] = useState(new Map<string, TaskCompletionState>());

  const refresh = useCallback(async (afterCompletion = false) => {
    if (inFlight.current && !afterCompletion) return;
    const current = ++generation.current;
    refreshing.current = true;
    setLoading(true);
    setError(null);
    // Manual refresh clears data from removed/rotated credentials. After a write,
    // retain the row until a fresh list arrives, including if that read fails.
    if (!afterCompletion) setResult(null);
    try {
      const next = await rpc.call("tasks_list");
      if (current === generation.current) {
        setResult(next);
        setCompletions(new Map());
      }
    } catch (cause) {
      if (current === generation.current) {
        setError(afterCompletion
          ? "Occurrence completed in Todoist, but the list could not be refreshed. Use Refresh to reload it; do not complete it again."
          : cause instanceof Error ? cause.message : "Could not load Todoist tasks.");
      }
    } finally {
      if (current === generation.current) {
        refreshing.current = false;
        setLoading(false);
      }
    }
  }, [rpc]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; generation.current++; };
  }, [refresh]);

  async function complete(task: Task) {
    const previous = completions.get(task.id);
    if (inFlight.current || refreshing.current || previous?.status === "completed"
      || (previous?.status === "error" && previous.needsRefresh)) return;
    // Synchronous guard also blocks a second click before React re-renders.
    inFlight.current = true;
    setCompleting(true);
    setCompletions(current => new Map(current).set(task.id, { status: "saving" }));
    let outcome: CompletionResult;
    try {
      outcome = await rpc.call("tasks_complete", { taskId: task.id });
    } catch {
      // The RPC response itself can be lost after a successful write.
      outcome = { status: "error", reason: "unknown" };
    }
    try {
      if (!mounted.current) return;
      if (outcome.status === "completed") {
        setCompletions(current => new Map(current).set(task.id, { status: "completed" }));
        await refresh(true);
      } else {
        setCompletions(current => new Map(current).set(task.id, {
          status: "error",
          message: completionErrors[outcome.reason],
          needsRefresh: ["unknown", "not_found", "rejected", "not_configured"].includes(outcome.reason),
        }));
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setCompleting(false);
    }
  }

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div className={`mx-auto w-full px-4 py-4 md:px-6 md:py-5 ${selected ? "max-w-4xl" : "max-w-3xl"}`}>
        {selected ? (
          <section aria-label="Start Todoist task">
            <Button variant="outline" disabled={submitting} onClick={() => {
              setSelected(null);
              setSpawnError(false);
            }}>Back to tasks</Button>
            <h2 className="mt-4 text-lg font-semibold">Start with agent</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Choose a BB project and agent, review the prompt, then submit. Todoist will not be changed.
            </p>
            {spawnError && <p role="alert" className="mb-3 text-sm text-destructive">
              Could not confirm thread creation. Check BB for a new thread before retrying; your draft is preserved.
            </p>}
            <NewThreadComposer
              key={selected.id}
              draftKey={`todoist-task-${selected.id}`}
              initialPrompt={taskPrompt(selected)}
              layout="document"
              onSubmit={async (request) => {
                if (spawning.current) throw new Error("Thread creation already in progress.");
                spawning.current = true;
                setSubmitting(true);
                setSpawnError(false);
                let thread;
                try {
                  thread = await sdk.threads.spawn(request);
                } catch {
                  setSpawnError(true);
                  throw new Error("Could not confirm thread creation. Check BB before retrying.");
                } finally {
                  spawning.current = false;
                  setSubmitting(false);
                }
                setSelected(null);
                navigate.toThread(thread.id);
              }}
            />
          </section>
        ) : (
          <>
            <header className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-baseline gap-2.5">
                <h2 className="text-base font-semibold">Todoist</h2>
                {result?.configured && <span className="text-xs tabular-nums text-muted-foreground">
                  {result.tasks.length}{result.truncated ? "+" : ""} {result.tasks.length === 1 ? "task" : "tasks"}
                </span>}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-muted-foreground"
                aria-label={loading ? "Refreshing tasks" : "Refresh"}
                disabled={loading || completing}
                onClick={() => void refresh()}
              >
                <Icon name="RefreshCw" aria-hidden className={loading ? "motion-safe:animate-spin" : ""} />
              </Button>
            </header>
            {loading && <p role="status" className="mt-4">Loading tasks…</p>}
            {error && <p role="alert" className="mt-4 text-destructive">{error}</p>}
            {result && !result.configured && <section
              aria-labelledby="todoist-setup-title"
              className="mt-6 rounded-lg border border-border bg-card p-5"
            >
              <h3 id="todoist-setup-title" className="font-semibold">Connect Todoist</h3>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                <li>Copy your API token from <UrlLink
                  href="https://app.todoist.com/app/settings/integrations"
                  className="text-foreground underline underline-offset-4"
                >Todoist integrations</UrlLink>.</li>
                <li>Open this plugin’s settings and paste it into <strong className="font-medium text-foreground">Todoist API token</strong>.</li>
                <li>Return here and click <strong className="font-medium text-foreground">Refresh</strong>.</li>
              </ol>
              <Button asChild className="mt-5">
                <UrlLink href="/settings/plugins/todoist">Open settings</UrlLink>
              </Button>
              <p className="mt-3 text-xs text-muted-foreground">Your token stays on the BB server. Never paste it into a thread.</p>
            </section>}
            {result?.configured && <>
              {result.truncated && <p role="status" className="mt-4">
                Showing a partial list (up to 1,000 tasks). Open Todoist for the full list.
              </p>}
              {result.tasks.length === 0 ? <p role="status" className="mt-4">
                No tasks due today or overdue.
              </p> : <TaskList
                tasks={result.tasks} onDraft={setSelected} onComplete={task => void complete(task)}
                completions={completions} completionDisabled={loading || completing}
              />}
            </>}
          </>
        )}
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "tasks", title: "Todoist", icon: "ListTodo", path: "tasks", component: TasksPage,
  });
});
