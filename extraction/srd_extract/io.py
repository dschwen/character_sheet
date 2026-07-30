"""Deterministic JSON and page-range helpers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(path.suffix + ".tmp")
    temporary_path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    temporary_path.replace(path)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def parse_page_specification(value: str) -> tuple[int, ...]:
    """Parse one-based page specifications such as `28-30,35`."""
    pages: set[int] = set()
    for part in value.split(","):
        token = part.strip()
        if not token:
            raise ValueError("Page specification contains an empty component")
        if "-" in token:
            start_text, end_text = token.split("-", maxsplit=1)
            start = int(start_text)
            end = int(end_text)
            if start < 1 or end < start:
                raise ValueError(f"Invalid page range: {token}")
            pages.update(range(start, end + 1))
        else:
            page = int(token)
            if page < 1:
                raise ValueError(f"Page numbers are one-based: {page}")
            pages.add(page)
    if not pages:
        raise ValueError("At least one page is required")
    return tuple(sorted(pages))
