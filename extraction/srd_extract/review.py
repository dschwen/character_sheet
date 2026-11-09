"""Review queue, source verification, and approval ledger for authoring IR records.

The extractor proposes rules with `review` placeholders; human approvals are recorded in a
separate ledger under `extraction/reviews/` so they survive regeneration. Each decision pins
the proposed-rules hash and the resolved source quote hashes; `apply` promotes a generated
record only while those pins still match the live extraction, so source or rule changes move
a record back into the queue (plan §8.11 review-queue filters, §8.10 source-hash guardrail,
§16 review workflow).
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from srd_extract.io import read_json, write_json

AREAS = ("extraction", "semantics", "tests")
DECISIONS = ("approved", "needs-review")
FILTERS = (
    "UNCLASSIFIED",
    "LOW_EXTRACTION_CONFIDENCE",
    "BROKEN_REFERENCE",
    "SEMANTICS_MISSING",
    "SEMANTICS_CHANGED",
    "TESTS_MISSING",
    "TESTS_CHANGED",
    "SOURCE_HASH_CHANGED",
)

_VERIFIED = "verified"
_CHANGED = "changed"
_UNRESOLVED = "unresolved"


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def load_authoring_ir(generated_dir: Path) -> list[dict[str, Any]]:
    return [read_json(path) for path in sorted((generated_dir / "authoring-ir").glob("*.json"))]


def _record_rules_hash(record: dict[str, Any]) -> str:
    pinned = {
        "id": record["id"],
        "kind": record["kind"],
        "level": record["level"],
        "parentId": record["parentId"],
        "text": record["text"],
        "proposedRules": record["proposedRules"],
    }
    return _sha256(_canonical(pinned))


@dataclass
class SpanVerification:
    span: dict[str, Any]
    status: str
    recomputed_hash: str | None = None
    extraction_directory: str | None = None
    node_texts: list[str] = field(default_factory=list)
    detail: str = ""


class _PageIndex:
    """Lazily loads normalized document trees per page from every extraction run."""

    def __init__(self, extraction_root: Path) -> None:
        self._root = extraction_root
        self._cache: dict[int, list[tuple[str, list[dict[str, Any]]]]] = {}

    def page(self, page: int) -> list[tuple[str, list[dict[str, Any]]]]:
        if page not in self._cache:
            runs: list[tuple[str, list[dict[str, Any]]]] = []
            for normalized in sorted(self._root.glob("*/normalized")):
                path = normalized / "pages" / f"{page:04d}.json"
                if path.is_file():
                    document = read_json(path)
                    runs.append((normalized.parent.name, list(document["nodes"])))
            self._cache[page] = runs
        return self._cache[page]


def verify_span(span: dict[str, Any], index: _PageIndex) -> SpanVerification:
    """Resolve one recorded source span against the live normalized extraction."""

    blocks = set(str(block) for block in span["blocks"])
    matched: tuple[tuple[str, list[dict[str, Any]]], ...] = ()
    for directory, nodes in index.page(int(span["page"])):
        candidates = [
            node
            for node in nodes
            if blocks and blocks.issuperset(str(block) for block in node["sourceBlocks"])
        ]
        covered: set[str] = set()
        for node in candidates:
            covered.update(str(block) for block in node["sourceBlocks"])
        if candidates and covered == blocks:
            matched = ((directory, candidates),)
            break
    if not matched:
        return SpanVerification(
            span=span,
            status=_UNRESOLVED,
            detail="no extraction run reconstructs these blocks on this page",
        )
    directory, nodes = matched[0]
    texts = [str(node["normalizedText"]) for node in nodes]
    recomputed = _sha256("\n".join(texts))
    if recomputed != str(span["quoteHash"]):
        return SpanVerification(
            span=span,
            status=_CHANGED,
            recomputed_hash=recomputed,
            extraction_directory=directory,
            node_texts=texts,
            detail="recorded quote hash does not match the live normalized text",
        )
    return SpanVerification(
        span=span,
        status=_VERIFIED,
        recomputed_hash=recomputed,
        extraction_directory=directory,
        node_texts=texts,
    )


def verify_record(record: dict[str, Any], index: _PageIndex) -> list[SpanVerification]:
    return [verify_span(span, index) for span in record["source"]]


def _reviews_path(reviews_dir: Path, record_id: str) -> Path:
    return reviews_dir / f"{record_id}.json"


def load_ledger(reviews_dir: Path) -> dict[str, list[dict[str, Any]]]:
    ledger: dict[str, list[dict[str, Any]]] = {}
    if not reviews_dir.is_dir():
        return ledger
    for path in sorted(reviews_dir.glob("*.json")):
        entry = read_json(path)
        ledger[str(entry["irId"])] = list(entry["log"])
    return ledger


def _latest_decision(log: list[dict[str, Any]], area: str) -> dict[str, Any] | None:
    for entry in reversed(log):
        if str(entry["area"]) == area:
            return entry
    return None


@dataclass
class ReviewItem:
    record: dict[str, Any]
    rules_hash: str
    spans: list[SpanVerification]
    log: list[dict[str, Any]]
    flags: list[str] = field(default_factory=list)


def _pins_match(entry: dict[str, Any], rules_hash: str, span_hashes: list[str]) -> bool:
    pins = entry.get("pins", {})
    return (
        str(entry.get("decision")) == "approved"
        and pins.get("rulesHash") == rules_hash
        and list(pins.get("spanHashes", [])) == span_hashes
    )


def _latest_decision_ok(entry: dict[str, Any]) -> bool:
    return str(entry.get("decision")) == "approved"


def _span_hashes(spans: list[SpanVerification]) -> list[str]:
    return [str(verification.span["quoteHash"]) for verification in spans]


def _source_verified(spans: list[SpanVerification]) -> bool:
    return bool(spans) and all(span.status == _VERIFIED for span in spans)


def build_review_items(
    records: list[dict[str, Any]], ledger: dict[str, list[dict[str, Any]]], index: _PageIndex
) -> list[ReviewItem]:
    items: list[ReviewItem] = []
    for record in records:
        item = ReviewItem(
            record=record,
            rules_hash=_record_rules_hash(record),
            spans=verify_record(record, index),
            log=ledger.get(str(record["id"]), []),
        )
        item.flags = _flags(item)
        items.append(item)
    return items


def _flags(item: ReviewItem) -> list[str]:
    flags: list[str] = []
    review = item.record["review"]
    span_hashes = _span_hashes(item.spans)
    all_verified = _source_verified(item.spans)
    if str(review["extraction"]) != "approved":
        flags.append("LOW_EXTRACTION_CONFIDENCE")
    if not item.spans or any(verification.status == _UNRESOLVED for verification in item.spans):
        flags.append("BROKEN_REFERENCE")
    if any(verification.status == _CHANGED for verification in item.spans):
        flags.append("SOURCE_HASH_CHANGED")
    for area, missing_flag, changed_flag in (
        ("semantics", "SEMANTICS_MISSING", "SEMANTICS_CHANGED"),
        ("tests", "TESTS_MISSING", "TESTS_CHANGED"),
    ):
        decision = _latest_decision(item.log, area)
        if decision is None or not _latest_decision_ok(decision):
            flags.append(missing_flag)
        elif not _pins_match(decision, item.rules_hash, span_hashes) and all_verified:
            flags.append(changed_flag)
    return list(dict.fromkeys(flags))


def record_decision(
    reviews_dir: Path,
    item: ReviewItem,
    area: str,
    decision: str,
    reviewer: str,
    note: str | None,
    allow_drift: bool,
) -> dict[str, Any]:
    if area not in AREAS:
        raise ValueError(f"Unknown review area: {area}")
    if decision not in DECISIONS:
        raise ValueError(f"Unknown review decision: {decision}")
    if decision == "approved" and not allow_drift:
        if not item.spans:
            raise ValueError(f"Cannot record {area} approval without a source span")
        for verification in item.spans:
            if verification.status != _VERIFIED:
                raise ValueError(
                    f"Cannot record {area} approval while a source span is "
                    f"{verification.status}; re-extract or pass --allow-drift"
                )
    entry: dict[str, Any] = {
        "area": area,
        "decision": decision,
        "reviewer": reviewer,
        "reviewedAt": datetime.now(UTC).isoformat(timespec="seconds"),
        "pins": {"rulesHash": item.rules_hash, "spanHashes": _span_hashes(item.spans)},
    }
    if note:
        entry["note"] = note
    path = _reviews_path(reviews_dir, str(item.record["id"]))
    log = list(read_json(path)["log"]) if path.is_file() else []
    log.append(entry)
    write_json(path, {"irId": str(item.record["id"]), "log": log})
    return entry


def apply_ledger(
    generated_dir: Path, reviews_dir: Path, extraction_root: Path
) -> tuple[int, int, list[str]]:
    """Reconcile semantic/test status with current decisions and verified live source.

    Generated approval flags are a projection, not independent review evidence. Missing,
    withdrawn, or stale evidence revokes a prior approval without changing the ledger.
    Extractor-owned extraction status is left unchanged.
    """

    index = _PageIndex(extraction_root)
    ledger = load_ledger(reviews_dir)
    updated = 0
    stale = 0
    stale_ids: list[str] = []
    for path in sorted((generated_dir / "authoring-ir").glob("*.json")):
        record = read_json(path)
        log = ledger.get(str(record["id"]), [])
        rules_hash = _record_rules_hash(record)
        spans = verify_record(record, index)
        span_hashes = _span_hashes(spans)
        source_verified = _source_verified(spans)
        changed = False
        for area in ("semantics", "tests"):
            decision = _latest_decision(log, area)
            approved = decision is not None and _latest_decision_ok(decision)
            current = (
                decision is not None
                and approved
                and source_verified
                and _pins_match(decision, rules_hash, span_hashes)
            )
            if approved and not current:
                stale += 1
                stale_ids.append(str(record["id"]))
            status = str(record["review"][area])
            if current and status != "approved":
                record["review"][area] = "approved"
                changed = True
            elif not current and status == "approved":
                record["review"][area] = "needs-review" if area == "semantics" else "draft"
                changed = True
        if changed:
            write_json(path, record)
            updated += 1
    return updated, stale, sorted(set(stale_ids))


def _linked_tests(repo_root: Path, record: dict[str, Any]) -> list[str]:
    needles = {str(record["id"])}
    identifier = str(record["id"])
    slug = ".".join(identifier.split(".")[2:])
    if slug:
        needles.add(slug)
    found: list[str] = []
    for base in (repo_root / "apps", repo_root / "packages"):
        if not base.is_dir():
            continue
        for path in sorted(base.rglob("*.test.ts")):
            if "node_modules" in path.parts or "dist" in path.parts:
                continue
            text = path.read_text(encoding="utf-8")
            if any(needle in text for needle in needles):
                found.append(str(path.relative_to(repo_root)))
    return found


def render_queue(items: list[ReviewItem], filters: list[str]) -> str:
    counts = dict.fromkeys(FILTERS, 0)
    for item in items:
        for flag in item.flags:
            counts[flag] += 1
    lines = ["# Review queue", ""]
    lines.extend(f"- {flag}: {counts[flag]}" for flag in FILTERS if counts[flag])
    lines.append(f"- clean (no queue flags): {sum(1 for item in items if not item.flags)}")
    lines.append("")
    selected = [
        item for item in items if not filters or any(flag in item.flags for flag in filters)
    ]
    for item in selected:
        lines.append(f"{' '.join(item.flags) or 'CLEAN'}  {item.record['id']}")
    lines.append("")
    return "\n".join(lines)


def render_inspect(item: ReviewItem, repo_root: Path) -> str:
    record = item.record
    lines = [
        f"IR record: {record['id']}",
        f"  kind: {record['kind']}  level: {record['level']}  parent: {record['parentId']}",
        f"  title: {record['text']['title']}",
        f"  flags: {' '.join(item.flags) or 'none'}",
        "",
        "Source spans:",
    ]
    for verification in item.spans:
        lines.append(
            f"  page {verification.span['page']} blocks {', '.join(verification.span['blocks'])}"
            f" [{verification.status}]"
        )
        if verification.status != _VERIFIED and verification.detail:
            lines.append(f"    note: {verification.detail}")
        for text in verification.node_texts:
            lines.append(f"    | {text}")
    lines.extend(["", "Recorded text:"])
    for node in record["text"]["nodes"]:
        lines.append(f"  [{node['kind']}] {node['text']}")
        for text in node.get("items", []):
            lines.append(f"    - {text}")
    lines.extend(["", "Proposed rules:"])
    for rule in record["proposedRules"]:
        rendered = f"  {rule['type']} target={rule.get('target', '-')} "
        rendered += f"automation={rule['automationLevel']}"
        if rule.get("when"):
            rendered += f" when={_canonical(rule['when'])}"
        if rule.get("parameters"):
            rendered += f" parameters={_canonical(rule['parameters'])}"
        lines.append(rendered)
    lines.extend(
        [
            "",
            f"rulesHash: {item.rules_hash}",
            f"Extractor review block: {_canonical(record['review'])}",
            "",
            "Ledger history:",
        ]
    )
    if item.log:
        for entry in item.log:
            rendered = (
                f"  {entry['reviewedAt']}  {entry['area']} -> {entry['decision']}"
                f"  by {entry['reviewer']}"
            )
            if entry.get("note"):
                rendered += f"  note: {entry['note']}"
            lines.append(rendered)
    else:
        lines.append("  (no ledger entries yet)")
    lines.append("")
    lines.append("Tests mentioning this record or its feature slug:")
    linked = _linked_tests(repo_root, record)
    if linked:
        lines.extend(f"  {path}" for path in linked)
    else:
        lines.append("  (none found)")
    lines.append("")
    lines.append(
        f"Record a decision with: python -m srd_extract.review record "
        f"{record['id']} --area <area> --decision approved --reviewer <name>"
    )
    lines.append("")
    return "\n".join(lines)


def find_record(generated_dir: Path, record_id: str) -> dict[str, Any]:
    for path in sorted((generated_dir / "authoring-ir").glob("*.json")):
        record = read_json(path)
        if str(record["id"]) == record_id:
            return record
    raise ValueError(f"Authoring IR record not found: {record_id}")


def _add_common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--generated", required=True, type=Path)
    parser.add_argument("--extraction", required=True, type=Path)
    parser.add_argument("--reviews", required=True, type=Path)
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)

    queue_parser = subcommands.add_parser("queue", help="list records needing review work")
    _add_common(queue_parser)
    queue_parser.add_argument("--filter", action="append", choices=FILTERS)

    inspect_parser = subcommands.add_parser("inspect", help="show one record for review")
    inspect_parser.add_argument("record_id")
    _add_common(inspect_parser)

    record_parser = subcommands.add_parser("record", help="record a human review decision")
    record_parser.add_argument("record_id")
    record_parser.add_argument("--area", required=True, choices=AREAS)
    record_parser.add_argument("--decision", required=True, choices=DECISIONS)
    record_parser.add_argument("--reviewer", required=True)
    record_parser.add_argument("--note")
    record_parser.add_argument("--allow-drift", action="store_true")
    _add_common(record_parser)

    apply_parser = subcommands.add_parser(
        "apply", help="reconcile generated approval flags with verified, still-pinned decisions"
    )
    _add_common(apply_parser)

    options = parser.parse_args()
    ledger = load_ledger(options.reviews)

    if options.command == "apply":
        updated, stale, stale_ids = apply_ledger(
            options.generated, options.reviews, options.extraction
        )
        print(f"Updated {updated} generated record(s); {stale} stale approval pin(s).")
        for record_id in stale_ids:
            print(f"  stale: {record_id}")
        return 0

    index = _PageIndex(options.extraction)
    if options.command == "queue":
        items = build_review_items(load_authoring_ir(options.generated), ledger, index)
        print(render_queue(items, list(options.filter or [])))
        return 0

    record = find_record(options.generated, options.record_id)
    log = ledger.get(str(record["id"]), [])
    item = ReviewItem(
        record=record,
        rules_hash=_record_rules_hash(record),
        spans=verify_record(record, index),
        log=log,
    )
    item.flags = _flags(item)

    if options.command == "inspect":
        print(render_inspect(item, options.repo_root))
        return 0

    entry = record_decision(
        options.reviews,
        item,
        options.area,
        options.decision,
        options.reviewer,
        options.note,
        options.allow_drift,
    )
    print(f"Recorded: {entry['area']} -> {entry['decision']} for {record['id']}")
    print(f"  pinned rulesHash {entry['pins']['rulesHash'][:12]}...")
    print(f"  pinned {len(entry['pins']['spanHashes'])} source span hash(es)")
    print("Run `review apply` then regenerate coverage to promote this decision.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
