"""Deterministic page-region classification from extracted geometry."""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any

from srd_extract.io import read_json, write_json
from srd_extract.models import RegionClassification, record_to_dict

LAYOUT_SCHEMA_VERSION = "0.1.0"


def _table_regions(
    raw_page: dict[str, Any],
    width: float,
    gutter: float,
) -> list[dict[str, Any]]:
    regions: list[dict[str, Any]] = []
    for drawing in raw_page["drawings"]:
        x0, y0, x1, y1 = (float(value) for value in drawing["bbox"])
        drawing_width = x1 - x0
        if drawing_width < width * 0.3 or int(drawing["itemCount"]) < 4:
            continue
        if drawing_width >= width * 0.7 or (x0 < gutter - 12 and x1 > gutter + 12):
            region_type = "full-width-table"
            top_extension = 42
        elif (x0 + x1) / 2 < gutter:
            region_type = "left-column-table"
            top_extension = 22
        else:
            region_type = "right-column-table"
            top_extension = 22
        regions.append(
            {
                "tableRegionId": f"table-{len(regions) + 1:03d}",
                "regionType": region_type,
                "bbox": [x0, max(0, y0 - top_extension), x1, y1 + 18],
                "sourceDrawingIds": [drawing["drawingId"]],
                "confidence": 0.98,
                "signals": ["wide-drawing", "repeated-drawing-items", "text-row-overlap"],
            }
        )
    return regions


def _inside_region(block_bbox: list[float], region_bbox: list[float]) -> bool:
    block_x0, block_y0, block_x1, block_y1 = block_bbox
    region_x0, region_y0, region_x1, region_y1 = region_bbox
    horizontal_overlap = max(0.0, min(block_x1, region_x1) - max(block_x0, region_x0))
    block_width = max(1.0, block_x1 - block_x0)
    return (
        horizontal_overlap / block_width >= 0.8 and block_y0 >= region_y0 and block_y1 <= region_y1
    )


def _derive_gutter(
    blocks: list[dict[str, Any]],
    width: float,
    height: float,
) -> tuple[float, list[str]]:
    midpoint = width / 2
    body_blocks = [
        block
        for block in blocks
        if block["bbox"][1] > height * 0.06
        and block["bbox"][3] < height * 0.94
        and block["bbox"][2] - block["bbox"][0] < width * 0.6
    ]
    left_edges = [
        float(block["bbox"][2])
        for block in body_blocks
        if (block["bbox"][0] + block["bbox"][2]) / 2 < midpoint
    ]
    right_edges = [
        float(block["bbox"][0])
        for block in body_blocks
        if (block["bbox"][0] + block["bbox"][2]) / 2 >= midpoint
    ]
    if left_edges and right_edges:
        left_boundary = max(left_edges)
        right_boundary = min(right_edges)
        if left_boundary < right_boundary:
            return (left_boundary + right_boundary) / 2, [
                "content-density",
                "observed-column-gap",
            ]
    return midpoint, ["page-midpoint-fallback"]


def classify_page(raw_page: dict[str, Any]) -> dict[str, Any]:
    width = float(raw_page["page"]["width"])
    height = float(raw_page["page"]["height"])
    blocks: list[dict[str, Any]] = raw_page["blocks"]
    gutter, gutter_signals = _derive_gutter(blocks, width, height)
    table_regions = _table_regions(raw_page, width, gutter)
    classifications: list[RegionClassification] = []

    for block in blocks:
        x0, y0, x1, y1 = (float(value) for value in block["bbox"])
        center = (x0 + x1) / 2
        if any(_inside_region(block["bbox"], region["bbox"]) for region in table_regions):
            matching_region = next(
                region for region in table_regions if _inside_region(block["bbox"], region["bbox"])
            )
            classification = RegionClassification(
                block_id=block["block_id"],
                region_type=matching_region["regionType"],
                confidence=0.98,
                signals=("inside-detected-table", "wide-drawing-overlap"),
            )
        elif y1 <= height * 0.065:
            classification = RegionClassification(
                block_id=block["block_id"],
                region_type="running-header",
                confidence=0.98,
                signals=("top-margin", "repeated-region-candidate"),
            )
        elif y0 >= height * 0.94:
            classification = RegionClassification(
                block_id=block["block_id"],
                region_type="running-footer",
                confidence=0.99,
                signals=("bottom-margin", "page-number-region"),
            )
        elif x0 < gutter - 12 and x1 > gutter + 12:
            classification = RegionClassification(
                block_id=block["block_id"],
                region_type="full-width",
                confidence=0.96,
                signals=("crosses-gutter", "wide-x-range"),
            )
        elif center < gutter:
            classification = RegionClassification(
                block_id=block["block_id"],
                region_type="left-column",
                confidence=0.99,
                signals=("center-left-of-gutter", "gutter-separation"),
            )
        else:
            classification = RegionClassification(
                block_id=block["block_id"],
                region_type="right-column",
                confidence=0.99,
                signals=("center-right-of-gutter", "gutter-separation"),
            )
        classifications.append(classification)

    counts = Counter(classification.region_type for classification in classifications)
    return {
        "schemaVersion": LAYOUT_SCHEMA_VERSION,
        "sourceSha256": raw_page["sourceSha256"],
        "pageNumber": raw_page["page"]["number"],
        "columnGeometry": {
            "gutterX": gutter,
            "signals": gutter_signals,
        },
        "tableRegions": table_regions,
        "regions": [record_to_dict(classification) for classification in classifications],
        "counts": dict(sorted(counts.items())),
    }


def classify_page_file(raw_page_path: Path, output_path: Path) -> dict[str, Any]:
    raw_page = read_json(raw_page_path)
    layout = classify_page(raw_page)
    write_json(output_path, layout)
    return layout
