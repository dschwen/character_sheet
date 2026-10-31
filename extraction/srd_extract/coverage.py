"""Generate coverage counts and implemented builder limits from the current package."""

from __future__ import annotations

import argparse
from collections import Counter
from pathlib import Path
from typing import Any

from srd_extract.io import read_json, write_json

STATUSES = (
    "UNCLASSIFIED",
    "TEXT_ONLY",
    "STRUCTURED",
    "EXECUTABLE",
    "TESTED",
    "VERIFIED",
    "AUTHORED",
)


def coverage_report(
    entities: list[dict[str, Any]], authoring_ir: list[dict[str, Any]]
) -> dict[str, Any]:
    ids = [entity["id"] for entity in entities]
    if len(ids) != len(set(ids)):
        raise ValueError("Coverage cannot be generated for duplicate entity IDs")
    counts = dict.fromkeys(STATUSES, 0)
    for entity in entities:
        status = entity.get("review", {}).get("status", "UNCLASSIFIED")
        if status not in counts:
            raise ValueError(f"Unknown coverage status: {status}")
        counts[status] += 1
    classes = []
    for entity in sorted(entities, key=lambda entity: entity["id"]):
        if entity["kind"] != "class":
            continue
        builder = entity["body"].get("builder")
        classes.append(
            {
                "id": entity["id"],
                "name": entity["name"]["en"],
                "builderMinimum": builder.get("supportedLevelMinimum") if builder else None,
                "builderMaximum": builder.get("supportedLevelMaximum") if builder else None,
            }
        )
    reference_records = [
        {
            "id": entity["id"],
            "name": entity.get("name", {}).get("en", ""),
            "editions": sorted(
                {
                    str(span.get("edition"))
                    for span in entity.get("source", [])
                    if span.get("kind") == "edition-reference"
                }
            ),
            "sourceIds": sorted(
                {
                    str(span.get("sourceId"))
                    for span in entity.get("source", [])
                    if span.get("kind") == "edition-reference"
                }
            ),
        }
        for entity in sorted(entities, key=lambda entity: entity["id"])
        if any(span.get("kind") == "edition-reference" for span in entity.get("source", []))
    ]
    reference_ids = {record["id"] for record in reference_records}
    return {
        "package": "srd-5.2.1",
        "generatedAt": None,
        "counts": counts,
        "entityKinds": dict(sorted(Counter(entity["kind"] for entity in entities).items())),
        "provenance": {
            "pinnedSource": sum(1 for entity in entities if entity["id"] not in reference_ids),
            "editionReference": len(reference_ids),
        },
        "referenceRecords": reference_records,
        "classes": classes,
        "authoringIr": {
            "total": len(authoring_ir),
            "semanticsApproved": sum(
                ir["review"]["semantics"] == "approved" for ir in authoring_ir
            ),
            "testsApproved": sum(ir["review"]["tests"] == "approved" for ir in authoring_ir),
        },
        "note": (
            "Counts describe loaded entities, not completeness of SRD extraction. "
            "Builder limits describe implemented workflows, not semantic review approval. "
            "Proposed rules remain unverified until separately reviewed. "
            "AUTHORED records are out-of-SRD edition references attributed separately and are "
            "never presented as SRD content (see docs/adr/0013)."
        ),
    }


def coverage_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Rules coverage",
        "",
        "Generated from the current package by `python -m srd_extract.coverage`.",
        "",
        report["note"],
        "",
        "| Status | Loaded entities |",
        "| --- | ---: |",
        *[f"| {status} | {report['counts'][status]} |" for status in STATUSES],
        "",
        "## Implemented single-class builder and advancement limits",
        "",
        "| Class | Minimum level | Maximum level |",
        "| --- | ---: | ---: |",
        *[
            f"| {row['name']} | {row['builderMinimum']} | {row['builderMaximum']} |"
            for row in report["classes"]
        ],
        "",
        "## Review evidence",
        "",
        f"- Authoring IR records: {report['authoringIr']['total']}.",
        f"- Semantics approved: {report['authoringIr']['semanticsApproved']}.",
        f"- Tests approved: {report['authoringIr']['testsApproved']}.",
        "",
        "Passing automated tests is not independent semantic or test-review approval.",
        "Level-20 progression tables do not imply automated level-20 support.",
        "See `docs/rules-engine` for class-specific assisted mechanics and limits.",
        "",
        "## Loaded entity families",
        "",
        "| Kind | Count |",
        "| --- | ---: |",
        *[f"| {kind} | {count} |" for kind, count in report["entityKinds"].items()],
        "",
        "## Out-of-SRD edition-reference records",
        "",
        f"Pinned-source entities: {report['provenance']['pinnedSource']}.",
        f"Edition-reference records: {report['provenance']['editionReference']}.",
        "Authored from explicitly supplied rules text, never extracted from the pinned source.",
        "See `docs/adr/0013-out-of-source-edition-reference-records.md`.",
        "",
        "| Record | Edition reference | Declared source id |",
        "| --- | --- | --- |",
        *[
            f"| {row['name']} (`{row['id']}`) | {', '.join(row['editions'])} | "
            f"{', '.join(row['sourceIds'])} |"
            for row in report["referenceRecords"]
        ],
        "",
        "Regenerate after content changes:",
        "",
        "```bash",
        "PYTHONPATH=extraction .venv/bin/python -m srd_extract.coverage \\",
        "  --output packages/content-srd-5.2.1/generated \\",
        "  --markdown docs/coverage/README.md",
        "```",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--markdown", required=True, type=Path)
    options = parser.parse_args()
    report = coverage_report(
        read_json(options.output / "entities.json"),
        [read_json(path) for path in sorted((options.output / "authoring-ir").glob("*.json"))],
    )
    write_json(options.output / "coverage.json", report)
    options.markdown.parent.mkdir(parents=True, exist_ok=True)
    options.markdown.write_text(coverage_markdown(report), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
