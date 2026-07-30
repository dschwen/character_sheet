"""Run the extraction proof-of-concept pipeline."""

from __future__ import annotations

import argparse
from collections import Counter
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from srd_extract.document import assemble_document_files
from srd_extract.extract import extract_pages
from srd_extract.io import parse_page_specification, read_json, write_json
from srd_extract.layout import classify_page_file
from srd_extract.normalize import normalize_page_files
from srd_extract.overlay import render_overlay


def run_pipeline(
    source: Path,
    output: Path,
    pages: tuple[int, ...],
    *,
    overlays: bool,
) -> dict[str, Any]:
    raw_paths = extract_pages(source, output, pages)
    region_counts: Counter[str] = Counter()
    node_counts: Counter[str] = Counter()
    transformation_counts: Counter[str] = Counter()
    normalized_paths: list[Path] = []

    for page_number, raw_path in zip(pages, raw_paths, strict=True):
        layout_path = output / "layout" / "pages" / f"{page_number:04d}.json"
        normalized_path = output / "normalized" / "pages" / f"{page_number:04d}.json"
        layout = classify_page_file(raw_path, layout_path)
        normalized = normalize_page_files(raw_path, layout_path, normalized_path)
        normalized_paths.append(normalized_path)
        region_counts.update(region["region_type"] for region in layout["regions"])
        node_counts.update(node["kind"] for node in normalized["nodes"])
        transformation_counts.update(
            transformation["kind"]
            for node in normalized["nodes"]
            for transformation in node["transformations"]
        )
        if overlays:
            render_overlay(
                source,
                raw_path,
                layout_path,
                output / "overlays" / f"{page_number:04d}.png",
            )

    document = assemble_document_files(
        normalized_paths,
        output / "normalized" / "document.json",
    )
    first_raw = read_json(raw_paths[0])
    report = {
        "schemaVersion": "0.1.0",
        "sourceSha256": first_raw["sourceSha256"],
        "pages": list(pages),
        "counts": {
            "regions": dict(sorted(region_counts.items())),
            "nodes": dict(sorted(node_counts.items())),
            "transformations": dict(sorted(transformation_counts.items())),
            "continuations": document["continuationCount"],
        },
    }
    write_json(output / "report.json", report)
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--pages", required=True, type=parse_page_specification)
    parser.add_argument("--overlays", action="store_true")
    return parser


def main(arguments: Sequence[str] | None = None) -> int:
    options = build_parser().parse_args(arguments)
    report = run_pipeline(
        options.source,
        options.out,
        options.pages,
        overlays=options.overlays,
    )
    print(f"Extracted {len(report['pages'])} pages; source {report['sourceSha256']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
