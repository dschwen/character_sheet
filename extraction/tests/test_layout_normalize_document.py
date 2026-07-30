from typing import Any

from srd_extract.document import assemble_document
from srd_extract.layout import classify_page
from srd_extract.normalize import normalize_lines


def _block(block_id: str, bbox: list[float], text: str) -> dict[str, Any]:
    return {"block_id": block_id, "bbox": bbox, "text": text}


def test_layout_classifies_columns_table_and_footer() -> None:
    raw_page = {
        "sourceSha256": "a" * 64,
        "page": {"number": 1, "width": 594.0, "height": 783.0},
        "blocks": [
            _block("left", [63.0, 100.0, 280.0, 140.0], "Left"),
            _block("right", [315.0, 100.0, 540.0, 140.0], "Right"),
            _block("table-row", [75.0, 400.0, 520.0, 420.0], "1 Rage 2"),
            _block("footer", [63.0, 750.0, 220.0, 760.0], "SRD 1"),
        ],
        "drawings": [
            {
                "drawingId": "drawing-001",
                "bbox": [63.0, 390.0, 540.0, 500.0],
                "itemCount": 10,
            }
        ],
    }

    layout = classify_page(raw_page)
    regions = {region["block_id"]: region["region_type"] for region in layout["regions"]}

    assert regions == {
        "left": "left-column",
        "right": "right-column",
        "table-row": "full-width-table",
        "footer": "running-footer",
    }
    assert layout["tableRegions"][0]["signals"] == [
        "wide-drawing",
        "repeated-drawing-items",
        "text-row-overlap",
    ]


def test_normalization_joins_reversible_line_end_hyphens() -> None:
    normalized, transformations = normalize_lines(
        ["Blud-", "geoning damage."],
        [[0.0, 0.0, 100.0, 10.0], [0.0, 10.0, 75.0, 20.0]],
        100.0,
    )

    assert normalized == "Bludgeoning damage."
    assert transformations == [
        {
            "kind": "join-line-end-hyphen",
            "linePair": [1, 2],
            "before": "Blud-\ngeoning damage.",
            "after": "Bludgeoning damage.",
            "confidence": 0.9,
            "signals": [
                "line-end-hyphen",
                "lowercase-continuation",
                "line-near-block-right-edge",
            ],
        }
    ]


def test_document_assembly_links_column_and_page_continuations() -> None:
    pages = [
        {
            "sourceSha256": "a" * 64,
            "pageNumber": 1,
            "nodes": [
                {
                    "nodeId": "p0001-n001",
                    "kind": "ParagraphNode",
                    "regionType": "left-column",
                },
                {
                    "nodeId": "p0001-n002",
                    "kind": "ParagraphNode",
                    "regionType": "right-column",
                },
            ],
        },
        {
            "sourceSha256": "a" * 64,
            "pageNumber": 2,
            "nodes": [
                {
                    "nodeId": "p0002-n001",
                    "kind": "ParagraphNode",
                    "regionType": "left-column",
                }
            ],
        },
    ]

    document = assemble_document(pages)
    nodes = {node["nodeId"]: node for node in document["nodes"]}

    assert document["continuationCount"] == 2
    assert nodes["p0001-n002"]["continuationFrom"]["boundary"] == "column"
    assert nodes["p0002-n001"]["continuationFrom"] == {
        "nodeId": "p0001-n002",
        "boundary": "page",
        "confidence": 0.8,
    }
