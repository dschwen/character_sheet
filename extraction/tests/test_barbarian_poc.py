from pathlib import Path

import pytest

from srd_extract.barbarian import generate_barbarian_content
from srd_extract.io import read_json, write_json
from srd_extract.pipeline import run_pipeline

SOURCE_HASH = "8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87"
REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SOURCE = REPOSITORY_ROOT / "sources" / "wotc-srd-5.2.1-en" / SOURCE_HASH / "source.pdf"


@pytest.mark.skipif(not SOURCE.exists(), reason="Pinned SRD PDF is intentionally not committed")
def test_barbarian_pages_28_to_30_audit(tmp_path: Path) -> None:
    extraction = tmp_path / "extraction"
    content = tmp_path / "content"
    report = run_pipeline(SOURCE, extraction, (28, 29, 30), overlays=False)

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

    content_report = generate_barbarian_content(extraction, content)
    entities = read_json(content / "entities.json")
    reconciliation = read_json(content / "indexes" / "barbarian-reconciliation.json")

    assert content_report["progressionRows"] == 20
    assert content_report["extractedClassFeatures"] == 20
    assert content_report["extractedBerserkerFeatures"] == 4
    assert len(entities) == 28
    assert any(
        entity["id"] == "srd521.subclass.barbarian.path-of-the-berserker" for entity in entities
    )
    assert (content / "authoring-ir" / "barbarian.extra-attack.json").exists()
    assert reconciliation["valid"] is True
    assert reconciliation["counts"]["unresolved"] == 0
    barbarian = next(entity for entity in entities if entity["id"] == "srd521.class.barbarian")
    assert barbarian["body"]["builder"]["supportedLevelMaximum"] == 8
    assert barbarian["body"]["skillProficiencyChoice"]["countByLevel"]["7"] == 3
    assert barbarian["body"]["skillProficiencyChoice"]["countByLevel"]["8"] == 3
    pounce = next(entity for entity in entities if entity["name"]["en"] == "Instinctive Pounce")
    assert pounce["body"]["actionEnhancements"] == [
        {
            "actionId": "action.enter-rage",
            "movement": {"speedFraction": 0.5, "provokesOpportunityAttacks": True},
        }
    ]
    feral = read_json(content / "authoring-ir" / "barbarian.feral-instinct.json")
    assert feral["level"] == 7
    assert feral["proposedRules"][0]["target"] == "initiative"
    assert feral["source"][0]["page"] == 29
    assert feral["review"]["semantics"] == "needs-review"
    unrelated = {"id": "test.other-class", "kind": "class", "body": {"sentinel": True}}
    write_json(content / "entities.json", [*entities, unrelated])
    generate_barbarian_content(extraction, content)
    assert read_json(content / "entities.json") == [*entities, unrelated]
    generate_barbarian_content(extraction, content)
    assert read_json(content / "entities.json") == [*entities, unrelated]
