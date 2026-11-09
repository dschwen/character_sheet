# Human review workflow for authoring IR

This documents the review tooling in `extraction/srd_extract/review.py`. It implements the
plan's review-queue requirements (§8.11), the source-hash guardrail (§8.10), and the
rule-authoring sequence (§16) as an auditable command workflow. It is the CLI foundation for
the plan's review application; a visual side-by-side review UI has not been built, so the
`inspect` output is the current review surface. The checked-in ledger is empty; local,
untracked reviewer decisions may already exist. Use `queue` to inspect current evidence rather
than assuming that the generated coverage report reflects unapplied local decisions.

## How approvals work

1. Class extractors write proposed rules into the generated authoring IR with the extractor's
   own `review` placeholders (for example `semantics: "needs-review"`). Generated files are
   never hand-edited.
2. Human decisions live in a separate ledger under `extraction/reviews/`, one JSON file per
   record ID, appending `{area, decision, reviewer, reviewedAt, note?, pins}`.
3. Each approval pins the record: `rulesHash` (SHA-256 over the record's identity, text, and
   proposed rules) and `spanHashes` (the recorded source-span quote hashes).
4. `review apply` promotes a generated record's status to `approved` only while the live
   record and the live normalized extraction still match its pins. If proposed rules change,
   the queue reports `SEMANTICS_CHANGED`/`TESTS_CHANGED`; if source text changes, it reports
   `SOURCE_HASH_CHANGED`. Every source span must verify; missing spans and unresolved blocks
   block approval too. Stale approvals are demoted to `semantics: "needs-review"` or
   `tests: "draft"`. A latest `needs-review` decision or missing ledger decision also revokes
   a generated approval. Other extractor-authored, non-approved defaults stay unchanged.
5. `review record` refuses to approve a record whose source spans do not resolve against the
   live normalized extraction (or whose quote hashes drifted) unless `--allow-drift` is passed.
   That override permits recording historical evidence only: it never bypasses `apply`'s live
   source checks. A reviewer can always record a `needs-review` withdrawal, even after drift.
6. Coverage counts (`docs/coverage`) only change through `apply`, so automated tests still do
   not manufacture review evidence.

`apply` reconciles both promotions and revocations without editing the append-only ledger.
Its updated count is the number of generated records changed, not the number of approvals;
its stale count is per approval area, while stale record IDs are deduplicated. Repeating it
without an evidence change writes nothing. Semantics and tests remain independent: approving
one area does not approve the other. The extractor-owned `extraction` status remains unchanged;
the tooling records extraction decisions but does not project them into that schema field.

Source-span resolution finds, in any extraction run, the exact set of normalized document
nodes whose recorded blocks reconstruct the span, and re-computes the quote hash from their
live `normalizedText`. All 63 current records resolve and hash-match against the checked-in
extraction; unresolved spans report `BROKEN_REFERENCE`.

## Commands

From the repository root:

```bash
# Everything awaiting human work, grouped by the plan §8.11 filters:
.venv/bin/python -m srd_extract.review queue \
  --generated packages/content-srd-5.2.1/generated \
  --extraction generated/extraction \
  --reviews extraction/reviews

# One record for side-by-side review: resolved source text, recorded text, proposed rules,
# hashes, ledger history, and tests that mention the record or its feature slug.
.venv/bin/python -m srd_extract.review inspect <ir-id> \
  --generated packages/content-srd-5.2.1/generated \
  --extraction generated/extraction \
  --reviews extraction/reviews

# Record a decision. Areas are exactly the plan's three approvals: extraction, semantics, tests.
.venv/bin/python -m srd_extract.review record <ir-id> \
  --area semantics --decision approved --reviewer <name> [--note "..."] \
  --generated packages/content-srd-5.2.1/generated \
  --extraction generated/extraction \
  --reviews extraction/reviews

# Reconcile current decisions into generated review flags, then regenerate coverage:
.venv/bin/python -m srd_extract.review apply \
  --generated packages/content-srd-5.2.1/generated \
  --extraction generated/extraction \
  --reviews extraction/reviews
PYTHONPATH=extraction .venv/bin/python -m srd_extract.coverage \
  --output packages/content-srd-5.2.1/generated \
  --markdown docs/coverage/README.md
```

## Review procedure for one record

The §16 checklist maps to concrete actions:

1. `inspect` shows the resolved normalized source beside the recorded text — confirm the
   source boundary and normalization (extraction approval).
2. Read the proposed rules against the source; `inspect` lists linked engine and validation
   tests for the record's ID or feature slug.
3. If the proposal is wrong, change the extractor code (the proposal's home), regenerate, and
   let `queue` re-flag any stale approval. Reviewers do not edit generated files.
4. Confirm the linked tests cover a positive case and an inapplicability/edge case; add tests
   first when they do not, because a `tests` approval is an approval of tests that exist.
5. `record … --area semantics` and `record … --area tests` are separate decisions; approvals
   are pinned to the exact proposed rules and source hashes at decision time.
6. `apply` plus a coverage regeneration publishes the decisions. The coverage README then
   reports the count of approved semantics and tests.

A record reaches `VERIFIED` in the coverage ledger only when extraction, semantics, and tests
have all been approved and a reviewer has confirmed interaction coverage; this tooling records
the three approvals and their pins, but does not itself mark any entity `VERIFIED`.

## Limits

- The queue verifies source spans, quote hashes, and approval pins; it does not judge whether
  a proposed rule is correct. That judgment is what `record` captures.
- Generated flags and coverage are snapshots. After a source, rule, or decision change, run
  `apply` and regenerate coverage to clear stale approvals before publishing those snapshots.
- `TESTS_MISSING` means no approved test decision exists in the ledger; it is not a claim
  that no automated tests exist. `inspect` lists the tests it found so the reviewer can judge
  sufficiency, which is exactly the approval the plan keeps separate from passing builds.
- Test discovery matches the record ID or feature slug across `apps/` and `packages/` test
  files; it is a review aid, not a coverage proof.
