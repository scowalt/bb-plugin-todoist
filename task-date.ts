import type { Task } from "./todoist";

export type TaskDateGroup = "today" | "overdue" | "other";

function calendarDate(value: string): Date | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
  if (!parts) return null;
  const [, year, month, day] = parts;
  const date = new Date(0);
  date.setFullYear(Number(year), Number(month) - 1, Number(day));
  date.setHours(12, 0, 0, 0);
  return date.getFullYear() === Number(year)
    && date.getMonth() === Number(month) - 1
    && date.getDate() === Number(day) ? date : null;
}

export function taskDate(due: Task["due"], now: Date): {
  label: string;
  exact: string | null;
  group: TaskDateGroup;
} {
  const date = due ? calendarDate(due.date) : null;
  if (!date) return { label: due?.date || "No due date", exact: due?.date ?? null, group: "other" };

  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const group = date.getTime() === today.getTime() ? "today"
    : date < today ? "overdue" : "other";
  const label = group === "today" ? "Today"
    : date.getTime() === yesterday.getTime() ? "Yesterday"
    : new Intl.DateTimeFormat("en-US", {
      month: "short", day: "numeric",
      ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } as const : {}),
    }).format(date);
  return { label, exact: due!.date, group };
}
