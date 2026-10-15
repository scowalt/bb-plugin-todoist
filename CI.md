# CI: comment-free source

## Contract

[The original Actions workflow](.github/workflows/no-comments.yml) has one
`no-comments` job, `contents: read`, `ubuntu-latest`, and a 10-minute timeout.
It uses checkout `11d5960a326750d5838078e36cf38b85af677262` and setup-uv
`d0d8abe699bfb85fec6de9f7adb5ae17292296ff`, uv 0.11.32, and requirement-keyed
uv caching. Its unfiltered `push` includes tags; `pull_request` has no branch
or path filters. [The native pipeline](.woodpecker.yaml) preserves these event
inputs as `push`, `tag`, and `pull_request`, without narrowing branches or paths.
Caching is not a correctness input; no shared host cache is mounted.

The Linux ARM64-capable image is
`ghcr.io/astral-sh/uv:0.11.32-python3.14-trixie@sha256:adafbab0c780d8bd995039e9dfd800f95a057867d283deee7d5eb1b3126551b2`.
The pipeline selects `linux/arm64` and runs the original commands in order:

```sh
uv run --no-project --python 3.14 --with-requirements .comment-policy/requirements.txt python .comment-policy/check.py
uv run --no-project --python 3.14 --with-requirements .comment-policy/requirements.txt python -m unittest discover -s .comment-policy -p 'test_*.py'
```

Python stays 3.14. The five unchanged requirement pins are tree-sitter 0.25.2,
tree-sitter-language-pack 0.13.0, tree-sitter-c-sharp 0.23.5,
tree-sitter-embedded-template 0.25.0, and tree-sitter-yaml 0.7.2.
The checker enumerates tracked and non-ignored new files with Git, not a changed
path list. The existing Lefthook check uses `--staged` and reads the complete
index's blobs. Keep `.git` and the index available: an exported source archive
is insufficient. Default native clone suffices here; no authored check consumes
all-branch history, tags, or submodules. The unchanged suite has 13 tests.

This ports only authored hosted CI, not application or platform coverage.
[README development checks](README.md#development) and manual approval for live
installation/testing remain local exceptions. No Bun install, plugin build,
SDK check, install/reload, release/tag, generated distribution, or Todoist access
is added to CI. No publishing/deployment job or deployment controller is authored
in this baseline. Preserve source, locks, hooks, policy exclusions, instructions,
and the original Actions workflow byte-for-byte for rollback.

## Parent-owned rollout

Source preparation and local strict lint are not hosted ARM64 acceptance or a
completed migration. A separate merger/reviewer integrates the source before
serialized live operations. Use the existing single ARM64 agent, capacity 1,
2 GiB job limit on the 4 GiB CAX11 in hel1; add no capacity or spend.

1. Keep Actions enabled. Record current default-main SHA/tree, original workflow
   blob, protections, rulesets, required contexts, and Actions settings. Activate
   only the reviewed repository/configuration. Set and GET-read back native repo
   timeout **10 minutes**; this is a repository setting, not a YAML timeout key.
   Enable PRs, disable deployment events, require approval for fork PRs, set
   `approval_allowed_users: []`, and read back trusted network, volumes, and
   security all false. Keep reports private and job secrets absent. No operator,
   admin, publishing, production, or Todoist credentials enter PR jobs; no
   privileged mode, socket, host mount, auth bootstrap, or higher trust.
2. Deliver through **one ordinary reviewed PR**. Record its exact head SHA/tree
   and actual native PR event, clone, job, original commands, zero-violation
   policy file count, all 13 passing tests, and ARM64 agent identity. Require
   matching exact-SHA GitHub success; local x86_64 tests/lint do not substitute.
   Preserve configured push/tag/PR and fork-approval behavior, but distinguish
   configuration evidence from actual PR/main execution. Do not manufacture tag
   or fork events. MC #26/PR29 already supplied controlled RED-to-GREEN and
   same-PR post-disable proof once: no repeated intentional failures, marker
   commits, extra test PRs, or fresh post-disable revisions here.
3. Merge normally with `gh pr merge --match-head-commit <reviewed-head-sha>`.
   Obtain the **actual resulting default-main SHA**, its tree and ordered
   parents; verify the reviewed tree and original workflow blob. Require actual
   native **push** success for that main SHA, clone/job/original commands,
   policy count/13 tests/ARM64, and matching exact-SHA GitHub success before
   cutover. Do not substitute PR results or an expected merge SHA.
4. Only after PR and resulting-main proof, replace corresponding Actions-based
   requirements with observed native contexts, preserving unrelated protections
   and rules. Empty protections/rules/requirements mean replacement is a no-op:
   invent or remove nothing. Then change **only** Actions `enabled` to `false`.
   Read back settings and record timestamps; never infer omitted response fields.
5. Obtain separate fresh GET-only acceptance of native PR/main evidence,
   exact SHAs/tree/parents/workflow, safe settings, requirements, and Actions
   disabled. Bound the observation of no new Actions runs by explicit query
   times and cutoff. No fresh post-disable event is required or generated, and
   absence during that window is not an infinite-future trigger guarantee.
   Record the repository/result in the parent progress list.

If proof fails or platform, credential, history, or capacity requirements cannot
be preserved, stop and record the precise blocker; leave Actions enabled without
a weakened substitute. For rollback after cutover, the parent re-enables Actions
with its recorded prior settings and restores only replaced requirements. The
unchanged original workflow remains executable. Pause the native replacement as
needed without altering unrelated checks, controllers, or local exceptions.
