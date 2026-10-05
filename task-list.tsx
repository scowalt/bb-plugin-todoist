import { useEffect, useId, useRef, useState } from "react";
import { Markdown, UrlLink } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import type { Task } from "./todoist";
import { taskUrl } from "./task-prompt";
import { taskDate, type TaskDateGroup } from "./task-date";

function TaskDescription({ task }: { task: Task }) {
  const id = useId();
  const content = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const element = content.current;
    if (!element) return;
    const measure = () => {
      const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
      setOverflows(element.scrollHeight > lineHeight * 2 + 1);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [task.description]);

  return <div className="mt-1.5 min-w-0 text-sm text-muted-foreground">
    <div
      id={id}
      className={expanded ? "" : "max-h-10 overflow-hidden"}
      onFocusCapture={() => { if (overflows) setExpanded(true); }}
    >
      <div ref={content} className="break-words text-sm leading-5 [overflow-wrap:anywhere]">
        <Markdown
          content={task.description}
          className="min-w-0 text-sm leading-5 [&_p]:my-0 [&_ul]:my-0 [&_ol]:my-0 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_img]:max-w-full"
        />
      </div>
    </div>
    {(overflows || expanded) && <button
      type="button"
      aria-expanded={expanded}
      aria-controls={id}
      aria-label={`${expanded ? "Show less" : "Show more"} about ${task.content}`}
      className="mt-1 rounded-sm py-0.5 text-xs underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={() => setExpanded(value => !value)}
    >{expanded ? "Show less" : "Show more"}</button>}
  </div>;
}

export type TaskCompletionState =
  | { status: "saving" }
  | { status: "completed" }
  | { status: "error"; message: string; needsRefresh: boolean };

function TaskRow({ task, date, onDraft, onComplete, completion, completionDisabled }: {
  task: Task;
  date: ReturnType<typeof taskDate>;
  onDraft: (task: Task) => void;
  onComplete: (task: Task) => void;
  completion?: TaskCompletionState;
  completionDisabled: boolean;
}) {
  const statusId = useId();
  return <li className="flex items-start gap-3 py-3">
    <Checkbox
      className="mt-0.5 size-5"
      aria-label={`Complete current occurrence: ${task.content}`}
      aria-describedby={completion ? statusId : undefined}
      aria-busy={completion?.status === "saving"}
      checked={completion?.status === "completed"}
      disabled={completionDisabled || completion?.status === "saving" || completion?.status === "completed"
        || (completion?.status === "error" && completion.needsRefresh)}
      onCheckedChange={checked => { if (checked === true) onComplete(task); }}
    />
    <div className="flex min-w-0 flex-1 flex-col items-start gap-2 sm:flex-row sm:gap-5">
      <div className="min-w-0 w-full flex-1">
        <UrlLink
          href={taskUrl(task)}
          className="group rounded-sm text-sm font-medium leading-5 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [overflow-wrap:anywhere]"
        >
          {task.content}{" "}
          <Icon name="ExternalLink" aria-hidden className="inline-block size-3 align-baseline text-muted-foreground/70 group-hover:text-muted-foreground" />
          <span className="sr-only"> (open in Todoist)</span>
        </UrlLink>
        {task.description.trim() && <TaskDescription task={task} />}
        <p className={`mt-1.5 text-xs ${date.group === "overdue" ? "text-destructive/75" : "text-muted-foreground"}`}>
          {date.exact ? <time dateTime={date.exact} title={date.exact} aria-label={`Due ${date.exact}`}>
            {date.label}
          </time> : date.label}
        </p>
        {completion && <p
          id={statusId}
          role={completion.status === "error" ? "alert" : "status"}
          className={`mt-1.5 text-xs ${completion.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >{completion.status === "saving" ? "Completing occurrence…"
          : completion.status === "completed" ? "Occurrence completed. Waiting for a refreshed list."
          : completion.message}</p>}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 border-border/70 text-muted-foreground"
        aria-label={`Draft with agent: ${task.content}`}
        onClick={() => onDraft(task)}
      >Draft with agent</Button>
    </div>
  </li>;
}

const groups: { id: TaskDateGroup; title: string }[] = [
  { id: "today", title: "Today" },
  { id: "overdue", title: "Overdue" },
  { id: "other", title: "Other dates" },
];

export function TaskList({ tasks, onDraft, onComplete, completions, completionDisabled, now = new Date() }: {
  tasks: Task[];
  onDraft: (task: Task) => void;
  onComplete: (task: Task) => void;
  completions: ReadonlyMap<string, TaskCompletionState>;
  completionDisabled: boolean;
  now?: Date;
}) {
  const id = useId();
  const rows = tasks.map(task => ({ task, date: taskDate(task.due, now) }));
  return <div className="mt-5 space-y-5">
    {groups.map(group => {
      const items = rows.filter(row => row.date.group === group.id);
      if (!items.length) return null;
      const headingId = `${id}-${group.id}`;
      return <section key={group.id} aria-labelledby={headingId}>
        <h3 id={headingId} className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {group.title}{" "}
          <span className="font-normal tabular-nums">{items.length}</span>
        </h3>
        <ul className="divide-y divide-border/50">
          {items.map(({ task, date }) => <TaskRow
            key={task.id} task={task} date={date} onDraft={onDraft} onComplete={onComplete}
            completion={completions.get(task.id)} completionDisabled={completionDisabled}
          />)}
        </ul>
      </section>;
    })}
  </div>;
}
