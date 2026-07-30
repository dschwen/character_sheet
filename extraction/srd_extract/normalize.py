"""Conservative and reversible text normalization."""

from __future__ import annotations

import re
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any

from srd_extract.io import read_json, write_json

NORMALIZED_PAGE_SCHEMA_VERSION = "0.1.0"
LOWERCASE_START = re.compile(r"^[a-z]")


def _block_sort_key(block: dict[str, Any]) -> tuple[float, int, float]:
    return (
        float(block.get("reading_y", block["bbox"][1])),
        int(block.get("reading_part", 0)),
        float(block["bbox"][0]),
    )


def _reading_order(
    blocks: list[dict[str, Any]],
    regions: dict[str, str],
) -> list[dict[str, Any]]:
    headers = [block for block in blocks if regions[block["block_id"]] == "running-header"]
    footers = [block for block in blocks if regions[block["block_id"]] == "running-footer"]
    body = [
        block
        for block in blocks
        if regions[block["block_id"]] not in {"running-header", "running-footer"}
    ]
    full_width = sorted(
        (
            block
            for block in body
            if regions[block["block_id"]] in {"full-width", "full-width-table"}
        ),
        key=_block_sort_key,
    )
    column_blocks = [
        block
        for block in body
        if regions[block["block_id"]] not in {"full-width", "full-width-table"}
    ]

    ordered_body: list[dict[str, Any]] = []
    lower_bound = float("-inf")
    for separator in [*full_width, None]:
        upper_bound = float(separator["bbox"][1]) if separator is not None else float("inf")
        zone = [
            block for block in column_blocks if lower_bound <= float(block["bbox"][1]) < upper_bound
        ]
        left = sorted(
            (block for block in zone if regions[block["block_id"]].startswith("left-column")),
            key=_block_sort_key,
        )
        right = sorted(
            (block for block in zone if regions[block["block_id"]].startswith("right-column")),
            key=_block_sort_key,
        )
        ordered_body.extend(left)
        ordered_body.extend(right)
        if separator is not None:
            ordered_body.append(separator)
            lower_bound = float(separator["bbox"][3])
    return [
        *sorted(headers, key=_block_sort_key),
        *ordered_body,
        *sorted(footers, key=_block_sort_key),
    ]


def _collapse_table_blocks(
    blocks: list[dict[str, Any]],
    region_by_block: dict[str, str],
    table_regions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    table_blocks = {
        block["block_id"]: block
        for block in blocks
        if region_by_block[block["block_id"]].endswith("-table")
    }
    collapsed: list[dict[str, Any]] = [
        block for block in blocks if block["block_id"] not in table_blocks
    ]
    for table_region in table_regions:
        x0, y0, x1, y1 = table_region["bbox"]
        members = [
            block
            for block in table_blocks.values()
            if float(block["bbox"][1]) >= float(y0)
            and float(block["bbox"][3]) <= float(y1)
            and float(block["bbox"][0]) < float(x1)
            and float(block["bbox"][2]) > float(x0)
        ]
        if not members:
            continue
        members.sort(key=lambda block: (block["bbox"][1], block["bbox"][0]))
        synthetic_id = table_region["tableRegionId"]
        region_by_block[synthetic_id] = table_region["regionType"]
        collapsed.append(
            {
                "block_id": synthetic_id,
                "bbox": [
                    min(float(block["bbox"][0]) for block in members),
                    min(float(block["bbox"][1]) for block in members),
                    max(float(block["bbox"][2]) for block in members),
                    max(float(block["bbox"][3]) for block in members),
                ],
                "text": "\n".join(str(block["text"]) for block in members),
                "line_ids": [line_id for block in members for line_id in block["line_ids"]],
                "span_ids": [span_id for block in members for span_id in block["span_ids"]],
                "source_block_ids": [block["block_id"] for block in members],
            }
        )
    return collapsed


def _line_is_heading(
    line: dict[str, Any],
    spans_by_id: dict[str, dict[str, Any]],
    body_font_size: float,
) -> bool:
    text = str(line["text"]).strip()
    if not text or len(text) > 120 or text.startswith(("•", "\t")):
        return False
    spans = [
        spans_by_id[span_id]
        for span_id in line["span_ids"]
        if str(spans_by_id[span_id]["text"]).strip()
    ]
    if not spans:
        return False
    all_emphasized = all(
        any(marker in str(span["font"]).lower() for marker in ("bold", "black", "semibold"))
        for span in spans
    )
    return all_emphasized or max(float(span["size"]) for span in spans) >= body_font_size + 1


def _split_blocks_at_heading_lines(
    blocks: list[dict[str, Any]],
    region_by_block: dict[str, str],
    lines_by_id: dict[str, dict[str, Any]],
    spans_by_id: dict[str, dict[str, Any]],
    body_font_size: float,
) -> list[dict[str, Any]]:
    split_blocks: list[dict[str, Any]] = []
    for block in blocks:
        region_type = region_by_block[block["block_id"]]
        if (
            region_type.endswith("-table")
            or region_type in {"running-header", "running-footer"}
            or len(block["line_ids"]) <= 1
        ):
            split_blocks.append(block)
            continue
        chunks: list[list[str]] = []
        body_chunk: list[str] = []
        for line_id in block["line_ids"]:
            line = lines_by_id[line_id]
            if _line_is_heading(line, spans_by_id, body_font_size):
                if body_chunk:
                    chunks.append(body_chunk)
                    body_chunk = []
                chunks.append([line_id])
            else:
                body_chunk.append(line_id)
        if body_chunk:
            chunks.append(body_chunk)
        if len(chunks) == 1:
            split_blocks.append(block)
            continue
        for part_number, line_ids in enumerate(chunks, start=1):
            part_id = f"{block['block_id']}-part{part_number:03d}"
            region_by_block[part_id] = region_type
            part_lines = [lines_by_id[line_id] for line_id in line_ids]
            span_ids = [span_id for line in part_lines for span_id in line["span_ids"]]
            split_blocks.append(
                {
                    "block_id": part_id,
                    "bbox": [
                        min(float(line["bbox"][0]) for line in part_lines),
                        min(float(line["bbox"][1]) for line in part_lines),
                        max(float(line["bbox"][2]) for line in part_lines),
                        max(float(line["bbox"][3]) for line in part_lines),
                    ],
                    "text": "\n".join(str(line["text"]) for line in part_lines),
                    "line_ids": line_ids,
                    "span_ids": span_ids,
                    "source_block_ids": block.get(
                        "source_block_ids",
                        [block["block_id"]],
                    ),
                    "reading_y": block["bbox"][1],
                    "reading_part": part_number,
                }
            )
    return split_blocks


def normalize_lines(
    lines: list[str],
    line_bboxes: list[list[float]] | None = None,
    right_edge: float | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    transformations: list[dict[str, Any]] = []
    normalized_parts: list[str] = []
    for index, original_line in enumerate(lines):
        stripped_line = original_line.strip()
        line = unicodedata.normalize("NFC", stripped_line)
        if line != stripped_line:
            transformations.append(
                {
                    "kind": "unicode-nfc",
                    "line": index + 1,
                    "before": stripped_line,
                    "after": line,
                }
            )
        if "\u00a0" in line:
            normalized_space_line = line.replace("\u00a0", " ")
            transformations.append(
                {
                    "kind": "normalize-nonbreaking-space",
                    "line": index + 1,
                    "before": line,
                    "after": normalized_space_line,
                }
            )
            line = normalized_space_line
        if not line:
            continue
        if not normalized_parts:
            normalized_parts.append(line)
            continue
        previous = normalized_parts[-1]
        if previous.endswith("\u00ad"):
            normalized_parts[-1] = previous[:-1] + line
            transformations.append(
                {
                    "kind": "join-soft-hyphen",
                    "linePair": [index, index + 1],
                    "before": previous + "\n" + line,
                    "after": previous[:-1] + line,
                    "confidence": 1,
                }
            )
        elif (
            previous.endswith("-")
            and LOWERCASE_START.match(line)
            and (
                line_bboxes is None
                or right_edge is None
                or abs(float(line_bboxes[index - 1][2]) - right_edge) <= 30
            )
        ):
            joined = previous[:-1] + line
            normalized_parts[-1] = joined
            transformations.append(
                {
                    "kind": "join-line-end-hyphen",
                    "linePair": [index, index + 1],
                    "before": previous + "\n" + line,
                    "after": joined,
                    "confidence": 0.9,
                    "signals": [
                        "line-end-hyphen",
                        "lowercase-continuation",
                        "line-near-block-right-edge",
                    ],
                }
            )
        else:
            normalized_parts.append(line)
    return " ".join(normalized_parts), transformations


def _normalize_list_items(
    lines: list[dict[str, Any]],
    right_edge: float,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    item_lines: list[list[dict[str, Any]]] = []
    current_item: list[dict[str, Any]] = []
    for line in lines:
        text = str(line["text"]).lstrip()
        if text.startswith("•"):
            if current_item:
                item_lines.append(current_item)
            current_item = [{**line, "text": text.removeprefix("•").lstrip()}]
        elif current_item:
            current_item.append(line)
    if current_item:
        item_lines.append(current_item)

    items: list[dict[str, Any]] = []
    transformations: list[dict[str, Any]] = []
    for index, lines_for_item in enumerate(item_lines, start=1):
        normalized_text, item_transformations = normalize_lines(
            [str(line["text"]) for line in lines_for_item],
            [line["bbox"] for line in lines_for_item],
            right_edge,
        )
        items.append(
            {
                "index": index,
                "rawText": "\n".join(str(line["text"]) for line in lines_for_item),
                "normalizedText": normalized_text,
            }
        )
        transformations.extend(item_transformations)
    return items, transformations


def normalize_page(raw_page: dict[str, Any], layout: dict[str, Any]) -> dict[str, Any]:
    region_by_block = {region["block_id"]: region["region_type"] for region in layout["regions"]}
    collapsed_blocks = _collapse_table_blocks(
        raw_page["blocks"],
        region_by_block,
        layout["tableRegions"],
    )
    lines_by_id = {line["line_id"]: line for line in raw_page["lines"]}
    spans_by_id = {span["span_id"]: span for span in raw_page["spans"]}
    body_span_sizes = [
        float(span["size"])
        for span in raw_page["spans"]
        if region_by_block[span["block_id"]] not in {"running-header", "running-footer"}
    ]
    size_counts = Counter(round(size, 2) for size in body_span_sizes)
    body_font_size = size_counts.most_common(1)[0][0] if size_counts else 0
    split_blocks = _split_blocks_at_heading_lines(
        collapsed_blocks,
        region_by_block,
        lines_by_id,
        spans_by_id,
        body_font_size,
    )

    nodes: list[dict[str, Any]] = []
    for order, block in enumerate(_reading_order(split_blocks, region_by_block), start=1):
        block_line_records = [lines_by_id[line_id] for line_id in block["line_ids"]]
        block_lines = [line["text"] for line in block_line_records]
        normalized_text, transformations = normalize_lines(
            block_lines,
            [line["bbox"] for line in block_line_records],
            float(block["bbox"][2]),
        )
        block_spans = [spans_by_id[span_id] for span_id in block["span_ids"]]
        maximum_size = max((float(span["size"]) for span in block_spans), default=0)
        bold = any(
            marker in str(span["font"]).lower()
            for span in block_spans
            for marker in ("bold", "black", "semibold")
        )
        region_type = region_by_block[block["block_id"]]
        list_items: list[dict[str, Any]] | None = None
        if any(str(line).lstrip().startswith("•") for line in block_lines):
            list_items, transformations = _normalize_list_items(
                block_line_records,
                float(block["bbox"][2]),
            )
            normalized_text = " • ".join(item["normalizedText"] for item in list_items)
        if region_type in {"running-header", "running-footer"}:
            kind = "MetadataNode"
        elif region_type.endswith("-table"):
            kind = "TableNode"
        elif list_items:
            kind = "ListNode"
        elif len(normalized_text) <= 160 and (maximum_size >= body_font_size + 1 or bold):
            kind = "HeadingNode"
        else:
            kind = "ParagraphNode"
        node = {
            "nodeId": f"p{raw_page['page']['number']:04d}-n{order:03d}",
            "kind": kind,
            "readingOrder": order,
            "regionType": region_type,
            "bbox": block["bbox"],
            "sourceBlocks": block.get("source_block_ids", [block["block_id"]]),
            "rawText": block["text"],
            "normalizedText": normalized_text,
            "transformations": transformations,
        }
        if list_items:
            node["items"] = list_items
        nodes.append(node)
    return {
        "schemaVersion": NORMALIZED_PAGE_SCHEMA_VERSION,
        "sourceSha256": raw_page["sourceSha256"],
        "pageNumber": raw_page["page"]["number"],
        "bodyFontSize": body_font_size,
        "nodes": nodes,
    }


def normalize_page_files(
    raw_page_path: Path,
    layout_path: Path,
    output_path: Path,
) -> dict[str, Any]:
    normalized = normalize_page(read_json(raw_page_path), read_json(layout_path))
    write_json(output_path, normalized)
    return normalized
