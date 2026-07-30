"""Lossless, layout-aware extraction from PDF pages."""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path
from typing import Any

import pymupdf

from srd_extract.acquire import sha256_file
from srd_extract.io import write_json
from srd_extract.models import TextBlock, TextLine, TextSpan, WordToken, record_to_dict

RAW_PAGE_SCHEMA_VERSION = "0.1.0"


def _bbox(value: Any) -> tuple[float, float, float, float]:
    x0, y0, x1, y1 = value
    return float(x0), float(y0), float(x1), float(y1)


def _point(value: Any) -> tuple[float, float]:
    x, y = value
    return float(x), float(y)


def _extract_text(
    page: pymupdf.Page,
    page_number: int,
) -> tuple[list[TextBlock], list[TextLine], list[TextSpan]]:
    page_dictionary = page.get_text("dict", sort=False)
    blocks: list[TextBlock] = []
    lines: list[TextLine] = []
    spans: list[TextSpan] = []

    for block_number, raw_block in enumerate(page_dictionary["blocks"]):
        if raw_block["type"] != 0:
            continue
        block_id = f"p{page_number:04d}-b{block_number + 1:03d}"
        block_line_ids: list[str] = []
        block_span_ids: list[str] = []
        block_line_text: list[str] = []
        for line_number, raw_line in enumerate(raw_block["lines"]):
            line_id = f"{block_id}-l{line_number + 1:03d}"
            line_span_ids: list[str] = []
            line_text: list[str] = []
            for span_number, raw_span in enumerate(raw_line["spans"]):
                span_id = f"{line_id}-s{span_number + 1:03d}"
                text = str(raw_span["text"])
                span = TextSpan(
                    page=page_number,
                    block_id=block_id,
                    line_id=line_id,
                    span_id=span_id,
                    bbox=_bbox(raw_span["bbox"]),
                    origin=_point(raw_span["origin"]),
                    text=text,
                    font=str(raw_span["font"]),
                    size=float(raw_span["size"]),
                    flags=int(raw_span["flags"]),
                    char_flags=int(raw_span.get("char_flags", 0)),
                    color=int(raw_span["color"]),
                    alpha=int(raw_span.get("alpha", 255)),
                    ascender=float(raw_span["ascender"]),
                    descender=float(raw_span["descender"]),
                )
                spans.append(span)
                line_span_ids.append(span_id)
                block_span_ids.append(span_id)
                line_text.append(text)
            joined_line_text = "".join(line_text)
            lines.append(
                TextLine(
                    line_id=line_id,
                    bbox=_bbox(raw_line["bbox"]),
                    direction=_point(raw_line["dir"]),
                    writing_mode=int(raw_line["wmode"]),
                    text=joined_line_text,
                    span_ids=tuple(line_span_ids),
                )
            )
            block_line_ids.append(line_id)
            block_line_text.append(joined_line_text)
        blocks.append(
            TextBlock(
                block_id=block_id,
                source_block_number=block_number,
                bbox=_bbox(raw_block["bbox"]),
                text="\n".join(block_line_text),
                line_ids=tuple(block_line_ids),
                span_ids=tuple(block_span_ids),
            )
        )
    return blocks, lines, spans


def _extract_words(page: pymupdf.Page, page_number: int) -> list[WordToken]:
    words: list[WordToken] = []
    for index, raw_word in enumerate(page.get_text("words", sort=False)):
        x0, y0, x1, y1, text, block_number, line_number, word_number = raw_word
        words.append(
            WordToken(
                word_id=f"p{page_number:04d}-w{index + 1:04d}",
                bbox=(float(x0), float(y0), float(x1), float(y1)),
                text=str(text),
                source_block_number=int(block_number),
                source_line_number=int(line_number),
                source_word_number=int(word_number),
            )
        )
    return words


def _extract_images(page: pymupdf.Page) -> list[dict[str, Any]]:
    images: list[dict[str, Any]] = []
    for index, image in enumerate(page.get_image_info(hashes=True, xrefs=True)):
        digest = image.get("digest")
        images.append(
            {
                "imageId": f"image-{index + 1:03d}",
                "bbox": list(_bbox(image["bbox"])),
                "digest": digest.hex() if isinstance(digest, bytes) else None,
                "height": int(image["height"]),
                "width": int(image["width"]),
                "xres": int(image["xres"]),
                "yres": int(image["yres"]),
                "xref": int(image.get("xref", 0)),
            }
        )
    return images


def _color(value: Any) -> list[float] | None:
    if value is None:
        return None
    return [float(component) for component in value]


def _float_or(value: Any, default: float) -> float:
    return default if value is None else float(value)


def _extract_drawings(page: pymupdf.Page) -> list[dict[str, Any]]:
    drawings: list[dict[str, Any]] = []
    for index, drawing in enumerate(page.get_drawings()):
        drawings.append(
            {
                "drawingId": f"drawing-{index + 1:03d}",
                "bbox": list(_bbox(drawing["rect"])),
                "closePath": bool(drawing.get("closePath", False)),
                "color": _color(drawing.get("color")),
                "fill": _color(drawing.get("fill")),
                "fillOpacity": _float_or(drawing.get("fill_opacity"), 1),
                "itemCount": len(drawing["items"]),
                "layer": str(drawing.get("layer", "")),
                "strokeOpacity": _float_or(drawing.get("stroke_opacity"), 1),
                "type": str(drawing["type"]),
                "width": _float_or(drawing.get("width"), 0),
            }
        )
    return drawings


def _extract_links(page: pymupdf.Page) -> list[dict[str, Any]]:
    links: list[dict[str, Any]] = []
    for index, link in enumerate(page.get_links()):
        links.append(
            {
                "linkId": f"link-{index + 1:03d}",
                "bbox": list(_bbox(link["from"])),
                "kind": int(link["kind"]),
                "targetPageIndex": int(link.get("page", -1)),
                "uri": link.get("uri"),
            }
        )
    return links


def extract_page(
    document: pymupdf.Document,
    page_number: int,
    source_sha256: str,
) -> dict[str, Any]:
    if page_number < 1 or page_number > document.page_count:
        raise ValueError(
            f"Page {page_number} is outside the document range 1–{document.page_count}"
        )
    page = document.load_page(page_number - 1)
    blocks, lines, spans = _extract_text(page, page_number)
    words = _extract_words(page, page_number)
    return {
        "schemaVersion": RAW_PAGE_SCHEMA_VERSION,
        "sourceSha256": source_sha256,
        "page": {
            "number": page_number,
            "index": page_number - 1,
            "width": float(page.rect.width),
            "height": float(page.rect.height),
            "rotation": int(page.rotation),
            "cropBox": list(_bbox(page.cropbox)),
            "mediaBox": list(_bbox(page.mediabox)),
        },
        "blocks": [record_to_dict(block) for block in blocks],
        "lines": [record_to_dict(line) for line in lines],
        "spans": [record_to_dict(span) for span in spans],
        "words": [record_to_dict(word) for word in words],
        "images": _extract_images(page),
        "drawings": _extract_drawings(page),
        "links": _extract_links(page),
    }


def extract_pages(source: Path, output: Path, pages: Iterable[int]) -> list[Path]:
    source_digest = sha256_file(source)
    generated_paths: list[Path] = []
    with pymupdf.open(source) as document:
        for page_number in pages:
            raw_page = extract_page(document, page_number, source_digest)
            generated_path = output / "raw" / "pages" / f"{page_number:04d}.json"
            write_json(generated_path, raw_page)
            generated_paths.append(generated_path)
    return generated_paths
