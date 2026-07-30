"""Acquire and fingerprint an immutable official SRD PDF."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
import urllib.request
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

DEFAULT_SOURCE_ID = "wotc-srd-5.2.1-en"
DEFAULT_LICENSE = "CC-BY-4.0"
DOWNLOAD_CHUNK_SIZE = 1024 * 1024


class AcquisitionError(RuntimeError):
    """Raised when a source cannot be safely acquired or verified."""


def sha256_file(path: Path) -> str:
    """Return a lowercase SHA-256 digest without loading the PDF into memory."""
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(DOWNLOAD_CHUNK_SIZE):
            digest.update(chunk)
    return digest.hexdigest()


def parse_pdfinfo(output: str) -> dict[str, str]:
    """Parse Poppler's stable `Key: value` metadata output."""
    result: dict[str, str] = {}
    for line in output.splitlines():
        key, separator, value = line.partition(":")
        if separator:
            result[key.strip()] = value.strip()
    return result


def inspect_pdf(path: Path) -> tuple[int, dict[str, str]]:
    """Verify basic PDF properties with Poppler and return its metadata."""
    if shutil.which("pdfinfo") is None:
        raise AcquisitionError("pdfinfo is required but was not found on PATH")
    process = subprocess.run(
        ["pdfinfo", str(path)],
        check=False,
        capture_output=True,
        text=True,
    )
    if process.returncode != 0:
        raise AcquisitionError(f"pdfinfo rejected the downloaded file: {process.stderr.strip()}")
    metadata = parse_pdfinfo(process.stdout)
    try:
        page_count = int(metadata["Pages"])
    except (KeyError, ValueError) as error:
        raise AcquisitionError("pdfinfo did not report a valid page count") from error
    if metadata.get("Encrypted", "").lower().startswith("yes"):
        raise AcquisitionError("The source PDF is encrypted")
    return page_count, metadata


def extract_license_review_page(pdf_path: Path, output_path: Path) -> None:
    """Extract page 1 for a human to copy the exact attribution into NOTICE.md."""
    if shutil.which("pdftotext") is None:
        raise AcquisitionError("pdftotext is required but was not found on PATH")
    process = subprocess.run(
        ["pdftotext", "-f", "1", "-l", "1", "-layout", str(pdf_path), str(output_path)],
        check=False,
        capture_output=True,
        text=True,
    )
    if process.returncode != 0:
        raise AcquisitionError(f"Could not extract page 1: {process.stderr.strip()}")


def _string_headers(headers: Mapping[str, str]) -> dict[str, str]:
    return {str(key).lower(): str(value) for key, value in sorted(headers.items())}


def acquire(
    *,
    url: str,
    output: Path,
    expected_pages: int,
    source_id: str = DEFAULT_SOURCE_ID,
    expected_sha256: str | None = None,
) -> Path:
    """Download, inspect, and atomically place a content-addressed source."""
    if urlparse(url).scheme != "https":
        raise AcquisitionError("Source URL must use HTTPS")
    output.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="srd-acquire-") as temporary_directory:
        temporary_path = Path(temporary_directory)
        downloaded_pdf = temporary_path / "source.pdf"
        request = urllib.request.Request(url, headers={"User-Agent": "dnd-character-manager/0.1"})
        retrieved_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")
        try:
            with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310
                headers = _string_headers(dict(response.headers.items()))
                with downloaded_pdf.open("xb") as downloaded_file:
                    shutil.copyfileobj(response, downloaded_file, DOWNLOAD_CHUNK_SIZE)
        except OSError as error:
            raise AcquisitionError(f"Could not download {url}: {error}") from error

        digest = sha256_file(downloaded_pdf)
        if expected_sha256 is not None and digest != expected_sha256:
            raise AcquisitionError(
                f"SHA-256 mismatch: expected {expected_sha256}, downloaded {digest}"
            )

        page_count, pdf_metadata = inspect_pdf(downloaded_pdf)
        if page_count != expected_pages:
            raise AcquisitionError(
                f"Page-count mismatch: expected {expected_pages}, downloaded {page_count}"
            )

        final_destination = output / digest
        if final_destination.exists():
            raise AcquisitionError(
                f"Immutable source destination already exists: {final_destination}"
            )

        staged_destination = temporary_path / digest
        staged_destination.mkdir()
        shutil.copy2(downloaded_pdf, staged_destination / "source.pdf")
        extract_license_review_page(downloaded_pdf, staged_destination / "page-1.txt")
        manifest: dict[str, Any] = {
            "source_id": source_id,
            "source_url": url,
            "retrieved_at": retrieved_at,
            "sha256": digest,
            "page_count": page_count,
            "license": DEFAULT_LICENSE,
            "http_headers": headers,
            "pdf_metadata": pdf_metadata,
        }
        (staged_destination / "source-metadata.json").write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        (staged_destination / "NOTICE.review-required.md").write_text(
            "# Attribution review required\n\n"
            "Copy the exact SRD attribution statement from `page-1.txt` into `NOTICE.md` "
            "and review it before distributing extracted content.\n",
            encoding="utf-8",
        )
        shutil.copytree(staged_destination, final_destination)
    return final_destination


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--expected-pages", required=True, type=int)
    parser.add_argument("--expected-sha256")
    parser.add_argument("--source-id", default=DEFAULT_SOURCE_ID)
    parser.add_argument("--output", required=True, type=Path)
    return parser


def main(arguments: Sequence[str] | None = None) -> int:
    options = build_parser().parse_args(arguments)
    destination = acquire(
        url=options.url,
        output=options.output,
        expected_pages=options.expected_pages,
        source_id=options.source_id,
        expected_sha256=options.expected_sha256,
    )
    print(destination)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
