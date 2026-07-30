from pathlib import Path

import pymupdf

from srd_extract.extract import extract_pages
from srd_extract.io import read_json


def _create_fixture_pdf(path: Path) -> None:
    with pymupdf.open() as document:
        page = document.new_page(width=594, height=783)
        page.insert_text((63, 40), "Classes", fontsize=14)
        page.insert_text((63, 100), "Left column", fontsize=10)
        page.insert_text((315, 100), "Right column", fontsize=10)
        page.draw_rect(
            pymupdf.Rect(63, 200, 540, 280),
            fill=(0.9, 0.9, 0.9),
            color=None,
        )
        page.insert_text((75, 225), "Level 1", fontsize=10)
        page.insert_text((315, 225), "Rage", fontsize=10)
        page.insert_link(
            {
                "kind": pymupdf.LINK_URI,
                "from": pymupdf.Rect(63, 300, 150, 315),
                "uri": "https://example.test/srd",
            }
        )
        document.save(path)


def test_extract_pages_preserves_geometry_and_is_deterministic(tmp_path: Path) -> None:
    source = tmp_path / "fixture.pdf"
    _create_fixture_pdf(source)
    first_output = tmp_path / "first"
    second_output = tmp_path / "second"

    first_path = extract_pages(source, first_output, [1])[0]
    second_path = extract_pages(source, second_output, [1])[0]
    raw_page = read_json(first_path)

    assert first_path.read_bytes() == second_path.read_bytes()
    assert raw_page["page"] == {
        "cropBox": [0.0, 0.0, 594.0, 783.0],
        "height": 783.0,
        "index": 0,
        "mediaBox": [0.0, 0.0, 594.0, 783.0],
        "number": 1,
        "rotation": 0,
        "width": 594.0,
    }
    assert any(span["text"] == "Left column" for span in raw_page["spans"])
    assert any(word["text"] == "Rage" for word in raw_page["words"])
    assert raw_page["drawings"]
    assert raw_page["links"][0]["uri"] == "https://example.test/srd"
