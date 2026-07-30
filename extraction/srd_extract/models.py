"""Typed records shared by the extraction stages."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Literal

type BBox = tuple[float, float, float, float]
type RegionType = Literal[
    "running-header",
    "running-footer",
    "left-column",
    "right-column",
    "full-width",
    "full-width-table",
    "left-column-table",
    "right-column-table",
]


@dataclass(frozen=True, slots=True)
class TextSpan:
    page: int
    block_id: str
    line_id: str
    span_id: str
    bbox: BBox
    origin: tuple[float, float]
    text: str
    font: str
    size: float
    flags: int
    char_flags: int
    color: int
    alpha: int
    ascender: float
    descender: float


@dataclass(frozen=True, slots=True)
class TextLine:
    line_id: str
    bbox: BBox
    direction: tuple[float, float]
    writing_mode: int
    text: str
    span_ids: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class TextBlock:
    block_id: str
    source_block_number: int
    bbox: BBox
    text: str
    line_ids: tuple[str, ...]
    span_ids: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class WordToken:
    word_id: str
    bbox: BBox
    text: str
    source_block_number: int
    source_line_number: int
    source_word_number: int


@dataclass(frozen=True, slots=True)
class RegionClassification:
    block_id: str
    region_type: RegionType
    confidence: float
    signals: tuple[str, ...]


def record_to_dict(record: Any) -> dict[str, Any]:
    """Convert a frozen extraction record into JSON-ready primitives."""
    return asdict(record)
