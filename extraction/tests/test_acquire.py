from pathlib import Path

import pytest

from srd_extract.acquire import AcquisitionError, acquire, parse_pdfinfo, sha256_file


def test_sha256_file(tmp_path: Path) -> None:
    fixture = tmp_path / "fixture.pdf"
    fixture.write_bytes(b"stable fixture")

    assert sha256_file(fixture) == (
        "09a37620a048ceb9cb968ef826472a32faa1e511d2c274ea646d0891e66d6462"
    )


def test_parse_pdfinfo() -> None:
    assert parse_pdfinfo("Pages:          364\nEncrypted:      no\nTitle: SRD: 5.2.1\n") == {
        "Pages": "364",
        "Encrypted": "no",
        "Title": "SRD: 5.2.1",
    }


def test_acquire_rejects_non_https_before_writing(tmp_path: Path) -> None:
    with pytest.raises(AcquisitionError, match="HTTPS"):
        acquire(url="http://example.test/source.pdf", output=tmp_path, expected_pages=364)
