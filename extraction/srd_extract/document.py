"""Assemble normalized pages into a source-linked document tree."""

from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from typing import Any

from srd_extract.io import read_json, write_json

DOCUMENT_SCHEMA_VERSION = "0.1.0"
CONTINUABLE_NODE_KINDS = {"ParagraphNode", "ListNode"}


def _content_nodes(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [node for node in nodes if node["kind"] != "MetadataNode"]


def _link_continuation(
    previous: dict[str, Any],
    current: dict[str, Any],
    boundary: str,
    confidence: float,
) -> None:
    current["continuationFrom"] = {
        "nodeId": previous["nodeId"],
        "boundary": boundary,
        "confidence": confidence,
    }
    previous["continuesTo"] = {
        "nodeId": current["nodeId"],
        "boundary": boundary,
        "confidence": confidence,
    }


def assemble_document(normalized_pages: list[dict[str, Any]]) -> dict[str, Any]:
    pages = sorted(deepcopy(normalized_pages), key=lambda page: page["pageNumber"])
    flattened_nodes: list[dict[str, Any]] = []
    page_entries: list[dict[str, Any]] = []

    for page in pages:
        nodes: list[dict[str, Any]] = page["nodes"]
        for node in nodes:
            node["parentId"] = f"page-{page['pageNumber']:04d}"
        content = _content_nodes(nodes)
        left = [node for node in content if str(node["regionType"]).startswith("left-column")]
        right = [node for node in content if str(node["regionType"]).startswith("right-column")]
        if left and right and right[0]["kind"] in CONTINUABLE_NODE_KINDS:
            previous_paragraph = next(
                (node for node in reversed(left) if node["kind"] in CONTINUABLE_NODE_KINDS),
                None,
            )
            if previous_paragraph is not None:
                _link_continuation(previous_paragraph, right[0], "column", 0.9)
        page_entries.append(
            {
                "pageId": f"page-{page['pageNumber']:04d}",
                "pageNumber": page["pageNumber"],
                "children": [node["nodeId"] for node in nodes],
            }
        )
        flattened_nodes.extend(nodes)

    for previous_page, current_page in zip(pages, pages[1:], strict=False):
        previous_content = _content_nodes(previous_page["nodes"])
        current_content = _content_nodes(current_page["nodes"])
        if not previous_content or not current_content:
            continue
        current_first = current_content[0]
        if current_first["kind"] not in CONTINUABLE_NODE_KINDS:
            continue
        previous_paragraph = next(
            (node for node in reversed(previous_content) if node["kind"] in CONTINUABLE_NODE_KINDS),
            None,
        )
        if previous_paragraph is not None:
            _link_continuation(previous_paragraph, current_first, "page", 0.8)

    continuation_count = sum("continuationFrom" in node for node in flattened_nodes)
    return {
        "schemaVersion": DOCUMENT_SCHEMA_VERSION,
        "sourceSha256": pages[0]["sourceSha256"] if pages else None,
        "root": {
            "documentId": "document",
            "children": [page["pageId"] for page in page_entries],
        },
        "pages": page_entries,
        "nodes": flattened_nodes,
        "continuationCount": continuation_count,
    }


def assemble_document_files(normalized_paths: list[Path], output_path: Path) -> dict[str, Any]:
    document = assemble_document([read_json(path) for path in normalized_paths])
    write_json(output_path, document)
    return document
