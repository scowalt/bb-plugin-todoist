import { describe, expect, it } from "vitest";
import { taskDate } from "./task-date";

const now = new Date(2026, 9, 1, 0, 15);
const due = (date: string, clock = now) => taskDate({ date }, clock);

describe("task calendar dates", () => {
  it("labels today and yesterday across a month boundary", () => {
    expect(due("2026-10-01")).toEqual({ label: "Today", exact: "2026-10-01", group: "today" });
    expect(due("2026-09-30")).toEqual({ label: "Yesterday", exact: "2026-09-30", group: "overdue" });
  });

  it("uses friendly dates and includes the year when needed", () => {
    expect(due("2026-09-28").label).toBe("Sep 28");
    expect(due("2025-09-30").label).toBe("Sep 30, 2025");
    expect(due("2026-10-02")).toMatchObject({ label: "Oct 2", group: "other" });
  });

  it("keeps date-only values on their calendar day near local midnight", () => {
    for (const hour of [0, 23]) {
      expect(due("2026-10-01", new Date(2026, 9, 1, hour, 59)).group).toBe("today");
    }
  });

  it("keeps the calendar portion of timed values rather than applying a UTC offset", () => {
    expect(due("2026-10-01T00:30:00Z")).toMatchObject({ label: "Today", group: "today" });
    expect(due("2026-09-30T23:30:00-10:00")).toMatchObject({ label: "Yesterday", group: "overdue" });
  });

  it("uses calendar subtraction across daylight saving and year boundaries", () => {
    expect(due("2026-03-08", new Date(2026, 2, 9, 0, 5)).label).toBe("Yesterday");
    expect(due("2026-11-01", new Date(2026, 10, 2, 0, 5)).label).toBe("Yesterday");
    expect(due("2025-12-31", new Date(2026, 0, 1, 0, 5)).label).toBe("Yesterday");
    expect(due("2024-02-29", new Date(2024, 2, 1, 0, 5)).label).toBe("Yesterday");
  });

  it("does not coerce invalid dates or drop tasks with missing dates", () => {
    for (const value of ["not-a-date", "2026-02-30", "2026-13-01", "2026-00-01", "2026-10-00"]) {
      expect(due(value)).toEqual({ label: value, exact: value, group: "other" });
    }
    expect(taskDate(null, now)).toEqual({ label: "No due date", exact: null, group: "other" });
  });
});
