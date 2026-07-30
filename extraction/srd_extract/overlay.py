"""Render classified text-block overlays for visual auditing."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pymupdf

from srd_extract.io import read_json

COLORS: dict[str, tuple[float, float, float]] = {
    "running-header": (0.6, 0.2, 0.8),
    "running-footer": (0.6, 0.2, 0.8),
    "left-column": (0.1, 0.4, 0.9),
    "right-column": (0.1, 0.7, 0.3),
    "full-width": (0.9, 0.35, 0.1),
    "full-width-table": (0.9, 0.35, 0.1),
    "left-column-table": (0.95, 0.65, 0.1),
    "right-column-table": (0.95, 0.65, 0.1),
}


def render_overlay(
    source: Path,
    raw_page_path: Path,
    layout_path: Path,
    output_path: Path,
    dpi: int = 144,
) -> None:
    raw_page: dict[str, Any] = read_json(raw_page_path)
    layout: dict[str, Any] = read_json(layout_path)
    block_by_id = {block["block_id"]: block for block in raw_page["blocks"]}
    with pymupdf.open(source) as document:
        page = document.load_page(int(raw_page["page"]["index"]))
        for region in layout["regions"]:
            block = block_by_id[region["block_id"]]
            rectangle = pymupdf.Rect(block["bbox"])
            color = COLORS[region["region_type"]]
            page.draw_rect(rectangle, color=color, width=0.7, overlay=True)
            label_y = max(5.0, rectangle.y0 - 1.5)
            page.insert_text(
                pymupdf.Point(rectangle.x0, label_y),
                f"{region['block_id']} {region['region_type']}",
                fontsize=4,
                color=color,
                overlay=True,
            )
        gutter = float(layout["columnGeometry"]["gutterX"])
        page.draw_line(
            pymupdf.Point(gutter, 0),
            pymupdf.Point(gutter, page.rect.height),
            color=(0.9, 0.1, 0.1),
            width=0.5,
            dashes="[2 2]",
            overlay=True,
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)
        page.get_pixmap(dpi=dpi, alpha=False).save(output_path)
