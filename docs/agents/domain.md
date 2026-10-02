# Domain docs

This repo uses a single-glossary layout:

- `GLOSSARY.md` at the repo root: domain vocabulary and model.
- `docs/adr/`: architecture decision records.

## Before exploring

Read `GLOSSARY.md` and ADRs relevant to the area being explored.

If these files do not exist, proceed silently. Do not flag their absence
or suggest creating them upfront. `/domain-modeling` creates them lazily
when terminology or decisions are resolved.

## Use the glossary's vocabulary

Use the terms defined in `GLOSSARY.md` when naming domain concepts in
issues, proposals, hypotheses, and tests.

If a needed concept is absent, reconsider whether it belongs to the
domain; note genuine vocabulary gaps for `/domain-modeling`.

## Migrating older domain docs

For existing domain docs, run the applicable commands in their directory:

```sh
git mv CONTEXT.md GLOSSARY.md
git mv CONTEXT-MAP.md GLOSSARY-MAP.md
git mv CONTEXT-FORMAT.md GLOSSARY-FORMAT.md
```

Run only commands whose source file exists; if the destination also exists,
reconcile the contents before renaming. Update references to the new names.
Skills use only the new filenames; there is no old-name fallback.

## Flag ADR conflicts

Explicitly identify any proposal that contradicts an existing ADR,
including the ADR identifier and why reopening it may be worthwhile.
