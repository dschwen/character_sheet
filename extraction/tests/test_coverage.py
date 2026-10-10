from pathlib import Path
from typing import Any

import pytest

from srd_extract.coverage import coverage_markdown, coverage_report
from srd_extract.io import read_json


def entity(status: str = "STRUCTURED") -> dict[str, Any]:
    return {
        "id": "test.class",
        "kind": "class",
        "name": {"en": "Test"},
        "body": {"builder": {"supportedLevelMinimum": 1, "supportedLevelMaximum": 6}},
        "review": {"status": status},
    }


def test_coverage_does_not_promote_implemented_content_to_reviewed_content() -> None:
    report = coverage_report(
        [entity()], [{"review": {"semantics": "needs-review", "tests": "draft"}}]
    )
    assert report["counts"]["STRUCTURED"] == 1
    assert report["counts"]["VERIFIED"] == 0
    assert report["classes"][0]["builderMaximum"] == 6
    assert report["authoringIr"] == {"total": 1, "semanticsApproved": 0, "testsApproved": 0}
    assert "not completeness" in report["note"]


def test_coverage_rejects_duplicate_entities_and_unknown_statuses() -> None:
    with pytest.raises(ValueError, match="duplicate"):
        coverage_report([entity(), entity()], [])
    with pytest.raises(ValueError, match="Unknown coverage status"):
        coverage_report([entity("MADE_UP")], [])


def test_coverage_is_independent_of_entity_order() -> None:
    first = entity()
    second = {**entity("TEXT_ONLY"), "id": "second.class"}
    assert coverage_report([first, second], []) == coverage_report([second, first], [])


def test_checked_in_coverage_matches_current_package() -> None:
    root = Path(__file__).resolve().parents[2]
    generated = root / "packages/content-srd-5.2.1/generated"
    report = coverage_report(
        read_json(generated / "entities.json"),
        [read_json(path) for path in sorted((generated / "authoring-ir").glob("*.json"))],
    )
    assert read_json(generated / "coverage.json") == report, (
        "Run python -m srd_extract.coverage after changing content or authoring IR"
    )
    assert (root / "docs/coverage/README.md").read_text(encoding="utf-8") == coverage_markdown(
        report
    )
