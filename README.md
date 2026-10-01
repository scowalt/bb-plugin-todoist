# Tasks for Todoist — BB plugin

View **Today + overdue** Todoist tasks in BB, complete their current occurrence,
and open a prefilled, host-owned new-thread composer. Choose the BB project,
environment and agent, review the prompt, then submit. Starting a draft does
not launch an agent or change Todoist.

Not created by, affiliated with, or supported by Todoist.

## MVP scope

- Single personal account; server-side API token authentication.
- Task title, Markdown description, due date and Todoist link.
- A user-clicked checkbox completes the **current occurrence** in Todoist.
  Recurring tasks advance to the next occurrence; the recurring series is not
  ended. For regular tasks, Todoist also completes their subtasks.
- Completion controls are disabled while saving and refreshing. Success reloads
  the list: a recurring task can remain if its next occurrence still matches
  today/overdue. No optimistic removal, undo or reopen.
- Completion failures keep the task visible with a sanitized inline error.
  Ambiguous failures (including timeout/lost response) are **not retried**:
  check Todoist and Refresh before completing again. A successful write followed
  by a failed refresh is reported separately; that row stays checked and disabled
  until a successful refresh, which retries only the read.
- Compact Today and Overdue groups with counts; long descriptions have two-line
  previews with **Show more / Show less** controls.
- Loads on opening the page, after successful completion, or on **Refresh**. No polling.
- Todoist evaluates `today | overdue` and selects the tasks. Grouping and friendly
  date labels use the browser's local calendar day without shifting date-only
  values through UTC; hover a date for its exact value. Unexpected or missing
  dates stay visible under Other dates, including account/browser date mismatches.
- Sequential cursor pagination, capped at five pages / 1,000 tasks per refresh.
  A partial-list notice appears if more remain. Failed pages produce an error,
  not a silently incomplete list.
- **Draft with agent** seeds an editable prompt with the task's title, description
  and link. On submit,
  BB creates the thread and navigates to it. Failed creation preserves the draft;
  check for a created thread before retrying an ambiguous network failure.
- No task editing, deleting, reopening, commenting, series completion, CLI
  commands, native agent tools, project mapping, automatic launches, thread
  tracking, or completion synchronization. Agent task prompts do **not**
  authorize agents to modify Todoist; completion is a user-triggered UI action.

The scaffold's local todo UI, mutation RPC and example CLI have been removed.
Any old scaffold KV data is unused, not migrated or deleted.

## Development

```sh
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run build
bb plugin types --check
```

Tests use mocked HTTP and the installed BB SDK backend/frontend harnesses. They
make no real Todoist requests and spawn no real threads. The frontend harness
checks completion/refresh/failure states, prompt handoff and navigation, not the
real host's selection controls, draft persistence or visual layout. API tests
verify fixed-origin close requests, strict RPC input, duplicate prevention,
secret-safe errors and timeout/disposal cancellation. Live behavior is left to
the user; no credentials or authenticated API calls are used in tests.

`bun run dev` is BB's build/reload watcher, not a standalone web server. Do not
run it before an approved plugin install. No separate development server is
needed for the current implementation.

## Installation and credentials (manual, approval required)

For a new installation, approve a live test and install the built local plugin
with `bb plugin install .`. For an existing local installation, rebuild and use
`bb plugin reload todoist` after approval. In
**BB Settings → Installed plugins → Tasks for Todoist**,
enter the personal token in the **Todoist API token** secret setting, then open
**Todoist** in the sidebar. A setting change takes effect on the next Refresh.

Obtain the token from Todoist's integrations settings. Do not paste tokens into
chat, source files, command-line arguments or logs. BB stores secret settings
server-side in its protected secret file, excluded from frontend settings.
The token is used only in an Authorization header to `api.todoist.com`; redirects
are rejected. API bodies and transport errors are not logged or sent to the UI.
Requests time out after 20 seconds per refresh/completion and abort on plugin
disposal. The only write is the fixed-origin close endpoint, invoked by the
user's completion control; there is no generic API proxy.

Personal API tokens can permit more operations than this plugin implements.
Task content is visible to BB clients; submitting a draft also sends it to your
selected agent provider. Use this only on a BB instance whose users you trust.
The UI-only workflow is not an access-control boundary against trusted BB users
or arbitrary code: BB's local RPC surface can be invoked outside the UI. No
completion CLI/tool is registered, and agents must not invoke mutation RPCs.
Tasks and completion feedback are held in page memory; composer drafts are
managed by BB. Overlapping completions of one task share one request within the
running plugin instance. This is not durable or cross-client exactly-once
protection after a request finishes or the plugin reloads; check Todoist before
repeating an uncertain completion, especially for recurring tasks.

### Approved live-test checklist

1. Verify missing-token guidance before entering a token.
2. Confirm Today + overdue matches Todoist, including recurring/timed tasks near
   midnight in your account timezone. Refresh after an external change.
3. Open a task draft; verify title/description/link and BB project/agent selectors.
4. Cancel without launching. If approved, submit one harmless task and verify
   navigation and that Todoist is unchanged.
5. Verify layout at narrow and wide widths and draft persistence after Back.
6. On a harmless task, click its completion checkbox: it disables while saving,
   then the list refreshes. This **writes to Todoist** and has no undo in BB.
7. On a harmless recurring task, verify only the current occurrence completes
   and the next due date advances (it can remain in the list). Do not test with
   a regular parent whose subtasks should stay open.
8. If completion cannot be confirmed, check Todoist before refreshing/repeating.
   If completion succeeded but refresh failed, use Refresh, not completion.

## Implementation references

- `server.ts`: validated list/occurrence-completion RPCs, per-task in-flight
  deduplication and server-only secret setting.
- `todoist.ts`: validated v1 API response, pagination, fixed close operation and sanitized errors.
- `app.tsx`: loading/setup, completion/refresh state and BB-owned composer;
  direct SDK thread creation only on submit.
- `task-list.tsx`: accessible completion controls, compact grouped rows and
  expandable SDK Markdown descriptions.
- `task-date.ts`: deterministic, calendar-safe display dates and grouping.
- `task-prompt.ts`: task URL and prompt construction.
- Installed `@get-bb/plugin-sdk` **0.5.29** declarations are the contract;
  `bb plugin types --check` confirmed a matching installed host.
- BB's official GitHub plugin uses issue actions followed by `toThread` navigation;
  this plugin adds the host composer as the explicit review/selection step.
- [Todoist v1 API](https://developer.todoist.com/api/v1/):
  `GET /api/v1/tasks/filter`, `query=today | overdue`, `lang=en`, `limit=200`,
  opaque `cursor`, response `{ results, next_cursor }`. Task URLs are constructed
  as `https://app.todoist.com/app/task/<id>` per the migration guidance.
- [Todoist v1 Close Task](https://developer.todoist.com/api/v1/#tag/Tasks/operation/close_task_api_v1_tasks__task_id__close_post):
  `POST https://api.todoist.com/api/v1/tasks/{task_id}/close`, no request body,
  documented response `200` with JSON `null`. Regular tasks and their subtasks
  move to history; recurring tasks are scheduled to their next occurrence.
  The plugin delegates those semantics to `/close`; it never sends Sync
  `item_complete`, alters the due date or requests series completion.
