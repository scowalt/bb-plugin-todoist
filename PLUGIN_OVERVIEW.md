## Your Todoist tasks, ready for agent work

See tasks due today or overdue in BB, with their descriptions, due dates, and
links back to Todoist. Refresh when you want the latest list. Click a task's
checkbox to complete its current occurrence: recurring tasks advance to their
next occurrence rather than ending the series.

Choose **Draft with agent** to open BB's new-thread composer with task context
already filled in. Select the BB project and agent, review the prompt, and
submit when ready. Opening a draft does not launch work.

## User-controlled completion

The checkbox writes to Todoist, then refreshes the list. A recurring task can
remain if its next occurrence still matches today/overdue. Regular tasks and
their subtasks move to history. There is no undo/reopen, editing, deleting or
commenting in BB.

Failed completions leave the task visible with an error. An uncertain result
requires checking Todoist before repeating; writes are never automatically
retried. Successful completion followed by a failed refresh is reported
separately, with completion disabled until the list refreshes.

The personal API token stays in a server-side BB secret. Starting agent work
does not grant permission to modify Todoist: agents leave the task unchanged.
Only the user's UI completion action is part of this workflow.

There is no project mapping, automatic synchronization, or task-to-thread
tracking. Task context is sent to the selected agent provider only when you
submit the draft. Use a trusted BB instance.

Not created by, affiliated with, or supported by Todoist.
