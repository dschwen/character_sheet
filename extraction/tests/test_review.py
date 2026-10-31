import hashlib
from pathlib import Path
from typing import Any

import pytest

from srd_extract.coverage import coverage_report
from srd_extract.io import read_json, write_json
from srd_extract.review import (
    ReviewItem,
    _PageIndex,
    apply_ledger,
    build_review_items,
    load_authoring_ir,
    load_ledger,
    record_decision,
    verify_span,
)

RAGE_ID = "srd521.class-feature.test.rage"
SOURCE_TEXT = "You can enter a Rage once per short rest."
OTHER_TEXT = "While raging you have resistance."


def _quote(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def ir_record(rules: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "schemaVersion": "0.1.0",
        "id": RAGE_ID,
        "kind": "class-feature",
        "parentId": "srd521.class.test",
        "level": 1,
        "source": [
            {
                "sourceId": "wotc-srd-5.2.1-en",
                "page": 28,
                "blocks": ["p0028-b001", "p0028-b002"],
                "quoteHash": _quote(f"{SOURCE_TEXT}\n{OTHER_TEXT}"),
            }
        ],
        "text": {"title": "Rage", "nodes": [{"kind": "ParagraphNode", "text": SOURCE_TEXT}]},
        "proposedRules": rules
        or [
            {
                "id": "grant-rage",
                "type": "grant-resource",
                "target": "srd521.resource.test.rage",
                "parameters": {},
                "automationLevel": "state-automated",
            }
        ],
        "review": {"extraction": "approved", "semantics": "needs-review", "tests": "draft"},
    }


def make_fixture(
    tmp_path: Path, source_text: str = SOURCE_TEXT, record: dict[str, Any] | None = None
) -> tuple[Path, Path, Path]:
    generated = tmp_path / "generated"
    write_json(generated / "authoring-ir" / "test.rage.json", record or ir_record())
    nodes = [
        {
            "kind": "ParagraphNode",
            "nodeId": "page-28-1",
            "normalizedText": source_text,
            "rawText": source_text,
            "sourceBlocks": ["p0028-b001"],
        },
        {
            "kind": "ListNode",
            "nodeId": "page-28-2",
            "normalizedText": OTHER_TEXT if source_text == SOURCE_TEXT else source_text,
            "rawText": OTHER_TEXT if source_text == SOURCE_TEXT else source_text,
            "sourceBlocks": ["p0028-b002"],
        },
    ]
    write_json(
        tmp_path / "extraction-out" / "srd-5.2.1-test" / "normalized" / "pages" / "0028.json",
        {"schemaVersion": "0.1.0", "pageNumber": 28, "nodes": nodes},
    )
    reviews = tmp_path / "reviews"
    reviews.mkdir()
    return generated, tmp_path / "extraction-out", reviews


def item_for(generated: Path, extraction: Path, reviews: Path) -> ReviewItem:
    records = load_authoring_ir(generated)
    items = build_review_items(records, load_ledger(reviews), _PageIndex(extraction))
    assert len(items) == 1
    return items[0]


def test_spans_resolve_against_live_normalized_text(tmp_path: Path) -> None:
    generated, extraction, reviews = make_fixture(tmp_path)
    span = ir_record()["source"][0]
    verification = verify_span(span, _PageIndex(extraction))
    assert verification.status == "verified"
    assert verification.node_texts == [SOURCE_TEXT, OTHER_TEXT]
    item = item_for(generated, extraction, reviews)
    assert item.flags == ["SEMANTICS_MISSING", "TESTS_MISSING"]


def test_source_drift_and_unresolved_blocks_are_flagged(tmp_path: Path) -> None:
    generated, extraction, reviews = make_fixture(tmp_path, source_text="Changed source text.")
    item = item_for(generated, extraction, reviews)
    assert "SOURCE_HASH_CHANGED" in item.flags
    broken = make_fixture(tmp_path / "broken")
    moved = broken[1] / "srd-5.2.1-test" / "normalized" / "pages" / "0028.json"
    document = read_json(moved)
    for node in document["nodes"]:
        node["sourceBlocks"] = ["p0028-b099"]
    write_json(moved, document)
    item = item_for(broken[0], broken[1], broken[2])
    assert "BROKEN_REFERENCE" in item.flags


def test_record_then_apply_promotes_only_fresh_approvals(tmp_path: Path) -> None:
    generated, extraction, reviews = make_fixture(tmp_path)
    item = item_for(generated, extraction, reviews)
    record_decision(reviews, item, "semantics", "approved", "reviewer-1", None, False)
    updated, stale, stale_ids = apply_ledger(generated, reviews, extraction)
    assert (updated, stale, stale_ids) == (1, 0, [])
    record = read_json(generated / "authoring-ir" / "test.rage.json")
    assert record["review"]["semantics"] == "approved"
    assert record["review"]["tests"] == "draft"
    report = coverage_report([], load_authoring_ir(generated))
    assert report["authoringIr"]["semanticsApproved"] == 1
    assert report["authoringIr"]["testsApproved"] == 0

    ledger_path = reviews / f"{RAGE_ID}.json"
    assert read_json(ledger_path)["log"][0]["reviewer"] == "reviewer-1"

    # Rejected or superseded decisions must not promote status.
    item = item_for(generated, extraction, reviews)
    record_decision(reviews, item, "tests", "needs-review", "reviewer-1", "not yet", False)
    updated, stale, _ = apply_ledger(generated, reviews, extraction)
    assert updated == 0
    # A needs-review decision stays in the ledger and never promotes the generated record.
    assert read_json(generated / "authoring-ir" / "test.rage.json")["review"]["tests"] == "draft"


def test_changed_proposed_rules_make_a_prior_approval_stale(tmp_path: Path) -> None:
    generated, extraction, reviews = make_fixture(tmp_path)
    item = item_for(generated, extraction, reviews)
    record_decision(reviews, item, "semantics", "approved", "reviewer-1", None, False)
    apply_ledger(generated, reviews, extraction)

    changed = ir_record(
        rules=[
            {
                "id": "changed",
                "type": "add-modifier",
                "target": "speed",
                "parameters": {},
                "automationLevel": "sheet-automated",
            }
        ]
    )
    write_json(generated / "authoring-ir" / "test.rage.json", changed)
    updated, stale, stale_ids = apply_ledger(generated, reviews, extraction)
    assert updated == 0
    assert stale >= 1
    assert RAGE_ID in stale_ids
    record = read_json(generated / "authoring-ir" / "test.rage.json")
    assert record["review"]["semantics"] == "needs-review"
    item = item_for(generated, extraction, reviews)
    assert "SEMANTICS_CHANGED" in item.flags


def test_record_refuses_unverified_spans_without_allow_drift(tmp_path: Path) -> None:
    generated, extraction, reviews = make_fixture(tmp_path, source_text="Changed source text.")
    item = item_for(generated, extraction, reviews)
    with pytest.raises(ValueError, match="changed"):
        record_decision(reviews, item, "semantics", "approved", "reviewer-1", None, False)
    entry = record_decision(reviews, item, "semantics", "approved", "reviewer-1", None, True)
    assert entry["pins"]["spanHashes"] == [ir_record()["source"][0]["quoteHash"]]
