# Issue tracker: GitHub

Issues and specs live in `scowalt/bb-plugin-todoist` on GitHub.
Use the `gh` CLI for all GitHub operations.

Run commands inside this clone, where `gh` infers the repository from
the remote, or pass `--repo scowalt/bb-plugin-todoist`.

## Conventions

- Create: `gh issue create --title "..." --body-file <file>`.
  Use a heredoc with `--body-file -` for multiline bodies.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels,comments`.
  Add appropriate `--label` and `--state` filters.
- Comment: `gh issue comment <number> --body "..."`.
- Apply/remove labels: `gh issue edit <number> --add-label "..."` or
  `--remove-label "..."`.
- Close: `gh issue close <number> --comment "..."`.

When a skill says "publish to the issue tracker", create a GitHub issue.
When it says "fetch the relevant ticket", read the issue and its comments.

GitHub shares issue and PR numbers. For an ambiguous reference, resolve
with `gh pr view <number>`, falling back to `gh issue view <number>`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Wayfinding operations

Used by `/wayfinder`:

- Map: one issue labelled `wayfinder:map`, holding Notes,
  Decisions-so-far, and Fog.
- Children: link tickets as GitHub sub-issues using `gh api`.
  If unavailable, use a task list in the map and `Part of #<map>` in
  each child. Label children `wayfinder:<type>`, where type is
  `research`, `prototype`, `grilling`, or `task`.
- Blocking: use native issue dependencies:
  `gh api --method POST repos/scowalt/bb-plugin-todoist/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`.
  Fetch the numeric database ID with
  `gh api repos/scowalt/bb-plugin-todoist/issues/<blocker> --jq .id`.
  If dependencies are unavailable, use `Blocked by: #<n>` in the body.
- Frontier: inspect the map's open children in map order; skip assigned
  tickets and tickets with open blockers. Native
  `issue_dependencies_summary.blocked_by` counts open blockers.
- Claim: `gh issue edit <number> --add-assignee @me`.
- Resolve: comment with the answer, close the ticket, and append a
  summary and link to the map's Decisions-so-far.
