from pathlib import Path

import pytest

from srd_extract.pipeline import run_pipeline

SOURCE_HASH = "8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87"
REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SOURCE = REPOSITORY_ROOT / "sources" / "wotc-srd-5.2.1-en" / SOURCE_HASH / "source.pdf"


@pytest.mark.skipif(not SOURCE.exists(), reason="Pinned SRD PDF is intentionally not committed")
def test_barbarian_pages_28_to_30_audit(tmp_path: Path) -> None:
    report = run_pipeline(SOURCE, tmp_path, (28, 29, 30), overlays=False)

    assert report["sourceSha256"] == SOURCE_HASH
    assert report["counts"]["nodes"] == {
        "HeadingNode": 32,
        "ListNode": 4,
        "MetadataNode": 3,
        "ParagraphNode": 31,
        "TableNode": 2,
    }
    assert report["counts"]["continuations"] == 4
    assert report["counts"]["transformations"]["join-line-end-hyphen"] == 21
